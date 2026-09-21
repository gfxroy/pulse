import { useEffect, useRef, type CSSProperties } from 'react';
import type { CameraGuideLive } from '../types';

interface Props {
  guide: CameraGuideLive;
  status: string;
  showFlashHint?: boolean;
}

export function CameraGuide({ guide, status, showFlashHint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== guide.stream) {
      video.srcObject = guide.stream;
      void video.play().catch(() => {
        /* autoplay may fail briefly */
      });
    }
    return () => {
      if (video.srcObject === guide.stream) video.srcObject = null;
    };
  }, [guide.stream]);

  const levelClass =
    guide.cueLevel === 'good'
      ? 'camera-guide--good'
      : guide.cueLevel === 'warn'
        ? 'camera-guide--warn'
        : 'camera-guide--bad';

  return (
    <div className={`camera-guide ${levelClass}`}>
      <div className="camera-guide__stage">
        <video
          ref={videoRef}
          className={`camera-guide__video${guide.mirror ? ' camera-guide__video--mirror' : ''}`}
          playsInline
          muted
          autoPlay
        />
        <p className="capture-feed-label">camera feed</p>

        {guide.mode === 'fingertip' ? (
          <div className="camera-guide__finger-target" aria-hidden>
            <div className="camera-guide__finger-ring" />
            <span className="camera-guide__finger-label">Cover Lens</span>
          </div>
        ) : (
          <FaceOverlay guide={guide} />
        )}

        <div className="camera-guide__status" role="status">
          {status}
        </div>
      </div>
      {showFlashHint && guide.mode === 'fingertip' && guide.cueLevel === 'bad' && (
        <p className="camera-guide__flash">Turn flashlight on manually</p>
      )}
    </div>
  );
}

function FaceOverlay({ guide }: { guide: CameraGuideLive }) {
  const roi = guide.roi ?? { x: 0.28, y: 0.12, w: 0.44, h: 0.42 };
  const style: CSSProperties = {
    left: `${roi.x * 100}%`,
    top: `${roi.y * 100}%`,
    width: `${roi.w * 100}%`,
    height: `${roi.h * 100}%`,
  };
  return (
    <div
      className={`camera-guide__face-roi${guide.roiLocked ? ' camera-guide__face-roi--locked' : ''}`}
      style={style}
      aria-hidden
    >
      <span className="camera-guide__face-hint">Forehead / cheeks</span>
    </div>
  );
}
