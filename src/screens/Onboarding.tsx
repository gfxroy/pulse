import { useState } from 'react';
import { Disclaimer } from '../components/Disclaimer';
import type { Capabilities } from '../types';
import { requestMotionPermission } from '../capabilities/probe';

interface Props {
  caps: Capabilities | null;
  probing: boolean;
  onComplete: (motionGranted: boolean) => void;
}

export function Onboarding({ caps, probing, onComplete }: Props) {
  const [motionAsked, setMotionAsked] = useState(false);
  const [motionGranted, setMotionGranted] = useState(false);
  const [step, setStep] = useState(0);

  const handleMotionTap = async () => {
    const ok = await requestMotionPermission();
    setMotionAsked(true);
    setMotionGranted(ok);
  };

  return (
    <div className="screen screen--onboarding">
      <div className="hero">
        <span className="hero__mark" aria-hidden />
        <h1>Pulse Wellness</h1>
        <p className="hero__tag">Multi-sensor heart-rate estimate</p>
      </div>

      {step === 0 && (
        <section className="card">
          <h2>Before you begin</h2>
          <Disclaimer />
          <ul className="checklist">
            <li>Works best on a phone over HTTPS (or localhost).</li>
            <li>Use good lighting for camera methods.</li>
            <li>Stay still during each measurement.</li>
            <li>For fingertip PPG, turn the flashlight on manually — we never control the torch.</li>
          </ul>
          <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
            I understand — continue
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="card">
          <h2>Sensor check</h2>
          {probing || !caps ? (
            <p className="muted">Probing cameras, microphone, and motion…</p>
          ) : (
            <ul className="cap-list">
              <CapRow ok={caps.secureContext} label="Secure context (HTTPS)" />
              <CapRow ok={caps.rearCamera} label="Rear camera (fingertip PPG)" />
              <CapRow ok={caps.frontCamera} label="Front camera (facial rPPG)" />
              <CapRow ok={caps.microphone} label="Microphone (PCG)" />
              <CapRow
                ok={caps.motion && (!caps.motionPermissionNeeded || motionGranted)}
                label="Motion sensors (accel / gyro)"
              />
              <CapRow ok={caps.faceDetector} label="FaceDetector API (optional)" soft />
            </ul>
          )}

          {caps?.motionPermissionNeeded && !motionAsked && (
            <div className="callout">
              <p>
                iOS requires a tap to enable motion sensors. Tap below to grant access (must be
                HTTPS).
              </p>
              <button type="button" className="btn btn--secondary" onClick={() => void handleMotionTap()}>
                Enable motion sensors
              </button>
            </div>
          )}

          {caps?.motionPermissionNeeded && motionAsked && (
            <p className={motionGranted ? 'ok-text' : 'warn-text'}>
              {motionGranted
                ? 'Motion permission granted.'
                : 'Motion permission denied — chest/handheld methods unavailable.'}
            </p>
          )}

          <button
            type="button"
            className="btn btn--primary"
            disabled={probing || !caps}
            onClick={() =>
              onComplete(
                caps?.motionPermissionNeeded ? motionGranted : Boolean(caps?.motion),
              )
            }
          >
            Continue to home
          </button>
        </section>
      )}
    </div>
  );
}

function CapRow({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  return (
    <li className={`cap-row ${ok ? 'cap-row--ok' : soft ? 'cap-row--soft' : 'cap-row--no'}`}>
      <span className="cap-row__dot" aria-hidden />
      <span>{label}</span>
      <span className="cap-row__state">{ok ? 'Ready' : soft ? 'N/A' : 'Unavailable'}</span>
    </li>
  );
}
