/**
 * Microphone phonocardiography:
 * bandpass 25–150 Hz → Hilbert/Shannon envelope → S1/S2 lobes
 * → systole < diastole → HR from S1–S1; reject noisy segments.
 */

import { normalize, filtfiltBandpass } from '../dsp/filters';
import { beatEnvelope } from '../dsp/envelope';
import { detectPeaks, type Peak, bpmFromPeaks } from '../dsp/peaks';
import { combineQuality, timeDomainSnrDb, regularityScore } from '../dsp/quality';
import { spectralPeakHarmonicAware } from '../dsp/welch';
import { autocorrHeartRate } from '../dsp/autocorr';
import { savitzkyGolay } from '../dsp/preprocess';
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
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      rawChunks.push(new Float32Array(input));
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      liveEnergy = Math.sqrt(sum / input.length);
    };
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
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

        if (elapsed > 8 && rawChunks.length > 10 && Math.floor(elapsed * 5) % 7 === 0) {
          const partial = analyzePcg(mergeChunks(rawChunks), sampleRate);
          if (partial.bpm != null && partial.confidence >= 0.3) {
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

/** Reject segments whose RMS is far from median (noise bursts). */
function maskNoisySegments(
  signal: Float32Array,
  fs: number,
  segSec = 0.5,
): Float32Array {
  const seg = Math.max(8, Math.round(segSec * fs));
  const nSeg = Math.floor(signal.length / seg);
  if (nSeg < 3) return signal;

  const rms: number[] = [];
  for (let s = 0; s < nSeg; s++) {
    let sq = 0;
    const base = s * seg;
    for (let i = 0; i < seg; i++) sq += signal[base + i] ** 2;
    rms.push(Math.sqrt(sq / seg));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 1e-12;

  const out = new Float32Array(signal.length);
  out.set(signal);
  for (let s = 0; s < nSeg; s++) {
    if (rms[s] > med * 3.5 || rms[s] < med * 0.15) {
      const base = s * seg;
      for (let i = 0; i < seg; i++) out[base + i] = 0;
    }
  }
  return out;
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
  // Discard settle / placement seconds
  const settleN = Math.round(sampleRate * 2.5);
  const usable = pcm.length > settleN ? pcm.subarray(settleN) : pcm;

  if (usable.length < sampleRate * 3) {
    return {
      bpm: null,
      quality: 0.05,
      confidence: 0,
      s1Count: 0,
      snrDb: 0,
      notes: 'Recording too short',
    };
  }

  // Tighter heart-sound band; downsample for efficiency
  const targetFs = Math.min(sampleRate, 1000);
  const { data: ds, fs } = downsample(usable, sampleRate, targetFs);
  const cleaned = maskNoisySegments(ds, fs, 0.4);
  const bp = filtfiltBandpass(cleaned, 25, 150, fs);

  // Hilbert + Shannon envelope, ~40 ms smooth
  const env = beatEnvelope(bp, fs, 40, true);
  const norm = normalize(savitzkyGolay(env, Math.min(11, Math.max(5, Math.round(fs * 0.02) | 1))));

  const lobes = detectPeaks(norm, {
    fs,
    minBpm: 40,
    maxBpm: 240,
    thresholdRatio: 0.32,
    adaptWindowSec: 1.0,
  });

  const s1Peaks = labelS1S2(lobes);
  const { bpm: s1Bpm, cv } = bpmFromPeaks(s1Peaks, 40, 180);

  // Autocorr + spectral on downsampled envelope
  const envFsDown = downsample(norm, fs, 50);
  const ac = autocorrHeartRate(envFsDown.data, envFsDown.fs, 0.67, 3.0);
  const harm = spectralPeakHarmonicAware(envFsDown.data, envFsDown.fs, 0.67, 3.0, true);
  const snrDb = harm?.snrDb ?? 0;

  let bpm: number | null = s1Bpm;
  if (bpm == null && ac.bpm != null) bpm = ac.bpm;
  if (bpm == null && harm) bpm = harm.bpm;

  // Prefer S1–S1 when it agrees with autocorr
  if (s1Bpm != null && ac.bpm != null) {
    if (Math.abs(s1Bpm - ac.bpm) <= 10) {
      bpm = 0.6 * s1Bpm + 0.4 * ac.bpm;
    } else if (ac.confidence > 0.55 && s1Peaks.length < 4) {
      bpm = ac.bpm;
    }
  }

  // Harmonic check vs spectral
  if (bpm != null && harm) {
    const ratio = bpm / harm.bpm;
    if (ratio > 1.85 && ratio < 2.15) bpm = harm.bpm; // was double
    if (ratio > 0.45 && ratio < 0.55) bpm = harm.bpm; // was half
  }

  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: timeDomainSnrDb(norm, lobes),
    regularity: regularityScore(s1Peaks, 40, 180),
    agreement:
      bpm != null && ac.bpm != null
        ? Math.max(0, 1 - Math.abs(bpm - ac.bpm) / 20)
        : 0.25,
  });

  let confidence = bpm != null ? quality : 0;
  if (cv > 0.35) confidence *= 0.65;
  if (s1Peaks.length < 3) confidence *= 0.6;
  if (confidence < 0.22) {
    bpm = null;
    confidence = 0;
  }

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence,
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
 */
function labelS1S2(lobes: Peak[]): Peak[] {
  if (lobes.length < 3) return lobes;

  const intervals: number[] = [];
  for (let i = 1; i < lobes.length; i++) {
    intervals.push(lobes[i].timeSec - lobes[i - 1].timeSec);
  }

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

  const evenIsSystole = meanEven > 0 && meanEven <= meanOdd;
  const s1: Peak[] = [];

  if (evenIsSystole) {
    for (let i = 0; i < lobes.length; i += 2) s1.push(lobes[i]);
  } else {
    for (let i = 1; i < lobes.length; i += 2) s1.push(lobes[i]);
  }

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
