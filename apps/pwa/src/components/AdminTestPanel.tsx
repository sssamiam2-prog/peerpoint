import * as React from 'react';
import { Link } from 'react-router-dom';
import { VoiceCheckPanel, loadVoiceDisguisePref } from './VoiceCheckModal';
import { MEMBER_ORIGIN } from '../lib/adminHost';
import type { VoiceDisguisePreset } from '../lib/voiceDisguise';

type Props = {
  authHeaders: () => HeadersInit;
  onAdminHost: boolean;
};

/**
 * Admin smoke-test hub: mint rooms, open chat/voice, mic check, content pages, SMS.
 */
export function AdminTestPanel(props: Props): React.ReactElement {
  const { authHeaders, onAdminHost } = props;
  const [disguise, setDisguise] = React.useState<VoiceDisguisePreset>(() => loadVoiceDisguisePref());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [roomCode, setRoomCode] = React.useState<string | undefined>();
  const [note, setNote] = React.useState<string | undefined>();
  const [showMic, setShowMic] = React.useState(false);
  const [smsConfigured, setSmsConfigured] = React.useState<boolean | null>(null);
  const [smsStatusMsg, setSmsStatusMsg] = React.useState<string | undefined>();
  const [smsPhone, setSmsPhone] = React.useState('');
  const [smsBusy, setSmsBusy] = React.useState(false);
  const [smsError, setSmsError] = React.useState<string | undefined>();
  const [smsOk, setSmsOk] = React.useState<string | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/staff/sms-test', { headers: authHeaders() });
        const data = (await res.json().catch(() => ({}))) as {
          smsConfigured?: boolean;
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setSmsConfigured(false);
          setSmsStatusMsg(data.error ?? 'Could not check SMS status.');
          return;
        }
        setSmsConfigured(Boolean(data.smsConfigured));
        setSmsStatusMsg(data.message);
      } catch {
        if (!cancelled) {
          setSmsConfigured(false);
          setSmsStatusMsg('Could not check SMS status.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const mintRoom = async (contactMode: 'chat' | 'voice'): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const res = await fetch('/api/staff/test-room', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ contactMode })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        roomCode?: string;
        message?: string;
      };
      if (!res.ok || !data.roomCode) {
        setError(data.error ?? 'Could not create a test room.');
        return;
      }
      setRoomCode(data.roomCode);
      setNote(data.message);
    } catch {
      setError('Network error creating test room.');
    } finally {
      setBusy(false);
    }
  };

  const sendSmsTest = async (): Promise<void> => {
    setSmsBusy(true);
    setSmsError(undefined);
    setSmsOk(undefined);
    try {
      const res = await fetch('/api/staff/sms-test', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: smsPhone.trim() })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        smsConfigured?: boolean;
      };
      if (typeof data.smsConfigured === 'boolean') setSmsConfigured(data.smsConfigured);
      if (!res.ok) {
        setSmsError(data.error ?? 'Test SMS failed.');
        return;
      }
      setSmsOk(data.message ?? 'Test SMS sent.');
    } catch {
      setSmsError('Network error sending test SMS.');
    } finally {
      setSmsBusy(false);
    }
  };

  const memberBase = onAdminHost ? MEMBER_ORIGIN : '';

  return (
    <section className="staff-tab-panel" role="tabpanel" id="panel-test" aria-labelledby="tab-test">
      <h3 style={{ marginTop: 0 }}>Test App Functions</h3>
      <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 0 }}>
        Smoke-test member features from Admin. Create a test room code, then open Chat and Voice (use two browsers or
        devices with the same code). Mic check stays on this page.
      </p>

      <div className="admin-test-grid">
        <article className="admin-test-card">
          <h4>1. Test room</h4>
          <p className="admin-test-card__lede">
            Issues a real room code (valid for Ably) so chat and voice work like a live session.
          </p>
          <div className="admin-test-card__actions">
            <button type="button" disabled={busy} onClick={() => void mintRoom('chat')}>
              {busy ? 'Creating…' : 'Create test room'}
            </button>
          </div>
          {error ? <p className="admin-test-card__error">{error}</p> : null}
          {roomCode ? (
            <div className="admin-test-room">
              <div>
                Room code: <strong className="admin-test-room__code">{roomCode}</strong>
              </div>
              {note ? <p className="admin-test-card__lede">{note}</p> : null}
              <div className="admin-test-card__actions">
                <Link className="admin-test-link-btn" to={`/chat?room=${encodeURIComponent(roomCode)}`}>
                  Open Peer chat
                </Link>
                <Link className="admin-test-link-btn" to={`/voice?room=${encodeURIComponent(roomCode)}`}>
                  Open Peer voice
                </Link>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void navigator.clipboard.writeText(roomCode)}
                >
                  Copy code
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="admin-test-card">
          <h4>2. SMS (Twilio)</h4>
          <p className="admin-test-card__lede">
            Status:{' '}
            {smsConfigured === null
              ? 'Checking…'
              : smsConfigured
                ? 'Twilio secrets are set'
                : 'Not configured — add TWILIO_* secrets on Cloudflare Pages'}
          </p>
          {smsStatusMsg ? <p className="admin-test-card__lede">{smsStatusMsg}</p> : null}
          <label style={{ display: 'block', marginTop: 8, fontSize: 14 }}>
            Your cell (test recipient)
            <input
              value={smsPhone}
              onChange={e => setSmsPhone(e.target.value)}
              placeholder="8015551234"
              autoComplete="tel"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <div className="admin-test-card__actions" style={{ marginTop: 10 }}>
            <button type="button" disabled={smsBusy || !smsPhone.trim()} onClick={() => void sendSmsTest()}>
              {smsBusy ? 'Sending…' : 'Send test SMS'}
            </button>
          </div>
          {smsError ? <p className="admin-test-card__error">{smsError}</p> : null}
          {smsOk ? <p style={{ color: 'var(--accent, #0f6a4a)', fontSize: 14 }}>{smsOk}</p> : null}
        </article>

        <article className="admin-test-card">
          <h4>3. Mic &amp; speaker</h4>
          <p className="admin-test-card__lede">Verify this device before a voice session. Nothing is sent to a peer.</p>
          {!showMic ? (
            <button type="button" onClick={() => setShowMic(true)}>
              Open voice check
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={() => setShowMic(false)} style={{ marginBottom: 10 }}>
                Hide voice check
              </button>
              <VoiceCheckPanel compact disguise={disguise} onDisguiseChange={setDisguise} />
            </>
          )}
          <p className="admin-test-card__lede" style={{ marginTop: 10 }}>
            Or open the full page: <Link to="/voice-test">Voice check</Link>
          </p>
        </article>

        <article className="admin-test-card">
          <h4>4. Chat &amp; voice screens</h4>
          <p className="admin-test-card__lede">Open the live UI (enter a room code, or create one above first).</p>
          <div className="admin-test-card__actions">
            <Link className="admin-test-link-btn" to="/chat">
              Peer chat
            </Link>
            <Link className="admin-test-link-btn" to="/voice">
              Peer voice
            </Link>
          </div>
        </article>

        <article className="admin-test-card">
          <h4>5. Content &amp; member home</h4>
          <p className="admin-test-card__lede">
            Self Help and Resources on this Admin host, or open the public member site.
          </p>
          <div className="admin-test-card__actions">
            <Link className="admin-test-link-btn" to="/self-help">
              Self Help
            </Link>
            <Link className="admin-test-link-btn" to="/resources">
              Resources
            </Link>
            {onAdminHost ? (
              <a className="admin-test-link-btn" href={`${memberBase}/`} target="_blank" rel="noreferrer">
                Member site (new tab)
              </a>
            ) : (
              <Link className="admin-test-link-btn" to="/request">
                Request Help
              </Link>
            )}
          </div>
        </article>

        <article className="admin-test-card">
          <h4>Suggested checklist</h4>
          <ul className="admin-test-checklist">
            <li>Create test room → copy code</li>
            <li>Send test SMS (after Twilio secrets are set)</li>
            <li>Open Peer chat in two windows with the same code → send a message</li>
            <li>Open Peer voice with the same code → confirm audio both ways</li>
            <li>Run mic/speaker check on a phone and a desktop</li>
            <li>Browse Self Help and Resources</li>
            <li>On the member site: unlock with site use code, request immediate contact (optional live test)</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
