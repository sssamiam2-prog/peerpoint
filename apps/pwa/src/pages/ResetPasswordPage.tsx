import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useActionFeedback, type SuccessToast } from '../components/ActionFeedback';
import { isProductionAdminHost } from '../lib/adminHost';

type StaffRole = 'admin' | 'staff';

type ResetInfo = {
  username: string;
  role: StaffRole;
  email: string;
};

export function ResetPasswordPage(): React.ReactElement {
  const { runAction } = useActionFeedback();
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const navigate = useNavigate();
  const adminSite = isProductionAdminHost();

  const [info, setInfo] = React.useState<ResetInfo | null>(null);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');

  React.useEffect(() => {
    if (!token) {
      setLoadError('Missing reset token. Open the link from your password reset email.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/staff/reset-password?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as ResetInfo & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? 'Reset link is invalid or expired.');
          return;
        }
        setInfo({
          username: data.username,
          role: data.role,
          email: data.email
        });
      } catch {
        if (!cancelled) setLoadError('Could not validate reset link. Try again later.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (): Promise<void> => {
    setError(undefined);
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    await runAction('Updating password…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          role?: StaffRole;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not reset password.');
          return null;
        }
        window.setTimeout(() => {
          if (data.role === 'admin' && !adminSite) {
            navigate('/staff', { replace: true });
            return;
          }
          navigate(adminSite ? '/' : '/staff', { replace: true });
        }, 700);
        return {
          title: 'Password updated',
          message: data.message ?? 'You can sign in with your new password.'
        };
      } catch {
        setError('Network error. Try again.');
        return null;
      } finally {
        setBusy(false);
      }
    }, toast => toast ?? undefined);
  };

  if (loadError) {
    return (
      <div className="page-shell page-shell-tight">
        <h2>Reset password</h2>
        <p style={{ color: '#a4262c' }}>{loadError}</p>
        <p>
          <Link to={adminSite ? '/' : '/staff'}>Back to sign-in</Link>
        </p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="page-shell page-shell-tight">
        <h2>Reset password</h2>
        <p className="lede">Checking reset link…</p>
      </div>
    );
  }

  return (
    <div className="page-shell page-shell-tight">
      <h2>Choose a new password</h2>
      <p className="lede">
        Account <strong>{info.username}</strong> ({info.role === 'admin' ? 'Admin' : 'Staff'}). Enter a new password
        below.
      </p>
      {error ? <div style={{ color: '#a4262c', marginTop: 8 }}>{error}</div> : null}

      <div style={{ display: 'grid', gap: 12, maxWidth: 420, marginTop: 16 }}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
        <p style={{ fontSize: 13, margin: 0 }}>
          <Link to={adminSite ? '/' : '/staff'}>Back to sign-in</Link>
        </p>
      </div>
    </div>
  );
}
