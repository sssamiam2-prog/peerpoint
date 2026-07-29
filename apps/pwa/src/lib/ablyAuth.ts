import type * as Ably from 'ably';
import { peerChatLog, peerChatWarn } from './peerChatDebugLog';

function sanitizeAblyApiKey(raw: string): string {
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.split(/\r?\n/)[0] ?? '';
  s = s.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, '');
}

function isPlausibleAblyApiKey(key: string): boolean {
  return key.length >= 30 && key.includes(':') && key.includes('.');
}

/**
 * Build Ably Realtime client options.
 * Prefer short-lived tokens from `VITE_ABLY_AUTH_URL` (Cloudflare Function);
 * fall back to `VITE_ABLY_KEY` for local/dev only.
 */
export function resolveAblyClientOptions(opts: {
  roomCode: string;
  clientId: string;
  apiKey?: string;
  echoMessages?: boolean;
}): Ably.ClientOptions {
  const authUrl = (import.meta.env.VITE_ABLY_AUTH_URL as string | undefined)?.trim();
  const base: Ably.ClientOptions = {
    clientId: opts.clientId,
    echoMessages: opts.echoMessages ?? false
  };

  if (authUrl && authUrl.length > 0) {
    const url = new URL(authUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    url.searchParams.set('room', opts.roomCode);
    url.searchParams.set('clientId', opts.clientId);
    peerChatLog('ably', 'auth:token_url', { path: url.pathname });
    return {
      ...base,
      authUrl: url.toString(),
      authMethod: 'GET'
    };
  }

  const key = opts.apiKey ? sanitizeAblyApiKey(opts.apiKey) : '';
  if (!isPlausibleAblyApiKey(key)) {
    peerChatWarn('ably', 'auth:missing', {});
    throw new Error(
      'Chat needs either VITE_ABLY_AUTH_URL (recommended) or VITE_ABLY_KEY in apps/pwa/.env. Restart the dev server after changing env.'
    );
  }
  peerChatLog('ably', 'auth:api_key', { mode: 'basic' });
  return { ...base, key };
}

export function hasAblyAuthConfigured(apiKey?: string): boolean {
  const authUrl = (import.meta.env.VITE_ABLY_AUTH_URL as string | undefined)?.trim();
  if (authUrl && authUrl.length > 0) return true;
  if (apiKey && isPlausibleAblyApiKey(sanitizeAblyApiKey(apiKey))) return true;
  return false;
}
