/**
 * On-device voice disguise for Peer voice (Web Audio).
 * Mild pitch + formant shift — aims for clear speech, not a robot effect.
 * Not guaranteed anonymity.
 */

export type VoiceDisguisePreset = 'off' | 'deeper' | 'higher';

export type DisguisedMic = {
  /** Stream to send over WebRTC (disguised when preset !== off). */
  sendStream: MediaStream;
  setMuted: (muted: boolean) => void;
  close: () => void;
};

type PitchConfig = { ratio: number; lowShelf: number; highShelf: number; label: string };

const PRESETS: Record<Exclude<VoiceDisguisePreset, 'off'>, PitchConfig> = {
  // Mild ratios keep speech intelligible; shelves nudge “formant” character.
  deeper: { ratio: 0.9, lowShelf: 3, highShelf: -2.5, label: 'deeper' },
  higher: { ratio: 1.1, lowShelf: -2, highShelf: 3, label: 'higher' }
};

const WORKLET_NAME = 'peerpoint-pitch-shift';

const WORKLET_SOURCE = `
class PeerPointPitchShift extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = 1;
    this._readPos = 0;
    this._buf = new Float32Array(8192);
    this._writePos = 0;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.ratio === 'number') {
        const r = e.data.ratio;
        this._ratio = Math.min(1.25, Math.max(0.8, r));
      }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const chIn = input[0];
    const chOut = output[0];
    const buf = this._buf;
    const len = buf.length;
    const ratio = this._ratio;

    for (let i = 0; i < chIn.length; i++) {
      buf[this._writePos] = chIn[i];
      this._writePos = (this._writePos + 1) % len;
    }

    for (let i = 0; i < chOut.length; i++) {
      const i0 = Math.floor(this._readPos) % len;
      const i1 = (i0 + 1) % len;
      const frac = this._readPos - Math.floor(this._readPos);
      let sample = buf[i0] * (1 - frac) + buf[i1] * frac;
      // Crossfade near wrap to reduce clicks
      const fade = 64;
      const distWrite = (this._writePos - i0 + len) % len;
      if (distWrite < fade) {
        sample *= distWrite / fade;
      }
      chOut[i] = sample;
      this._readPos += ratio;
      if (this._readPos >= len) this._readPos -= len;
    }

    // Copy to other channels if present
    for (let c = 1; c < output.length; c++) {
      if (output[c]) output[c].set(chOut);
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', PeerPointPitchShift);
`;

let workletBlobUrl: string | null = null;

function workletUrl(): string {
  if (!workletBlobUrl) {
    workletBlobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  }
  return workletBlobUrl;
}

/**
 * Capture mic and optionally disguise before WebRTC send.
 * Processing stays on-device (AudioContext) — nothing is uploaded for conversion.
 */
export async function openDisguisedMicrophone(preset: VoiceDisguisePreset): Promise<DisguisedMic> {
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  if (preset === 'off') {
    return {
      sendStream: rawStream,
      setMuted: (muted: boolean): void => {
        for (const t of rawStream.getAudioTracks()) t.enabled = !muted;
      },
      close: (): void => {
        for (const t of rawStream.getTracks()) t.stop();
      }
    };
  }

  const cfg = PRESETS[preset];
  const ctx = new AudioContext();
  await ctx.resume();

  try {
    await ctx.audioWorklet.addModule(workletUrl());
  } catch (e) {
    for (const t of rawStream.getTracks()) t.stop();
    await ctx.close().catch(() => undefined);
    throw new Error(
      e instanceof Error
        ? `Voice disguise unavailable on this browser (${e.message}). Try another browser or turn disguise off.`
        : 'Voice disguise unavailable on this browser.'
    );
  }

  const source = ctx.createMediaStreamSource(rawStream);
  const pitch = new AudioWorkletNode(ctx, WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1]
  });
  pitch.port.postMessage({ ratio: cfg.ratio });

  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 320;
  low.gain.value = cfg.lowShelf;

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 2200;
  high.gain.value = cfg.highShelf;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.15;

  const dryWet = ctx.createGain();
  dryWet.gain.value = 1;

  const dest = ctx.createMediaStreamDestination();
  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;

  source.connect(pitch);
  pitch.connect(low);
  low.connect(high);
  high.connect(comp);
  comp.connect(muteGain);
  muteGain.connect(dryWet);
  dryWet.connect(dest);

  // Keep AudioContext alive; send only processed track(s).
  const sendStream = dest.stream;

  return {
    sendStream,
    setMuted: (muted: boolean): void => {
      muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      for (const t of rawStream.getAudioTracks()) t.enabled = !muted;
    },
    close: (): void => {
      try {
        source.disconnect();
        pitch.disconnect();
        low.disconnect();
        high.disconnect();
        comp.disconnect();
        muteGain.disconnect();
        dryWet.disconnect();
      } catch {
        /* ignore */
      }
      for (const t of rawStream.getTracks()) t.stop();
      void ctx.close();
    }
  };
}
