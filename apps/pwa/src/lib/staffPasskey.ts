import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { StaffSessionMeta } from './staffSessionStorage';

type LoginResult = {
  token: string;
  role: 'admin' | 'staff';
  username?: string;
  displayName?: string;
  mustChangePassword?: boolean;
  canEditPeerSupportHelpTypes?: boolean;
};

export async function registerStaffPasskey(authToken: string): Promise<{ ok: true } | { error: string }> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
  const optRes = await fetch('/api/staff/webauthn/register-options', { method: 'POST', headers });
  const optData = (await optRes.json().catch(() => ({}))) as { options?: unknown; error?: string };
  if (!optRes.ok || !optData.options) {
    return { error: optData.error ?? 'Could not start passkey setup.' };
  }
  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: optData.options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Passkey setup was cancelled.';
    return { error: msg };
  }
  const verifyRes = await fetch('/api/staff/webauthn/register-verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ response: attResp })
  });
  const verifyData = (await verifyRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!verifyRes.ok || !verifyData.ok) {
    return { error: verifyData.error ?? 'Passkey setup failed.' };
  }
  return { ok: true };
}

export async function loginWithStaffPasskey(
  username: string,
  rememberMe: boolean
): Promise<{ ok: true; data: LoginResult; meta: StaffSessionMeta } | { ok: false; error: string }> {
  const identity = username.trim();
  if (!identity) return { ok: false, error: 'Enter your email or username first.' };

  const optRes = await fetch('/api/staff/webauthn/login-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identity })
  });
  const optData = (await optRes.json().catch(() => ({}))) as { options?: unknown; error?: string };
  if (!optRes.ok || !optData.options) {
    return { ok: false, error: optData.error ?? 'Biometric sign-in is not available for this account.' };
  }

  let authResp;
  try {
    authResp = await startAuthentication({
      optionsJSON: optData.options as Parameters<typeof startAuthentication>[0]['optionsJSON']
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Biometric sign-in was cancelled.';
    return { ok: false, error: msg };
  }

  const verifyRes = await fetch('/api/staff/webauthn/login-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identity, response: authResp, rememberMe })
  });
  const data = (await verifyRes.json().catch(() => ({}))) as LoginResult & { error?: string; ok?: boolean };
  if (!verifyRes.ok || !data.token || !data.role) {
    return { ok: false, error: data.error ?? 'Biometric sign-in failed.' };
  }

  const meta: StaffSessionMeta = {
    role: data.role,
    username: data.username,
    displayName: data.displayName,
    mustChangePassword: data.mustChangePassword === true,
    canEditPeerSupportHelpTypes: data.canEditPeerSupportHelpTypes === true
  };
  return { ok: true, data: data as LoginResult, meta };
}
