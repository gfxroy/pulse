/**
 * Microphone phonocardiography:
 * bandpass 20–200 Hz → Shannon energy envelope → S1/S2 lobe peaks
 * → systole < diastole heuristic to label S1 vs S2 → HR from S1–S1.
 */

import { BandpassFilter, normalize } from '../dsp/filters';
import { beatEnvelope } from '../dsp/envelope';
import { detectPeaks, type Peak } from '../dsp/peaks';
import { combineQuality, timeDomainSnrDb, regularityScore } from '../dsp/quality';
import { spectralPeak, spectralSnrDb } from '../dsp/fft';
import type { MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const DURATION = METHOD_META.mic_pcg.durationSec;

export async function runMicPcg(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = Date.now();
  let audioCtx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  const rawChunks: Float32Array[] = [];
  let sampleRate = 44100;
  const waveformWindow: number[] = [];
  let intervalId = 0;
  let liveEnergy = 0;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    audioCtx = new AudioContext();
    sampleRate = audioCtx.sampleRate;
    source = audioCtx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but widely available; Analyser alone isn't enough for raw PCM buffer.
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      rawChunks.push(new Float32Array(input));
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      liveEnergy = Math.sqrt(sum / input.length);
    };
    source.connect(processor);
    processor.connect(audioCtx.destination); // required in some browsers for processing to run
    // Mute output by gain 0
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    processor.disconnect();
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);

    await new Promise<void>((resolve, reject) => {
      intervalId = window.setInterval(() => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const elapsed = (Date.now() - started) / 1000;
        if (elapsed >= DURATION) {
          resolve();
          return;
        }

        waveformWindow.push(liveEnergy);
        if (waveformWindow.length > 80) waveformWindow.shift();

        let quality = Math.min(0.35, liveEnergy * 40);
        let bpmLive: number | null = null;
        let status =
          liveEnergy < 0.002
            ? 'Press mic firmly on bare chest skin…'
            : 'Listening for heart sounds…';

        // Occasional partial analysis after ~8s
        if (elapsed > 8 && rawChunks.length > 10 && Math.floor(elapsed * 5) % 7 === 0) {
          const partial = analyzePcg(mergeChunks(rawChunks), sampleRate);
          if (partial.bpm != null) {
            bpmLive = partial.bpm;
            quality = partial.quality;
            status = `Live ~${Math.round(partial.bpm)} BPM (S1–S1)`;
          }
        }

        onLive({
          waveform: [...waveformWindow],
          quality,
          bpmLive,
          elapsedSec: elapsed,
          status,
        });
      }, 200);
    });
  } finally {
    window.clearInterval(intervalId);
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {
      /* ignore */
    }
    stream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close();
  }

  const durationSec = (Date.now() - started) / 1000;
  const pcm = mergeChunks(rawChunks);
  const result = analyzePcg(pcm, sampleRate);

  return {
    methodId: 'mic_pcg',
    bpm: result.bpm,
    quality: result.quality,
    confidence: result.confidence,
    durationSec,
    peakCount: result.s1Count,
    snrDb: result.snrDb,
    notes: result.notes,
    timestamp: Date.now(),
  };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Downsample by averaging blocks for envelope processing efficiency. */
function downsample(signal: Float32Array, fromFs: number, toFs: number): {
  data: Float32Array;
  fs: number;
} {
  const ratio = Math.max(1, Math.round(fromFs / toFs));
  const fs = fromFs / ratio;
  const n = Math.floor(signal.length / ratio);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const base = i * ratio;
    for (let k = 0; k < ratio; k++) sum += signal[base + k];
    data[i] = sum / ratio;
  }
  return { data, fs };
}

