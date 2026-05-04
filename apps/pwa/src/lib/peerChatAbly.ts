import * as Ably from 'ably';
import type { Message, PresenceMessage } from 'ably';
import type { PeerChatMessage, PeerPresenceMember, PeerTypingPayload } from '../types/chat';
import { isPeerChatDebugEnabled, peerChatLog, peerChatWarn } from './peerChatDebugLog';

/** Wire event names — must match publish() calls. */
export const PEER_CHAT_EVENT = 'peer_msg';
export const PEER_TYPING_EVENT = 'peer_typing';

export function sanitizeAblyApiKey(raw: string): string {
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

export function isPlausibleAblyApiKey(key: string): boolean {
  return key.length >= 30 && key.includes(':') && key.includes('.');
}

export function explainAblyError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err);

  if (/denied access based on given capability|capability/i.test(raw)) {
    return [
      'Your Ably API key is not allowed to use this chat channel.',
      '',
      'In Ably: App → API Keys → open the key you use in .env → set channel/resource rules so this key can Subscribe, Publish, History, and Presence on:',
      '  peerpoint:room:*',
      '(For quick testing you can use one unrestricted key, or use channel pattern * with subscribe + publish + history + presence.)',
      '',
      'Then update apps/pwa/.env and restart npm run dev.'
    ].join('\n');
  }

  return raw;
}

export function channelNameForRoom(normalizedCode: string): string {
  return `peerpoint:room:${normalizedCode}`;
}

export function normalizeRoomCodeInput(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) {
    return {
      ok: false,
      error: 'Enter a room code of at least 4 letters or numbers (spaces and punctuation are ignored).'
    };
  }
  if (code.length > 24) {
    return { ok: false, error: 'Room code is too long. Use at most 24 letters or numbers.' };
  }
  return { ok: true, code };
}

function unwrapMessageData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    try {
      const s = new TextDecoder().decode(new Uint8Array(data));
      return JSON.parse(s) as unknown;
    } catch {
      return data;
    }
  }
  if (ArrayBuffer.isView(data)) {
    try {
      const view = data as ArrayBufferView;
      const s = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return JSON.parse(s) as unknown;
    } catch {
      return data;
    }
  }
  return data;
}

function asNonEmptyString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return null;
}

export function normalizePeerChatPayload(data: unknown): PeerChatMessage | null {
  const unwrapped = unwrapMessageData(data);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  const id = asNonEmptyString(o.id);
  const from = asNonEmptyString(o.from);
  if (!id || !from) return null;
  if (o.text === undefined || o.text === null) return null;
  const text = String(o.text);
  let atNum: number;
  if (typeof o.at === 'number' && Number.isFinite(o.at)) {
    atNum = o.at;
  } else if (typeof o.at === 'string') {
    const n = Number(o.at);
    atNum = Number.isFinite(n) ? n : Date.now();
  } else {
    atNum = Date.now();
  }
  return { id, from, text, at: atNum };
}

function parseTypingPayload(data: unknown): PeerTypingPayload | null {
  const unwrapped = unwrapMessageData(data);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  const from = asNonEmptyString(o.from);
  if (!from || typeof o.typing !== 'boolean') return null;
  return { from, typing: o.typing };
}

export type AblyChatSession = {
  localClientId: string;
  presenceEnabled: boolean;
  publish: (text: string) => Promise<PeerChatMessage | undefined>;
  publishTyping: (typing: boolean) => Promise<void>;
  close: () => void;
};

function presenceDataName(data: unknown, fallback: string): string {
  if (data === null || data === undefined) return fallback;
  if (typeof data === 'string') {
    const t = data.trim();
    return t || fallback;
  }
  if (typeof data === 'object' && 'name' in data && typeof (data as { name?: unknown }).name === 'string') {
    const n = (data as { name: string }).name.trim();
    return n || fallback;
  }
  return fallback;
}

function presenceMemberKey(m: PresenceMessage): string | undefined {
  const cid = m.clientId?.trim();
  if (cid) return cid;
  const conn = m.connectionId?.trim();
  if (conn) return conn;
  return undefined;
}

function rosterFromPresenceMessages(members: PresenceMessage[], fallbackName: string): PeerPresenceMember[] {
  const byClient = new Map<string, string>();
  for (const m of members) {
    const key = presenceMemberKey(m);
    if (!key) continue;
    const name = presenceDataName(m.data, fallbackName);
    if (!byClient.has(key)) byClient.set(key, name);
  }
  const roster: PeerPresenceMember[] = Array.from(byClient.entries()).map(([clientId, name]) => ({
    clientId,
    name
  }));
  roster.sort((a, b) => a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId));
  return roster;
}

function newMessageId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const ABLY_CLIENT_ID_STORAGE_KEY = 'peerpoint_ably_client_id';

