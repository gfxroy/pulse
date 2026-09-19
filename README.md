# Pulse Wellness — Heart Rate Monitor

Multi-method **wellness** heart-rate estimate for the browser. Uses rear-camera fingertip PPG, facial rPPG (POS), chest accel/gyro, handheld accel, and microphone phonocardiography. Confidence-weighted fusion for guided multi-method scans.

> **Not a medical device.** Readings are wellness estimates only — not for diagnosis, treatment, or clinical decisions.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (Vite defaults to `http://localhost:5173`).

| Script        | Description                |
|---------------|----------------------------|
| `npm run dev` | Dev server with HMR        |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint                     |

## HTTPS / localhost notes for sensors

Camera, microphone, and (on iOS) motion permission APIs require a **secure context**:

- `http://localhost` / `http://127.0.0.1` — OK for development
- `https://…` — required on real phones over LAN/internet
- Plain `http://192.168.x.x` — sensors will often fail

For phone testing, use a tunnel (e.g. Cloudflare Tunnel, ngrok) or deploy to HTTPS hosting.

## Methods

| Method | Sensor | Notes |
|--------|--------|-------|
| Fingertip PPG | Rear camera | Highest confidence. Red-channel mean → bandpass 0.7–4 Hz → peaks + FFT. **Manual flashlight only.** |
| Chest accel + gyro | DeviceMotion | Lie down, phone on sternum. Accel Z + gyro envelopes cross-validated. |
| Facial rPPG | Front camera | POS pulse extraction on forehead/cheek ROI (FaceDetector when available). |
| Mic PCG | Microphone | 20–200 Hz bandpass, Shannon energy, S1/S2 via systole &lt; diastole, HR from S1–S1. |
| Handheld accel | DeviceMotion | Same family as chest with stronger smoothing; **least precise**. |

Capability probe gates each method separately. Guided scan runs available methods in sequence and fuses with quality × reliability weights (finger &gt; chest &gt; face &gt; mic &gt; handheld). Strong disagreements are flagged as outliers and down-weighted.

## iOS motion permission

`DeviceMotionEvent.requestPermission()` **must** run from a user tap during onboarding (HTTPS). The app never requests it silently.

## Manual flashlight (fingertip PPG)

This app **never** attempts programmatic torch/flashlight control. For fingertip PPG, turn the flashlight on yourself via Control Center (iOS) or Quick Settings (Android), then cover the rear camera + flash with your fingertip.

## Privacy

All processing runs locally in the browser. History is stored in `localStorage` only. No sensor data is uploaded.

## Stack

Vite + React + TypeScript. Hand-rolled DSP under `src/dsp/` (cascaded Butterworth biquads, FFT, peak detection, Shannon energy, SNR/quality). Method pipelines under `src/methods/`.

## Disclaimer

Pulse Wellness provides non-clinical wellness estimates. Sensor quality, placement, lighting, and device differences strongly affect accuracy. Seek professional medical advice for health concerns.
