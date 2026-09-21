/**
 * Fingertip PPG via rear camera.
 * Unique video frames only (never rAF-duplicated); timestamps → uniform grid;
 * HR estimated on the longest good-contact run. Manual flashlight only.
 */

import {
  BandpassFilter,
  normalize,
  filtfiltBandpass,
  adaptiveBandHz,
} from '../dsp/filters';
import { estimateHeartRateSliding, HrTracker } from '../dsp/hrEstimate';
import {
  robustSampleRate,
  linearDetrend,
  savitzkyGolay,
  resampleUniform,
  medianFilter3,
  contiguousRuns,
} from '../dsp/preprocess';
import type { CameraCueLevel, MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const DURATION = METHOD_META.fingertip_ppg.durationSec;
const FS_SEED = 30;

interface VideoFrameCallbackMeta {
  mediaTime: number;
  presentedFrames?: number;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: VideoFrameCallbackMeta) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function recentVariance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, c) => a + c, 0) / arr.length;
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  return v / arr.length;
}

function pulsatility(arr: number[]): number {
  if (arr.length < 8) return 0;
  const mean = arr.reduce((a, c) => a + c, 0) / arr.length;
  if (mean < 8) return 0;
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  return Math.sqrt(v / arr.length) / mean;
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
  let rvfcHandle = 0;
  let settled = false;
  let goodContactFrames = 0;
  let darkFrames = 0;
  let brightOkFrames = 0;

  const rawR: number[] = [];
  const rawG: number[] = [];
  const timestamps: number[] = [];
  const contact: boolean[] = [];
  let filter = new BandpassFilter(0.7, 3.5, FS_SEED, true);
  let filterFs = FS_SEED;
  const waveformWindow: number[] = [];
  const recentMeanR: number[] = [];
  const recentR: number[] = [];
  const recentG: number[] = [];
  const tracker = new HrTracker(7);
  let lockedBpm: number | null = null;
  let lastMediaTime = -1;
  let lastCurrentTime = -1;
  let prevMeanR: number | null = null;
  let done = false;

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
    const v = video as VideoWithFrameCallback;

    await new Promise<void>((resolve, reject) => {
      const finish = (err?: unknown) => {
        if (done) return;
        done = true;
        if (err) reject(err);
        else resolve();
      };

      const processFrame = (now: number) => {
        if (done) return;
        if (signal.aborted) {
          finish(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const elapsed = (now - started) / 1000;
        if (elapsed >= DURATION) {
          finish();
          return;
        }

        const vw = video!.videoWidth;
        const vh = video!.videoHeight;
        if (vw <= 0 || vh <= 0) return;

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
        let meanR = sumR / pixels;
        const meanG = sumG / pixels;
        const meanB = sumB / pixels;
        const meanLuma = (meanR + meanG + meanB) / 3;

        // Hold across auto-exposure pops (finger cover makes AE hunt).
        if (prevMeanR != null && Math.abs(meanR - prevMeanR) > 32 && goodContactFrames > 8) {
          meanR = prevMeanR;
        }
        prevMeanR = meanR;

        const redDominance = meanR / (meanG + meanB + 1);
        const brightnessOk = meanR > 85 && meanR < 248;
        const redOk = redDominance > 1.2 || meanR > 140;
        const coverageOk = brightnessOk && redOk;
        const tooDark = meanLuma < 28 && meanR < 45;

        recentMeanR.push(meanR);
        if (recentMeanR.length > 45) recentMeanR.shift();
        recentR.push(meanR);
        recentG.push(meanG);
        if (recentR.length > 60) {
          recentR.shift();
          recentG.shift();
        }
        const motionVar = recentVariance(recentMeanR);
        const motionOk = motionVar < 550;

        timestamps.push(now);
        rawR.push(meanR);
        rawG.push(meanG);

        if (timestamps.length === 40 || (timestamps.length > 40 && timestamps.length % 30 === 0)) {
          const fsEst = robustSampleRate(timestamps, 'ms');
          if (fsEst >= 12 && fsEst <= 90 && Math.abs(fsEst - filterFs) > 1.5) {
            filterFs = fsEst;
            const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.8);
            filter = new BandpassFilter(band.low, band.high, filterFs, true);
            const replay = rawR.slice(-Math.round(filterFs * 2));
            for (const val of replay) filter.process(val);
          } else if (lockedBpm != null && timestamps.length % 60 === 0) {
            const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.8);
            filter.retune(band.low, band.high, filterFs);
          }
        }

        const pulR = pulsatility(recentR);
        const pulG = pulsatility(recentG);
        // Green often has the highest camera PPG SNR; red wins in transillumination.
        const useGreen = pulG > pulR * 1.12 && pulG > 0.004;
        const sample = useGreen ? meanG : meanR;

        const filtered = filter.process(sample);
        waveformWindow.push(filtered);
        if (waveformWindow.length > 120) waveformWindow.shift();

        let quality = 0.12;
        let bpmLive: number | null = null;
        let cueLevel: CameraCueLevel = 'bad';
        let status = 'Cover the lens completely';

        if (tooDark) {
          status = 'Too dark — try flashlight or another phone light';
          cueLevel = 'bad';
          goodContactFrames = 0;
          darkFrames++;
          brightOkFrames = 0;
        } else if (!coverageOk) {
          darkFrames = Math.max(0, darkFrames - 2);
          if (meanR < 70 || redDominance < 1.0) {
            status = 'Cover the lens completely';
          } else if (!redOk) {
            status = 'Press gently — need more red glow';
          } else {
            status = 'Adjust pressure — brightness out of range';
          }
          cueLevel = 'bad';
          goodContactFrames = 0;
          brightOkFrames = 0;
        } else if (!motionOk) {
          darkFrames = 0;
          status = 'Hold still';
          cueLevel = 'warn';
          goodContactFrames = Math.max(0, goodContactFrames - 1);
          brightOkFrames++;
        } else {
          darkFrames = 0;
          goodContactFrames++;
          brightOkFrames++;
          status = 'Hold still';
          cueLevel = 'warn';
        }

        const goodContact = coverageOk && motionOk && goodContactFrames > 10;
        contact.push(goodContact);
        const needsAlternateLight = darkFrames > 45 && brightOkFrames < 10;
        const fs = filterFs;

        if (rawR.length > fs * 6 && goodContact && elapsed > 3.5) {
          const windowSec = Math.min(14, Math.max(8, elapsed - 1));
          const nWin = Math.min(rawR.length, Math.round(fs * windowSec));
          const sliceTs = timestamps.slice(-nWin);
          const sliceR = rawR.slice(-nWin);
          const sliceG = rawG.slice(-nWin);
          const sliceContact = contact.slice(-nWin);
          const goodFrac = sliceContact.filter(Boolean).length / sliceContact.length;
          const src = useGreen ? sliceG : sliceR;
          const { signal: grid, fs: fsWin } = resampleUniform(src, sliceTs, 'ms');
          const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.8);
          let processed = medianFilter3(grid);
          processed = filtfiltBandpass(processed, band.low, band.high, fsWin);
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

          if (est.bpm != null && est.confidence >= 0.32 && !est.discordant && goodFrac >= 0.55) {
            const stable = tracker.push(est.bpm, 0.32, est.confidence);
            bpmLive = stable ?? est.bpm;
            quality = est.quality;
            if (est.confidence >= 0.55) {
              lockedBpm = bpmLive;
              settled = true;
              status = 'Good signal';
              cueLevel = 'good';
            }
          } else if (est.bpm != null && est.confidence >= 0.24) {
            quality = est.quality * 0.65;
            bpmLive = null;
            status = est.discordant ? 'Stabilizing… hold still' : 'Hold still';
            cueLevel = 'warn';
          } else {
            quality = est.quality * 0.45;
          }
        } else if (!goodContact) {
          quality = 0.12;
        }

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
            needsAlternateLight,
          },
        });
      };

      const onRvfc = (now: number, meta: VideoFrameCallbackMeta) => {
        if (done) return;
        const mediaTime = meta.mediaTime;
        if (mediaTime !== lastMediaTime) {
          lastMediaTime = mediaTime;
          processFrame(now);
        }
        if (!done && v.requestVideoFrameCallback) {
          rvfcHandle = v.requestVideoFrameCallback(onRvfc);
        }
      };

      const onRaf = () => {
        if (done) return;
        const now = performance.now();
        const ct = video!.currentTime;
        if (ct !== lastCurrentTime) {
          lastCurrentTime = ct;
          processFrame(now);
        }
        if (!done) raf = requestAnimationFrame(onRaf);
      };

      if (v.requestVideoFrameCallback) {
        rvfcHandle = v.requestVideoFrameCallback(onRvfc);
      } else {
        raf = requestAnimationFrame(onRaf);
      }
    });
  } finally {
    done = true;
    cancelAnimationFrame(raf);
    const v = video as VideoWithFrameCallback | null;
    if (v?.cancelVideoFrameCallback && rvfcHandle) {
      try {
        v.cancelVideoFrameCallback(rvfcHandle);
      } catch {
        /* ignore */
      }
    }
    stream?.getTracks().forEach((t) => t.stop());
    if (video) {
      video.srcObject = null;
    }
  }

  const durationSec = (performance.now() - started) / 1000;
  return finalizePpg(rawR, rawG, timestamps, contact, lockedBpm, settled, durationSec);
}

