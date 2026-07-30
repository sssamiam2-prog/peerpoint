import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { PeerConfidentialityModal } from '../components/PeerConfidentialityModal';
import {
  confidentialitySessionKey,
  hasAcknowledgedConfidentiality
} from '../lib/peerConfidentiality';
import { clearModernSession, loadModernSession } from '../lib/modernSession';
import { ModernBackButton } from './ModernBackButton';

type SessionStatus = { status?: string; staffJoined?: boolean; active?: boolean };

export function ModernWaiting(): React.ReactElement {
  const navigate = useNavigate();
  const session = React.useMemo(loadModernSession, []);
  const [error, setError] = React.useState('');
  const [showNotice, setShowNotice] = React.useState(false);
  const sessionKey = session ? confidentialitySessionKey('request', session.requestId) : '';

  React.useEffect(() => {
    if (!session) {
      navigate('/m/request', { replace: true });
      return;
    }
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const r = await fetch(
          `/api/peer-support/session?requestId=${encodeURIComponent(session.requestId)}&token=${encodeURIComponent(session.anonymousSessionToken)}`
        );
        const data = (await r.json()) as SessionStatus;
        if (cancelled) return;
        if (data.staffJoined || data.active || data.status === 'active') {
          if (hasAcknowledgedConfidentiality(sessionKey)) {
            navigate('/m/chat', { replace: true });
          } else {
            setShowNotice(true);
          }
        }
      } catch {
        if (!cancelled) setError('Connection check failed. We will keep trying.');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [navigate, session, sessionKey]);

  const cancel = async (): Promise<void> => {
    if (!session) return;
    await fetch('/api/peer-support/session/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: session.requestId,
        token: session.anonymousSessionToken
      })
    }).catch(() => undefined);
    clearModernSession();
    navigate('/');
  };

  if (!session) return <div />;

  return (
    <section className="modern-page modern-waiting">
      <PeerConfidentialityModal
        open={showNotice}
        sessionKey={sessionKey}
        variant="modern"
        onContinue={() => {
          setShowNotice(false);
          navigate('/m/chat', { replace: true });
        }}
        onCancel={() => setShowNotice(false)}
      />
      <ModernBackButton to="/" label="Home" />
      <div className="waiting-rings">
        <span />
        <span />
        <span />
      </div>
      <p className="modern-eyebrow">PEERPOINT · REQUEST SENT</p>
      <h1>We’re finding someone for you.</h1>
      <p>A trained PEERPoint staff member will join as soon as they can.</p>
      <div className="modern-code">
        <span>Your support code</span>
        <strong>{session.publicSupportCode}</strong>
        <button
          type="button"
          className="modern-text-button"
          onClick={() => void navigator.clipboard?.writeText(session.publicSupportCode)}
        >
          Copy
        </button>
      </div>
      {error ? <p className="modern-error">{error}</p> : null}
      {showNotice ? (
        <p className="modern-muted">A peer is ready — review confidentiality to continue.</p>
      ) : null}
      <button type="button" className="modern-danger-link" onClick={() => void cancel()}>
        Cancel request
      </button>
    </section>
  );
}
