import * as React from 'react';
import {
  connectPeerChat,
  explainAblyError,
  normalizeRoomCodeInput,
  sanitizeAblyApiKey
} from '../lib/peerChatAbly';
import type { PeerChatMessage, PeerPresenceMember } from '../types/chat';

const DISPLAY_KEY = 'peerpoint_chat_display_name';

/** Dev-only — filter console with `[PeerChat UI]`. Uses info so logs show without enabling Verbose. */
function chatUiDebug(phase: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail !== undefined) console.info(`[PeerChat UI] ${phase}`, detail);
  else console.info(`[PeerChat UI] ${phase}`);
}

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

function formatTypingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more are typing`;
}

export function ChatPage(): React.ReactElement {
  const ablyKeyRaw = import.meta.env.VITE_ABLY_KEY as string | undefined;
  const ablyKey = ablyKeyRaw ? sanitizeAblyApiKey(ablyKeyRaw) : undefined;
  const hasKey = Boolean(ablyKey && ablyKey.length > 0);

  const [roomInput, setRoomInput] = React.useState('');
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
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const seenIds = React.useRef<Set<string>>(new Set());
  const publishRef = React.useRef<((text: string) => Promise<PeerChatMessage | undefined>) | null>(null);
  const typingPublishRef = React.useRef<((typing: boolean) => Promise<void>) | null>(null);
  const typingIdleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingThrottleAtRef = React.useRef(0);
  /** Increments each chat session effect run — drops stale Ably callbacks after Strict Mode remount / Leave. */
  const chatEpochRef = React.useRef(0);

  const appendMessages = React.useCallback((incoming: PeerChatMessage[]): void => {
    setMessages(prev => {
      const next = [...prev];
      for (const m of incoming) {
        if (seenIds.current.has(m.id)) {
          chatUiDebug('message:deduped', { id: m.id, from: m.from });
          continue;
        }
        seenIds.current.add(m.id);
        chatUiDebug('message:append', { id: m.id, from: m.from, textLen: m.text.length });
        next.push(m);
      }
      next.sort((a, b) => a.at - b.at);
      return next;
    });
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
    if (!session || !ablyKey) return;

    const epoch = ++chatEpochRef.current;

    publishRef.current = null;
    typingPublishRef.current = null;

    let closed = false;
    let closeSession: (() => void) | undefined;

    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);

    void (async (): Promise<void> => {
      try {
        const chat = await connectPeerChat(
          ablyKey,
          session.room,
          session.name,
          msg => {
            if (closed || epoch !== chatEpochRef.current) return;
            appendMessages([msg]);
            setTypingOthers(prev => prev.filter(n => n !== msg.from));
          },
          state => {
            if (closed || epoch !== chatEpochRef.current) return;
            setConnState(state);
          },
          payload => {
            if (closed || epoch !== chatEpochRef.current) return;
            if (isSelfMessage(payload.from, session.name)) return;
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
        publishRef.current = chat.publish;
        typingPublishRef.current = chat.publishTyping;
        closeSession = chat.close;
        chatUiDebug('session:publish_ready', {
          room: session.room,
          presenceEnabled: chat.presenceEnabled,
          localClientId: chat.localClientId
        });
      } catch (e: unknown) {
        if (!closed && epoch === chatEpochRef.current) {
          chatUiDebug('session:connect_failed', {
            message: e instanceof Error ? e.message : String(e)
          });
          setMessages([]);
          setJoinError(explainAblyError(e));
          setSession(null);
        }
      }
    })();

    return (): void => {
      closed = true;
      flushLocalTyping();
      publishRef.current = null;
      typingPublishRef.current = null;
      closeSession?.();
    };
    // appendMessages is stable (useCallback); omit from deps to avoid extra Ably reconnects in dev.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable appendMessages + intentional epoch guards
  }, [ablyKey, session, flushLocalTyping]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typingOthers]);

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
    setConnState('connecting');
    chatUiDebug('join', { room: parsed.code, name });
    setSession({ room: parsed.code, name });
  };

  const onLeave = (): void => {
    chatUiDebug('leave');
    flushLocalTyping();
    setSession(null);
    setMessages([]);
    setTypingOthers([]);
    setPresenceMembers([]);
    setLocalClientId(null);
    setPresenceEnabled(false);
    seenIds.current = new Set();
    setConnState(undefined);
    setSendError(undefined);
  };

  const onSend = async (): Promise<void> => {
    setSendError(undefined);
    flushLocalTyping();
    const publish = publishRef.current;
    if (!publish) {
      chatUiDebug('send:blocked', { reason: 'no_publish_fn', connState });
      setSendError('Not connected yet.');
      return;
    }
    if (connState !== 'connected') {
      chatUiDebug('send:blocked', { reason: 'not_connected', connState });
    }
    try {
      chatUiDebug('send:start', { connState, draftLen: draft.trim().length });
      const sent = await publish(draft);
      if (sent) {
        appendMessages([sent]);
      }
      chatUiDebug('send:ok');
      setDraft('');
    } catch (e: unknown) {
      chatUiDebug('send:error', { message: e instanceof Error ? e.message : String(e) });
      setSendError(explainAblyError(e));
    }
  };

  if (!hasKey) {
    return (
      <div className="page-shell">
        <h2>Peer chat</h2>
        <p>Group chat opens after everyone enters the same room code. This feature needs a realtime service key.</p>
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: 'var(--social-bg)',
            border: '1px solid var(--border)',
            fontSize: 14
          }}
        >
          <p style={{ marginBottom: 8 }}>
            Add <code>VITE_ABLY_KEY</code> to <code>apps/pwa/.env</code> (see <code>.env.example</code>), restart{' '}
            <code>npm run dev</code>, then return here.
          </p>
          <p style={{ marginBottom: 0 }}>
            Create a free Ably app at{' '}
            <a href="https://ably.com/sign-up" target="_blank" rel="noreferrer">
              ably.com
            </a>
            Prefer an API key whose capabilities are limited to subscribe, publish, history, and presence on channels matching{' '}
            <code>peerpoint:room:*</code> (see Ably docs on key capabilities).
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
    return (
      <div className="page-shell page-shell-tight">
        <h2>Peer chat</h2>
        <p>Everyone enters the same room code to join one conversation. Messages go through Ably (a third-party service), not SharePoint.</p>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text)' }}>
          If this is an emergency, call 911. This chat is not a substitute for crisis services.
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
            Your name (shown in chat)
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="First name or initials"
              autoComplete="name"
              maxLength={40}
            />
          </label>
          <button type="button" onClick={onJoin}>
            Join room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="peer-chat-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Room {session.room}</h2>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>
        Signed in as <strong>{session.name}</strong>
        {connState && connState !== 'connected' ? (
          <span style={{ marginLeft: 8 }}>· {connState}</span>
        ) : null}
      </div>
      {connState && connState !== 'connected' ? (
        <div
          role="status"
          style={{
            fontSize: 14,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(168, 80, 0, 0.12)',
            border: '1px solid rgba(168, 80, 0, 0.35)',
            color: 'var(--text-h)'
          }}
        >
          Connecting to the chat service ({connState}). Send stays off until the link shows connected.
        </div>
      ) : null}

      <section className="peer-chat-roster-panel" aria-labelledby="peer-chat-roster-title">
        <h3 id="peer-chat-roster-title" className="peer-chat-roster-title">
          People in this room
        </h3>
        {connState !== 'connected' ? (
          <p className="peer-chat-roster-status" role="status">
            Connecting… you’ll see who else is here once the link is ready.
          </p>
        ) : !presenceEnabled ? (
          <>
            <p className="peer-chat-roster-status">
              You are in this room as <strong>{session.name}</strong>. Others who join the same room code will appear here
              when your Ably API key allows <strong>Presence</strong> on channels like{' '}
              <code className="peer-chat-roster-code">peerpoint:room:*</code>.
            </p>
            <ul className="peer-chat-roster-list">
              <li>
                <span className="peer-chat-roster-name">{session.name}</span>{' '}
                <span className="peer-chat-roster-you">(you)</span>
              </li>
            </ul>
          </>
        ) : (
          <>
            {aloneInRoom ? (
              <p className="peer-chat-roster-standby" role="status">
                Standby — waiting for someone else to join this room with the same code.
              </p>
            ) : null}
            <ul className="peer-chat-roster-list" aria-live="polite">
              {presenceMembers.map(m => {
                const isYou = localClientId !== null && m.clientId === localClientId;
                return (
                  <li key={m.clientId}>
                    <span className="peer-chat-roster-name">{m.name}</span>
                    {isYou ? <span className="peer-chat-roster-you"> (you)</span> : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div ref={listRef} className="peer-chat-scroll">
        {messages.length === 0 && <div style={{ color: 'var(--text)', fontSize: 14 }}>No messages yet. Say hello.</div>}
        {messages.map(m => {
          const self = isSelfMessage(m.from, session.name);
          return (
            <div key={m.id} className={self ? 'peer-chat-row peer-chat-row--self' : 'peer-chat-row peer-chat-row--other'}>
              <div className={self ? 'peer-chat-bubble peer-chat-bubble--self' : 'peer-chat-bubble peer-chat-bubble--other'}>
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

      {sendError && <div style={{ color: '#a4262c', fontSize: 14 }}>{sendError}</div>}

      <div className="peer-chat-composer-row">
        <label className="peer-chat-composer-field">
          Message
          <textarea
            className="peer-chat-composer"
            rows={5}
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              pingLocalTyping();
            }}
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
        </label>
        <button
          type="button"
          className="peer-chat-send"
          onClick={() => void onSend()}
          disabled={!draft.trim() || connState !== 'connected'}
          title={
            !draft.trim()
              ? 'Type a message first'
              : connState !== 'connected'
                ? `Wait until connected (now: ${connState ?? 'unknown'})`
                : 'Send message'
          }
        >
          Send
        </button>
      </div>
    </div>
  );
}