function pickChannel(r: number[], g: number[]): number[] {
  if (r.length < 16) return r;
  return pulsatility(g) > pulsatility(r) * 1.12 ? g : r;
}

function finalizePpg(
  rawR: number[],
  rawG: number[],
  timestamps: number[],
  contact: boolean[],
  lockedBpm: number | null,
  settled: boolean,
  durationSec: number,
): MethodResult {
  const empty = (notes: string): MethodResult => ({
    methodId: 'fingertip_ppg',
    bpm: null,
    quality: 0.05,
    confidence: 0,
    durationSec,
    notes,
    timestamp: Date.now(),
  });

  if (rawR.length < 30) {
    return empty('Insufficient samples — check contact and flashlight');
  }

  const src = pickChannel(rawR, rawG);
  const fsRaw = robustSampleRate(timestamps, 'ms') || FS_SEED;

  // Prefer the longest good-contact run (skip placement / lift-off).
  const minGood = Math.round(fsRaw * 8);
  const runs = contiguousRuns(contact, minGood);
  let useStart = 0;
  let useEnd = src.length;
  if (runs.length > 0) {
    let best = runs[0];
    for (const run of runs) {
      if (run.end - run.start > best.end - best.start) best = run;
    }
    useStart = best.start;
    useEnd = best.end;
  } else {
    // Fall back: drop settle seconds.
    const drop = Math.min(src.length, Math.round(fsRaw * 3));
    useStart = drop;
  }

  const sliceV = src.slice(useStart, useEnd);
  const sliceT = timestamps.slice(useStart, useEnd);
  if (sliceV.length < fsRaw * 4) {
    return empty('Insufficient samples — check contact and flashlight');
  }

  const { signal: grid, fs } = resampleUniform(sliceV, sliceT, 'ms');
  if (grid.length < fs * 4) {
    return empty('Insufficient samples — check contact and flashlight');
  }

  const band = adaptiveBandHz(lockedBpm, 0.67, 3.5, 0.8);
  let processed = medianFilter3(grid);
  processed = filtfiltBandpass(processed, band.low, band.high, fs);
  processed = savitzkyGolay(processed, Math.min(9, Math.max(5, Math.round(fs / 8) | 1)));
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

  let bpm = est.bpm;
  let confidence = est.confidence * (settled ? 1 : 0.8);
  let quality = est.quality;
  let notes: string | undefined;

  const usedFrac = (useEnd - useStart) / src.length;
  if (usedFrac < 0.45) {
    confidence *= 0.85;
    notes = 'Used the longest steady-contact stretch';
  }
  if (est.discordant) {
    confidence *= 0.6;
    notes = 'Autocorr/spectral disagreement — reduced confidence';
  }
  if (
    confidence < 0.26 ||
    (est.snrDb < 4.5 && est.peakCount < 5) ||
    (est.discordant && confidence < 0.4)
  ) {
    notes = (notes ? notes + '; ' : '') + 'Signal too weak for reliable reading';
    bpm = null;
    confidence = 0;
  }
  if (!settled && bpm != null) {
    notes = notes ?? 'Signal coverage may have been weak';
  }

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
