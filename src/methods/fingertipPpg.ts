/**
 * Fingertip PPG via rear camera red-channel mean.
 * Timestamps with performance.now(); Fs derived from timestamps (never assumed 30).
 * Dual estimate: autocorrelation + spectral with harmonic rejection.
 * Manual flashlight only — never torch API.
 */

import {
  BandpassFilter,
  normalize,
  filtfiltBandpass,
  adaptiveBandHz,
} from '../dsp/filters';
import { estimateHeartRateSliding, HrTracker } from '../dsp/hrEstimate';
import { robustSampleRate, linearDetrend, savitzkyGolay } from '../dsp/preprocess';
import type { CameraCueLevel, MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const DURATION = METHOD_META.fingertip_ppg.durationSec;
/** Seed filter Fs until enough timestamps accumulate. */
const FS_SEED = 30;

function recentVariance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, c) => a + c, 0) / arr.length;
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  return v / arr.length;
}

export async function runFingertipPpg(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = performance.now();
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;
  let settled = false;
  let goodContactFrames = 0;

  const rawSamples: number[] = [];
  const timestamps: number[] = []; // performance.now() ms
  let filter = new BandpassFilter(0.7, 3.5, FS_SEED, true);
  let filterFs = FS_SEED;
  const waveformWindow: number[] = [];
  const recentMeanR: number[] = [];
  const tracker = new HrTracker(7);
  let lockedBpm: number | null = null;
  let lastFrameTs = 0;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    });

    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const now = performance.now();
        const elapsed = (now - started) / 1000;
        if (elapsed >= DURATION) {
          resolve();
          return;
        }

        const vw = video!.videoWidth;
        const vh = video!.videoHeight;
        if (vw > 0 && vh > 0) {
          // Deduplicate: skip if camera hasn't produced a new frame recently
          // but still timestamp every accepted sample with performance.now()
          const cw = Math.floor(vw * 0.4);
          const ch = Math.floor(vh * 0.4);
          const sx = Math.floor((vw - cw) / 2);
          const sy = Math.floor((vh - ch) / 2);
          canvas!.width = cw;
          canvas!.height = ch;
          ctx.drawImage(video!, sx, sy, cw, ch, 0, 0, cw, ch);
          const img = ctx.getImageData(0, 0, cw, ch);
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          const data = img.data;
          const pixels = cw * ch;
          for (let i = 0; i < data.length; i += 4) {
            sumR += data[i];
            sumG += data[i + 1];
            sumB += data[i + 2];
          }
          const meanR = sumR / pixels;
          const meanG = sumG / pixels;
          const meanB = sumB / pixels;
          const meanLuma = (meanR + meanG + meanB) / 3;

          const redDominance = meanR / (meanG + meanB + 1);
          // Strong good-contact gating
          const brightnessOk = meanR > 90 && meanR < 250;
          const redOk = redDominance > 1.25;
          const coverageOk = brightnessOk && redOk;

          recentMeanR.push(meanR);
          if (recentMeanR.length > 40) recentMeanR.shift();
          const motionVar = recentVariance(recentMeanR);
          const motionOk = motionVar < 700;

          // Update Fs estimate periodically and retune filter coefficients
          timestamps.push(now);
          rawSamples.push(meanR);

          if (timestamps.length === 40 || (timestamps.length > 40 && timestamps.length % 30 === 0)) {
            const fsEst = robustSampleRate(timestamps, 'ms');
            if (fsEst >= 12 && fsEst <= 90 && Math.abs(fsEst - filterFs) > 1.5) {
              filterFs = fsEst;
              const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.65);
              filter = new BandpassFilter(band.low, band.high, filterFs, true);
              // Replay recent raw into new filter to rebuild state
              const replay = rawSamples.slice(-Math.round(filterFs * 2));
              for (const v of replay) filter.process(v);
            } else if (lockedBpm != null && timestamps.length % 60 === 0) {
              const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.65);
              filter.retune(band.low, band.high, filterFs);
            }
          }

          // Only publish filtered sample when contact is plausible (still collect raw)
          const filtered = filter.process(meanR);
          waveformWindow.push(filtered);
          if (waveformWindow.length > 120) waveformWindow.shift();

          let quality = 0.12;
          let bpmLive: number | null = null;
          let cueLevel: CameraCueLevel = 'bad';
          let status = 'Cover the lens completely';

          if (meanLuma < 25 && meanR < 40) {
            status = 'Too dark / turn flashlight on';
            cueLevel = 'bad';
            goodContactFrames = 0;
          } else if (!coverageOk) {
            if (meanR < 60 || redDominance < 0.95) {
              status = 'Cover the lens completely';
            } else if (!redOk) {
              status = 'Press gently — need more red glow';
            } else {
              status = 'Adjust pressure — brightness out of range';
            }
            cueLevel = 'bad';
            goodContactFrames = 0;
          } else if (!motionOk) {
            status = 'Hold still';
            cueLevel = 'warn';
            goodContactFrames = Math.max(0, goodContactFrames - 1);
          } else {
            goodContactFrames++;
            status = 'Hold still';
            cueLevel = 'warn';
          }

          const goodContact = coverageOk && motionOk && goodContactFrames > 8;
          const fs = filterFs;

          if (rawSamples.length > fs * 5 && goodContact) {
            const windowSec = Math.min(14, Math.max(8, elapsed - 1));
            const nWin = Math.min(rawSamples.length, Math.round(fs * windowSec));
            const sliceTs = timestamps.slice(-nWin);
            const sliceRaw = rawSamples.slice(-nWin);
            const fsWin = robustSampleRate(sliceTs, 'ms') || fs;
            const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.7);
            let processed = filtfiltBandpass(sliceRaw, band.low, band.high, fsWin);
            processed = savitzkyGolay(processed, Math.min(9, Math.max(5, Math.round(fsWin / 8) | 1)));
            processed = normalize(linearDetrend(processed));

            const est = estimateHeartRateSliding(
              processed,
              {
                fs: fsWin,
                fMin: band.low,
                fMax: band.high,
                lockedBpm,
                useWelch: true,
              },
              Math.min(10, windowSec * 0.7),
              2,
            );

            // Gate: do not publish low-SNR / discordant estimates
            if (est.bpm != null && est.confidence >= 0.28 && !est.discordant) {
              const stable = tracker.push(est.bpm, 0.28, est.confidence);
              bpmLive = stable ?? est.bpm;
              quality = est.quality;
              if (est.confidence >= 0.5) {
                lockedBpm = bpmLive;
                settled = true;
                status = 'Good signal';
                cueLevel = 'good';
              }
            } else if (est.bpm != null && est.confidence >= 0.2) {
              quality = est.quality * 0.7;
              // Prefer no live reading over wrong reading when discordant
              bpmLive = est.discordant ? null : est.bpm;
              status = est.discordant ? 'Stabilizing… hold still' : 'Hold still';
              cueLevel = 'warn';
            } else {
              quality = est.quality * 0.5;
            }
          } else if (!goodContact) {
            quality = 0.12;
          }

          lastFrameTs = now;
          onLive({
            waveform: [...waveformWindow],
            quality,
            bpmLive,
            elapsedSec: elapsed,
            status,
            camera: {
              mode: 'fingertip',
              stream: stream!,
              mirror: false,
              cueLevel,
              meanRed: meanR,
              redDominance,
            },
          });
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (video) {
      video.srcObject = null;
    }
  }

  const durationSec = (performance.now() - started) / 1000;
  const fsFinal = robustSampleRate(timestamps, 'ms') || filterFs;

  // Prefer longer analysis window at rest for accuracy near ~90 BPM
  const dropSec = 1.5;
  const drop = Math.min(rawSamples.length, Math.round(fsFinal * dropSec));
  const usableRaw = rawSamples.slice(drop);
  const usableTs = timestamps.slice(drop);
  const fs = robustSampleRate(usableTs, 'ms') || fsFinal;

  if (usableRaw.length < fs * 4) {
    return {
      methodId: 'fingertip_ppg',
      bpm: null,
      quality: 0.05,
      confidence: 0,
      durationSec,
      notes: 'Insufficient samples — check contact and flashlight',
      timestamp: Date.now(),
    };
  }

  const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.7);
  let processed = filtfiltBandpass(usableRaw, band.low, band.high, fs);
  processed = savitzkyGolay(processed, Math.min(9, Math.max(5, (Math.round(fs / 8) | 1))));
  processed = normalize(linearDetrend(processed));

  const est = estimateHeartRateSliding(
    processed,
    {
      fs,
      fMin: 0.67,
      fMax: 3.5,
      lockedBpm,
      useWelch: true,
    },
    10,
    2,
  );

  // Strong final gate: reject low confidence rather than publish wrong HR
  let bpm = est.bpm;
  let confidence = est.confidence * (settled ? 1 : 0.8);
  let quality = est.quality;
  let notes: string | undefined;

  if (est.discordant) {
    confidence *= 0.6;
    notes = 'Autocorr/spectral disagreement — reduced confidence';
  }
  if (confidence < 0.22 || (est.snrDb < 4 && est.peakCount < 5)) {
    notes = (notes ? notes + '; ' : '') + 'Signal too weak for reliable reading';
    bpm = null;
    confidence = 0;
  }
  if (!settled && bpm != null) {
    notes = notes ?? 'Signal coverage may have been weak';
  }

  void lastFrameTs;

  return {
    methodId: 'fingertip_ppg',
    bpm,
    quality,
    confidence,
    durationSec,
    peakCount: est.peakCount,
    snrDb: est.snrDb,
    notes,
    timestamp: Date.now(),
  };
}
