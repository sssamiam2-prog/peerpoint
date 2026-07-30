import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConversationDestroyOverlay } from '../components/ConversationDestroyOverlay';
import { VoiceCheckModal, loadVoiceDisguisePref } from '../components/VoiceCheckModal';
import { hasAblyAuthConfigured } from '../lib/ablyAuth';
import { explainAblyError, normalizeRoomCodeInput, sanitizeAblyApiKey } from '../lib/peerChatAbly';
import {
  startPeerVoiceSession,
  type PeerVoiceSessionApi,
  type PeerVoiceUiState,
  type VoiceDisguisePreset
} from '../lib/peerVoiceSession';

const DISPLAY_KEY = 'peerpoint_chat_display_name';
const DISGUISE_KEY = 'peerpoint_voice_disguise';

function stateLabel(s: PeerVoiceUiState): string {
  switch (s) {
    case 'connecting':
      return 'Connecting…';
    case 'waiting':
      return 'Waiting for peer';
    case 'ringing':
      return 'Negotiating';
    case 'live':
      return 'Connected';
    case 'ended':
      return 'Ended';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

export function PeerVoicePage(): React.ReactElement {
  const [params] = useSearchParams();
  const ablyKeyRaw = import.meta.env.VITE_ABLY_KEY as string | undefined;
  const ablyKey = ablyKeyRaw ? sanitizeAblyApiKey(ablyKeyRaw) : undefined;
  const hasKey = hasAblyAuthConfigured(ablyKey);
  const hasTurnEnv = Boolean((import.meta.env.VITE_WEBRTC_ICE_JSON as string | undefined)?.trim());

  const [roomInput, setRoomInput] = React.useState(() => (params.get('room') ?? '').trim().toUpperCase());
  const [nameInput, setNameInput] = React.useState(() => {
    try {
      return sessionStorage.getItem(DISPLAY_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [disguise, setDisguise] = React.useState<VoiceDisguisePreset>(() => loadVoiceDisguisePref());
  const [voiceCheckOpen, setVoiceCheckOpen] = React.useState(false);
  const [session, setSession] = React.useState<{ room: string; name: string; disguise: VoiceDisguisePreset } | null>(
    null
  );
  const [joinError, setJoinError] = React.useState<string | undefined>(undefined);
  const [statusLine, setStatusLine] = React.useState('');
  const [uiState, setUiState] = React.useState<PeerVoiceUiState>('waiting');
  const [muted, setMuted] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [destroying, setDestroying] = React.useState(false);
  const sessionRef = React.useRef<PeerVoiceSessionApi | null>(null);
  const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const voiceEpochRef = React.useRef(0);

  const onDisguiseChange = (d: VoiceDisguisePreset): void => {
    setDisguise(d);
    try {
      sessionStorage.setItem(DISGUISE_KEY, d);
    } catch {
      /* ignore */
    }
  };

  React.useEffect(() => {
    if (!session || !hasKey) return;
    const epoch = ++voiceEpochRef.current;
    const audioAtMount = remoteAudioRef.current;
    let cancelled = false;

    void (async (): Promise<void> => {
      try {
        const api = await startPeerVoiceSession({
          apiKey: ablyKey,
          roomCode: session.room,
          displayName: session.name,
          voiceDisguise: session.disguise,
          onRemoteStream: stream => {
            const el = remoteAudioRef.current;
            if (el) {
              el.srcObject = stream;
              void el.play().catch(() => {
                setStatusLine(p =>
                  p.includes('Play') ? p : p + ' Tap the page if audio does not start (browser policy).'
                );
              });
            }
          },
          onUiState: s => {
            if (cancelled || epoch !== voiceEpochRef.current) return;
            setUiState(s);
          },
          onStatus: msg => {
            if (cancelled || epoch !== voiceEpochRef.current) return;
            setStatusLine(msg);
          }
        });
        if (cancelled || epoch !== voiceEpochRef.current) {
          api.close();
          return;
        }
        sessionRef.current = api;
      } catch (e: unknown) {
        if (!cancelled && epoch === voiceEpochRef.current) {
          const raw = e instanceof Error ? e.message : String(e);
          if (/NotAllowedError|Permission denied/i.test(raw)) {
            setJoinError('Microphone access was blocked. Allow the microphone for this site and try again.');
          } else if (/NotFoundError|DevicesNotFoundError/i.test(raw)) {
            setJoinError('No microphone was found on this device.');
          } else {
            setJoinError(explainAblyError(e));
          }
          setSession(null);
        }
      }
    })();

    return (): void => {
      cancelled = true;
      sessionRef.current?.close();
      sessionRef.current = null;
      if (audioAtMount) {
        audioAtMount.srcObject = null;
      }
    };
  }, [ablyKey, hasKey, session, retryNonce]);

  React.useEffect(() => {
    sessionRef.current?.setMuted(muted);
  }, [muted]);

  const onJoin = (): void => {
    setJoinError(undefined);
    const parsed = normalizeRoomCodeInput(roomInput);
    if (!parsed.ok) {
      setJoinError(parsed.error);
      return;
    }
    const name = nameInput.trim();
    if (name.length < 1) {
      setJoinError('Enter the name others will see (first name, initials, or a nickname).');
      return;
    }
    if (name.length > 40) {
      setJoinError('Display name must be 40 characters or fewer.');
      return;
    }
    try {
      sessionStorage.setItem(DISPLAY_KEY, name);
      sessionStorage.setItem(DISGUISE_KEY, disguise);
    } catch {
      /* ignore */
    }
    voiceEpochRef.current++;
    setUiState('connecting');
    setStatusLine('Requesting microphone…');
    setSession({ room: parsed.code, name, disguise });
  };

  const autoJoinedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoJoinedRef.current || session || !hasKey) return;
    const fromLink = (params.get('room') ?? '').trim();
    if (!fromLink) return;
    const parsed = normalizeRoomCodeInput(fromLink);
    if (!parsed.ok) return;
    const fromJoin = params.get('from') === 'join';
    let name = nameInput.trim();
    if (!name && fromJoin) {
      name = 'Member';
      setNameInput(name);
    }
    if (name.length < 1 || name.length > 40) return;
    autoJoinedRef.current = true;
    setRoomInput(parsed.code);
    try {
      sessionStorage.setItem(DISPLAY_KEY, name);
      sessionStorage.setItem(DISGUISE_KEY, disguise);
    } catch {
      /* ignore */
    }
    voiceEpochRef.current++;
    setUiState('connecting');
    setStatusLine('Requesting microphone…');
    setSession({ room: parsed.code, name, disguise });
  }, [disguise, hasKey, nameInput, params, session]);

  const finishLeave = React.useCallback((): void => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setSession(null);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setStatusLine('');
    setUiState('waiting');
    setDestroying(false);
  }, []);

  const onLeave = (): void => {
    if (destroying) return;
    setDestroying(true);
  };

  const onRetry = (): void => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setUiState('connecting');
    setStatusLine('Retrying…');
    setRetryNonce(n => n + 1);
  };

  if (!hasKey) {
    return (
      <div className="page-shell page-shell-wide">
        <h2>Peer voice</h2>
        <p>Anonymous voice session uses the same realtime auth as Peer chat.</p>
        <p className="callout callout--muted" style={{ marginTop: 8 }}>
          Set <code>VITE_ABLY_AUTH_URL</code> or <code>VITE_ABLY_KEY</code> in <code>apps/pwa/.env</code> and restart the
          dev server.
        </p>
        <button type="button" className="voice-check-cta__btn" style={{ marginTop: 12 }} onClick={() => setVoiceCheckOpen(true)}>
          Test mic &amp; speaker
        </button>
        <VoiceCheckModal
          open={voiceCheckOpen}
          onClose={() => setVoiceCheckOpen(false)}
          disguise={disguise}
          onDisguiseChange={onDisguiseChange}
        />
      </div>
    );
  }

  if (!session) {
    const fromEmailLink = Boolean((params.get('room') ?? '').trim());
    return (
      <div className="page-shell page-shell-wide peer-voice-join">
        <h2>Peer voice</h2>

        <button
          type="button"
          className="voice-check-cta"
          onClick={() => setVoiceCheckOpen(true)}
        >
          <span className="voice-check-cta__eyebrow">New device?</span>
          <span className="voice-check-cta__title">Test mic &amp; speaker before joining</span>
          <span className="voice-check-cta__hint">Opens a quick check — nothing is sent to another person</span>
        </button>

        <div className="peer-voice-join__grid">
          <div className="peer-voice-join__main">
            {fromEmailLink ? (
              <p className="callout callout--muted">
                Your room code from email is filled in. Enter a display name and join. If you disconnect, use the same
                room code to reconnect — codes expire after <strong>24 hours</strong> of no use.
              </p>
            ) : (
              <p className="callout callout--muted">
                Use the room code from your PEERPoint email (same code as Peer chat). Voice is{' '}
                <strong>1:1 only</strong>. Codes expire after <strong>24 hours</strong> of no use.
              </p>
            )}
            <p className="callout callout--privacy">
              <strong>Privacy.</strong> PEERPoint does not keep or record your voice. Not for 911 or emergencies.
              Optional voice disguise runs on your device only. The site access code does not identify you.
            </p>
            {!hasTurnEnv ? (
              <p className="callout callout--muted" style={{ marginTop: 8 }}>
                Tip: many networks need a TURN server. Set <code>VITE_WEBRTC_ICE_JSON</code> (see{' '}
                <code>.env.example</code>) if calls fail to connect.
              </p>
            ) : null}

            {joinError && (
              <div style={{ marginTop: 12, color: '#a4262c', whiteSpace: 'pre-wrap' }}>{joinError}</div>
            )}

            <div className="peer-voice-join__fields">
              <label>
                Room code (match your peer)
                <input value={roomInput} onChange={e => setRoomInput(e.target.value)} placeholder="e.g. MEETING404" />
              </label>
              <label>
                Your display name
                <span className="field-hint">Any name you choose—you don’t have to use your real name.</span>
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Nickname or any label"
                  autoComplete="off"
                  autoFocus={fromEmailLink}
                />
              </label>
              <label>
                Voice disguise
                <select
                  value={disguise}
                  onChange={e => onDisguiseChange(e.target.value as VoiceDisguisePreset)}
                >
                  <option value="off">Off — natural voice</option>
                  <option value="deeper">Deeper (mild disguise)</option>
                  <option value="higher">Higher (mild disguise)</option>
                </select>
              </label>
              <p className="field-hint" style={{ marginTop: 0 }}>
                Mild on-device pitch/timbre change. Clear speech, not a robot voice. Not guaranteed anonymity.
              </p>
              <button type="button" onClick={onJoin}>
                Join voice
              </button>
            </div>
          </div>
        </div>

        <VoiceCheckModal
          open={voiceCheckOpen}
          onClose={() => setVoiceCheckOpen(false)}
          disguise={disguise}
          onDisguiseChange={onDisguiseChange}
        />
      </div>
    );
  }

  return (
    <div className="page-shell page-shell-wide">
      {destroying ? <ConversationDestroyOverlay onComplete={finishLeave} /> : null}
      <h2>Peer voice</h2>
      <p style={{ margin: '0 0 8px', fontSize: 14, color: '#5c6e66' }}>
        Room <strong>{session.room}</strong> · You appear as <strong>{session.name}</strong>
        {session.disguise !== 'off' ? ` · disguise: ${session.disguise}` : ''} · {stateLabel(uiState)}
      </p>
      <p className="callout callout--muted" style={{ marginTop: 0, fontSize: 13 }}>
        Disconnected? Rejoin with room <strong>{session.room}</strong> (also in your email). Expires after 24 hours of
        no use.
      </p>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      {statusLine && (
        <div
          role="status"
          style={{
            marginTop: 8,
            padding: 10,
            background: uiState === 'error' ? '#fff5f5' : '#f4f9f6',
            borderRadius: 8,
            fontSize: 13,
            whiteSpace: 'pre-wrap'
          }}
        >
          {statusLine}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />
          Mute microphone
        </label>
        {uiState === 'error' ? (
          <button type="button" onClick={onRetry}>
            Reconnect
          </button>
        ) : null}
        <button type="button" className="btn-ghost" onClick={onLeave} disabled={destroying}>
          Leave
        </button>
      </div>
    </div>
  );
}
