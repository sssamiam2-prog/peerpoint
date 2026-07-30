import * as React from 'react';
import { Link } from 'react-router-dom';
import { useActionFeedback, type SuccessToast } from '../components/ActionFeedback';
import { AdminContentPanel } from '../components/AdminContentPanel';
import { AdminTestPanel } from '../components/AdminTestPanel';
import { TwilioPhoneVerify } from '../components/TwilioPhoneVerify';
import { ADMIN_HOST, isAdminHostClient, isProductionAdminHost } from '../lib/adminHost';

const STAFF_TOKEN_KEY = 'peerpoint_staff_token';
const STAFF_META_KEY = 'peerpoint_staff_meta';

type RequestNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
  createdByDisplay: string;
};

type TimeEntry = {
  id: string;
  minutes: number;
  note?: string;
  createdAt: string;
  createdBy: string;
  createdByDisplay: string;
};

type HelpRequest = {
  id: string;
  submittedAt: string;
  requesterName?: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact?: string;
  description?: string;
  status: 'open' | 'queued' | 'assigned' | 'closed';
  roomCode?: string;
  assignedPeer?: string;
  assignedPeerUsername?: string;
  contactMode?: 'chat' | 'voice' | 'form' | 'faceToFace';
  bureau?: string;
  employmentType?: 'civilian' | 'sworn';
  preferredPeerSex?: 'male' | 'female';
  notes?: RequestNote[];
  timeEntries?: TimeEntry[];
};

type StaffRole = 'admin' | 'staff';

type SessionMeta = {
  role: StaffRole;
  username?: string;
  displayName?: string;
  peerAvailable?: boolean;
  unavailableSince?: string;
  unavailableReason?: string;
};

type PublicAccount = {
  username: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  sex?: 'male' | 'female';
  displayName?: string;
  active: boolean;
  setupComplete: boolean;
  createdAt: string;
  isPeerSupportLeader?: boolean;
  twilioPhoneVerified?: boolean;
  emailVerified?: boolean;
  cellPhone?: string;
};

type PendingInvite = {
  token: string;
  email: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  createdAt: string;
  invitedBy: string;
  cellPhone?: string;
  emailVerified?: boolean;
};

type OnCallSlot = {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  sex?: 'male' | 'female';
  startAt: string;
  endAt: string;
  createdBy: string;
  createdAt: string;
  availabilityAcknowledged?: boolean;
  availabilityAcknowledgedAt?: string;
  modalities?: 'remote' | 'inPerson' | 'both';
};

type ReportPayload = {
  generatedAt: string;
  summary: {
    requestCount: number;
    openCount: number;
    assignedCount: number;
    closedCount: number;
    totalMinutesLogged: number;
    onCallBlocks: number;
  };
  timeByStaff: { username: string; displayName: string; minutes: number; entries: number }[];
  requestsWithActivity: {
    id: string;
    submittedAt: string;
    status: string;
    assignedPeer?: string;
    assignedPeerUsername?: string;
    contactMode?: string;
    bureau?: string;
    employmentType?: string;
    notes: RequestNote[];
    timeEntries: TimeEntry[];
    totalMinutes: number;
  }[];
  onCallHistory: OnCallSlot[];
};

type WorkspaceTab = 'requests' | 'onCall' | 'members' | 'content' | 'reports' | 'test' | 'account';

type RosterPerson = {
  username: string;
  displayName: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  sex?: 'male' | 'female';
};

