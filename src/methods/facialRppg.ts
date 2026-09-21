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
  resampleUniform,
  medianFilter3,
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

/**
 * Inclusive YCbCr skin gate. The old R>G && R−G>8 rule dropped melanin-rich
 * skin — a failure mode for the people this app is for. Wide Cb/Cr box plus
 * a low Y floor; specular highlights are trimmed separately.
 */
function isSkinYCbCr(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (y < 24 || y > 250) return false;
  return cb >= 70 && cb <= 150 && cr >= 120 && cr <= 185;
}

function skinMean(
  data: Uint8ClampedArray,
): { r: number; g: number; b: number; skinFrac: number } {
  const pixels: { r: number; g: number; b: number; y: number }[] = [];
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total++;
    if (isSkinYCbCr(r, g, b)) {
      pixels.push({ r, g, b, y: 0.299 * r + 0.587 * g + 0.114 * b });
    }
  }

  const use = pixels.length >= total * 0.12 ? pixels : collectAll(data);
  if (use.length === 0) {
    return { r: 0, g: 0, b: 0, skinFrac: 0 };
  }

  // Drop brightest 12% (specular) so highlights don't dominate the ROI mean.
  use.sort((a, b) => a.y - b.y);
  const lo = 0;
  const hi = Math.max(1, Math.floor(use.length * 0.88));
  const trimmed = use.slice(lo, hi);
  let sR = 0;
  let sG = 0;
  let sB = 0;
  for (const p of trimmed) {
    sR += p.r;
    sG += p.g;
    sB += p.b;
  }
  const n = trimmed.length;
  return {
    r: sR / n,
    g: sG / n,
    b: sB / n,
    skinFrac: pixels.length / total,
  };
}

