import * as React from 'react';

type VerifyStatus = {
  configured?: boolean;
  verified?: boolean;
  phoneE164?: string;
  cellPhone?: string;
  hint?: string;
  error?: string;
};

type StartResult = {
  ok?: boolean;
  alreadyVerified?: boolean;
  verified?: boolean;
  phoneE164?: string;
  validationCode?: string;
  message?: string;
  hint?: string;
  error?: string;
};

type CheckResult = {
  ok?: boolean;
  verified?: boolean;
  phoneE164?: string;
  message?: string;
  error?: string;
};

export type TwilioPhoneVerifyProps = {
  /** Controlled phone value (cell). */
  phone: string;
  onPhoneChange?: (phone: string) => void;
  /** Invite setup flow — no Bearer session yet. */
  inviteToken?: string;
  /** Logged-in staff/admin Bearer token. */
  authToken?: string | null;
  /** Hide the phone input when parent already shows it. */
  hidePhoneInput?: boolean;
  onVerifiedChange?: (verified: boolean, phoneE164?: string) => void;
};

/**
 * Twilio Verified Caller ID (trial SMS allow-list).
 * Shows a 6-digit code; Twilio calls the phone; user enters code on the keypad.
 */
export function TwilioPhoneVerify(props: TwilioPhoneVerifyProps): React.ReactElement {
  const { phone, onPhoneChange, inviteToken, authToken, hidePhoneInput, onVerifiedChange } = props;

  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [validationCode, setValidationCode] = React.useState<string | undefined>();
  const [message, setMessage] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [polling, setPolling] = React.useState(false);

  const onVerifiedChangeRef = React.useRef(onVerifiedChange);
  const onPhoneChangeRef = React.useRef(onPhoneChange);
  React.useEffect(() => {
    onVerifiedChangeRef.current = onVerifiedChange;
    onPhoneChangeRef.current = onPhoneChange;
  });

  const headersFor = (): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  };

  // Load Twilio config + saved cell once per session/invite (not on every keystroke).
  React.useEffect(() => {
    if (!inviteToken && !authToken) {
      setConfigured(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const qs = new URLSearchParams();
        if (inviteToken) qs.set('inviteToken', inviteToken);
        const res = await fetch(`/api/staff/verify-phone?${qs.toString()}`, {
          headers: headersFor()
        });
        const data = (await res.json().catch(() => ({}))) as VerifyStatus;
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error);
          return;
        }
        setConfigured(data.configured === true);
        setVerified(data.verified === true);
        onVerifiedChangeRef.current?.(data.verified === true, data.phoneE164);
        if (data.cellPhone) onPhoneChangeRef.current?.(data.cellPhone);
      } catch {
        /* ignore transient */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when auth identity changes
  }, [inviteToken, authToken]);

  React.useEffect(() => {
    if (!polling || !validationCode) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch('/api/staff/verify-phone', {
            method: 'POST',
            headers: headersFor(),
            body: JSON.stringify({
              action: 'check',
              phone,
              inviteToken: inviteToken || undefined
            })
          });
          const data = (await res.json().catch(() => ({}))) as CheckResult;
          if (res.ok && data.verified) {
            setVerified(true);
            setPolling(false);
            setValidationCode(undefined);
            setMessage(data.message ?? 'Phone verified.');
            setError(undefined);
            onVerifiedChangeRef.current?.(true, data.phoneE164);
          }
        } catch {
          /* keep polling */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while waiting; phone/token captured each tick
  }, [inviteToken, authToken, phone, polling, validationCode]);

  const onStart = async (): Promise<void> => {
    setError(undefined);
    setMessage(undefined);
    if (!phone.trim()) {
      setError('Enter a cell phone number first.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/staff/verify-phone', {
        method: 'POST',
        headers: headersFor(),
        body: JSON.stringify({
          action: 'start',
          phone,
          inviteToken: inviteToken || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as StartResult;
      if (!res.ok) {
        setError(data.error ?? 'Could not start verification.');
        return;
      }
      if (data.alreadyVerified || data.verified) {
        setVerified(true);
        setValidationCode(undefined);
        setPolling(false);
        setMessage(data.message ?? 'Already verified.');
        onVerifiedChangeRef.current?.(true, data.phoneE164);
        return;
      }
      setValidationCode(data.validationCode);
      setMessage(data.message ?? data.hint);
      setPolling(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async (): Promise<void> => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fetch('/api/staff/verify-phone', {
        method: 'POST',
        headers: headersFor(),
        body: JSON.stringify({
          action: 'check',
          phone,
          inviteToken: inviteToken || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as CheckResult;
      if (!res.ok) {
        setError(data.error ?? 'Could not check status.');
        return;
      }
      setVerified(data.verified === true);
      setMessage(data.message);
      if (data.verified) {
        setValidationCode(undefined);
        setPolling(false);
        onVerifiedChangeRef.current?.(true, data.phoneE164);
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (configured === false) {
    return (
      <div style={{ fontSize: 14, color: 'var(--text)', marginTop: 8 }}>
        SMS phone verification is unavailable until Twilio is configured on the server.
      </div>
    );
  }

  if (configured === null && !inviteToken && !authToken) {
    return <></>;
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 8,
        display: 'grid',
        gap: 8
      }}
    >
      <strong style={{ fontSize: 14 }}>Verify cell for SMS alerts</strong>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
        On a Twilio trial account, each staff cell must be verified once. Twilio will{' '}
        <strong>call</strong> this number — answer and enter the code on your phone keypad (not by
        typing it back into this form).
      </p>
      {!hidePhoneInput ? (
        <label>
          Cell phone to verify
          <input
            value={phone}
            onChange={e => {
              setVerified(false);
              setValidationCode(undefined);
              setPolling(false);
              setMessage(undefined);
              onPhoneChange?.(e.target.value);
            }}
            autoComplete="tel"
            disabled={verified}
          />
        </label>
      ) : null}
      {verified ? (
        <p style={{ margin: 0, color: 'var(--accent, #0f6a4a)', fontSize: 14 }}>
          Verified for trial SMS{phone ? ` (${phone})` : ''}.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={busy || !phone.trim()} onClick={() => void onStart()}>
            {busy ? 'Working…' : validationCode ? 'Call again' : 'Call me to verify'}
          </button>
          {validationCode ? (
            <button type="button" disabled={busy} onClick={() => void onCheck()}>
              I entered the code
            </button>
          ) : null}
        </div>
      )}
      {validationCode && !verified ? (
        <div
          style={{
            fontSize: 22,
            letterSpacing: '0.2em',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            padding: '8px 0'
          }}
          aria-live="polite"
        >
          Code: {validationCode}
        </div>
      ) : null}
      {polling && !verified ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text)' }}>
          Waiting for Twilio… checking every few seconds.
        </p>
      ) : null}
      {message && !verified ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>{message}</p>
      ) : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: '#a4262c' }}>{error}</p> : null}
    </div>
  );
}
