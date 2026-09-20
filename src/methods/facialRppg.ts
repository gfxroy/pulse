/**
 * Facial remote PPG: POS + CHROM fusion by quality.
 * Timestamps with performance.now(); Fs derived from timestamps.
 * Better cheek/forehead ROI, skin gating, motion rejection.
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
  highpassMa,
} from '../dsp/preprocess';
import type { CameraCueLevel, MethodResult, NormRect } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const DURATION = METHOD_META.facial_rppg.durationSec;
const WIN = 64; // ~2 s temporal window for POS/CHROM at ~30 fps
const FS_SEED = 30;

interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

declare class FaceDetector {
  constructor(options?: { fastMode?: boolean; maxDetectedFaces?: number });
  detect(image: ImageBitmapSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

function recentVariance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, c) => a + c, 0) / arr.length;
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  return v / arr.length;
}

function toNorm(roi: Roi, vw: number, vh: number): NormRect {
  return {
    x: roi.x / vw,
    y: roi.y / vh,
    w: roi.w / vw,
    h: roi.h / vh,
  };
}

function meanStd(arr: number[]): { mean: number; std: number } {
  const mean = arr.reduce((a, c) => a + c, 0) / (arr.length || 1);
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  return { mean, std: Math.sqrt(v / (arr.length || 1)) || 1 };
}

/** POS: Plane-Orthogonal-to-Skin (de Haan & Jeanne). */
function posSample(
  r: number,
  g: number,
  b: number,
  winR: number[],
  winG: number[],
  winB: number[],
): number {
  const mR = meanStd(winR).mean;
  const mG = meanStd(winG).mean;
  const mB = meanStd(winB).mean;
  const recentS1: number[] = [];
  const recentS2: number[] = [];
  for (let i = 0; i < winR.length; i++) {
    const nr = winR[i] / (mR || 1);
    const ng = winG[i] / (mG || 1);
    const nb = winB[i] / (mB || 1);
    recentS1.push(ng - nb);
    recentS2.push(ng + nb - 2 * nr);
  }
  const s1 = g / (mG || 1) - b / (mB || 1);
  const s2 = g / (mG || 1) + b / (mB || 1) - 2 * (r / (mR || 1));
  const alpha = meanStd(recentS1).std / meanStd(recentS2).std;
  return s1 - alpha * s2;
}

/** CHROM: Chrominance method (de Haan & Jeanne). */
function chromSample(
  r: number,
  g: number,
  b: number,
  winR: number[],
  winG: number[],
  winB: number[],
): number {
  const mR = meanStd(winR).mean || 1;
  const mG = meanStd(winG).mean || 1;
  const mB = meanStd(winB).mean || 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < winR.length; i++) {
    const rn = winR[i] / mR;
    const gn = winG[i] / mG;
    const bn = winB[i] / mB;
    xs.push(rn - gn);
    ys.push(rn + gn - 2 * bn);
  }
  const sx = meanStd(xs).std;
  const sy = meanStd(ys).std;
  const alpha = sx / (sy || 1e-6);
  const rn = r / mR;
  const gn = g / mG;
  const bn = b / mB;
  const x = rn - gn;
  const y = rn + gn - 2 * bn;
  return x - alpha * y;
}

/** Cheap skin-ish pixel gate: R>G>B-ish and not too dark/bright. */
function skinMean(
  data: Uint8ClampedArray,
): { r: number; g: number; b: number; skinFrac: number } {
  let sR = 0;
  let sG = 0;
  let sB = 0;
  let skin = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total++;
    // Loose skin heuristic (works without ML deps)
    const isSkin =
      r > 60 &&
      g > 30 &&
      b > 20 &&
      r > g &&
      r > b &&
      r - g > 8 &&
      r < 250 &&
      g < 230;
    if (isSkin) {
      sR += r;
      sG += g;
      sB += b;
      skin++;
    }
  }
  if (skin < total * 0.08) {
    // Fallback: all pixels
    sR = sG = sB = 0;
    for (let i = 0; i < data.length; i += 4) {
      sR += data[i];
      sG += data[i + 1];
      sB += data[i + 2];
    }
    return {
      r: sR / total,
      g: sG / total,
      b: sB / total,
      skinFrac: skin / total,
    };
  }
  return {
    r: sR / skin,
    g: sG / skin,
    b: sB / skin,
    skinFrac: skin / total,
  };
}

