import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredSiteUseCode, saveModernSession } from '../lib/modernSession';

export function ModernRequestIntro(): React.ReactElement {
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const begin = async (): Promise<void> => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/peer-support/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteUseCode: getStoredSiteUseCode() }) });
      const data = await response.json() as { requestId?: string; anonymousSessionToken?: string; sessionToken?: string; publicSupportCode?: string; supportCode?: string; error?: string };
      const token = data.anonymousSessionToken ?? data.sessionToken;
      const code = data.publicSupportCode ?? data.supportCode;
      if (!response.ok || !data.requestId || !token || !code) {
        throw new Error(data.error || 'Could not start a support session.');
      }
      saveModernSession({ requestId: data.requestId, anonymousSessionToken: token, publicSupportCode: code });
      navigate('/m/waiting');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start a support session.'); }
    finally { setBusy(false); }
  };
  return <section className="modern-page modern-intro"><p className="modern-eyebrow">PEER SUPPORT</p><h1>Asking for support is a strength.</h1>
    <div className="modern-feature-list"><div><b>Confidential</b><span>Your identity is kept private.</span></div><div><b>Trained peers</b><span>Connect with trained support staff.</span></div><div><b>No judgment</b><span>A space to talk, your way.</span></div></div>
    {error ? <p className="modern-error">{error}</p> : null}<button className="modern-primary" onClick={() => void begin()} disabled={busy}>{busy ? 'Starting…' : 'Continue →'}</button>
  </section>;
}
