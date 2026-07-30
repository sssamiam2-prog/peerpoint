export const CALL_STATES = ['waiting', 'ringing', 'connecting', 'active', 'ended'] as const;

export type CallState = (typeof CALL_STATES)[number];

export function mapSessionStatus(status: string): 'waiting' | 'active' | 'closed' {
  if (status === 'assigned') return 'active';
  if (status === 'closed') return 'closed';
  return 'waiting';
}

export function isValidCallTransition(from: string | undefined, to: string): boolean {
  if (!CALL_STATES.includes(to as CallState)) return false;
  if (!from) return to === 'waiting';
  if (from === to) return true;
  const transitions: Record<CallState, CallState[]> = {
    waiting: ['ringing', 'connecting', 'ended'],
    ringing: ['connecting', 'ended'],
    connecting: ['active', 'ended'],
    active: ['ended'],
    ended: []
  };
  return CALL_STATES.includes(from as CallState) && transitions[from as CallState].includes(to as CallState);
}

export type LiveKitJwtClaims = {
  iss: string;
  sub: string;
  nbf: number;
  exp: number;
  video: {
    roomJoin: true;
    room: string;
    canPublish: true;
    canSubscribe: true;
  };
};

export function buildLiveKitJwtClaims(
  apiKey: string,
  identity: string,
  roomName: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 60 * 60
): LiveKitJwtClaims {
  return {
    iss: apiKey,
    sub: identity,
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true }
  };
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function signLiveKitJwt(claims: LiveKitJwtClaims, secret: string): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  );
  return `${signingInput}.${base64Url(signature)}`;
}
