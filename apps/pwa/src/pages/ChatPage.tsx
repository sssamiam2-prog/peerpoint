import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ConversationDestroyOverlay } from '../components/ConversationDestroyOverlay';
import { hasAblyAuthConfigured } from '../lib/ablyAuth';
import {
  channelNameForRoom,
  clearPeerChatBrowserStorage,
  connectPeerChat,
  explainAblyError,
  normalizeRoomCodeInput,
  sanitizeAblyApiKey
} from '../lib/peerChatAbly';
import { isPeerChatDebugEnabled, peerChatLog, peerChatWarn } from '../lib/peerChatDebugLog';
import type { PeerChatMessage, PeerPresenceMember } from '../types/chat';

const DISPLAY_KEY = 'peerpoint_chat_display_name';

function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

function isSelfMessage(from: string, selfDisplayName: string): boolean {
  return from.trim().toLowerCase() === selfDisplayName.trim().toLowerCase();
}

const BUBBLE_TONE_COUNT = 8;
function bubbleToneIndex(from: string): number {
  const s = from.trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % BUBBLE_TONE_COUNT;
}

function formatTypingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more are typing`;
}

function useShowChatDebug(): boolean {
  const [params] = useSearchParams();
  if (params.get('debug') === '1') return true;
  return isPeerChatDebugEnabled();
}

export function ChatPage(): React.ReactElement {
  const [params] = useSearchParams();
  const ablyKeyRaw = import.meta.env.VITE_ABLY_KEY as string | undefined;
  const ablyKey = ablyKeyRaw ? sanitizeAblyApiKey(ablyKeyRaw) : undefined;
  const hasKey = hasAblyAuthConfigured(ablyKey);
  const showDebug = useShowChatDebug();

  const [roomInput, setRoomInput] = React.useState(() => (params.get('room') ?? '').trim().toUpperCase());
  const [nameInput, setNameInput] = React.useState(() => {
    try {
      return sessionStorage.getItem(DISPLAY_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [session, setSession] = React.useState<{ room: string; name: string } | null>(null);
  const [messages, setMessages] = React.useState<PeerChatMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [joinError, setJoinError] = React.useState<string | undefined>(undefined);
  const [connState, setConnState] = React.useState<string | undefined>(undefined);
  const [sendError, setSendError] = React.useState<string | undefined>(undefined);
  const [typingOthers, setTypingOthers] = React.useState<string[]>([]);
  const [presenceMembers, setPresenceMembers] = React.useState<PeerPresenceMember[]>([]);
  const [localClientId, setLocalClientId] = React.useState<string | null>(null);
  const [presenceEnabled, setPresenceEnabled] = React.useState(false);
  const [publishReady, setPublishReady] = React.useState(false);
  const [channelName, setChannelName] = React.useState<string | null>(null);
  const [connectionId, setConnectionId] = React.useState<string | null>(null);
  const [destroying, setDestroying] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const seenIds = React.useRef<Set<string>>(new Set());
  const publishRef = React.useRef<((text: string) => Promise<PeerChatMessage | undefined>) | null>(null);
  const typingPublishRef = React.useRef<((typing: boolean) => Promise<void>) | null>(null);
  const typingIdleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingThrottleAtRef = React.useRef(0);
  const chatEpochRef = React.useRef(0);
  const sessionNameRef = React.useRef('');

  const resizeComposer = React.useCallback((): void => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxPx = 104; /* ~4 lines */
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, []);

  const appendMessages = React.useCallback((incoming: PeerChatMessage[]): void => {
    setMessages(prev => {
      const next = [...prev];
      for (const m of incoming) {
        if (seenIds.current.has(m.id)) {
          peerChatLog('ui', 'message:deduped', { id: m.id, from: m.from });
          continue;
        }
        seenIds.current.add(m.id);
        peerChatLog('ui', 'message:append', { id: m.id, from: m.from, textLen: m.text.length });
        next.push(m);
      }
      next.sort((a, b) => a.at - b.at);
      return next;
    });
  }, []);

  const inboundRelayRef = React.useRef<(msg: PeerChatMessage) => void>(() => {});
  /* eslint-disable-next-line react-hooks/refs -- assign latest relay without effect churn */
  inboundRelayRef.current = (msg: PeerChatMessage): void => {
    appendMessages([msg]);
    setTypingOthers(prev => prev.filter(n => n !== msg.from));
  };
  const relayInbound = React.useCallback((msg: PeerChatMessage) => {
    inboundRelayRef.current(msg);
  }, []);

  const flushLocalTyping = React.useCallback((): void => {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    const pub = typingPublishRef.current;
    if (pub) void pub(false);
  }, []);

  const pingLocalTyping = React.useCallback((): void => {
    if (connState !== 'connected') return;
    const pub = typingPublishRef.current;
    if (!pub) return;
    const now = Date.now();
    if (now - typingThrottleAtRef.current >= 1200) {
      typingThrottleAtRef.current = now;
      void pub(true);
    }
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = setTimeout(() => {
      typingIdleTimerRef.current = null;
      void pub(false);
    }, 2200);
  }, [connState]);

  React.useEffect(() => {
    if (!session || !hasKey) return;
    sessionNameRef.current = session.name;
    const epoch = ++chatEpochRef.current;

    publishRef.current = null;
    typingPublishRef.current = null;
    setPublishReady(false);

    let closed = false;
    let closeSession: (() => void) | undefined;

    /* eslint-disable react-hooks/set-state-in-effect */
    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);
    setChannelName(channelNameForRoom(session.room));
    setConnectionId(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void (async (): Promise<void> => {
      try {
        const chat = await connectPeerChat(
          ablyKey,
          session.room,
          session.name,
          relayInbound,
          state => {
            if (closed || epoch !== chatEpochRef.current) return;
            setConnState(state);
          },
          payload => {
            if (closed || epoch !== chatEpochRef.current) return;
            if (isSelfMessage(payload.from, sessionNameRef.current)) return;
            setTypingOthers(prev => {
              const s = new Set(prev);
              if (payload.typing) s.add(payload.from);
              else s.delete(payload.from);
              return Array.from(s).sort((a, b) => a.localeCompare(b));
            });
          },
          members => {
            if (closed || epoch !== chatEpochRef.current) return;
            setPresenceMembers(members);
          }
        );
        if (closed || epoch !== chatEpochRef.current) {
          chat.close();
          return;
        }
        setLocalClientId(chat.localClientId);
        setPresenceEnabled(chat.presenceEnabled);
        setChannelName(chat.channelName);
        setConnectionId(chat.connectionId);
        publishRef.current = chat.publish;
        typingPublishRef.current = chat.publishTyping;
        setPublishReady(true);
        closeSession = chat.close;
        peerChatLog('ui', 'session:publish_ready', {
          room: session.room,
          presenceEnabled: chat.presenceEnabled,
          localClientId: chat.localClientId,
          channelName: chat.channelName,
          connectionId: chat.connectionId
        });
      } catch (e: unknown) {
        if (!closed && epoch === chatEpochRef.current) {
          peerChatWarn('ui', 'session:connect_failed', {
            message: e instanceof Error ? e.message : String(e)
          });
          setJoinError(explainAblyError(e));
          setSession(null);
          setPublishReady(false);
        }
      }
    })();

    return (): void => {
      closed = true;
      flushLocalTyping();
      publishRef.current = null;
      typingPublishRef.current = null;
      setPublishReady(false);
      closeSession?.();
    };
  }, [ablyKey, hasKey, session, relayInbound, flushLocalTyping]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typingOthers]);

  React.useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  const canSend = Boolean(draft.trim() && connState === 'connected' && publishReady);

  const onJoin = (): void => {
    setJoinError(undefined);
    const parsed = normalizeRoomCodeInput(roomInput);
    if (!parsed.ok) {
      setJoinError(parsed.error);
      return;
    }
    const name = nameInput.trim();
    if (name.length < 1) {
      setJoinError('Enter the name others will see in the chat.');
      return;
    }
    if (name.length > 40) {
      setJoinError('Display name must be 40 characters or fewer.');
      return;
    }
    try {
      sessionStorage.setItem(DISPLAY_KEY, name);
    } catch {
      /* ignore */
    }
    seenIds.current = new Set();
    setMessages([]);
    setTypingOthers([]);
    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);
    setPublishReady(false);
    setConnState('connecting');
    peerChatLog('ui', 'join', { room: parsed.code, name });
    setSession({ room: parsed.code, name });
  };

  const autoJoinedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoJoinedRef.current || session || !hasKey) return;
    const fromLink = (params.get('room') ?? '').trim();
    if (!fromLink) return;
    const parsed = normalizeRoomCodeInput(fromLink);
    if (!parsed.ok) return;
    // Email/SMS join links should enter chat immediately (default display name if needed).
    const fromJoin = params.get('from') === 'join';
    let name = nameInput.trim();
    if (!name && fromJoin) {
      name = 'Member';
      setNameInput(name);
    }
    if (name.length < 1 || name.length > 40) return;
    autoJoinedRef.current = true;
    setRoomInput(parsed.code);
    try {
      sessionStorage.setItem(DISPLAY_KEY, name);
    } catch {
      /* ignore */
    }
    seenIds.current = new Set();
    setMessages([]);
    setTypingOthers([]);
    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);
    setPublishReady(false);
    setConnState('connecting');
    peerChatLog('ui', 'auto-join', { room: parsed.code, name, fromJoin });
    setSession({ room: parsed.code, name });
  }, [hasKey, params, nameInput, session]);

  const finishLeave = React.useCallback((): void => {
    peerChatLog('ui', 'leave');
    flushLocalTyping();
    clearPeerChatBrowserStorage();
    try {
      sessionStorage.removeItem(DISPLAY_KEY);
    } catch {
      /* ignore */
    }
    setNameInput('');
    setSession(null);
    setMessages([]);
    setTypingOthers([]);
    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);
    setPublishReady(false);
    setChannelName(null);
    setConnectionId(null);
    seenIds.current = new Set();
    setConnState(undefined);
    setSendError(undefined);
    setDestroying(false);
  }, [flushLocalTyping]);

  const onLeave = (): void => {
    if (destroying) return;
    setDestroying(true);
  };

  const onSend = async (): Promise<void> => {
    setSendError(undefined);
    flushLocalTyping();
    const publish = publishRef.current;
    if (!publish) {
      peerChatLog('ui', 'send:blocked', { reason: 'no_publish_fn', connState, publishReady });
      setSendError('Not connected yet.');
      return;
    }
    if (connState !== 'connected') {
      peerChatLog('ui', 'send:blocked', { reason: 'not_connected', connState });
      setSendError(`Still ${connState ?? 'connecting'} — wait until connected.`);
      return;
    }
    try {
      peerChatLog('ui', 'send:start', { connState, draftLen: draft.trim().length });
      const sent = await publish(draft);
      if (sent) {
        appendMessages([sent]);
      }
      peerChatLog('ui', 'send:ok');
      setDraft('');
    } catch (e: unknown) {
      peerChatWarn('ui', 'send:error', { message: e instanceof Error ? e.message : String(e) });
      setSendError(explainAblyError(e));
    }
  };

  if (!hasKey) {
    return (
      <div className="page-shell">
        <h2>Peer chat</h2>
        <p>Group chat opens after everyone enters the same room code. This feature needs a realtime service.</p>
        <div className="callout callout--muted" style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Prefer <code>VITE_ABLY_AUTH_URL=/api/ably-token</code> (Cloudflare Function) in production. For local
            testing, add <code>VITE_ABLY_KEY</code> to <code>apps/pwa/.env</code>, then restart{' '}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  const aloneInRoom =
    presenceEnabled &&
    connState === 'connected' &&
    localClientId !== null &&
    presenceMembers.length === 1 &&
    presenceMembers[0].clientId === localClientId;

  if (!session) {
    const fromEmailLink = Boolean((params.get('room') ?? '').trim());
    return (
      <div className="page-shell page-shell-tight">
        <h2>Peer chat</h2>
        {fromEmailLink ? (
          <p className="callout callout--muted">
            Your room code from email is filled in. Enter a display name and join. If you get disconnected later, use
            the same room code (in your email) to reconnect — codes expire after <strong>24 hours</strong> of no use.
          </p>
        ) : (
          <p className="callout callout--muted">
            Use the room code from your PEERPoint email (or from staff). Keep it handy to reconnect if you disconnect.
            Codes expire after <strong>24 hours</strong> of no use.
          </p>
        )}
        <p className="callout callout--privacy">
        <strong>Privacy.</strong> PEERPoint does not keep or record your messages. Enter the room code and a display
          name only—no work sign-in. The site access code does not identify you.
        </p>
        <p className="lede">
          If this is an emergency, call 911. This chat is not a substitute for crisis services. For voice with the same
          code, use <Link to={roomInput ? `/voice?room=${encodeURIComponent(roomInput)}` : '/voice'}>Peer voice</Link>.
        </p>

        {joinError && <div style={{ marginTop: 12, color: '#a4262c', whiteSpace: 'pre-wrap' }}>{joinError}</div>}

        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <label>
            Room code
            <input
              value={roomInput}
              onChange={e => setRoomInput(e.target.value)}
              placeholder="e.g. TEAM-2026 or 48291"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Your display name (shown in chat)
            <span
              style={{
                display: 'block',
                fontSize: 13,
                color: '#5c6e66',
                marginTop: 2,
                marginBottom: 4,
                lineHeight: 1.35,
                fontWeight: 400
              }}
            >
              This can be any name you choose—you don&apos;t have to use your real name.
            </span>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Nickname or any label"
              autoComplete="off"
              maxLength={40}
              autoFocus={fromEmailLink}
            />
          </label>
          <button type="button" onClick={onJoin}>
            Join room
          </button>
        </div>
      </div>
    );
  }

  const sendBlockedReason = !draft.trim()
    ? 'Type a message first'
    : connState !== 'connected'
      ? `Wait until connected (now: ${connState ?? 'unknown'})`
      : !publishReady
        ? 'Finishing connection…'
        : 'Send message';

  const connected = connState === 'connected';
  const voiceHref = `/voice?room=${encodeURIComponent(session.room)}`;

  return (
    <div className="peer-chat-page peer-chat-page--session">
      {destroying ? <ConversationDestroyOverlay onComplete={finishLeave} /> : null}
      <header className="peer-chat-toolbar">
        <div className="peer-chat-toolbar__left">
          <h2 className="peer-chat-toolbar__title">Room {session.room}</h2>
          <span
            className={`peer-chat-conn-pill${connected ? ' peer-chat-conn-pill--ok' : ' peer-chat-conn-pill--warn'}`}
            role="status"
          >
            {connected ? 'Connected' : connState ?? 'Connecting…'}
          </span>
        </div>
        <div className="peer-chat-toolbar__actions">
          <Link className="peer-chat-toolbar__link" to={voiceHref}>
            Switch to voice
          </Link>
          <button type="button" className="btn-ghost" onClick={onLeave} disabled={destroying}>
            Leave
          </button>
        </div>
      </header>

      {!connected ? (
        <div className="peer-chat-conn-banner" role="status">
          Connecting… Send stays off until ready. Rejoin later with room code <strong>{session.room}</strong> (also in
          your email; expires after 24 hours of no use).
        </div>
      ) : null}

      {showDebug ? (
        <div className="peer-chat-debug" aria-label="Chat connection debug">
          <div>
            <strong>channel</strong> {channelName ?? '—'}
          </div>
          <div>
            <strong>connection</strong> {connectionId ?? '—'} · <strong>state</strong> {connState ?? '—'}
          </div>
          <div>
            <strong>clientId</strong> {localClientId ?? '—'} · <strong>publishReady</strong> {String(publishReady)}
          </div>
          <div>
            <strong>messages</strong> {messages.length} · <strong>presence</strong> {presenceMembers.length}
          </div>
        </div>
      ) : null}

      <div className="peer-chat-presence-strip" aria-live="polite" aria-label="People in this room">
        <span className="peer-chat-presence-strip__label">In room</span>
        {connState !== 'connected' ? (
          <span className="peer-chat-presence-waiting">Connecting…</span>
        ) : !presenceEnabled ? (
          <span className="peer-chat-chip peer-chat-chip--you">
            {session.name}
            <span className="peer-chat-chip__you">(you)</span>
          </span>
        ) : (
          <>
            {presenceMembers.map(m => {
              const isYou = localClientId !== null && m.clientId === localClientId;
              return (
                <span key={m.clientId} className={`peer-chat-chip${isYou ? ' peer-chat-chip--you' : ''}`}>
                  {m.name}
                  {isYou ? <span className="peer-chat-chip__you">(you)</span> : null}
                </span>
              );
            })}
            {aloneInRoom ? <span className="peer-chat-presence-waiting">Waiting for someone else…</span> : null}
          </>
        )}
      </div>

      <div ref={listRef} className="peer-chat-scroll">
        {messages.length === 0 ? <div className="peer-chat-empty">No messages yet. Say hello.</div> : null}
        {messages.map(m => {
          const self = isSelfMessage(m.from, session.name);
          const tone = bubbleToneIndex(m.from);
          return (
            <div key={m.id} className={self ? 'peer-chat-row peer-chat-row--self' : 'peer-chat-row peer-chat-row--other'}>
              <div
                className={`peer-chat-bubble peer-chat-bubble--tone-${tone} ${self ? 'peer-chat-bubble--mine' : 'peer-chat-bubble--theirs'}`}
              >
                {!self && <div className="peer-chat-bubble-name">{m.from}</div>}
                <div className="peer-chat-bubble-text">{m.text}</div>
                <div className="peer-chat-bubble-meta">{formatTime(m.at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="peer-chat-typing-bar" aria-live="polite">
        {typingOthers.length > 0 ? (
          <span>
            {formatTypingLine(typingOthers)}
            <span className="peer-chat-typing-dots" aria-hidden>
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        ) : null}
      </div>

      {sendError ? <div style={{ color: '#a4262c', fontSize: 13, flexShrink: 0 }}>{sendError}</div> : null}

      <div className="peer-chat-composer-row">
        <div className="peer-chat-composer-field">
          <textarea
            ref={composerRef}
            className="peer-chat-composer"
            rows={1}
            value={draft}
            aria-label="Message"
            onChange={e => {
              setDraft(e.target.value);
              pingLocalTyping();
            }}
            onInput={resizeComposer}
            onBlur={() => {
              flushLocalTyping();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            placeholder="Type a message…"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="peer-chat-send"
          onClick={() => void onSend()}
          disabled={!canSend}
          title={sendBlockedReason}
        >
          Send
        </button>
      </div>
    </div>
  );
}
