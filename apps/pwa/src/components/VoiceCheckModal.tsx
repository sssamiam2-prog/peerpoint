import * as React from 'react';
import { openDisguisedMicrophone, type VoiceDisguisePreset } from '../lib/voiceDisguise';

const DISGUISE_KEY = 'peerpoint_voice_disguise';

export function loadVoiceDisguisePref(): VoiceDisguisePreset {
  try {
    const v = sessionStorage.getItem(DISGUISE_KEY);
    if (v === 'deeper' || v === 'higher' || v === 'off') return v;
  } catch {
    /* ignore */
  }
  return 'off';
}

function playTestTone(): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 523.25;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
  osc.start(t0);
  osc.stop(t0 + 0.75);
  osc.onended = () => {
    void ctx.close();
  };
}

type Props = {
  disguise: VoiceDisguisePreset;
  onDisguiseChange: (d: VoiceDisguisePreset) => void;
  /** Compact layout for modal body */
  compact?: boolean;
};

/**
 * Mic + speaker self-check. Nothing is sent to another person or recorded for the agency.
 */
export function VoiceCheckPanel(props: Props): React.ReactElement {
  const { disguise, onDisguiseChange, compact } = props;
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [level, setLevel] = React.useState(0);
  const [loopback, setLoopback] = React.useState(false);
  const [status, setStatus] = React.useState('Tap Start mic test to begin.');
  const micRef = React.useRef<Awaited<ReturnType<typeof openDisguisedMicrophone>> | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const analyserCtxRef = React.useRef<AudioContext | null>(null);

  const stopMic = React.useCallback((): void => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    micRef.current?.close();
    micRef.current = null;
    if (analyserCtxRef.current) {
      void analyserCtxRef.current.close();
      analyserCtxRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    setRunning(false);
    setLevel(0);
  }, []);

  React.useEffect(() => () => stopMic(), [stopMic]);

  const startMic = async (): Promise<void> => {
    setError(undefined);
    stopMic();
    setStatus('Requesting microphone…');
    try {
      try {
        sessionStorage.setItem(DISGUISE_KEY, disguise);
      } catch {
        /* ignore */
      }
      const mic = await openDisguisedMicrophone(disguise);
      micRef.current = mic;

      const actx = new AudioContext();
      analyserCtxRef.current = actx;
      await actx.resume();
      const source = actx.createMediaStreamSource(mic.sendStream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = (): void => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      if (audioRef.current) {
        audioRef.current.srcObject = loopback ? mic.sendStream : null;
        if (loopback) void audioRef.current.play().catch(() => undefined);
      }

      setRunning(true);
      setStatus(
        disguise === 'off'
          ? 'Mic is live. Speak — the meter should move. Then test the speaker.'
          : `Mic is live with “${disguise}” disguise. Speak — the meter should move.`
      );
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/NotAllowedError|Permission denied/i.test(raw)) {
        setError('Microphone access was blocked. Allow the mic for this site in your browser settings, then try again.');
      } else if (/NotFoundError|DevicesNotFoundError/i.test(raw)) {
        setError('No microphone was found on this device.');
      } else {
        setError(raw);
      }
      setStatus('Mic test failed.');
    }
  };

  React.useEffect(() => {
    if (!running || !micRef.current || !audioRef.current) return;
    audioRef.current.srcObject = loopback ? micRef.current.sendStream : null;
    if (loopback) {
      void audioRef.current.play().catch(() => undefined);
      setStatus(s => (s.includes('headphones') ? s : `${s} Use headphones for loopback to avoid echo.`));
    }
  }, [loopback, running]);

  return (
    <div className={`voice-check-panel${compact ? ' voice-check-panel--compact' : ''}`}>
      {!compact ? (
        <p className="lede" style={{ marginTop: 0 }}>
          Test your microphone and speaker on this device before a peer voice session. Nothing is sent to another person
          or recorded for the agency.
        </p>
      ) : (
        <p className="voice-check-panel__intro">
          Nothing is sent to another person. Allow the mic when prompted, speak so the meter moves, then play the
          speaker tone.
        </p>
      )}

      <div className="voice-check-panel__grid">
        <label className="voice-check-panel__label">
          Voice disguise (optional)
          <select
            value={disguise}
            disabled={running}
            onChange={e => onDisguiseChange(e.target.value as VoiceDisguisePreset)}
          >
            <option value="off">Off — natural voice</option>
            <option value="deeper">Deeper (mild disguise)</option>
            <option value="higher">Higher (mild disguise)</option>
          </select>
        </label>
        <p className="voice-check-panel__hint">
          Disguise runs on your device only. Mild settings stay clear; not guaranteed anonymity.
        </p>

        {error ? <div className="voice-check-panel__error">{error}</div> : null}
        <p className="voice-check-panel__status" role="status">
          {status}
        </p>

        <div className="voice-check-meter" aria-label="Microphone level">
          <div className="voice-check-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>

        <div className="voice-check-panel__actions">
          {!running ? (
            <button type="button" onClick={() => void startMic()}>
              Start mic test
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={stopMic}>
              Stop mic
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              try {
                playTestTone();
                setStatus('Played a short test tone. If you heard it, the speaker works.');
              } catch {
                setError('Could not play a test tone on this device.');
              }
            }}
          >
            Test speaker
          </button>
        </div>

        <label className="voice-check-panel__loopback">
          <input
            type="checkbox"
            checked={loopback}
            disabled={!running}
            onChange={e => setLoopback(e.target.checked)}
          />
          <span>
            Hear myself (loopback) — use <strong>headphones</strong> to avoid echo.
          </span>
        </label>

        <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

        <div className="voice-check-panel__checklist">
          <strong>Checklist</strong>
          <ul>
            <li>Allow microphone when prompted</li>
            <li>Meter moves when you speak</li>
            <li>Speaker tone is audible</li>
            <li>On phones, turn off silent/vibrate if you hear nothing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  disguise: VoiceDisguisePreset;
  onDisguiseChange: (d: VoiceDisguisePreset) => void;
};

export function VoiceCheckModal(props: ModalProps): React.ReactElement | null {
  const { open, onClose, disguise, onDisguiseChange } = props;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="install-modal-backdrop voice-check-modal-backdrop"
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="install-modal voice-check-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-check-modal-title"
      >
        <div className="voice-check-modal__head">
          <h3 id="voice-check-modal-title">Test mic &amp; speaker</h3>
          <button type="button" className="btn-ghost voice-check-modal__close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <VoiceCheckPanel compact disguise={disguise} onDisguiseChange={onDisguiseChange} />
        <div className="install-modal__actions" style={{ marginTop: 12 }}>
          <button type="button" onClick={onClose}>
            Done — ready to join
          </button>
        </div>
      </div>
    </div>
  );
}