/**
 * Ably requires a clientId for presence; some auth paths omit it. Persist one per tab
 * so reconnects stay stable.
 */
function stableBrowserTabClientId(): string {
  try {
    const existing = sessionStorage.getItem(ABLY_CLIENT_ID_STORAGE_KEY);
    if (
      typeof existing === 'string' &&
      existing.length > 0 &&
      existing.length <= 128 &&
      /^[a-zA-Z0-9._:@-]+$/.test(existing)
    ) {
      return existing;
    }
    const id =
      typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
        ? `peer-${globalThis.crypto.randomUUID()}`
        : `peer-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(ABLY_CLIENT_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return `peer-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

async function waitForRealtimeConnected(client: Ably.Realtime): Promise<void> {
  const initial = client.connection.state;
  if (initial === 'connected') return;
  if (initial === 'failed' || initial === 'closed') {
    throw new Error('Ably connection cannot start (already failed or closed). Check VITE_ABLY_KEY.');
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Ably (20s). Check network and VITE_ABLY_KEY.'));
    }, 20_000);

    const cleanup = (): void => {
      clearTimeout(timer);
      client.connection.off(onState);
    };

    const onState = (change: Ably.ConnectionStateChange): void => {
      if (change.current === 'connected') {
        cleanup();
        resolve();
      } else if (change.current === 'failed' || change.current === 'closed') {
        cleanup();
        const msg =
          change.reason &&
          typeof change.reason === 'object' &&
          change.reason !== null &&
          'message' in change.reason
            ? String((change.reason as { message?: string }).message ?? change.reason)
            : `Ably connection ${String(change.current)}`;
        reject(new Error(explainAblyError(new Error(msg))));
      }
    };

    client.connection.on(onState);
  });
}

