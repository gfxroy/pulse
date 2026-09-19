import type { Capabilities } from '../types';

async function canGetCamera(facingMode: 'user' | 'environment'): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    // Try enumerating devices as soft signal
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((d) => d.kind === 'videoinput');
    } catch {
      return false;
    }
  }
}

async function canGetMic(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

function motionSupported(): { available: boolean; permissionNeeded: boolean } {
  const hasDM = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  if (!hasDM) return { available: false, permissionNeeded: false };
  // iOS 13+: requestPermission exists and must be called from a user gesture
  const maybeReq = (
    DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> }
  ).requestPermission;
  if (typeof maybeReq === 'function') {
    return { available: true, permissionNeeded: true };
  }
  return { available: true, permissionNeeded: false };
}

function faceDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

export async function probeCapabilities(): Promise<Capabilities> {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const motion = motionSupported();

  // Probe cameras sequentially to avoid hammering permission prompts
  const rearCamera = secureContext ? await canGetCamera('environment') : false;
  const frontCamera = secureContext ? await canGetCamera('user') : false;
  const microphone = secureContext ? await canGetMic() : false;

  return {
    rearCamera,
    frontCamera,
    microphone,
    motion: motion.available,
    motionPermissionNeeded: motion.permissionNeeded,
    faceDetector: faceDetectorAvailable(),
    secureContext,
  };
}

/**
 * Must be called from a user tap on iOS. Returns true if motion events are allowed.
 */
export async function requestMotionPermission(): Promise<boolean> {
  const maybeReq = (
    DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> }
  ).requestPermission;
  if (typeof maybeReq !== 'function') return true;
  try {
    const state = await maybeReq.call(DeviceMotionEvent);
    return state === 'granted';
  } catch {
    return false;
  }
}
