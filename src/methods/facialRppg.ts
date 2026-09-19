/**
 * Facial remote PPG using POS (Plane-Orthogonal-to-Skin) algorithm.
 * FaceDetector API when available; else center-face fallback ROI.
 */

import { BandpassFilter, normalize, detrend } from '../dsp/filters';
import { estimateHeartRate } from '../dsp/hrEstimate';
import type { MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const TARGET_FPS = 30;
const DURATION = METHOD_META.facial_rppg.durationSec;
const WIN = 48; // ~1.6 s temporal window for POS

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

export async function runFacialRppg(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = Date.now();
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;

  const rawR: number[] = [];
  const rawG: number[] = [];
  const rawB: number[] = [];
  const posSignal: number[] = [];
  const filter = new BandpassFilter(0.7, 3.5, TARGET_FPS, true);
  const waveformWindow: number[] = [];

  let detector: FaceDetector | null = null;
  if (typeof FaceDetector !== 'undefined') {
    try {
      detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      detector = null;
    }
  }

  // Sliding buffers for POS
  const winR: number[] = [];
  const winG: number[] = [];
  const winB: number[] = [];

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: TARGET_FPS },
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

    await new Promise<void>((resolve, reject) => {
      const tick = async () => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const elapsed = (Date.now() - started) / 1000;
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

          // Detect face every ~10 frames
          if (detector && frameCount % 10 === 0) {
            try {
              const faces = await detector.detect(canvas!);
              if (faces.length > 0) {
                const b = faces[0].boundingBox;
                // Forehead + upper cheeks: top 55% of face, inset horizontally
                lastRoi = {
                  x: Math.floor(b.x + b.width * 0.15),
                  y: Math.floor(b.y + b.height * 0.08),
                  w: Math.floor(b.width * 0.7),
                  h: Math.floor(b.height * 0.45),
                };
              }
            } catch {
              /* ignore detect errors */
            }
          }

          const roi: Roi =
            lastRoi ??
            ({
              x: Math.floor(vw * 0.3),
              y: Math.floor(vh * 0.15),
              w: Math.floor(vw * 0.4),
              h: Math.floor(vh * 0.35),
            } satisfies Roi);

          const img = ctx.getImageData(
            Math.max(0, roi.x),
            Math.max(0, roi.y),
            Math.min(roi.w, vw - roi.x),
            Math.min(roi.h, vh - roi.y),
          );
          let sR = 0;
          let sG = 0;
          let sB = 0;
          const d = img.data;
          const px = img.width * img.height;
          for (let i = 0; i < d.length; i += 4) {
            sR += d[i];
            sG += d[i + 1];
            sB += d[i + 2];
          }
          const r = sR / px;
          const g = sG / px;
          const b = sB / px;
          rawR.push(r);
          rawG.push(g);
          rawB.push(b);

          winR.push(r);
          winG.push(g);
          winB.push(b);
          if (winR.length > WIN) {
            winR.shift();
            winG.shift();
            winB.shift();
          }

          let posSample = 0;
          if (winR.length >= WIN) {
            // Temporal normalization
            const mean = (arr: number[]) => arr.reduce((a, c) => a + c, 0) / arr.length;
            const mR = mean(winR);
            const mG = mean(winG);
            const mB = mean(winB);
            const nR = r / (mR || 1);
            const nG = g / (mG || 1);
            const nB = b / (mB || 1);
            // POS projection: S1 = G̃ - B̃, S2 = G̃ + B̃ - 2R̃
            const s1 = nG - nB;
            const s2 = nG + nB - 2 * nR;
            // α = σ(S1)/σ(S2) over window — approximate with recent values
            const recentS1: number[] = [];
            const recentS2: number[] = [];
            for (let i = 0; i < winR.length; i++) {
              const nr = winR[i] / (mR || 1);
              const ng = winG[i] / (mG || 1);
              const nb = winB[i] / (mB || 1);
              recentS1.push(ng - nb);
              recentS2.push(ng + nb - 2 * nr);
            }
            const std = (arr: number[]) => {
              const m = mean(arr);
              let v = 0;
              for (const x of arr) v += (x - m) ** 2;
              return Math.sqrt(v / arr.length) || 1;
            };
            const alpha = std(recentS1) / std(recentS2);
            posSample = s1 - alpha * s2;
          }

          const filtered = filter.process(posSample);
          posSignal.push(filtered);
          waveformWindow.push(filtered);
          if (waveformWindow.length > 90) waveformWindow.shift();

          let quality = 0.1;
          let bpmLive: number | null = null;
          let status = lastRoi
            ? 'Face locked — keep still…'
            : 'Center your face in the frame…';

          if (posSignal.length > TARGET_FPS * 6) {
            const slice = posSignal.slice(-Math.min(posSignal.length, TARGET_FPS * 20));
            const est = estimateHeartRate(normalize(detrend(slice, Math.round(TARGET_FPS * 1.2))), {
              fs: TARGET_FPS,
              fMin: 0.75,
              fMax: 3.0,
            });
            quality = est.quality * (lastRoi ? 1 : 0.7);
            bpmLive = est.bpm;
            if (est.bpm) status = `Live ~${Math.round(est.bpm)} BPM`;
          }

          onLive({
            waveform: [...waveformWindow],
            quality,
            bpmLive,
            elapsedSec: elapsed,
            status,
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

  const durationSec = (Date.now() - started) / 1000;
  const drop = Math.min(posSignal.length, Math.round(TARGET_FPS * 2));
  const usable = normalize(detrend(posSignal.slice(drop), Math.round(TARGET_FPS * 1.2)));
  const est = estimateHeartRate(usable, { fs: TARGET_FPS, fMin: 0.75, fMax: 3.0 });

  return {
    methodId: 'facial_rppg',
    bpm: est.bpm,
    quality: est.quality,
    confidence: est.confidence,
    durationSec,
    peakCount: est.peakCount,
    snrDb: est.snrDb,
    timestamp: Date.now(),
  };
}
