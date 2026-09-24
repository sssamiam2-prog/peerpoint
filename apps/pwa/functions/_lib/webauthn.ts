import type { Env } from './store';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialDescriptorFuture,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse
} from '@simplewebauthn/server';
import { requestHostname } from './staffAuth';

const CREDS_PREFIX = 'peerpoint:webauthn_creds:';
const PENDING_REG_PREFIX = 'peerpoint:webauthn_pending_reg:';
const PENDING_AUTH_PREFIX = 'peerpoint:webauthn_pending_auth:';
const CHALLENGE_TTL_SECONDS = 5 * 60;

export type StoredPasskey = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
};

const memoryCreds = new Map<string, StoredPasskey[]>();
const memoryPendingReg = new Map<string, string>();
const memoryPendingAuth = new Map<string, string>();

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toStoredPasskey(credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }): StoredPasskey {
  return {
    id: credential.id,
    publicKey: bytesToBase64(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports as AuthenticatorTransportFuture[] | undefined
  };
}

function toWebAuthnCredential(stored: StoredPasskey): { id: string; publicKey: Uint8Array; counter: number; transports?: string[] } {
  return {
    id: stored.id,
    publicKey: base64ToBytes(stored.publicKey),
    counter: stored.counter,
    transports: stored.transports
  };
}

export function webauthnRpId(request: Request): string {
  const host = requestHostname(request);
  if (host === 'localhost' || host === '127.0.0.1' || host === 'admin.localhost') return 'localhost';
  if (host === 'mypeerpoint.com' || host.endsWith('.mypeerpoint.com')) return 'mypeerpoint.com';
  return host;
}

export function webauthnExpectedOrigin(request: Request): string {
  const origin = request.headers.get('Origin')?.trim();
  if (origin) return origin;
  return new URL(request.url).origin;
}

function credsKey(username: string): string {
  return `${CREDS_PREFIX}${username}`;
}

function pendingRegKey(username: string): string {
  return `${PENDING_REG_PREFIX}${username}`;
}

function pendingAuthKey(username: string): string {
  return `${PENDING_AUTH_PREFIX}${username}`;
}

function userIdBytes(username: string): Uint8Array {
  return new TextEncoder().encode(username);
}

export async function listPasskeysForUser(env: Env, username: string): Promise<StoredPasskey[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(credsKey(username));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as StoredPasskey[]) : [];
    } catch {
      return [];
    }
  }
  return memoryCreds.get(username) ?? [];
}

async function savePasskeys(env: Env, username: string, creds: StoredPasskey[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(credsKey(username), JSON.stringify(creds));
    return;
  }
  memoryCreds.set(username, creds);
}

async function putPendingChallenge(
  env: Env,
  kind: 'reg' | 'auth',
  username: string,
  challenge: string
): Promise<void> {
  const key = kind === 'reg' ? pendingRegKey(username) : pendingAuthKey(username);
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(key, challenge, { expirationTtl: CHALLENGE_TTL_SECONDS });
    return;
  }
  if (kind === 'reg') memoryPendingReg.set(username, challenge);
  else memoryPendingAuth.set(username, challenge);
}

async function takePendingChallenge(env: Env, kind: 'reg' | 'auth', username: string): Promise<string | null> {
  const key = kind === 'reg' ? pendingRegKey(username) : pendingAuthKey(username);
  if (env.PEERPOINT_KV) {
    const challenge = await env.PEERPOINT_KV.get(key);
    if (challenge) await env.PEERPOINT_KV.delete(key);
    return challenge;
  }
  const map = kind === 'reg' ? memoryPendingReg : memoryPendingAuth;
  const challenge = map.get(username) ?? null;
  if (challenge) map.delete(username);
  return challenge;
}

export async function createRegistrationOptions(request: Request, env: Env, username: string, displayName: string) {
  const rpID = webauthnRpId(request);
  const existing = await listPasskeysForUser(env, username);
  const excludeCredentials: PublicKeyCredentialDescriptorFuture[] = existing.map(c => ({
    id: c.id,
    transports: c.transports
  }));

  const options = await generateRegistrationOptions({
    rpName: 'PEERPoint',
    rpID,
    userName: username,
    userDisplayName: displayName || username,
    userID: userIdBytes(username),
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform'
    }
  });

  await putPendingChallenge(env, 'reg', username, options.challenge);
  return { options, rpID };
}

export async function verifyRegistration(
  request: Request,
  env: Env,
  username: string,
  response: unknown
): Promise<VerifiedRegistrationResponse> {
  const expectedChallenge = await takePendingChallenge(env, 'reg', username);
  if (!expectedChallenge) {
    return { verified: false, registrationInfo: undefined };
  }
  const rpID = webauthnRpId(request);
  const expectedOrigin = webauthnExpectedOrigin(request);

  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false
  });

  if (verification.verified && verification.registrationInfo) {
    const { credential } = verification.registrationInfo;
    const creds = await listPasskeysForUser(env, username);
    const next = toStoredPasskey(credential);
    const filtered = creds.filter(c => c.id !== next.id);
    filtered.push(next);
    await savePasskeys(env, username, filtered);
  }

  return verification;
}

export async function createAuthenticationOptions(request: Request, env: Env, username: string) {
  const rpID = webauthnRpId(request);
  const creds = await listPasskeysForUser(env, username);
  if (creds.length === 0) return null;

  const allowCredentials: PublicKeyCredentialDescriptorFuture[] = creds.map(c => ({
    id: c.id,
    transports: c.transports
  }));

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'preferred'
  });

  await putPendingChallenge(env, 'auth', username, options.challenge);
  return { options, rpID };
}

export async function verifyAuthentication(
  request: Request,
  env: Env,
  username: string,
  response: unknown
): Promise<VerifiedAuthenticationResponse> {
  const expectedChallenge = await takePendingChallenge(env, 'auth', username);
  if (!expectedChallenge) {
    return {
      verified: false,
      authenticationInfo: {
        credentialID: '',
        newCounter: 0,
        userVerified: false,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: '',
        rpID: ''
      }
    };
  }

  const creds = await listPasskeysForUser(env, username);
  const responseId = (response as { id?: string })?.id;
  const stored = creds.find(c => c.id === responseId);
  if (!stored) {
    return {
      verified: false,
      authenticationInfo: {
        credentialID: '',
        newCounter: 0,
        userVerified: false,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: '',
        rpID: ''
      }
    };
  }

  const rpID = webauthnRpId(request);
  const expectedOrigin = webauthnExpectedOrigin(request);

  const verification = await verifyAuthenticationResponse({
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: toWebAuthnCredential(stored),
    requireUserVerification: false
  });

  if (verification.verified && verification.authenticationInfo) {
    const nextCounter = verification.authenticationInfo.newCounter;
    stored.counter = nextCounter;
    await savePasskeys(env, username, creds);
    return verification;
  }

  return verification;
}
