import * as Ably from 'ably';
import type { Message, PresenceMessage } from 'ably';
import type { PeerChatMessage, PeerPresenceMember, PeerTypingPayload } from '../types/chat';

export const PEER_CHAT_EVENT = 'peer_msg';
export const PEER_TYPING_EVENT = 'peer_typing';

/** Dev-only tracing — filter the browser console with `[PeerChat]`. Uses info so logs show without enabling Verbose. Never logs the API key. */
function peerChatDebug(phase: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail !== undefined) console.info(`[PeerChat] ${phase}`, detail);
  else console.info(`[PeerChat] ${phase}`);
}

/** Normalize key from .env / clipboard (quotes, BOM, newlines break Ably with "invalid key parameter"). */
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
  // Typical format: appId.keyId:secret (colon separates key id from secret)
  return key.length >= 30 && key.includes(':') && key.includes('.');
}

/** Map Ably SDK errors to actionable copy (capability / channel restrictions). */
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
      'Then run scripts/sync-ably-env.ps1 again (or update apps/pwa/.env) and restart npm run dev.'
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

/** If Ably delivers JSON as a string or binary (wire/client variant), normalize before validation. */
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

/** Ably / JSON may stringify fields; normalize so peers always render and dedupe works. */
export function normalizePeerChatPayload(data: unknown): PeerChatMessage | null {
  const unwrapped = unwrapMessageData(data);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.from !== 'string' || typeof o.text !== 'string') return null;
  let atNum: number;
  if (typeof o.at === 'number' && Number.isFinite(o.at)) {
    atNum = o.at;
  } else if (typeof o.at === 'string') {
    const n = Number(o.at);
    atNum = Number.isFinite(n) ? n : Date.now();
  } else {
    atNum = Date.now();
  }
  return { id: o.id, from: o.from, text: o.text, at: atNum };
}

function parseTypingPayload(data: unknown): PeerTypingPayload | null {
  const unwrapped = unwrapMessageData(data);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  if (typeof o.from !== 'string' || typeof o.typing !== 'boolean') return null;
  return { from: o.from, typing: o.typing };
}

export type AblyChatSession = {
  /** Stable id for this tab: Ably `auth.clientId` when present, else `connection.id` (matches roster keys). */
  localClientId: string;
  /** True if `channel.presence.enter` succeeded; roster callbacks run only when true. */
  presenceEnabled: boolean;
  /** Returns the message so the UI can append locally (`echoMessages: false` on the client). */
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
  peerChatDebug('connect:start', {
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
  const client = new Ably.Realtime({ key, echoMessages: false });
  const channel = client.channels.get(chanName);

  await channel.attach();

  const onConn = (change: Ably.ConnectionStateChange): void => {
    const reason =
      change.reason && typeof change.reason === 'object' && 'message' in change.reason
        ? String((change.reason as { message?: string }).message ?? change.reason)
        : change.reason !== undefined
          ? String(change.reason)
          : undefined;
    peerChatDebug('connection', {
      previous: change.previous,
      current: change.current,
      ...(reason ? { reason } : {})
    });
    onConnectionState?.(change.current);
  };
  client.connection.on(onConn);

  peerChatDebug('connection:initial', { state: client.connection.state });

  /** One listener + filter by `message.name` — avoids edge cases where named-event subscriptions do not fire. */
  const inboundHandler = (m: Message): void => {
    if (m.name === PEER_CHAT_EVENT) {
      const normalized = normalizePeerChatPayload(m.data);
      if (normalized) {
        peerChatDebug('recv:peer_msg', {
          id: normalized.id,
          from: normalized.from,
          textLen: normalized.text.length,
          connectionId: m.connectionId
        });
        onMessage(normalized);
      } else {
        peerChatDebug('recv:peer_msg:skipped_invalid_payload', {
          messageEventName: m.name,
          dataPreview:
            m.data === null || m.data === undefined
              ? String(m.data)
              : typeof m.data === 'object' && !(m.data instanceof ArrayBuffer) && !ArrayBuffer.isView(m.data)
                ? '[object]'
                : String(m.data).slice(0, 120)
        });
      }
      return;
    }
    if (onTyping && m.name === PEER_TYPING_EVENT) {
      const typing = parseTypingPayload(m.data);
      if (typing) {
        peerChatDebug('recv:peer_typing', { from: typing.from, typing: typing.typing });
        onTyping(typing);
      }
    }
  };

  await channel.subscribe(inboundHandler);
  peerChatDebug('subscribe', { mode: 'all_messages', filter: [PEER_CHAT_EVENT, PEER_TYPING_EVENT] });

  try {
    const page = await channel.history({ direction: 'backwards', limit: 50 });
    peerChatDebug('history:loaded', { count: page.items.length });
    for (const item of page.items) {
      if (item.name !== PEER_CHAT_EVENT) continue;
      const normalized = normalizePeerChatPayload(item.data);
      if (normalized) onMessage(normalized);
    }
  } catch (e: unknown) {
    peerChatDebug('history:error', {
      message: e instanceof Error ? e.message : String(e)
    });
    // History may be empty or unavailable depending on Ably app settings; live chat still works.
  }

  let presenceEnabled = false;
  let presenceUnsub: (() => void) | undefined;

  const pushRoster = async (): Promise<void> => {
    if (!presenceEnabled || !onPresence) return;
    try {
      const members = await channel.presence.get();
      onPresence(rosterFromPresenceMessages(members, fallbackName));
    } catch {
      // Ignore transient presence errors; chat remains usable.
    }
  };

  if (onPresence) {
    try {
      await channel.presence.enter({ name: fallbackName });
      presenceEnabled = true;
      peerChatDebug('presence:enter', { ok: true });
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
      peerChatDebug('presence:enter', {
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const localClientId =
    (typeof client.auth.clientId === 'string' && client.auth.clientId.trim() !== ''
      ? client.auth.clientId.trim()
      : client.connection.id) || '';

  peerChatDebug('connect:ready', {
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
        id:
          typeof globalThis.crypto !== 'undefined' &&
          typeof globalThis.crypto.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        from: fallbackName,
        text: trimmed,
        at: Date.now()
      };
      peerChatDebug('publish:peer_msg', { id: msg.id, textLen: trimmed.length });
      try {
        await channel.publish(PEER_CHAT_EVENT, msg);
        peerChatDebug('publish:peer_msg:ok', { id: msg.id });
        return msg;
      } catch (e: unknown) {
        peerChatDebug('publish:peer_msg:error', {
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
        peerChatDebug('publish:peer_typing:error', {
          message: e instanceof Error ? e.message : String(e)
        });
        // Typing is optional; avoid unhandled rejections while connection stabilizes (e.g. Strict Mode remount).
      }
    },
    close: (): void => {
      peerChatDebug('session:close');
      client.connection.off(onConn);
      channel.unsubscribe(inboundHandler);
      presenceUnsub?.();
      const shutdown = (): void => {
        client.close();
      };
      if (presenceEnabled) {
        void channel.presence
          .leave()
          .then(shutdown)
          .catch(shutdown);
      } else {
        shutdown();
      }
    }
  };
}
