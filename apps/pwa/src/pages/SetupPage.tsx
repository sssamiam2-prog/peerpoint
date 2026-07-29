import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useActionFeedback, type SuccessToast } from '../components/ActionFeedback';
import { ADMIN_HOST, isProductionAdminHost } from '../lib/adminHost';

const STAFF_TOKEN_KEY = 'peerpoint_staff_token';
const STAFF_META_KEY = 'peerpoint_staff_meta';

type StaffRole = 'admin' | 'staff';

type InvitePrefill = {
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  role: StaffRole;
};

export function SetupPage(): React.ReactElement {
  const { runAction } = useActionFeedback();
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const navigate = useNavigate();
  const adminSite = isProductionAdminHost();

  const [prefill, setPrefill] = React.useState<InvitePrefill | null>(null);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [password2, setPassword2] = React.useState('');
  const [currentShift, setCurrentShift] = React.useState('');
  const [cellPhone, setCellPhone] = React.useState('');
  const [homePhone, setHomePhone] = React.useState('');
  const [workPhone, setWorkPhone] = React.useState('');
  const [personalEmail, setPersonalEmail] = React.useState('');
  const [workEmail, setWorkEmail] = React.useState('');
  const [sex, setSex] = React.useState<'male' | 'female' | ''>('');

  React.useEffect(() => {
    if (!token) {
      setLoadError('Missing invite token. Open the link from your invite email.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/staff/invite?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as InvitePrefill & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? 'Invite not found or expired.');
          return;
        }
        setPrefill({
          firstName: data.firstName,
          lastName: data.lastName,
          bureau: data.bureau,
          jobTitle: data.jobTitle,
          email: data.email,
          role: data.role
        });
        setPersonalEmail(data.email);
        setWorkEmail(data.email);
      } catch {
        if (!cancelled) setLoadError('Could not load invite. Try again later.');
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
    if (sex !== 'male' && sex !== 'female') {
      setError('Please select Male or Female (used when members request immediate contact).');
      return;
    }
    setBusy(true);
    await runAction('Saving your account…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            username,
            password,
            currentShift,
            cellPhone,
            homePhone,
            workPhone,
            personalEmail,
            workEmail,
            sex
          })
        });
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          role?: StaffRole;
          username?: string;
          displayName?: string;
          error?: string;
        };
        if (!res.ok || !data.token || !data.role || !data.username) {
          setError(data.error ?? 'Could not finish registration.');
          return null;
        }
        const meta = {
          role: data.role,
          username: data.username,
          displayName: data.displayName
        };
        sessionStorage.setItem(STAFF_TOKEN_KEY, data.token);
        sessionStorage.setItem(STAFF_META_KEY, JSON.stringify(meta));
        // Brief success, then navigate.
        window.setTimeout(() => {
          if (data.role === 'admin' && !adminSite) {
            window.location.href = `https://${ADMIN_HOST}/`;
            return;
          }
          navigate(adminSite ? '/' : '/staff', { replace: true });
        }, 700);
        return { title: 'Registration complete', message: 'Taking you to your workspace…' };
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
        <h2>Finish registration</h2>
        <p style={{ color: '#a4262c' }}>{loadError}</p>
        <p>
          <Link to="/">Back</Link>
        </p>
      </div>
    );
  }

  if (!prefill) {
    return (
      <div className="page-shell page-shell-tight">
        <h2>Finish registration</h2>
        <p className="lede">Loading invite…</p>
      </div>
    );
  }

  return (
    <div className="page-shell page-shell-tight">
      <h2>Finish PEERPoint registration</h2>
      <p className="lede">
        Welcome, <strong>{prefill.firstName} {prefill.lastName}</strong>. You were invited as{' '}
        <strong>{prefill.role === 'admin' ? 'Admin' : 'Staff'}</strong>
        {prefill.bureau ? ` · ${prefill.bureau}` : ''}
        {prefill.jobTitle ? ` · ${prefill.jobTitle}` : ''}.
      </p>
      {error ? <div style={{ color: '#a4262c', marginTop: 8 }}>{error}</div> : null}

      <div style={{ display: 'grid', gap: 12, maxWidth: 480, marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Account</h3>
        <label>
          Username
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <h3 style={{ margin: '12px 0 0' }}>Contact</h3>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ padding: '0 4px' }}>Sex (for member peer preferences)</legend>
          <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
            <input type="radio" name="sex" checked={sex === 'male'} onChange={() => setSex('male')} />
            Male
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" name="sex" checked={sex === 'female'} onChange={() => setSex('female')} />
            Female
          </label>
        </fieldset>
        <label>
          Current shift
          <input
            value={currentShift}
            onChange={e => setCurrentShift(e.target.value)}
            placeholder="e.g. Days, Nights, Swing"
          />
        </label>
        <label>
          Cell phone number
          <input value={cellPhone} onChange={e => setCellPhone(e.target.value)} autoComplete="tel" />
        </label>
        <label>
          Home number
          <input value={homePhone} onChange={e => setHomePhone(e.target.value)} />
        </label>
        <label>
          Work number
          <input value={workPhone} onChange={e => setWorkPhone(e.target.value)} />
        </label>
        <label>
          Personal email
          <input
            type="email"
            value={personalEmail}
            onChange={e => setPersonalEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Work email
          <input
            type="email"
            value={workEmail}
            onChange={e => setWorkEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <button type="button" disabled={busy} onClick={() => void onSubmit()}>
          {busy ? 'Saving…' : 'Complete registration'}
        </button>
      </div>
    </div>
  );
}
