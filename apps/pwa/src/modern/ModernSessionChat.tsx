import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ConversationDestroyOverlay } from '../components/ConversationDestroyOverlay';
import { PeerConfidentialityModal } from '../components/PeerConfidentialityModal';
import { type CallState, reduceCallState } from '../lib/callState';
import { joinLiveKitAudio, leaveLiveKitAudio } from '../lib/livekitAudio';
import {
  confidentialitySessionKey,
  hasAcknowledgedConfidentiality
} from '../lib/peerConfidentiality';
import { clearModernSession, loadModernSession } from '../lib/modernSession';
import { connectPeerSession, type PeerSessionConnection } from '../lib/peerChatAbly';
import type { PeerChatMessage, PeerTypingPayload } from '../types/chat';
import { ModernBackButton } from './ModernBackButton';
import { ModernCallOverlay } from './ModernCallOverlay';

type Props = { staff?: boolean; requestId?: string; supportCode?: string };

export function ModernSessionChat({ staff = false, requestId, supportCode }: Props): React.ReactElement {
  const navigate = useNavigate();
  const saved = React.useMemo(loadModernSession, []);
  const id = requestId ?? saved?.requestId;
  const token = staff ? undefined : saved?.anonymousSessionToken;
  const sessionKey = id ? confidentialitySessionKey('request', id) : '';
  const [messages, setMessages] = React.useState<PeerChatMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const [connection, setConnection] = React.useState<PeerSessionConnection | null>(null);
  const [error, setError] = React.useState('');
  const [tab, setTab] = React.useState<'chat' | 'details'>('chat');
  const [destroying, setDestroying] = React.useState(false);
  const [call, setCall] = React.useState<CallState>('idle');
  const [noticeReady, setNoticeReady] = React.useState(
    () => staff || (id ? hasAcknowledgedConfidentiality(confidentialitySessionKey('request', id)) : false)
  );
  const [showNotice, setShowNotice] = React.useState(() => !staff && Boolean(id) && !noticeReady);
  const staffToken = staff ? sessionStorage.getItem('peerpoint_staff_token') ?? undefined : undefined;

  React.useEffect(() => {
    if (!id || (!staff && !token)) {
      navigate(staff ? '/m/staff' : '/m/request');
      return;
    }
    if (!staff && !noticeReady) {
      setShowNotice(true);
      return;
    }
    let live: PeerSessionConnection | null = null;
    void (async () => {
      try {
        const response = await fetch(
          `/api/peer-support/session?requestId=${encodeURIComponent(id)}${
            token ? `&token=${encodeURIComponent(token)}` : ''
          }`,
          staffToken ? { headers: { Authorization: `Bearer ${staffToken}` } } : undefined
        );
        const data = (await response.json()) as {
          ablyChannelName?: string;
          channelName?: string;
          publicSupportCode?: string;
        };
        const channelName = data.ablyChannelName ?? data.channelName;
        if (!response.ok || !channelName) throw new Error('Could not connect to this support session.');
        live = await connectPeerSession({
          requestId: id,
          channelName,
          displayName: staff ? 'Peer Support Staff' : 'You',
          sessionToken: token,
          staffToken,
          onMessage: m =>
            setMessages(old => (old.some(x => x.id === m.id) ? old : [...old, m])),
          onTyping: (p: PeerTypingPayload) => {
            if (p.from !== (staff ? 'Peer Support Staff' : 'You')) setTyping(p.typing);
          },
          onCall: payload => {
            const state = payload.state;
            if (state === 'requested') setCall('ringing');
            if (state === 'ended') {
              leaveLiveKitAudio();
              setCall('ended');
            }
          },
          onConnectionState: state => {
            if (state === 'failed') setError('Chat connection failed.');
          }
        });
        setConnection(live);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not connect to chat.');
      }
    })();
    return () => live?.close();
  }, [id, navigate, noticeReady, staff, staffToken, token]);

  const send = async (): Promise<void> => {
    if (!connection || !draft.trim()) return;
    const sent = await connection.publish(draft);
    if (sent) setMessages(old => (old.some(m => m.id === sent.id) ? old : [...old, sent]));
    setDraft('');
    void connection.publishTyping(false);
  };

  const requestCall = async (): Promise<void> => {
    setCall('requested');
    await connection?.publishCall({ state: 'requested' });
  };

  const acceptCall = async (): Promise<void> => {
    setCall('joining');
    try {
      const r = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(staffToken ? { Authorization: `Bearer ${staffToken}` } : {})
        },
        body: JSON.stringify({ requestId: id, token })
      });
      const data = (await r.json()) as { url?: string; token?: string };
      if (!r.ok || !data.url || !data.token) throw new Error('Voice is unavailable.');
      await joinLiveKitAudio({ url: data.url, token: data.token });
      setCall('active');
      await connection?.publishCall({ state: 'active' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice call failed.');
      setCall('failed');
    }
  };

  const endCall = async (): Promise<void> => {
    leaveLiveKitAudio();
    setCall('ended');
    await connection?.publishCall({ state: 'ended' });
  };

  const endSession = async (): Promise<void> => {
    if (!id) return;
    await fetch('/api/peer-support/session/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(staffToken ? { Authorization: `Bearer ${staffToken}` } : {})
      },
      body: JSON.stringify({ requestId: id, token })
    }).catch(() => undefined);
    clearModernSession();
    setDestroying(true);
  };

  if (!id) return <div />;

  return (
    <section className="modern-chat">
      {!staff ? (
        <PeerConfidentialityModal
          open={showNotice}
          sessionKey={sessionKey}
          variant="modern"
          onContinue={() => {
            setShowNotice(false);
            setNoticeReady(true);
          }}
          onCancel={() => {
            setShowNotice(false);
            navigate('/m/waiting', { replace: true });
          }}
        />
      ) : null}
      <ModernBackButton to={staff ? '/m/staff' : '/'} label={staff ? 'Requests' : 'Home'} />
      <header>
        <div>
          <span className="modern-status-dot" />{' '}
          <b>{staff ? `Support code: ${supportCode ?? 'Session'}` : 'PEERPoint Staff'}</b>
          <small>
            {noticeReady
              ? typing
                ? 'Typing…'
                : 'Confidential PEERPoint chat'
              : 'Review confidentiality to connect'}
          </small>
        </div>
        <button className="modern-voice-button" onClick={() => void requestCall()} disabled={!connection}>
          ⌁ Voice
        </button>
      </header>
      <div className="modern-chat-tabs">
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          Chat
        </button>
        <button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>
          Details
        </button>
      </div>
      {tab === 'details' ? (
        <div className="modern-details">
          <p>This PEERPoint conversation is confidential and can be ended at any time.</p>
          <button onClick={() => void endSession()} className="modern-end-session">
            End session
          </button>
        </div>
      ) : (
        <>
          <div className="modern-messages">
            {messages.map(m => (
              <div
                key={m.id}
                className={`modern-message ${m.from === (staff ? 'Peer Support Staff' : 'You') ? 'mine' : ''}`}
              >
                <b>{m.from === 'You' ? 'You' : 'PEERPoint Staff'}</b>
                {m.text}
              </div>
            ))}
            {error ? <p className="modern-error">{error}</p> : null}
          </div>
          <form
            className="modern-composer"
            onSubmit={e => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                void connection?.publishTyping(true);
              }}
              placeholder="Type a message…"
              disabled={!connection}
            />
            <button disabled={!connection}>Send</button>
          </form>
        </>
      )}
      <ModernCallOverlay
        state={call}
        onAccept={() => void acceptCall()}
        onDecline={() => {
          setCall(reduceCallState(call, 'declined'));
          void connection?.publishCall({ state: 'declined' });
        }}
        onEnd={() => void endCall()}
      />
      {destroying ? (
        <ConversationDestroyOverlay onComplete={() => navigate(staff ? '/m/staff' : '/')} />
      ) : null}
    </section>
  );
}