function analyzePcg(
  pcm: Float32Array,
  sampleRate: number,
): {
  bpm: number | null;
  quality: number;
  confidence: number;
  s1Count: number;
  snrDb: number;
  notes?: string;
} {
  if (pcm.length < sampleRate * 3) {
    return {
      bpm: null,
      quality: 0.05,
      confidence: 0,
      s1Count: 0,
      snrDb: 0,
      notes: 'Recording too short',
    };
  }

  // Bandpass 20–200 Hz at original rate (or lightly downsampled)
  const targetFs = Math.min(sampleRate, 2000);
  const { data: ds, fs } = downsample(pcm, sampleRate, targetFs);
  const bp = new BandpassFilter(20, 200, fs, true).processBuffer(ds);

  // Shannon energy envelope, smooth ~30–50 ms
  const env = beatEnvelope(bp, fs, 45);
  const norm = normalize(env);

  // Detect lobe peaks (S1 and S2) — allow up to ~4 Hz for paired sounds
  const lobes = detectPeaks(norm, {
    fs,
    minBpm: 40, // will filter via pairing
    maxBpm: 240, // allow S1+S2 rate temporarily
    thresholdRatio: 0.35,
    adaptWindowSec: 1.0,
  });

  const s1Peaks = labelS1S2(lobes);
  const s1Intervals: number[] = [];
  for (let i = 1; i < s1Peaks.length; i++) {
    const dt = s1Peaks[i].timeSec - s1Peaks[i - 1].timeSec;
    const bpm = 60 / dt;
    if (bpm >= 40 && bpm <= 180) s1Intervals.push(dt);
  }

  let bpm: number | null = null;
  if (s1Intervals.length >= 2) {
    const sorted = [...s1Intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    bpm = 60 / median;
  }

  // Spectral check on envelope (heart rate band)
  const envFsDown = downsample(norm, fs, 50);
  const { peak: spec, magnitudes, freqs } = spectralPeak(
    envFsDown.data,
    envFsDown.fs,
    0.7,
    3.0,
    4,
  );
  const snrDb = spec
    ? spectralSnrDb(magnitudes, freqs, spec.bin, 0.7, 3.0)
    : timeDomainSnrDb(norm, lobes);

  if (bpm == null && spec) bpm = spec.bpm;

  const fakePeaksForReg = s1Peaks;
  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: timeDomainSnrDb(norm, lobes),
    regularity: regularityScore(fakePeaksForReg, 40, 180),
    agreement:
      bpm != null && spec
        ? Math.max(0, 1 - Math.abs(bpm - spec.bpm) / 20)
        : 0.3,
  });

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence: bpm != null ? quality : 0,
    s1Count: s1Peaks.length,
    snrDb,
    notes:
      s1Peaks.length < 3
        ? 'Few S1 detections — check mic placement'
        : `Labeled ${s1Peaks.length} S1 sounds`,
  };
}

/**
 * Systole (S1→S2) is shorter than diastole (S2→S1).
 * Walk consecutive lobe pairs and assign S1 to the start of the shorter gap.
 */
function labelS1S2(lobes: Peak[]): Peak[] {
  if (lobes.length < 3) return lobes;

  const intervals: number[] = [];
  for (let i = 1; i < lobes.length; i++) {
    intervals.push(lobes[i].timeSec - lobes[i - 1].timeSec);
  }

  // Find which phase is systole: among alternating interval groups, shorter mean = systole
  let sumEven = 0;
  let sumOdd = 0;
  let nEven = 0;
  let nOdd = 0;
  for (let i = 0; i < intervals.length; i++) {
    if (i % 2 === 0) {
      sumEven += intervals[i];
      nEven++;
    } else {
      sumOdd += intervals[i];
      nOdd++;
    }
  }
  const meanEven = nEven ? sumEven / nEven : 0;
  const meanOdd = nOdd ? sumOdd / nOdd : 0;

  // If even intervals are shorter → they are systole → S1 at even indices (0,2,4…)
  // If odd intervals are shorter → S1 at odd starts (1,3,5…) i.e. peaks at index 1,3,…
  const evenIsSystole = meanEven > 0 && meanEven <= meanOdd;
  const s1: Peak[] = [];

  if (evenIsSystole) {
    // Pattern: S1, S2, S1, S2… starting at lobe 0
    for (let i = 0; i < lobes.length; i += 2) s1.push(lobes[i]);
  } else {
    // Pattern starts mid-cycle: first lobe may be S2
    for (let i = 1; i < lobes.length; i += 2) s1.push(lobes[i]);
  }

  // Sanity: S1–S1 should be ~0.33–1.5 s. If not, try alternate phasing.
  if (s1.length >= 3) {
    const dt = s1[1].timeSec - s1[0].timeSec;
    if (dt < 0.28 || dt > 1.6) {
      const alt: Peak[] = [];
      const start = evenIsSystole ? 1 : 0;
      for (let i = start; i < lobes.length; i += 2) alt.push(lobes[i]);
      if (alt.length >= 2) return alt;
    }
  }

  return s1;
}
