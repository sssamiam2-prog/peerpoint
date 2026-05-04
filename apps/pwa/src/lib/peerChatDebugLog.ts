/**
 * Peer chat tracing — filter the console with `[PeerChat]` or `[PeerChat UI]`.
 * Never logs API keys or secrets.
 *
 * Enabled when:
 * - `import.meta.env.DEV`, or
 * - `VITE_PEER_CHAT_DEBUG=true` (or `1`) in `.env` — rebuild required, or
 * - `localStorage.setItem('peerpoint_chat_debug', '1')` then refresh — works on deployed builds.
 */

const LS_DEBUG = 'peerpoint_chat_debug';

export function isPeerChatDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  const env = import.meta.env.VITE_PEER_CHAT_DEBUG;
  if (env === 'true' || env === '1') return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_DEBUG) === '1') return true;
  } catch {
    /* private / blocked storage */
  }
  return false;
}

export function peerChatLog(
  source: 'ably' | 'ui',
  phase: string,
  detail?: Record<string, unknown>
): void {
  if (!isPeerChatDebugEnabled()) return;
  const tag = source === 'ably' ? '[PeerChat]' : '[PeerChat UI]';
  if (detail !== undefined) console.info(`${tag} ${phase}`, detail);
  else console.info(`${tag} ${phase}`);
}

/** Use for recoverable issues (e.g. dropped payload) so they stand out in the console. */
export function peerChatWarn(
  source: 'ably' | 'ui',
  phase: string,
  detail?: Record<string, unknown>
): void {
  if (!isPeerChatDebugEnabled()) return;
  const tag = source === 'ably' ? '[PeerChat]' : '[PeerChat UI]';
  if (detail !== undefined) console.warn(`${tag} ${phase}`, detail);
  else console.warn(`${tag} ${phase}`);
}
