/**
 * Soft Web Audio cues for staff assignment alerts, peer-joined notices, and chat messages.
 * Browsers block sound until a user gesture — unlockSoftAudio() plays a silent buffer to unlock.
 */

let sharedCtx: AudioContext | null = null;
let assignmentLoopTimer: ReturnType<typeof setInterval> | null = null;
let joinLoopTimer: ReturnType<typeof setInterval> | null = null;
let unlocked = false;
let gestureHooked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

/** Play a near-silent buffer so the AudioContext is fully unlocked after a gesture. */
async function primeContext(ctx: AudioContext): Promise<void> {
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch {
    /* ignore — will retry on next gesture */
  }
}

/** Call from a user gesture so browsers allow later autoplay of soft cues. */
export function unlockSoftAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  void primeContext(ctx);
}

/** Install one-time listeners so the first click/tap/key anywhere unlocks audio. */
export function ensureSoftAudioGestureHook(): void {
  if (typeof window === 'undefined' || gestureHooked) return;
  gestureHooked = true;
  const onGesture = (): void => {
    unlockSoftAudio();
  };
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  window.addEventListener('keydown', onGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
}

function beep(
  freqs: number[],
  opts?: { volume?: number; durationSec?: number; gapSec?: number; type?: OscillatorType }
): void {
  const ctx = getCtx();
  if (!ctx) return;
  void (async () => {
    if (ctx.state === 'suspended' || !unlocked) await primeContext(ctx);
    if (ctx.state === 'suspended') return;
    const volume = opts?.volume ?? 0.12;
    const durationSec = opts?.durationSec ?? 0.16;
    const gapSec = opts?.gapSec ?? 0.09;
    const type = opts?.type ?? 'sine';
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = now + i * (durationSec + gapSec);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.03);
    });
  })();
}

/** Short blip when a chat message arrives. */
export function playMessageChime(): void {
  ensureSoftAudioGestureHook();
  beep([698.46, 880], { volume: 0.1, durationSec: 0.11, gapSec: 0.06 });
}

/** Two-note pulse for assignment / peer-joined (audible but not harsh). */
export function playSoftAlertPulse(): void {
  ensureSoftAudioGestureHook();
  beep([523.25, 659.25, 784], { volume: 0.14, durationSec: 0.18, gapSec: 0.08 });
}

export function startAssignmentAlertLoop(): void {
  stopAssignmentAlertLoop();
  ensureSoftAudioGestureHook();
  unlockSoftAudio();
  playSoftAlertPulse();
  assignmentLoopTimer = setInterval(() => {
    playSoftAlertPulse();
  }, 2800);
}

export function stopAssignmentAlertLoop(): void {
  if (assignmentLoopTimer) {
    clearInterval(assignmentLoopTimer);
    assignmentLoopTimer = null;
  }
}

export function startPeerJoinedAlertLoop(): void {
  stopPeerJoinedAlertLoop();
  ensureSoftAudioGestureHook();
  unlockSoftAudio();
  playSoftAlertPulse();
  joinLoopTimer = setInterval(() => {
    playSoftAlertPulse();
  }, 3000);
}

export function stopPeerJoinedAlertLoop(): void {
  if (joinLoopTimer) {
    clearInterval(joinLoopTimer);
    joinLoopTimer = null;
  }
}

export function stopAllSoftAlerts(): void {
  stopAssignmentAlertLoop();
  stopPeerJoinedAlertLoop();
}

/** Manual test from the alert banner UI. */
export function testAlertSound(): void {
  ensureSoftAudioGestureHook();
  unlockSoftAudio();
  playSoftAlertPulse();
}