function collectAll(data: Uint8ClampedArray): { r: number; g: number; b: number; y: number }[] {
  const out: { r: number; g: number; b: number; y: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    out.push({ r, g, b, y: 0.299 * r + 0.587 * g + 0.114 * b });
  }
  return out;
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
  const posRaw: number[] = [];
  const chromRaw: number[] = [];
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
    const detectCanvas = document.createElement('canvas');
    const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });
    let frameCount = 0;
    let lastRoi: Roi | null = null;
    let lastFaceBox: Roi | null = null;
    let faceMissStreak = 0;
    let prevRoiCenter: { x: number; y: number } | null = null;
    let detecting = false;
    let lastCurrentTime = -1;

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
        const ct = video!.currentTime;
        if (vw > 0 && vh > 0 && ct !== lastCurrentTime) {
          lastCurrentTime = ct;
          // Downscale for ROI sampling — full-res getImageData is wasted.
          const dw = 320;
          const dh = Math.max(1, Math.round((vh / vw) * dw));
          canvas!.width = dw;
          canvas!.height = dh;
          ctx.drawImage(video!, 0, 0, dw, dh);
          frameCount++;

          if (detector && detectCtx && frameCount % 8 === 0 && !detecting) {
            detecting = true;
            detectCanvas.width = dw;
            detectCanvas.height = dh;
            detectCtx.drawImage(canvas!, 0, 0);
            const snap = detectCanvas;
            void detector
              .detect(snap)
              .then((faces) => {
                detecting = false;
                if (faces.length > 0) {
                  const b = faces[0].boundingBox;
                  lastFaceBox = { x: b.x, y: b.y, w: b.width, h: b.height };
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
              })
              .catch(() => {
                detecting = false;
              });
          }

          const guideRoi: Roi = {
            x: Math.floor(dw * 0.28),
            y: Math.floor(dh * 0.12),
            w: Math.floor(dw * 0.44),
            h: Math.floor(dh * 0.42),
          };

          const roi: Roi = lastRoi ?? guideRoi;
          const faceDetected = lastRoi != null;

          const cx = roi.x + roi.w / 2;
          const cy = roi.y + roi.h / 2;
          let roiJump = false;
          if (prevRoiCenter && faceDetected) {
            const dx = (cx - prevRoiCenter.x) / dw;
            const dy = (cy - prevRoiCenter.y) / dh;
            if (Math.hypot(dx, dy) > 0.04) roiJump = true;
          }
          if (faceDetected) prevRoiCenter = { x: cx, y: cy };

          const img = ctx.getImageData(
            Math.max(0, roi.x),
            Math.max(0, roi.y),
            Math.max(1, Math.min(roi.w, dw - roi.x)),
            Math.max(1, Math.min(roi.h, dh - roi.y)),
          );
          const skin = skinMean(img.data);
          const r = skin.r;
          const g = skin.g;
          const b = skin.b;

          winR.push(r);
          winG.push(g);
          winB.push(b);
          if (winR.length > WIN) {
            winR.shift();
            winG.shift();
            winB.shift();
          }

          if (timestamps.length === 40 || (timestamps.length > 40 && timestamps.length % 30 === 0)) {
            const fsEst = robustSampleRate(timestamps, 'ms');
            if (fsEst >= 12 && fsEst <= 90 && Math.abs(fsEst - filterFs) > 1.5) {
              filterFs = fsEst;
              const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.75);
              posFilter = new BandpassFilter(band.low, band.high, filterFs, true);
              chromFilter = new BandpassFilter(band.low, band.high, filterFs, true);
            }
          }

          // Skip motion frames entirely — do not inject zeros into the traces.
          if (winR.length >= WIN && !roiJump) {
            const posS = posSample(r, g, b, winR, winG, winB);
            const chromS = chromSample(r, g, b, winR, winG, winB);
            timestamps.push(now);
            posRaw.push(posS);
            chromRaw.push(chromS);

            const posF = posFilter.process(posS);
            const chromF = chromFilter.process(chromS);

            const display = 0.6 * posF + 0.4 * chromF;
            waveformWindow.push(display);
            if (waveformWindow.length > 90) waveformWindow.shift();
            recentPos.push(display);
            if (recentPos.length > 40) recentPos.shift();
          }

          const motionVar = recentVariance(recentPos);

          const faceAreaFrac = lastFaceBox
            ? (lastFaceBox.w * lastFaceBox.h) / (dw * dh)
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
          if (posRaw.length > fs * 7 && !roiJump) {
            const nWin = Math.min(posRaw.length, Math.round(fs * 18));
            const sliceTs = timestamps.slice(-nWin);
            const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.75);

            const prep = (sig: number[]) => {
              const { signal: grid, fs: fsWin } = resampleUniform(
                sig.slice(-nWin),
                sliceTs,
                'ms',
              );
              let x = medianFilter3(grid);
              x = filtfiltBandpass(x, band.low, band.high, fsWin);
              x = highpassMa(x, Math.round(fsWin * 1.2));
              x = savitzkyGolay(x, 7);
              return { x: normalize(linearDetrend(x)), fsWin };
            };

            const posPrep = prep(posRaw);
            const chromPrep = prep(chromRaw);
            const posEst = estimateHeartRateSliding(
              posPrep.x,
              { fs: posPrep.fsWin, fMin: band.low, fMax: band.high, lockedBpm, useWelch: true },
              9,
              2.5,
            );
            const chromEst = estimateHeartRateSliding(
              chromPrep.x,
              { fs: chromPrep.fsWin, fMin: band.low, fMax: band.high, lockedBpm, useWelch: true },
              9,
              2.5,
            );

            const best =
              chromEst.confidence > posEst.confidence + 0.05 ? chromEst : posEst;

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
            quality = q * (faceOk ? 1 : 0.65) * (skin.skinFrac > 0.12 ? 1 : 0.85);
            if (bpm != null && conf >= 0.25 && faceOk && (faceAreaFrac >= 0.06 || !detector)) {
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

          const normRoi = toNorm(roi, dw, dh);
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

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
  }

  const durationSec = (performance.now() - started) / 1000;
  const fsEst = robustSampleRate(timestamps, 'ms') || filterFs;
  const drop = Math.min(posRaw.length, Math.round(fsEst * 3));
  const sliceTs = timestamps.slice(drop);
  const band = adaptiveBandHz(lockedBpm, 0.7, 3.0, 0.75);

  const prepFinal = (sig: number[]) => {
    const { signal: grid, fs } = resampleUniform(sig.slice(drop), sliceTs, 'ms');
    let x = medianFilter3(grid);
    x = filtfiltBandpass(x, band.low, band.high, fs);
    x = highpassMa(x, Math.round(fs * 1.2));
    x = savitzkyGolay(x, 7);
    return { x: normalize(linearDetrend(x)), fs };
  };

  if (posRaw.length - drop < fsEst * 5) {
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

  const posPrep = prepFinal(posRaw);
  const chromPrep = prepFinal(chromRaw);
  const posEst = estimateHeartRateSliding(
    posPrep.x,
    { fs: posPrep.fs, fMin: 0.7, fMax: 3.0, lockedBpm, useWelch: true },
    10,
    2.5,
  );
  const chromEst = estimateHeartRateSliding(
    chromPrep.x,
    { fs: chromPrep.fs, fMin: 0.7, fMax: 3.0, lockedBpm, useWelch: true },
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
