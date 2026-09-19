/**
 * Fingertip PPG via rear camera red-channel mean.
 * Manual flashlight only — never torch API.
 */

import { BandpassFilter, normalize } from '../dsp/filters';
import { estimateHeartRate } from '../dsp/hrEstimate';
import type { CameraCueLevel, MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const TARGET_FPS = 30;
const DURATION = METHOD_META.fingertip_ppg.durationSec;

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
  const started = Date.now();
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;
  let settled = false;

  const samples: number[] = [];
  const filter = new BandpassFilter(0.7, 4.0, TARGET_FPS, true);
  const waveformWindow: number[] = [];
  const recentMeanR: number[] = [];

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: TARGET_FPS },
      },
      audio: false,
    });
    // Intentionally do NOT touch torch / torch constraint.

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
        const elapsed = (Date.now() - started) / 1000;
        if (elapsed >= DURATION) {
          resolve();
          return;
        }

        const vw = video!.videoWidth;
        const vh = video!.videoHeight;
        if (vw > 0 && vh > 0) {
          // Center crop ~40% for fingertip region (matches on-screen target)
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
          const coverageOk = meanR > 80 && redDominance > 1.1;

          recentMeanR.push(meanR);
          if (recentMeanR.length > TARGET_FPS) recentMeanR.shift();
          const motionVar = recentVariance(recentMeanR);

          const filtered = filter.process(meanR);
          samples.push(filtered);

          waveformWindow.push(filtered);
          if (waveformWindow.length > 90) waveformWindow.shift();

          let quality = 0.15;
          let bpmLive: number | null = null;
          let cueLevel: CameraCueLevel = 'bad';
          let status = 'Cover the lens completely';

          // Real metric-driven cues (not timers)
          if (meanLuma < 25 && meanR < 40) {
            status = 'Too dark / turn flashlight on';
            cueLevel = 'bad';
          } else if (!coverageOk) {
            if (meanR < 60 || redDominance < 0.95) {
              status = 'Cover the lens completely';
            } else {
              status = 'Press gently — need more red glow';
            }
            cueLevel = 'bad';
          } else if (motionVar > 900 && samples.length > TARGET_FPS) {
            // Large frame-to-frame red swings → motion / incomplete cover
            status = 'Hold still';
            cueLevel = 'warn';
          } else {
            status = 'Hold still';
            cueLevel = 'warn';
          }

          if (samples.length > TARGET_FPS * 4) {
            const slice = samples.slice(-Math.min(samples.length, TARGET_FPS * 12));
            const est = estimateHeartRate(normalize(slice), {
              fs: TARGET_FPS,
              fMin: 0.7,
              fMax: 3.5,
            });
            quality = coverageOk ? est.quality : est.quality * 0.4;
            bpmLive = est.bpm;
            if (coverageOk && est.quality >= 0.45 && est.bpm) {
              status = 'Good signal';
              cueLevel = 'good';
              settled = true;
            } else if (coverageOk && motionVar <= 900) {
              status = 'Hold still';
              cueLevel = 'warn';
            }
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

  const durationSec = (Date.now() - started) / 1000;
  // Drop first ~1.5s filter transient
  const drop = Math.min(samples.length, Math.round(TARGET_FPS * 1.5));
  const usable = normalize(samples.slice(drop));
  const est = estimateHeartRate(usable, { fs: TARGET_FPS, fMin: 0.7, fMax: 3.5 });

  return {
    methodId: 'fingertip_ppg',
    bpm: est.bpm,
    quality: est.quality,
    confidence: est.confidence * (settled ? 1 : 0.75),
    durationSec,
    peakCount: est.peakCount,
    snrDb: est.snrDb,
    notes: settled ? undefined : 'Signal coverage may have been weak',
    timestamp: Date.now(),
  };
}