export async function runFacialRppg(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = performance.now();
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;

  const timestamps: number[] = [];
  const posSignal: number[] = [];
  const chromSignal: number[] = [];
  let filterFs = FS_SEED;
  let posFilter = new BandpassFilter(0.7, 3.0, FS_SEED, true);
  let chromFilter = new BandpassFilter(0.7, 3.0, FS_SEED, true);
  const waveformWindow: number[] = [];
  const recentPos: number[] = [];
  const tracker = new HrTracker(7);
  let lockedBpm: number | null = null;

  let detector: FaceDetector | null = null;
  if (typeof FaceDetector !== 'undefined') {
    try {
      detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      detector = null;
    }
  }

  const winR: number[] = [];
  const winG: number[] = [];
  const winB: number[] = [];

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
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
    let frameCount = 0;
    let lastRoi: Roi | null = null;
    let lastFaceBox: Roi | null = null;
    let faceMissStreak = 0;
    let prevRoiCenter: { x: number; y: number } | null = null;

    await new Promise<void>((resolve, reject) => {
      const tick = async () => {
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
          canvas!.width = vw;
          canvas!.height = vh;
          ctx.drawImage(video!, 0, 0);
          frameCount++;

          if (detector && frameCount % 8 === 0) {
            try {
              const faces = await detector.detect(canvas!);
              if (faces.length > 0) {
                const b = faces[0].boundingBox;
                lastFaceBox = { x: b.x, y: b.y, w: b.width, h: b.height };
                // Forehead band + upper cheeks (avoid mouth/eyes motion)
                lastRoi = {
                  x: Math.floor(b.x + b.width * 0.18),
                  y: Math.floor(b.y + b.height * 0.1),
                  w: Math.floor(b.width * 0.64),
                  h: Math.floor(b.height * 0.42),
                };
                faceMissStreak = 0;
              } else {
                faceMissStreak++;
                if (faceMissStreak > 3) {
                  lastRoi = null;
                  lastFaceBox = null;
                }
              }
            } catch {
              /* ignore */
            }
          }

          const guideRoi: Roi = {
            x: Math.floor(vw * 0.28),
            y: Math.floor(vh * 0.12),
            w: Math.floor(vw * 0.44),
            h: Math.floor(vh * 0.42),
          };

          const roi: Roi = lastRoi ?? guideRoi;
          const faceDetected = lastRoi != null;

          // Reject frames with large ROI jump (motion)
          const cx = roi.x + roi.w / 2;
          const cy = roi.y + roi.h / 2;
          let roiJump = false;
          if (prevRoiCenter && faceDetected) {
            const dx = (cx - prevRoiCenter.x) / vw;
            const dy = (cy - prevRoiCenter.y) / vh;
            if (Math.hypot(dx, dy) > 0.04) roiJump = true;
          }
          if (faceDetected) prevRoiCenter = { x: cx, y: cy };

          const img = ctx.getImageData(
            Math.max(0, roi.x),
            Math.max(0, roi.y),
            Math.min(roi.w, vw - roi.x),
            Math.min(roi.h, vh - roi.y),
          );
          const skin = skinMean(img.data);
          const r = skin.r;
          const g = skin.g;
          const b = skin.b;

          timestamps.push(now);
          winR.push(r);
          winG.push(g);
          winB.push(b);
          if (winR.length > WIN) {
            winR.shift();
            winG.shift();
            winB.shift();
          }

          // Retune Fs
          if (timestamps.length === 40 || (timestamps.length > 40 && timestamps.length % 30 === 0)) {
            const fsEst = robustSampleRate(timestamps, 'ms');
            if (fsEst >= 12 && fsEst <= 90 && Math.abs(fsEst - filterFs) > 1.5) {
              filterFs = fsEst;
              const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.55);
              posFilter = new BandpassFilter(band.low, band.high, filterFs, true);
              chromFilter = new BandpassFilter(band.low, band.high, filterFs, true);
            }
          }

          let posS = 0;
          let chromS = 0;
          if (winR.length >= WIN && !roiJump) {
            posS = posSample(r, g, b, winR, winG, winB);
            chromS = chromSample(r, g, b, winR, winG, winB);
          }

          const posF = posFilter.process(posS);
          const chromF = chromFilter.process(chromS);
          posSignal.push(posF);
          chromSignal.push(chromF);

          // Display blend
          const display = 0.6 * posF + 0.4 * chromF;
          waveformWindow.push(display);
          if (waveformWindow.length > 90) waveformWindow.shift();

          recentPos.push(display);
          if (recentPos.length > 40) recentPos.shift();
          const motionVar = recentVariance(recentPos);

          const faceAreaFrac = lastFaceBox
            ? (lastFaceBox.w * lastFaceBox.h) / (vw * vh)
            : 0;

          let quality = 0.1;
          let bpmLive: number | null = null;
          let cueLevel: CameraCueLevel = 'bad';
          let status = 'Center your face in the frame';

          if (detector && !faceDetected) {
            status = 'Center your face in the frame';
            cueLevel = 'bad';
          } else if (faceDetected && faceAreaFrac > 0 && faceAreaFrac < 0.06) {
            status = 'Move closer';
            cueLevel = 'warn';
          } else if (roiJump) {
            status = 'Hold still';
            cueLevel = 'warn';
          } else if (faceDetected || !detector) {
            status = 'Hold still';
            cueLevel = 'warn';
          }

          const fs = filterFs;
          if (posSignal.length > fs * 7 && !roiJump) {
            const nWin = Math.min(posSignal.length, Math.round(fs * 18));
            const sliceTs = timestamps.slice(-nWin);
            const fsWin = robustSampleRate(sliceTs, 'ms') || fs;
            const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.55);

            const prep = (sig: number[]) => {
              const slice = sig.slice(-nWin);
              let x = filtfiltBandpass(slice, band.low, band.high, fsWin);
              x = highpassMa(x, Math.round(fsWin * 1.2));
              x = savitzkyGolay(x, 7);
              return normalize(linearDetrend(x));
            };

            const posEst = estimateHeartRateSliding(
              prep(posSignal),
              { fs: fsWin, fMin: band.low, fMax: band.high, lockedBpm, useWelch: true },
              9,
              2.5,
            );
            const chromEst = estimateHeartRateSliding(
              prep(chromSignal),
              { fs: fsWin, fMin: band.low, fMax: band.high, lockedBpm, useWelch: true },
              9,
              2.5,
            );

            // Pick by quality / confidence
            const best =
              (chromEst.confidence > posEst.confidence + 0.05 ? chromEst : posEst);

            // Soft fuse when both agree
            let bpm = best.bpm;
            let conf = best.confidence;
            let q = best.quality;
            if (
              posEst.bpm != null &&
              chromEst.bpm != null &&
              Math.abs(posEst.bpm - chromEst.bpm) <= 8
            ) {
              const wP = posEst.confidence;
              const wC = chromEst.confidence;
              bpm = (posEst.bpm * wP + chromEst.bpm * wC) / (wP + wC || 1);
              conf = Math.min(1, (wP + wC) / 2 + 0.08);
              q = Math.min(1, (posEst.quality + chromEst.quality) / 2 + 0.05);
            }

            const faceOk = faceDetected || !detector;
            quality = q * (faceOk ? 1 : 0.65) * (skin.skinFrac > 0.15 ? 1 : 0.85);
            if (bpm != null && conf >= 0.25 && faceOk && faceAreaFrac >= 0.06) {
              const stable = tracker.push(bpm, 0.25, conf);
              bpmLive = stable ?? bpm;
              if (conf >= 0.45 && motionVar < 0.1) {
                lockedBpm = bpmLive;
                status = 'Good pulse signal';
                cueLevel = 'good';
              } else if (motionVar >= 0.1) {
                status = 'Hold still';
                cueLevel = 'warn';
              }
            }
          }

          const normRoi = toNorm(roi, vw, vh);
          const displayRoi: NormRect = {
            x: 1 - normRoi.x - normRoi.w,
            y: normRoi.y,
            w: normRoi.w,
            h: normRoi.h,
          };

          onLive({
            waveform: [...waveformWindow],
            quality,
            bpmLive,
            elapsedSec: elapsed,
            status,
            camera: {
              mode: 'face',
              stream: stream!,
              mirror: true,
              cueLevel,
              faceDetected: faceDetected || !detector,
              roi: displayRoi,
              roiLocked: faceDetected,
            },
          });
        }

        raf = requestAnimationFrame(() => {
          void tick();
        });
      };
      raf = requestAnimationFrame(() => {
        void tick();
      });
    });
  } finally {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
  }

  const durationSec = (performance.now() - started) / 1000;
  const fs = robustSampleRate(timestamps, 'ms') || filterFs;
  const drop = Math.min(posSignal.length, Math.round(fs * 2));

  const prepFinal = (sig: number[]) => {
    const slice = sig.slice(drop);
    const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.55);
    let x = filtfiltBandpass(slice, band.low, band.high, fs);
    x = highpassMa(x, Math.round(fs * 1.2));
    x = savitzkyGolay(x, 7);
    return normalize(linearDetrend(x));
  };

  if (posSignal.length - drop < fs * 5) {
    return {
      methodId: 'facial_rppg',
      bpm: null,
      quality: 0.05,
      confidence: 0,
      durationSec,
      notes: 'Insufficient facial PPG samples',
      timestamp: Date.now(),
    };
  }

  const posEst = estimateHeartRateSliding(
    prepFinal(posSignal),
    { fs, fMin: 0.7, fMax: 3.0, lockedBpm, useWelch: true },
    10,
    2.5,
  );
  const chromEst = estimateHeartRateSliding(
    prepFinal(chromSignal),
    { fs, fMin: 0.7, fMax: 3.0, lockedBpm, useWelch: true },
    10,
    2.5,
  );

  let bpm: number | null;
  let confidence: number;
  let quality: number;
  let snrDb: number;
  let peakCount: number;

  if (
    posEst.bpm != null &&
    chromEst.bpm != null &&
    Math.abs(posEst.bpm - chromEst.bpm) <= 8
  ) {
    const wP = Math.max(0.1, posEst.confidence);
    const wC = Math.max(0.1, chromEst.confidence);
    bpm = (posEst.bpm * wP + chromEst.bpm * wC) / (wP + wC);
    confidence = Math.min(1, (wP + wC) / 2 + 0.1);
    quality = Math.min(1, (posEst.quality + chromEst.quality) / 2 + 0.05);
    snrDb = Math.max(posEst.snrDb, chromEst.snrDb);
    peakCount = Math.max(posEst.peakCount, chromEst.peakCount);
  } else {
    const best = chromEst.confidence > posEst.confidence ? chromEst : posEst;
    bpm = best.bpm;
    confidence = best.confidence * 0.85;
    quality = best.quality;
    snrDb = best.snrDb;
    peakCount = best.peakCount;
  }

  if (confidence < 0.2 || (snrDb < 3.5 && peakCount < 4)) {
    bpm = null;
    confidence = 0;
  }

  return {
    methodId: 'facial_rppg',
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence,
    durationSec,
    peakCount,
    snrDb,
    timestamp: Date.now(),
  };
}