export async function connectPeerChat(
  apiKey: string,
  roomCode: string,
  displayName: string,
  onMessage: (msg: PeerChatMessage) => void,
  onConnectionState?: (state: Ably.ConnectionState) => void,
  onTyping?: (payload: PeerTypingPayload) => void,
  onPresence?: (members: PeerPresenceMember[]) => void
): Promise<AblyChatSession> {
  const key = sanitizeAblyApiKey(apiKey);
  const chanName = channelNameForRoom(roomCode);
  peerChatLog('ably', 'connect:start', {
    channel: chanName,
    roomCode,
    displayName: displayName.trim() || 'Anonymous'
  });

  if (!isPlausibleAblyApiKey(key)) {
    throw new Error(
      'Ably API key looks incomplete or wrong. Copy the full key from Ably (format like xxx.yyy:secret), one line, no quotes — then fix apps/pwa/.env and restart npm run dev.'
    );
  }

  const fallbackName = displayName.trim() || 'Anonymous';

  const client = new Ably.Realtime({
    key,
    clientId: stableBrowserTabClientId(),
    echoMessages: false,
    ...(isPeerChatDebugEnabled()
      ? {
          logLevel: 2,
          logHandler: (msg: string): void => {
            if (/message|protocol|subscribe|publish|peer_msg|peerpoint/i.test(msg)) {
              peerChatLog('ably', 'protocol', { line: msg.slice(0, 300) });
            }
          }
        }
      : {})
  });

  const onConn = (change: Ably.ConnectionStateChange): void => {
    const reason =
      change.reason && typeof change.reason === 'object' && 'message' in change.reason
        ? String((change.reason as { message?: string }).message ?? change.reason)
        : change.reason !== undefined
          ? String(change.reason)
          : undefined;
    peerChatLog('ably', 'connection', {
      previous: change.previous,
      current: change.current,
      ...(reason ? { reason } : {})
    });
    onConnectionState?.(change.current);
  };
  client.connection.on(onConn);

  peerChatLog('ably', 'connection:initial', { state: client.connection.state });

  await waitForRealtimeConnected(client);
  peerChatLog('ably', 'connection:ready', { state: client.connection.state });

  const channel = client.channels.get(chanName);

  await channel.attach();

  const onChatInbound = (m: Message): void => {
    peerChatLog('ably', 'raw_inbound', {
      event: PEER_CHAT_EVENT,
      name: m.name ?? '(none)',
      dataType: m.data === null || m.data === undefined ? 'nullish' : typeof m.data
    });

    const normalized = normalizePeerChatPayload(m.data);
    if (normalized) {
      peerChatLog('ably', 'recv:peer_msg', {
        id: normalized.id,
        from: normalized.from,
        textLen: normalized.text.length,
        connectionId: m.connectionId
      });
      onMessage(normalized);
    } else {
      peerChatWarn('ably', 'recv:peer_msg:skipped_invalid_payload', {
        messageEventName: m.name,
        dataPreview:
          m.data === null || m.data === undefined
            ? String(m.data)
            : typeof m.data === 'object' &&
                !(m.data instanceof ArrayBuffer) &&
                !ArrayBuffer.isView(m.data)
              ? JSON.stringify(m.data).slice(0, 200)
              : String(m.data).slice(0, 120)
      });
    }
  };

  const onTypingInbound = (m: Message): void => {
    peerChatLog('ably', 'raw_inbound', {
      event: PEER_TYPING_EVENT,
      name: m.name ?? '(none)',
      dataType: m.data === null || m.data === undefined ? 'nullish' : typeof m.data
    });
    if (!onTyping) return;
    const typing = parseTypingPayload(m.data);
    if (typing) {
      peerChatLog('ably', 'recv:peer_typing', { from: typing.from, typing: typing.typing });
      onTyping(typing);
    }
  };

  /** Two explicit named subscriptions (Ably FAQ: event name must match publish exactly). */
  await channel.subscribe(PEER_CHAT_EVENT, onChatInbound);
  peerChatLog('ably', 'subscribe', { event: PEER_CHAT_EVENT });
  if (onTyping) {
    await channel.subscribe(PEER_TYPING_EVENT, onTypingInbound);
    peerChatLog('ably', 'subscribe', { event: PEER_TYPING_EVENT });
  }

  try {
    const page = await channel.history({ direction: 'backwards', limit: 50 });
    peerChatLog('ably', 'history:loaded', { count: page.items.length });
    for (const item of page.items) {
      if (item.name !== PEER_CHAT_EVENT) continue;
      const normalized = normalizePeerChatPayload(item.data);
      if (normalized) onMessage(normalized);
    }
  } catch (e: unknown) {
    peerChatWarn('ably', 'history:error', {
      message: e instanceof Error ? e.message : String(e)
    });
  }

  let presenceEnabled = false;
  let presenceUnsub: (() => void) | undefined;

  const pushRoster = async (): Promise<void> => {
    if (!presenceEnabled || !onPresence) return;
    try {
      const members = await channel.presence.get();
      onPresence(rosterFromPresenceMessages(members, fallbackName));
    } catch {
      /* ignore */
    }
  };

  if (onPresence) {
    try {
      await channel.presence.enter({ name: fallbackName });
      presenceEnabled = true;
      peerChatLog('ably', 'presence:enter', { ok: true });
      await pushRoster();
      const subHandler = (): void => {
        void pushRoster();
      };
      channel.presence.subscribe(subHandler);
      presenceUnsub = (): void => {
        channel.presence.unsubscribe(subHandler);
      };
    } catch (e: unknown) {
      presenceEnabled = false;
      peerChatWarn('ably', 'presence:enter', {
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const localClientId =
    (typeof client.auth.clientId === 'string' && client.auth.clientId.trim() !== ''
      ? client.auth.clientId.trim()
      : client.connection.id) || '';

  peerChatLog('ably', 'connect:ready', {
    connectionState: client.connection.state,
    channelState: channel.state,
    presenceEnabled,
    localClientId,
    authClientId: client.auth.clientId ?? null
  });
  onConnectionState?.(client.connection.state);

  return {
    localClientId,
    presenceEnabled,
    publish: async (text: string): Promise<PeerChatMessage | undefined> => {
      const trimmed = text.trim();
      if (!trimmed) return undefined;
      const msg: PeerChatMessage = {
        id: newMessageId(),
        from: fallbackName,
        text: trimmed,
        at: Date.now()
      };
      peerChatLog('ably', 'publish:peer_msg', { id: msg.id, textLen: trimmed.length });
      try {
        await channel.publish(PEER_CHAT_EVENT, msg);
        peerChatLog('ably', 'publish:peer_msg:ok', { id: msg.id });
        return msg;
      } catch (e: unknown) {
        peerChatWarn('ably', 'publish:peer_msg:error', {
          id: msg.id,
          message: e instanceof Error ? e.message : String(e)
        });
        throw e;
      }
    },
    publishTyping: async (typing: boolean): Promise<void> => {
      const payload: PeerTypingPayload = { from: fallbackName, typing };
      try {
        await channel.publish(PEER_TYPING_EVENT, payload);
      } catch (e: unknown) {
        peerChatWarn('ably', 'publish:peer_typing:error', {
          message: e instanceof Error ? e.message : String(e)
        });
      }
    },
    close: (): void => {
      peerChatLog('ably', 'session:close');
      client.connection.off(onConn);
      channel.unsubscribe(PEER_CHAT_EVENT, onChatInbound);
      if (onTyping) {
        channel.unsubscribe(PEER_TYPING_EVENT, onTypingInbound);
      }
      presenceUnsub?.();
      const shutdown = (): void => {
        client.close();
      };
      if (presenceEnabled) {
        void channel.presence.leave().then(shutdown).catch(shutdown);
      } else {
        shutdown();
      }
    }
  };
}