function loadMeta(): SessionMeta | null {
  try {
    const raw = sessionStorage.getItem(STAFF_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

function localDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDayString(day: string, deltaDays: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return localDayString(dt);
}

function combineLocalDayAndTime(day: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatSlotRange(slot: OnCallSlot): string {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

function modalityLabel(m?: OnCallSlot['modalities']): string {
  if (m === 'remote') return 'Chat & voice only';
  if (m === 'inPerson') return 'Face to face only';
  return 'Chat/voice + face to face';
}

function formatDayHeading(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function StaffPage(): React.ReactElement {
  const { runAction, showSuccess } = useActionFeedback();
  const onAdminHost = isAdminHostClient();
  const onProdAdminHost = isProductionAdminHost();

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  /** On the member/installable app: Staff sign-in with nested Admin sign-in. */
  const [loginMode, setLoginMode] = React.useState<StaffRole>(() =>
    isProductionAdminHost() ? 'admin' : 'staff'
  );
  const [token, setToken] = React.useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STAFF_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [meta, setMeta] = React.useState<SessionMeta | null>(() => loadMeta());
  const [error, setError] = React.useState<string | undefined>();
  const [info, setInfo] = React.useState<string | undefined>();
  const [requests, setRequests] = React.useState<HelpRequest[]>([]);
  const [onCallNow, setOnCallNow] = React.useState<OnCallSlot[]>([]);
  const [onCallSlots, setOnCallSlots] = React.useState<OnCallSlot[]>([]);
  const [roster, setRoster] = React.useState<RosterPerson[]>([]);
  const [scheduleDay, setScheduleDay] = React.useState(() => localDayString(new Date()));
  const [onCallUsername, setOnCallUsername] = React.useState('');
  const [onCallStartTime, setOnCallStartTime] = React.useState('08:00');
  const [onCallEndTime, setOnCallEndTime] = React.useState('17:00');
  const [onCallAck, setOnCallAck] = React.useState(false);
  const [onCallModalities, setOnCallModalities] = React.useState<'remote' | 'inPerson' | 'both'>('both');
  const [peerName, setPeerName] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});
  const [timeDrafts, setTimeDrafts] = React.useState<Record<string, string>>({});
  const [timeNoteDrafts, setTimeNoteDrafts] = React.useState<Record<string, string>>({});
  const [report, setReport] = React.useState<ReportPayload | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [passwordMsg, setPasswordMsg] = React.useState<string | undefined>();
  const [accountCellPhone, setAccountCellPhone] = React.useState('');
  const [showForgotPassword, setShowForgotPassword] = React.useState(false);
  const [forgotIdentity, setForgotIdentity] = React.useState('');
  const [forgotBusy, setForgotBusy] = React.useState(false);
  const [forgotMsg, setForgotMsg] = React.useState<string | undefined>();
  const [availabilityConfirm, setAvailabilityConfirm] = React.useState<string | undefined>();
  const [availabilityBusy, setAvailabilityBusy] = React.useState(false);

  const [accounts, setAccounts] = React.useState<PublicAccount[]>([]);
  const [pendingInvites, setPendingInvites] = React.useState<PendingInvite[]>([]);
  const [inviteFirstName, setInviteFirstName] = React.useState('');
  const [inviteLastName, setInviteLastName] = React.useState('');
  const [inviteBureau, setInviteBureau] = React.useState('');
  const [inviteJobTitle, setInviteJobTitle] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteCellPhone, setInviteCellPhone] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<StaffRole>('staff');
  const [lastInviteUrl, setLastInviteUrl] = React.useState<string | undefined>();
  const [activeTab, setActiveTab] = React.useState<WorkspaceTab>('requests');

  const authHeaders = React.useCallback((): HeadersInit => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [token]);

  const persistSession = (nextToken: string, nextMeta: SessionMeta): void => {
    sessionStorage.setItem(STAFF_TOKEN_KEY, nextToken);
    sessionStorage.setItem(STAFF_META_KEY, JSON.stringify(nextMeta));
    setToken(nextToken);
    setMeta(nextMeta);
  };

  const clearSession = (): void => {
    sessionStorage.removeItem(STAFF_TOKEN_KEY);
    sessionStorage.removeItem(STAFF_META_KEY);
    setToken(null);
    setMeta(null);
    setRequests([]);
    setAccounts([]);
    setPendingInvites([]);
  };

  const refreshAccounts = React.useCallback(async (): Promise<void> => {
    if (!token || meta?.role !== 'admin') return;
    const res = await fetch('/api/staff/accounts', { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      accounts?: PublicAccount[];
      pendingInvites?: PendingInvite[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? `Could not load accounts (${res.status})`);
      return;
    }
    setAccounts(data.accounts ?? []);
    setPendingInvites(data.pendingInvites ?? []);
  }, [authHeaders, meta?.role, token]);

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!token) return;
    setError(undefined);
    const tzOffsetMin = String(new Date().getTimezoneOffset());
    const qs = new URLSearchParams({ day: scheduleDay, tzOffsetMin });
    const res = await fetch(`/api/staff/requests?${qs.toString()}`, { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      requests?: HelpRequest[];
      onCallNow?: OnCallSlot[];
      onCallSlots?: OnCallSlot[];
      roster?: RosterPerson[];
      me?: SessionMeta;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? `Failed to load (${res.status})`);
      if (res.status === 401 || res.status === 403) clearSession();
      return;
    }
    setRequests(data.requests ?? []);
    setOnCallNow(data.onCallNow ?? []);
    setOnCallSlots(data.onCallSlots ?? []);
    setRoster(data.roster ?? []);
    if (data.me) {
      setMeta(data.me);
      sessionStorage.setItem(STAFF_META_KEY, JSON.stringify(data.me));
      if (data.me.displayName && !peerName) setPeerName(data.me.displayName);
      if (!onCallUsername && data.me.username) {
        const meOnRoster = (data.roster ?? []).some(p => p.username === data.me!.username);
        if (meOnRoster) setOnCallUsername(data.me.username);
      }
    }
    if (!onCallUsername && (data.roster?.length ?? 0) > 0 && !data.me?.username) {
      setOnCallUsername(data.roster![0]!.username);
    }
  }, [authHeaders, onCallUsername, peerName, scheduleDay, token]);

  const refreshReports = React.useCallback(async (): Promise<void> => {
    if (!token || meta?.role !== 'admin') return;
    const res = await fetch('/api/staff/reports', { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as ReportPayload & { error?: string };
    if (!res.ok) {
      setError(data.error ?? `Could not load reports (${res.status})`);
      return;
    }
    setReport(data);
  }, [authHeaders, meta?.role, token]);

  React.useEffect(() => {
    if (token) {
      void refresh();
      if (meta?.role === 'admin') void refreshAccounts();
    }
  }, [token, refresh, refreshAccounts, meta?.role]);

  React.useEffect(() => {
    if (token && meta?.role === 'admin' && activeTab === 'reports') {
      void refreshReports();
    }
  }, [token, meta?.role, activeTab, refreshReports]);

  React.useEffect(() => {
    if (token && activeTab === 'onCall') void refresh();
  }, [scheduleDay, activeTab, token, refresh]);

  const onLogin = async (): Promise<void> => {
    setError(undefined);
    if (!username.trim()) {
      setError('Username or email is required.');
      return;
    }
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        role?: StaffRole;
        username?: string;
        displayName?: string;
        error?: string;
      };
      if (!res.ok || !data.token || !data.role) {
        setError(data.error ?? 'Login failed.');
        return;
      }
      const expectedMode = onProdAdminHost ? 'admin' : loginMode;
      if (expectedMode === 'admin' && data.role !== 'admin') {
        setError('That account is Staff. Switch to Staff sign-in.');
        return;
      }
      if (expectedMode === 'staff' && data.role === 'admin') {
        setError('That account is Admin. Switch to Admin sign-in.');
        return;
      }
      const nextMeta: SessionMeta = {
        role: data.role,
        username: data.username,
        displayName: data.displayName
      };
      persistSession(data.token, nextMeta);
      setPassword('');
      setUsername('');
      if (nextMeta.displayName) setPeerName(nextMeta.displayName);
    } catch {
      setError('Staff API not reachable. Deploy Pages Functions and configure secrets + KV.');
    }
  };

  const onLogout = async (): Promise<void> => {
    try {
      if (token) {
        await fetch('/api/staff/logout', { method: 'POST', headers: authHeaders() });
      }
    } catch {
      /* ignore */
    }
    clearSession();
  };

  const onChangePassword = async (): Promise<void> => {
    setPasswordMsg(undefined);
    setError(undefined);
    await runAction('Updating password…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not change password.');
        return null;
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMsg('Password updated.');
      return { title: 'Password updated', message: 'Your password has been changed.' };
    }, toast => toast ?? undefined);
  };

  const onForgotPassword = async (): Promise<void> => {
    setError(undefined);
    setForgotMsg(undefined);
    const identity = forgotIdentity.trim() || username.trim();
    if (!identity) {
      setError('Enter your username or email to reset your password.');
      return;
    }
    setForgotBusy(true);
    await runAction('Sending reset email…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: identity })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) {
          setError(data.error ?? 'Could not start password reset.');
          return null;
        }
        const message =
          data.message ??
          'If an account matches, we sent a reset link. Check your inbox (and spam). The link expires in 1 hour.';
        setForgotMsg(message);
        return { title: 'Check your email', message };
      } catch {
        setError('Network error. Try again.');
        return null;
      } finally {
        setForgotBusy(false);
      }
    }, toast => toast ?? undefined);
  };

  const onInviteUser = async (): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    setLastInviteUrl(undefined);
    await runAction('Sending invite…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          firstName: inviteFirstName,
          lastName: inviteLastName,
          bureau: inviteBureau,
          jobTitle: inviteJobTitle,
          email: inviteEmail,
          cellPhone: inviteCellPhone,
          role: inviteRole
        })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string;
        emailed?: boolean;
        emailNote?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not create invite.');
        return null;
      }
      setInviteFirstName('');
      setInviteLastName('');
      setInviteBureau('');
      setInviteJobTitle('');
      setInviteEmail('');
      setInviteCellPhone('');
      setInviteRole('staff');
      setLastInviteUrl(data.inviteUrl);
      const note = data.emailed
        ? 'Verification email sent. They verify email first; then Twilio calls their cell. You can also copy the link below.'
        : data.emailNote ?? 'Invite created. Copy the verify link below and share it privately.';
      setInfo(note);
      await refreshAccounts();
      return {
        title: data.emailed ? 'Verification email sent' : 'Invite created',
        message: note
      };
    }, toast => toast ?? undefined);
  };

  const onResendInvite = async (invite: PendingInvite): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    await runAction('Resending verification email…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ inviteToken: invite.token, resend: true })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string;
        emailed?: boolean;
        emailNote?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not resend invite.');
        return null;
      }
      setLastInviteUrl(data.inviteUrl);
      const note = data.emailed ? 'Verification email resent.' : data.emailNote ?? 'Copy the verify link below.';
      setInfo(note);
      return { title: 'Email resent', message: note };
    }, toast => toast ?? undefined);
  };

  const onRetriggerInviteTwilio = async (invite: PendingInvite): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    await runAction('Starting Twilio phone verify…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ inviteToken: invite.token, retriggerTwilio: true })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        emailed?: boolean;
        emailNote?: string;
        validationCode?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not start phone verification.');
        return null;
      }
      const note = [
        data.message,
        data.validationCode ? `Code: ${data.validationCode}` : null,
        data.emailed ? 'Code emailed to member.' : data.emailNote
      ]
        .filter(Boolean)
        .join(' ');
      setInfo(note);
      return { title: 'Phone verification', message: note };
    }, toast => toast ?? undefined);
  };

  const onResendAccountEmailVerify = async (account: PublicAccount): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    await runAction('Sending email verification…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, resendEmailVerification: true })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        emailed?: boolean;
        emailNote?: string;
        verifyUrl?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not send email verification.');
        return null;
      }
      if (data.verifyUrl) setLastInviteUrl(data.verifyUrl);
      const note = data.emailed
        ? data.message ?? 'Verification email sent.'
        : data.emailNote ?? data.message ?? 'Copy the verify link below.';
      setInfo(note);
      return { title: 'Email verification', message: note };
    }, toast => toast ?? undefined);
  };

  const onRetriggerAccountTwilio = async (account: PublicAccount): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    await runAction('Starting Twilio phone verify…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, retriggerTwilioVerify: true })
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        emailed?: boolean;
        emailNote?: string;
        validationCode?: string;
        account?: PublicAccount;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not start phone verification.');
        return null;
      }
      if (data.account) {
        setAccounts(prev => prev.map(a => (a.username === data.account!.username ? data.account! : a)));
      } else {
        await refreshAccounts();
      }
      const note = [
        data.message,
        data.validationCode ? `Code: ${data.validationCode}` : null,
        data.emailed ? 'Code emailed to member.' : data.emailNote
      ]
        .filter(Boolean)
        .join(' ');
      setInfo(note);
      return { title: 'Phone verification', message: note };
    }, toast => toast ?? undefined);
  };

  const onRevokeInvite = async (invite: PendingInvite): Promise<void> => {
    setError(undefined);
    await runAction('Revoking invite…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ inviteToken: invite.token, revoke: true })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not revoke invite.');
        return null;
      }
      await refreshAccounts();
      return { title: 'Invite revoked' };
    }, toast => toast ?? undefined);
  };

  const onToggleActive = async (account: PublicAccount): Promise<void> => {
    setError(undefined);
    const nextActive = !account.active;
    await runAction(nextActive ? 'Enabling account…' : 'Disabling account…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, active: nextActive })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not update account.');
        return null;
      }
      await refreshAccounts();
      return {
        title: nextActive ? 'Account enabled' : 'Account disabled',
        message: `${account.firstName} ${account.lastName}`.trim() || account.username
      };
    }, toast => toast ?? undefined);
  };

  const onChangeRole = async (account: PublicAccount, role: StaffRole): Promise<void> => {
    setError(undefined);
    await runAction('Updating access…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, role })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not update role.');
        return null;
      }
      await refreshAccounts();
      return {
        title: 'Access updated',
        message: `${account.username} is now ${role === 'admin' ? 'Admin' : 'Staff'}.`
      };
    }, toast => toast ?? undefined);
  };

  const onChangeSex = async (account: PublicAccount, sex: 'male' | 'female'): Promise<void> => {
    setError(undefined);
    await runAction('Updating profile…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, sex })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not update sex.');
        return null;
      }
      await refreshAccounts();
      return {
        title: 'Profile updated',
        message: `Set to ${sex === 'male' ? 'Male' : 'Female'}.`
      };
    }, toast => toast ?? undefined);
  };

  const onToggleLeader = async (account: PublicAccount): Promise<void> => {
    setError(undefined);
    const next = !account.isPeerSupportLeader;
    await runAction(next ? 'Designating Leader…' : 'Removing Leader…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/accounts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ username: account.username, isPeerSupportLeader: next })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not update Leader designation.');
        return null;
      }
      await refreshAccounts();
      return {
        title: next ? 'Peer Support Leader' : 'Leader removed',
        message: next
          ? `${account.firstName} will be emailed when on-call coverage is unavailable.`
          : `${account.firstName} is no longer a Peer Support Leader.`
      };
    }, toast => toast ?? undefined);
  };

  const copyInviteUrl = async (): Promise<void> => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setInfo('Invite link copied.');
      showSuccess({ title: 'Link copied', message: 'Invite link is on your clipboard.' });
    } catch {
      setInfo('Copy failed — select the link manually.');
    }
  };

  const assign = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(undefined);
    await runAction('Assigning request…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            action: 'assign',
            id,
            assignedPeer: peerName.trim() || meta?.displayName || meta?.username || 'Peer'
          })
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          emailed?: {
            memberEmailed?: boolean;
            staffEmailed?: boolean;
            memberSms?: boolean;
            staffSms?: boolean;
            summary?: string;
          };
        };
        if (!res.ok) {
          setError(data.error ?? 'Assign failed.');
          return null;
        }
        await refresh();
        const summary =
          data.emailed?.summary ??
          'Room code generated. Email/SMS sent when contact info and Twilio/Resend are configured.';
        return {
          title: 'Request assigned',
          message: summary
        };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const acceptQueue = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(undefined);
    await runAction('Accepting queue…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'acceptQueue', id })
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          roomCode?: string;
          joinPath?: string;
          contactMode?: 'chat' | 'voice';
          emailed?: {
            memberEmailed?: boolean;
            staffEmailed?: boolean;
            memberSms?: boolean;
            staffSms?: boolean;
            summary?: string;
          };
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not accept.');
          return null;
        }
        await refresh();
        const room = data.roomCode ? ` Room ${data.roomCode}.` : '';
        const summary = data.emailed?.summary ?? 'Member notified when email/SMS is configured.';
        return {
          title: 'Accepted',
          message: `${summary}${room}`
        };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const declineQueue = async (id: string): Promise<void> => {
    setBusyId(id);
    setError(undefined);
    await runAction('Declining…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'declineQueue', id })
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          reoffered?: boolean;
          nextPeer?: string;
          notify?: { summary?: string };
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not decline.');
          return null;
        }
        await refresh();
        if (data.reoffered) {
          return {
            title: 'Passed to next peer',
            message:
              data.notify?.summary ??
              (data.nextPeer
                ? `Offered to ${data.nextPeer} (email + SMS when configured).`
                : 'Next free on-call peer was notified.')
          };
        }
        return {
          title: 'Declined',
          message: 'No other free peer was available. Peer Support Leaders were notified.'
        };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const closeReq = async (id: string): Promise<void> => {
    setBusyId(id);
    await runAction('Closing request…', async (): Promise<SuccessToast | null> => {
      try {
        await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'close', id })
        });
        await refresh();
        return { title: 'Request closed' };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const addOnCall = async (): Promise<void> => {
    setError(undefined);
    setInfo(undefined);
    const isAdminUser = meta?.role === 'admin';
    const username = isAdminUser ? onCallUsername : meta?.username || onCallUsername;
    if (!username) {
      setError('Pick a Staff or Admin from the list.');
      return;
    }
    if (!onCallAck) {
      setError('Acknowledge that you are expected to be available during these On Call times.');
      return;
    }
    const start = combineLocalDayAndTime(scheduleDay, onCallStartTime);
    const end = combineLocalDayAndTime(scheduleDay, onCallEndTime);
    if (!start || !end) {
      setError('Start and end times are required.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setError('End time must be after start time (same day).');
      return;
    }
    await runAction('Saving On Call…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/requests', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'addOnCall',
          username,
          self: !isAdminUser || username === meta?.username,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          availabilityAcknowledged: true,
          modalities: onCallModalities
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not add on-call block.');
        return null;
      }
      setInfo('On-call block saved.');
      setOnCallAck(false);
      setOnCallModalities('both');
      await refresh();
      return {
        title: 'On Call saved',
        message: modalityLabel(onCallModalities)
      };
    }, toast => toast ?? undefined);
  };

  const addNote = async (id: string): Promise<void> => {
    const text = (noteDrafts[id] ?? '').trim();
    if (!text) {
      setError('Enter a note before saving.');
      return;
    }
    setBusyId(id);
    setError(undefined);
    await runAction('Saving note…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'addNote', id, text })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Could not save note.');
          return null;
        }
        setNoteDrafts(prev => ({ ...prev, [id]: '' }));
        await refresh();
        return { title: 'Note saved' };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const addTime = async (id: string): Promise<void> => {
    const minutes = Number(timeDrafts[id]);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError('Enter time spent in minutes.');
      return;
    }
    setBusyId(id);
    setError(undefined);
    await runAction('Logging time…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            action: 'addTime',
            id,
            minutes,
            note: (timeNoteDrafts[id] ?? '').trim() || undefined
          })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Could not log time.');
          return null;
        }
        setTimeDrafts(prev => ({ ...prev, [id]: '' }));
        setTimeNoteDrafts(prev => ({ ...prev, [id]: '' }));
        await refresh();
        return { title: 'Time logged', message: `${Math.round(minutes)} minutes saved.` };
      } finally {
        setBusyId(null);
      }
    }, toast => toast ?? undefined);
  };

  const removeOnCall = async (slotId: string): Promise<void> => {
    setError(undefined);
    await runAction('Removing On Call…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/requests', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'removeOnCall', id: slotId })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not remove on-call block.');
        return null;
      }
      await refresh();
      return { title: 'On Call removed' };
    }, toast => toast ?? undefined);
  };

  const setPeerAvailable = async (available: boolean): Promise<void> => {
    setError(undefined);
    setAvailabilityConfirm(undefined);
    setAvailabilityBusy(true);
    await runAction(available ? 'Marking available…' : 'Marking unavailable…', async (): Promise<SuccessToast | null> => {
      try {
        const res = await fetch('/api/staff/requests', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            action: 'setPeerAvailable',
            available,
            reason: available ? undefined : 'manually marked unavailable'
          })
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          me?: { peerAvailable?: boolean; unavailableSince?: string; unavailableReason?: string };
        };
        if (!res.ok) {
          setError(data.error ?? 'Could not update availability.');
          setAvailabilityConfirm('Status was not changed. Try again.');
          return null;
        }
        const nowAvailable = data.me?.peerAvailable !== false;
        if (data.me && meta) {
          const next = {
            ...meta,
            peerAvailable: data.me.peerAvailable,
            unavailableSince: data.me.unavailableSince,
            unavailableReason: data.me.unavailableReason
          };
          setMeta(next);
          sessionStorage.setItem(STAFF_META_KEY, JSON.stringify(next));
        }
        // Verify server echo matches the requested change.
        if (nowAvailable !== available) {
          setAvailabilityConfirm(
            `Status may not have updated (server still shows ${nowAvailable ? 'Available' : 'Unavailable'}). Refresh and try again.`
          );
          setError('Availability did not match the requested change.');
          return null;
        }
        setAvailabilityConfirm(
          nowAvailable
            ? 'Confirmed: you are now Available for peer matching.'
            : 'Confirmed: you are now Unavailable. Members will not be matched to you.'
        );
        await refresh();
        return {
          title: nowAvailable ? 'You are available' : 'You are unavailable',
          message: nowAvailable
            ? 'Members can match you again for immediate contact while you are On Call.'
            : 'You will get a reminder email about every 30 minutes until you mark yourself available.'
        };
      } finally {
        setAvailabilityBusy(false);
      }
    }, toast => toast ?? undefined);
  };

  if (!token) {
    const mode = onProdAdminHost ? 'admin' : loginMode;
    return (
      <div className="page-shell page-shell-tight">
        <h2>{mode === 'admin' ? 'Admin sign-in' : 'Staff sign-in'}</h2>
        <p className="lede">
          {onProdAdminHost
            ? `Enter your Admin username or email and password. Production Admin URL: https://${ADMIN_HOST}`
            : mode === 'admin'
              ? 'Sign in with your Admin username or email and password. Works in this installed app on Windows, Mac, or phone.'
              : 'For Peer Support staff and on-duty peers. Sign in with your Staff username or email and password.'}
        </p>

        {!onProdAdminHost ? (
          <div className="staff-login-modes" role="tablist" aria-label="Sign-in type">
            <button
              type="button"
              role="tab"
              aria-selected={loginMode === 'staff'}
              className={
                loginMode === 'staff' ? 'staff-login-modes__btn staff-login-modes__btn--active' : 'staff-login-modes__btn'
              }
              onClick={() => {
                setLoginMode('staff');
                setError(undefined);
              }}
            >
              Staff login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginMode === 'admin'}
              className={
                loginMode === 'admin' ? 'staff-login-modes__btn staff-login-modes__btn--active' : 'staff-login-modes__btn'
              }
              onClick={() => {
                setLoginMode('admin');
                setError(undefined);
              }}
            >
              Admin login
            </button>
          </div>
        ) : null}

        {error && <div style={{ color: '#a4262c', marginTop: 8 }}>{error}</div>}
        <label style={{ display: 'block', marginTop: 16 }}>
          Username or email
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            name="username"
            placeholder={mode === 'admin' ? 'Admin username or email' : 'Staff username or email'}
          />
        </label>
        <label style={{ display: 'block', marginTop: 12 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            name="password"
          />
        </label>
        <button type="button" style={{ marginTop: 12 }} onClick={() => void onLogin()}>
          {mode === 'admin' ? 'Sign in as Admin' : 'Sign in as Staff'}
        </button>
        <p style={{ marginTop: 12, fontSize: 14 }}>
          <button
            type="button"
            className="linkish"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--accent, #0f6a4a)',
              textDecoration: 'underline',
              cursor: 'pointer',
              font: 'inherit'
            }}
            onClick={() => {
              setShowForgotPassword(v => !v);
              setForgotMsg(undefined);
              setError(undefined);
              if (!forgotIdentity && username) setForgotIdentity(username);
            }}
          >
            Forgot password?
          </button>
        </p>
        {showForgotPassword ? (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              border: '1px solid var(--border, #d5e0d8)',
              borderRadius: 8,
              maxWidth: 420
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>
              Enter your username or the email on your account. We will send a reset link if a match is found.
            </p>
            <label style={{ display: 'block' }}>
              Username or email
              <input
                value={forgotIdentity}
                onChange={e => setForgotIdentity(e.target.value)}
                autoComplete="username"
                name="forgot-identity"
                placeholder={username || 'username or email'}
              />
            </label>
            <button
              type="button"
              style={{ marginTop: 10 }}
              disabled={forgotBusy}
              onClick={() => void onForgotPassword()}
            >
              {forgotBusy ? 'Sending…' : 'Send reset link'}
            </button>
            {forgotMsg ? (
              <p style={{ color: 'var(--accent, #0f6a4a)', marginTop: 10, fontSize: 14 }}>{forgotMsg}</p>
            ) : null}
          </div>
        ) : null}
        {mode === 'admin' || onProdAdminHost ? (
          <p style={{ fontSize: 13, marginTop: 16, color: 'var(--text)' }}>
            Admin How-To:{' '}
            <a href="/docs/PEERPoint-Admin-How-To.docx" download>
              Download Word
            </a>
            {' · '}
            <a href="/docs/PEERPoint-Admin-How-To.pdf" download>
              Download PDF
            </a>
          </p>
        ) : (
          <p style={{ fontSize: 13, marginTop: 16, color: 'var(--text)' }}>
            Staff How-To:{' '}
            <a href="/docs/PEERPoint-Staff-How-To.docx" download>
              Download Word
            </a>
            {' · '}
            <a href="/docs/PEERPoint-Staff-How-To.pdf" download>
              Download PDF
            </a>
          </p>
        )}
        {!onProdAdminHost && mode === 'staff' ? (
          <p style={{ fontSize: 13, marginTop: 12, color: 'var(--text-muted)' }}>
            Need Admin tools? Use the <strong>Admin login</strong> tab above in this same app.
          </p>
        ) : null}
      </div>
    );
  }

  const isAdmin = meta?.role === 'admin';
  // Admin tools work in the installable member app (Windows/desktop PWA), not only on the Admin host.
  const showMembersTab = isAdmin;
  const showContentTab = isAdmin;
  const showReportsTab = isAdmin;
  const showTestTab = isAdmin;
  const adminOnlyTabs: WorkspaceTab[] = ['members', 'content', 'reports', 'test'];
  const tab =
    adminOnlyTabs.includes(activeTab) && !showMembersTab && activeTab === 'members'
      ? 'requests'
      : adminOnlyTabs.includes(activeTab) && activeTab === 'content' && !showContentTab
        ? 'requests'
        : adminOnlyTabs.includes(activeTab) && activeTab === 'reports' && !showReportsTab
          ? 'requests'
          : adminOnlyTabs.includes(activeTab) && activeTab === 'test' && !showTestTab
            ? 'requests'
            : activeTab;

  const isAvailable = meta?.peerAvailable !== false;
  const welcomeName = meta?.displayName || meta?.username || (isAdmin ? 'Admin' : 'Staff');

  return (
    <div className="page-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{isAdmin ? 'Admin workspace' : 'Staff workspace'}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && !onProdAdminHost ? (
            <a
              className="btn-ghost"
              href={`https://${ADMIN_HOST}/`}
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Open Admin website
            </a>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </div>

      <section
        className="staff-welcome"
        aria-label="Welcome and availability"
        style={{
          marginTop: 14,
          padding: 16,
          borderRadius: 14,
          border: `2px solid ${isAvailable ? 'var(--accent, #0f6a4a)' : '#b45309'}`,
          background: isAvailable ? 'var(--social-bg, #f6faf7)' : '#fffbeb',
          display: 'grid',
          gap: 10,
          maxWidth: 640
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>
            Welcome, {welcomeName}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text)' }}>
            You are signed in as <strong>{isAdmin ? 'Admin' : 'Staff'}</strong>
            {meta?.username ? ` (${meta.username})` : ''}.
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 14,
              background: isAvailable ? 'rgba(15, 106, 74, 0.12)' : 'rgba(180, 83, 9, 0.15)',
              color: isAvailable ? 'var(--accent, #0f6a4a)' : '#92400e'
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isAvailable ? 'var(--accent, #0f6a4a)' : '#b45309'
              }}
            />
            Status: {isAvailable ? 'Available' : 'Unavailable'}
          </span>
          <button
            type="button"
            disabled={availabilityBusy}
            onClick={() => void setPeerAvailable(!isAvailable)}
          >
            {availabilityBusy
              ? 'Updating…'
              : isAvailable
                ? 'Mark myself unavailable'
                : 'Mark myself available'}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
          {isAvailable
            ? 'Members can be matched to you for immediate contact while you are On Call.'
            : `Members will not be matched to you${
                meta?.unavailableReason ? ` (${meta.unavailableReason})` : ''
              }.${
                meta?.unavailableSince
                  ? ` Since ${new Date(meta.unavailableSince).toLocaleString()}.`
                  : ''
              } You will get an email reminder about every 30 minutes until you mark yourself available again.`}
        </p>

        {availabilityConfirm ? (
          <p
            role="status"
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: isAvailable ? 'var(--accent, #0f6a4a)' : '#92400e'
            }}
          >
            {availabilityConfirm}
          </p>
        ) : null}
      </section>

      <p style={{ marginTop: 10, fontSize: 14 }}>
        {showTestTab ? (
          <>
            Use the <strong>Test app</strong> tab to smoke-test chat, voice, mic check, and member pages.
          </>
        ) : (
          <>
            <Link to="/voice-test">Voice check</Link>
            {' — '}
            test mic and speaker on this phone or computer before taking a peer voice call.
          </>
        )}
      </p>
      {error && <div style={{ color: '#a4262c', marginTop: 8 }}>{error}</div>}
      {info && <div style={{ color: 'var(--accent, #0f6a4a)', marginTop: 8 }}>{info}</div>}

      <div className="staff-tabs" role="tablist" aria-label="Workspace sections">
        <button
          type="button"
          role="tab"
          id="tab-requests"
          aria-selected={tab === 'requests'}
          aria-controls="panel-requests"
          className={tab === 'requests' ? 'staff-tab is-active' : 'staff-tab'}
          onClick={() => setActiveTab('requests')}
        >
          Requests
        </button>
        <button
          type="button"
          role="tab"
          id="tab-onCall"
          aria-selected={tab === 'onCall'}
          aria-controls="panel-onCall"
          className={tab === 'onCall' ? 'staff-tab is-active' : 'staff-tab'}
          onClick={() => setActiveTab('onCall')}
        >
          On Call
        </button>
        {showMembersTab ? (
          <button
            type="button"
            role="tab"
            id="tab-members"
            aria-selected={tab === 'members'}
            aria-controls="panel-members"
            className={tab === 'members' ? 'staff-tab is-active' : 'staff-tab'}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
        ) : null}
        {showContentTab ? (
          <button
            type="button"
            role="tab"
            id="tab-content"
            aria-selected={tab === 'content'}
            aria-controls="panel-content"
            className={tab === 'content' ? 'staff-tab is-active' : 'staff-tab'}
            onClick={() => setActiveTab('content')}
          >
            Content
          </button>
        ) : null}
        {showTestTab ? (
          <button
            type="button"
            role="tab"
            id="tab-test"
            aria-selected={tab === 'test'}
            aria-controls="panel-test"
            className={tab === 'test' ? 'staff-tab is-active' : 'staff-tab'}
            onClick={() => setActiveTab('test')}
          >
            Test app
          </button>
        ) : null}
        {showReportsTab ? (
          <button
            type="button"
            role="tab"
            id="tab-reports"
            aria-selected={tab === 'reports'}
            aria-controls="panel-reports"
            className={tab === 'reports' ? 'staff-tab is-active' : 'staff-tab'}
            onClick={() => setActiveTab('reports')}
          >
            Reports
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          id="tab-account"
          aria-selected={tab === 'account'}
          aria-controls="panel-account"
          className={tab === 'account' ? 'staff-tab is-active' : 'staff-tab'}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
      </div>

      {tab === 'requests' ? (
        <section
          className="staff-tab-panel"
          role="tabpanel"
          id="panel-requests"
          aria-labelledby="tab-requests"
        >
          <p className="lede" style={{ marginTop: 0 }}>
            Accept queued chat/voice requests, or assign a room code for open follow-ups. Member and staff both get
            email and text with the room code and a one-tap join link. New requests go to the next free on-call peer
            (peers already in a session are skipped; peers who have not taken a session yet are preferred).
          </p>
          <h3>Assign as</h3>
          <label>
            Peer display name for assignments
            <input
              value={peerName}
              onChange={e => setPeerName(e.target.value)}
              placeholder="Your name or initials"
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
            <h3 style={{ margin: 0 }}>Open queue</h3>
            <button type="button" className="btn-ghost" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          {requests.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text)' }}>No requests yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 12 }}>
              {requests.map(r => {
                const offeredToMe =
                  r.status === 'queued' &&
                  Boolean(meta?.username) &&
                  String(r.assignedPeerUsername || '').toLowerCase() === String(meta?.username || '').toLowerCase();
                const joinPath =
                  r.roomCode &&
                  (r.contactMode === 'voice' ? `/voice?room=${r.roomCode}` : `/chat?room=${r.roomCode}`);
                return (
                <li
                  key={r.id}
                  style={{
                    border: offeredToMe ? '2px solid var(--accent, #0f766e)' : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    background: offeredToMe ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)' : 'var(--social-bg)'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {r.requesterName || '(no name)'} · {r.status}
                    {r.contactMode === 'faceToFace'
                      ? ' · Face to face'
                      : r.contactMode === 'chat' || r.contactMode === 'voice'
                        ? ` · Immediate ${r.contactMode}`
                        : ''}
                    {offeredToMe ? ' · waiting for you' : ''}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {r.requesterPhone} · {r.requesterEmail}
                    {r.bureau ? ` · ${r.bureau}` : ''}
                    {r.employmentType ? ` · ${r.employmentType}` : ''}
                    {r.preferredPeerSex ? ` · preferred ${r.preferredPeerSex}` : ''}
                    {r.status === 'queued' && r.assignedPeer ? ` · offered to ${r.assignedPeer}` : ''}
                  </div>
                  {r.description ? <p style={{ fontSize: 14, marginTop: 8 }}>{r.description}</p> : null}
                  {r.status === 'queued' ? (
                    <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-muted)' }}>
                      Accept to create a room code and notify the member (email + text). Decline offers the next free
                      on-call peer; Leaders are alerted only if nobody else is free.
                    </p>
                  ) : null}
                  {r.roomCode ? (
                    <p style={{ fontSize: 14, marginTop: 8 }}>
                      Room code: <strong>{r.roomCode}</strong>
                      {r.assignedPeer ? ` · assigned to ${r.assignedPeer}` : ''}
                      <br />
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>
                        Code expires after <strong>24 hours</strong> with no chat/voice use. Re-assign to issue a new
                        code. Both of you can reconnect with this same code if disconnected.
                      </span>
                      <br />
                      {joinPath ? (
                        <>
                          <Link to={joinPath}>
                            Open {r.contactMode === 'voice' ? 'Peer voice' : 'Peer chat'} (auto-fills room)
                          </Link>
                          {' · '}
                        </>
                      ) : null}
                      <Link to={`/chat`}>Peer chat</Link>
                      {' · '}
                      <Link to={`/voice`}>Peer voice</Link>
                    </p>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {r.status === 'queued' && (offeredToMe || isAdmin) ? (
                      <>
                        <button type="button" disabled={busyId === r.id} onClick={() => void acceptQueue(r.id)}>
                          Accept &amp; notify (email + SMS)
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busyId === r.id}
                          onClick={() => void declineQueue(r.id)}
                        >
                          Decline (next peer)
                        </button>
                      </>
                    ) : null}
                    {r.status === 'open' ? (
                      <button type="button" disabled={busyId === r.id} onClick={() => void assign(r.id)}>
                        Assign + email room code
                      </button>
                    ) : null}
                    {r.status !== 'closed' ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busyId === r.id}
                        onClick={() => void closeReq(r.id)}
                      >
                        Close
                      </button>
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid var(--border)',
                      display: 'grid',
                      gap: 8
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Staff notes</div>
                    {(r.notes ?? []).length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                        {(r.notes ?? []).map(n => (
                          <li key={n.id} style={{ marginBottom: 4 }}>
                            <strong>{n.createdByDisplay}</strong>{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              ({new Date(n.createdAt).toLocaleString()})
                            </span>
                            : {n.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No notes yet.</p>
                    )}
                    <label style={{ fontSize: 13 }}>
                      Add note
                      <textarea
                        rows={2}
                        value={noteDrafts[r.id] ?? ''}
                        onChange={e => setNoteDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busyId === r.id}
                      onClick={() => void addNote(r.id)}
                    >
                      Save note
                    </button>

                    {(() => {
                      const assignedToMe =
                        String(r.assignedPeerUsername ?? '').toLowerCase() ===
                        String(meta?.username ?? '').toLowerCase();
                      const canLogTime = isAdmin || assignedToMe;
                      const totalMins = (r.timeEntries ?? []).reduce((s, t) => s + t.minutes, 0);
                      return (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>
                            Time spent{totalMins > 0 ? ` · ${totalMins} min total` : ''}
                          </div>
                          {(r.timeEntries ?? []).length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                              {(r.timeEntries ?? []).map(t => (
                                <li key={t.id}>
                                  {t.minutes} min · {t.createdByDisplay}
                                  {t.note ? ` — ${t.note}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {canLogTime ? (
                            <div style={{ display: 'grid', gap: 6, maxWidth: 360 }}>
                              <label style={{ fontSize: 13 }}>
                                Minutes
                                <input
                                  type="number"
                                  min={1}
                                  max={1440}
                                  value={timeDrafts[r.id] ?? ''}
                                  onChange={e => setTimeDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                                />
                              </label>
                              <label style={{ fontSize: 13 }}>
                                Time note (optional)
                                <input
                                  value={timeNoteDrafts[r.id] ?? ''}
                                  onChange={e =>
                                    setTimeNoteDrafts(prev => ({ ...prev, [r.id]: e.target.value }))
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="btn-ghost"
                                disabled={busyId === r.id}
                                onClick={() => void addTime(r.id)}
                              >
                                Log time
                              </button>
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                              Assign this request to yourself to log time spent.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'onCall' ? (
        <section className="staff-tab-panel" role="tabpanel" id="panel-onCall" aria-labelledby="tab-onCall">
          <h3 style={{ marginTop: 0 }}>On Call schedule</h3>
          <p style={{ fontSize: 14, color: 'var(--text)' }}>
            {isAdmin
              ? 'Add yourself or another Peer Support Member for specific days and hours. Members requesting immediate contact are matched to who is On Call now (Male/Female preference). Names are not shown to members.'
              : 'Add yourself for specific days and hours when you can cover On Call. You must acknowledge that you are expected to be available during those times.'}
          </p>

          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 14,
              border: '2px solid var(--primary)',
              background: 'var(--bg)',
              display: 'grid',
              gap: 12,
              maxWidth: 560
            }}
          >
            <h4 style={{ margin: 0 }}>{isAdmin ? 'Add On Call block' : 'Sign up for On Call'}</h4>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {roster.length === 0
                ? 'No active Peer Support Members found yet. Finish registration for invited accounts first.'
                : `${roster.length} Peer Support Member${roster.length === 1 ? '' : 's'} available`}
            </p>

            <form
              autoComplete="off"
              onSubmit={e => {
                e.preventDefault();
                void addOnCall();
              }}
              style={{ display: 'grid', gap: 10 }}
            >
              {isAdmin ? (
                <label style={{ fontWeight: 600 }}>
                  Peer Support Member
                  <select
                    className="oncall-member-select"
                    value={onCallUsername}
                    onChange={e => setOnCallUsername(e.target.value)}
                    required
                    aria-label="Choose Peer Support Member for On Call"
                  >
                    <option value="">— Choose a Peer Support Member —</option>
                    {roster.map(p => (
                      <option key={p.username} value={p.username}>
                        {p.displayName} · {p.role === 'admin' ? 'Admin' : 'Staff'}
                        {p.sex ? ` · ${p.sex === 'male' ? 'Male' : 'Female'}` : ' · sex not set'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p style={{ margin: 0, fontSize: 14 }}>
                  Signing up as <strong>{meta?.displayName || meta?.username}</strong>
                </p>
              )}

              <label style={{ fontWeight: 600 }}>
                Day
                <input
                  type="date"
                  value={scheduleDay}
                  onChange={e => setScheduleDay(e.target.value)}
                  aria-label="On Call day"
                  required
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ fontWeight: 600 }}>
                  Start time
                  <input
                    type="time"
                    value={onCallStartTime}
                    onChange={e => setOnCallStartTime(e.target.value)}
                    required
                  />
                </label>
                <label style={{ fontWeight: 600 }}>
                  End time
                  <input type="time" value={onCallEndTime} onChange={e => setOnCallEndTime(e.target.value)} required />
                </label>
              </div>

              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: 0 }}>
                <legend style={{ padding: '0 6px', fontWeight: 600 }}>Available for</legend>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>
                  Choose whether this On Call block covers face-to-face meetings, chat/voice only, or both.
                </p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="onCallModalities"
                    checked={onCallModalities === 'both'}
                    onChange={() => setOnCallModalities('both')}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Both — chat &amp; voice <em>and</em> face to face
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="onCallModalities"
                    checked={onCallModalities === 'remote'}
                    onChange={() => setOnCallModalities('remote')}
                    style={{ marginTop: 3 }}
                  />
                  <span>Chat &amp; voice only (no face to face)</span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 500 }}>
                  <input
                    type="radio"
                    name="onCallModalities"
                    checked={onCallModalities === 'inPerson'}
                    onChange={() => setOnCallModalities('inPerson')}
                    style={{ marginTop: 3 }}
                  />
                  <span>Face to face only (not for immediate chat/voice)</span>
                </label>
              </fieldset>

              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 13,
                  lineHeight: 1.4,
                  fontWeight: 600
                }}
              >
                <input
                  type="checkbox"
                  checked={onCallAck}
                  onChange={e => setOnCallAck(e.target.checked)}
                  style={{ marginTop: 3 }}
                  required
                />
                <span>
                  I acknowledge that the Peer Support Member scheduled for these times is expected to be available for
                  the selected contact types during this On Call block.
                </span>
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" disabled={(!isAdmin ? !meta?.username : !onCallUsername) || roster.length === 0}>
                  Add to On Call
                </button>
                <button type="button" className="btn-ghost" onClick={() => void refresh()}>
                  Refresh
                </button>
              </div>
            </form>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              border: '1px solid var(--accent-border)',
              background: 'var(--accent-bg)'
            }}
          >
            <strong>On Call now:</strong>{' '}
            {onCallNow.length === 0
              ? 'Nobody'
              : onCallNow
                  .map(
                    s =>
                      `${s.displayName}${s.sex ? ` (${s.sex === 'male' ? 'Male' : 'Female'})` : ' (sex not set)'} · ${modalityLabel(s.modalities)}`
                  )
                  .join(', ')}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="btn-ghost" onClick={() => setScheduleDay(d => shiftDayString(d, -1))}>
              Previous day
            </button>
            <button type="button" className="btn-ghost" onClick={() => setScheduleDay(localDayString(new Date()))}>
              Today
            </button>
            <button type="button" className="btn-ghost" onClick={() => setScheduleDay(d => shiftDayString(d, 1))}>
              Next day
            </button>
          </div>
          <h4 style={{ marginTop: 12 }}>Scheduled for {formatDayHeading(scheduleDay)}</h4>

          {onCallSlots.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text)' }}>No On Call blocks for this day yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 8 }}>
              {onCallSlots.map(slot => (
                <li
                  key={slot.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 10,
                    background: 'var(--social-bg)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center'
                  }}
                >
                  <span>
                    <strong>{slot.displayName}</strong> · {formatSlotRange(slot)}
                    {slot.sex ? ` · ${slot.sex === 'male' ? 'Male' : 'Female'}` : ' · sex not set'}
                    {' · '}
                    {modalityLabel(slot.modalities)}
                  </span>
                  <button type="button" className="btn-ghost" onClick={() => void removeOnCall(slot.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'members' && showMembersTab ? (
        <section className="staff-tab-panel" role="tabpanel" id="panel-members" aria-labelledby="tab-members">
          <h3 style={{ marginTop: 0 }}>Invite Peer Support Member</h3>
          <p style={{ fontSize: 14, color: 'var(--text)' }}>
            They receive a <strong>verification email</strong> first. After they verify, Twilio calls their cell for SMS
            allow-list setup, then they finish registration (username and password).
          </p>
          <form
            autoComplete="off"
            onSubmit={e => {
              e.preventDefault();
              void onInviteUser();
            }}
            style={{ display: 'grid', gap: 8, maxWidth: 480 }}
          >
            {/* Decoy fields so password managers do not fill the invite form */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              value=""
              readOnly
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              value=""
              readOnly
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <label>
              First name
              <input
                name="invite-first-name"
                autoComplete="off"
                value={inviteFirstName}
                onChange={e => setInviteFirstName(e.target.value)}
              />
            </label>
            <label>
              Last name
              <input
                name="invite-last-name"
                autoComplete="off"
                value={inviteLastName}
                onChange={e => setInviteLastName(e.target.value)}
              />
            </label>
            <label>
              Bureau
              <input
                name="invite-bureau"
                autoComplete="off"
                value={inviteBureau}
                onChange={e => setInviteBureau(e.target.value)}
              />
            </label>
            <label>
              Job title
              <input
                name="invite-job-title"
                autoComplete="off"
                value={inviteJobTitle}
                onChange={e => setInviteJobTitle(e.target.value)}
              />
            </label>
            <label>
              Email address
              <input
                type="text"
                inputMode="email"
                name="invite-member-email"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </label>
            <label>
              Cell phone
              <input
                type="tel"
                name="invite-cell-phone"
                autoComplete="off"
                placeholder="8015551234"
                value={inviteCellPhone}
                onChange={e => setInviteCellPhone(e.target.value)}
              />
            </label>
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <legend style={{ padding: '0 4px' }}>Access</legend>
              <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="inviteRole"
                  checked={inviteRole === 'staff'}
                  onChange={() => setInviteRole('staff')}
                />
                Staff
              </label>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="inviteRole"
                  checked={inviteRole === 'admin'}
                  onChange={() => setInviteRole('admin')}
                />
                Admin
              </label>
            </fieldset>
            <button type="submit">Send verification email</button>
          </form>

          {lastInviteUrl ? (
            <div style={{ marginTop: 12, maxWidth: 560 }}>
              <label>
                Verify / invite link
                <input readOnly value={lastInviteUrl} onFocus={e => e.target.select()} />
              </label>
              <button type="button" className="btn-ghost" style={{ marginTop: 8 }} onClick={() => void copyInviteUrl()}>
                Copy link
              </button>
            </div>
          ) : null}

          {pendingInvites.length > 0 ? (
            <>
              <h4 style={{ marginTop: 24 }}>Pending invites</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 8 }}>
                {pendingInvites.map(inv => (
                  <li
                    key={inv.token}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 10,
                      background: 'var(--social-bg)'
                    }}
                  >
                    <div>
                      <strong>
                        {inv.firstName} {inv.lastName}
                      </strong>{' '}
                      · {inv.role === 'admin' ? 'Admin' : 'Staff'} · pending
                      {inv.emailVerified ? ' · email verified' : ' · email not verified'}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {inv.email}
                      {inv.cellPhone ? ` · ${inv.cellPhone}` : ''} · {inv.bureau} · {inv.jobTitle}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn-ghost" onClick={() => void onResendInvite(inv)}>
                        Resend email verify
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void onRetriggerInviteTwilio(inv)}
                        disabled={!inv.emailVerified}
                        title={
                          inv.emailVerified
                            ? 'Call their cell via Twilio again'
                            : 'Email must be verified first'
                        }
                      >
                        Retrigger phone verify
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => void onRevokeInvite(inv)}>
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h4 style={{ marginTop: 24 }}>Accounts</h4>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Designate <strong>Peer Support Leaders</strong> to receive email when on-call coverage is unavailable or a
            peer declines a queued request. Use the verify buttons to resend email or Twilio cell verification.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 8 }}>
            {accounts.map(a => (
              <li
                key={a.username}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 10,
                  background: 'var(--social-bg)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}
              >
                <span>
                  <strong>
                    {a.firstName} {a.lastName}
                  </strong>{' '}
                  ({a.username}) · {a.role === 'admin' ? 'Admin' : 'Staff'}
                  {' · '}
                  {a.active ? 'active' : 'disabled'}
                  {a.isPeerSupportLeader ? ' · Peer Support Leader' : ''}
                  {a.emailVerified ? ' · email verified' : ' · email not verified'}
                  {a.twilioPhoneVerified ? ' · SMS phone verified' : ' · SMS phone not verified'}
                  {a.username === 'admin' ? (
                    <> · master control (not used for peer matching)</>
                  ) : (
                    <>
                      {' · '}
                      {a.sex === 'male' ? 'Male' : a.sex === 'female' ? 'Female' : 'sex not set'}
                    </>
                  )}
                  <br />
                  <span style={{ fontSize: 13 }}>
                    {a.bureau} · {a.jobTitle} · {a.email}
                    {a.cellPhone ? ` · ${a.cellPhone}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {a.username !== 'admin' ? (
                    <button type="button" className="btn-ghost" onClick={() => void onResendAccountEmailVerify(a)}>
                      Resend email verify
                    </button>
                  ) : null}
                  {a.username !== 'admin' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void onRetriggerAccountTwilio(a)}
                      disabled={!a.cellPhone}
                      title={a.cellPhone ? 'Twilio will call their cell' : 'No cell phone on file'}
                    >
                      Retrigger phone verify
                    </button>
                  ) : null}
                  {a.username !== 'admin' && a.sex !== 'male' ? (
                    <button type="button" className="btn-ghost" onClick={() => void onChangeSex(a, 'male')}>
                      Set Male
                    </button>
                  ) : null}
                  {a.username !== 'admin' && a.sex !== 'female' ? (
                    <button type="button" className="btn-ghost" onClick={() => void onChangeSex(a, 'female')}>
                      Set Female
                    </button>
                  ) : null}
                  {a.username !== 'admin' ? (
                    <button type="button" className="btn-ghost" onClick={() => void onToggleLeader(a)}>
                      {a.isPeerSupportLeader ? 'Remove Leader' : 'Make Leader'}
                    </button>
                  ) : null}
                  {a.username !== 'admin' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void onChangeRole(a, a.role === 'admin' ? 'staff' : 'admin')}
                    >
                      Make {a.role === 'admin' ? 'Staff' : 'Admin'}
                    </button>
                  ) : null}
                  {a.username !== 'admin' ? (
                    <button type="button" className="btn-ghost" onClick={() => void onToggleActive(a)}>
                      {a.active ? 'Disable' : 'Enable'}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'content' && showContentTab ? <AdminContentPanel authHeaders={authHeaders} /> : null}

      {tab === 'test' && showTestTab ? (
        <AdminTestPanel authHeaders={authHeaders} onAdminHost={onAdminHost} />
      ) : null}

      {tab === 'reports' && showReportsTab ? (
        <section className="staff-tab-panel" role="tabpanel" id="panel-reports" aria-labelledby="tab-reports">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Reports</h3>
            <button type="button" className="btn-ghost" onClick={() => void refreshReports()}>
              Refresh
            </button>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text)' }}>
            Notes, time spent, and On Call history for program oversight.
          </p>
          {!report ? (
            <p style={{ fontSize: 14 }}>Loading report…</p>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 10,
                  marginTop: 12
                }}
              >
                {[
                  ['Requests', report.summary.requestCount],
                  ['Open', report.summary.openCount],
                  ['Assigned', report.summary.assignedCount],
                  ['Closed', report.summary.closedCount],
                  ['Minutes logged', report.summary.totalMinutesLogged],
                  ['On Call blocks', report.summary.onCallBlocks]
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      background: 'var(--social-bg)'
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                  </div>
                ))}
              </div>

              <h4 style={{ marginTop: 24 }}>Time by Peer Support Member</h4>
              {report.timeByStaff.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--text)' }}>No time logged yet.</p>
              ) : (
                <ul style={{ paddingLeft: 18, fontSize: 14 }}>
                  {report.timeByStaff.map(row => (
                    <li key={row.username}>
                      <strong>{row.displayName}</strong> — {row.minutes} min ({row.entries} entries)
                    </li>
                  ))}
                </ul>
              )}

              <h4 style={{ marginTop: 24 }}>Requests with notes or time</h4>
              {report.requestsWithActivity.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--text)' }}>No notes or time entries yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
                  {report.requestsWithActivity.map(r => (
                    <li
                      key={r.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 12,
                        background: 'var(--social-bg)'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {r.status} · {r.assignedPeer || 'unassigned'} · {r.totalMinutes} min
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(r.submittedAt).toLocaleString()}
                        {r.bureau ? ` · ${r.bureau}` : ''}
                        {r.contactMode ? ` · ${r.contactMode}` : ''}
                      </div>
                      {(r.notes ?? []).map(n => (
                        <p key={n.id} style={{ fontSize: 13, margin: '6px 0 0' }}>
                          <strong>Note ({n.createdByDisplay}):</strong> {n.text}
                        </p>
                      ))}
                      {(r.timeEntries ?? []).map(t => (
                        <p key={t.id} style={{ fontSize: 13, margin: '4px 0 0' }}>
                          <strong>Time:</strong> {t.minutes} min · {t.createdByDisplay}
                          {t.note ? ` — ${t.note}` : ''}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}

              <h4 style={{ marginTop: 24 }}>On Call history</h4>
              {report.onCallHistory.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--text)' }}>No On Call blocks recorded.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, maxHeight: 360, overflow: 'auto' }}>
                  {report.onCallHistory.slice(0, 80).map(s => (
                    <li
                      key={s.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 8,
                        fontSize: 13,
                        background: 'var(--social-bg)'
                      }}
                    >
                      <strong>{s.displayName}</strong> · {formatSlotRange(s)}
                      <br />
                      {new Date(s.startAt).toLocaleDateString()} → {new Date(s.endAt).toLocaleDateString()}
                      {s.availabilityAcknowledged ? ' · availability acknowledged' : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Generated {new Date(report.generatedAt).toLocaleString()}
              </p>
            </>
          )}
        </section>
      ) : null}

      {tab === 'account' ? (
        <section className="staff-tab-panel" role="tabpanel" id="panel-account" aria-labelledby="tab-account">
          {isAdmin ? (
            <>
              <h3 style={{ marginTop: 0 }}>How-To guides</h3>
              <p style={{ fontSize: 14, color: 'var(--text)' }}>
                Download guides for Admins and Staff. Invite emails include these buttons automatically.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <a className="btn-ghost" href="/docs/PEERPoint-Admin-How-To.pdf" download>
                  Admin How-To (PDF)
                </a>
                <a className="btn-ghost" href="/docs/PEERPoint-Admin-How-To.docx" download>
                  Admin How-To (Word)
                </a>
                <a className="btn-ghost" href="/docs/PEERPoint-Staff-How-To.pdf" download>
                  Staff How-To (PDF)
                </a>
                <a className="btn-ghost" href="/docs/PEERPoint-Staff-How-To.docx" download>
                  Staff How-To (Word)
                </a>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Staff How-To</h3>
              <p style={{ fontSize: 14, color: 'var(--text)' }}>
                Guide for On Call signup, requests, notes, and time logging.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <a className="btn-ghost" href="/docs/PEERPoint-Staff-How-To.pdf" download>
                  Download PDF
                </a>
                <a className="btn-ghost" href="/docs/PEERPoint-Staff-How-To.docx" download>
                  Download Word
                </a>
              </div>
            </>
          )}

          <h3 style={{ marginTop: 28 }}>Cell phone &amp; SMS</h3>
          <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 0 }}>
            Verify your cell once so Twilio trial SMS (queue alerts and room codes) can reach you.
          </p>
          <div style={{ maxWidth: 420 }}>
            <TwilioPhoneVerify
              authToken={token}
              phone={accountCellPhone}
              onPhoneChange={setAccountCellPhone}
            />
          </div>

          <h3 style={{ marginTop: 28 }}>Change password</h3>
          {passwordMsg ? <p style={{ color: 'var(--accent, #0f6a4a)' }}>{passwordMsg}</p> : null}
          <form
            autoComplete="off"
            onSubmit={e => {
              e.preventDefault();
              void onChangePassword();
            }}
            style={{ display: 'grid', gap: 8, maxWidth: 420 }}
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              value=""
              readOnly
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            <label>
              Current password
              <input
                type="password"
                name="peerpoint-current-password"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                name="peerpoint-new-password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </label>
            <button type="submit">Update password</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
