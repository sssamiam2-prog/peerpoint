import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

type VerifyResult = {
  ok?: boolean;
  kind?: 'invite' | 'account';
  alreadyVerified?: boolean;
  email?: string;
  firstName?: string;
  role?: 'admin' | 'staff';
  setupUrl?: string;
  cellPhone?: string;
  phoneE164?: string;
  twilioVerified?: boolean;
  validationCode?: string;
  twilioEmailed?: boolean;
  twilioNote?: string;
  message?: string;
  error?: string;
};

export function VerifyEmailPage(): React.ReactElement {
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const accountToken = (params.get('accountToken') ?? '').trim();

  const [result, setResult] = React.useState<VerifyResult | null>(null);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(true);

  React.useEffect(() => {
    if (!token && !accountToken) {
      setLoadError('Missing verification link. Open the link from your PEERPoint email.');
      setBusy(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const qs = new URLSearchParams();
        if (accountToken) qs.set('accountToken', accountToken);
        else qs.set('token', token);
        const res = await fetch(`/api/staff/verify-email?${qs.toString()}`);
        const data = (await res.json().catch(() => ({}))) as VerifyResult;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? 'Could not verify email.');
          setBusy(false);
          return;
        }
        setResult(data);
      } catch {
        if (!cancelled) setLoadError('Network error. Try again later.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, accountToken]);

  if (busy) {
    return (
      <div className="page-shell page-shell-tight">
        <h2>Verifying email…</h2>
        <p className="lede">Please wait a moment.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-shell page-shell-tight">
        <h2>Email verification</h2>
        <p style={{ color: '#a4262c' }}>{loadError}</p>
        <p>
          <Link to="/">Back</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page-shell page-shell-tight">
      <h2>Email verified</h2>
      <p className="lede">
        Thanks{result?.firstName ? `, ${result.firstName}` : ''}. {result?.message}
      </p>

      {result?.validationCode && !result.twilioVerified ? (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 12,
            maxWidth: 480
          }}
        >
          <strong>Twilio is calling your cell</strong>
          <p style={{ fontSize: 14, margin: '8px 0' }}>
            Answer and enter this code on your <strong>phone keypad</strong>:
          </p>
          <div
            style={{
              fontSize: 28,
              letterSpacing: '0.2em',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {result.validationCode}
          </div>
          {result.phoneE164 ? (
            <p style={{ fontSize: 13, marginTop: 8 }}>Calling {result.phoneE164}</p>
          ) : null}
          {result.twilioEmailed ? (
            <p style={{ fontSize: 13, color: 'var(--text)' }}>We also emailed you this code.</p>
          ) : null}
        </div>
      ) : null}

      {result?.twilioVerified ? (
        <p style={{ color: 'var(--accent, #0f6a4a)', marginTop: 12 }}>Cell phone is verified for SMS.</p>
      ) : null}

      {result?.twilioNote && !result.validationCode ? (
        <p style={{ fontSize: 13, color: 'var(--text)', marginTop: 8 }}>{result.twilioNote}</p>
      ) : null}

      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {result?.kind === 'invite' && result.setupUrl ? (
          <a className="btn-primary" href={result.setupUrl} style={{ textDecoration: 'none' }}>
            Continue to registration
          </a>
        ) : null}
        {result?.kind === 'account' && result.setupUrl ? (
          <a className="btn-primary" href={result.setupUrl} style={{ textDecoration: 'none' }}>
            Open sign-in
          </a>
        ) : null}
        <Link to="/">Home</Link>
      </div>
    </div>
  );
}
