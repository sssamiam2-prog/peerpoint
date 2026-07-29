import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Resolves /join?t=TOKEN (or ?token=) to Peer chat/voice with the room filled in.
 */
export function JoinPage(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = (params.get('t') ?? params.get('token') ?? '').trim();
  const [error, setError] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState('Opening your session…');
  const [room, setRoom] = React.useState<string | undefined>();
  const [mode, setMode] = React.useState<'chat' | 'voice' | undefined>();

  React.useEffect(() => {
    if (!token) {
      setError('This join link is missing a token. Open the link from your email or text message.');
      setStatus('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/join?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          status?: string;
          room?: string;
          contactMode?: 'chat' | 'voice';
          path?: string;
          message?: string;
        };
        if (cancelled) return;
        if (data.status === 'queued') {
          setStatus(data.message ?? 'Waiting for a peer to accept…');
          setError(undefined);
          return;
        }
        if (!res.ok || !data.room || !data.path) {
          setError(data.error ?? 'Could not open this join link.');
          setStatus('');
          return;
        }
        setRoom(data.room);
        setMode(data.contactMode === 'voice' ? 'voice' : 'chat');
        setStatus(data.message ?? 'Connecting…');
        navigate(data.path, { replace: true });
      } catch {
        if (!cancelled) {
          setError('Network error opening this link. Try again or enter your room code manually.');
          setStatus('');
        }
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [token, navigate]);

  // Poll while still queued
  React.useEffect(() => {
    if (!token || room || error) return;
    if (!status.toLowerCase().includes('waiting') && !status.toLowerCase().includes('accept')) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/join?token=${encodeURIComponent(token)}`);
          const data = (await res.json().catch(() => ({}))) as {
            status?: string;
            room?: string;
            path?: string;
            message?: string;
            contactMode?: 'chat' | 'voice';
          };
          if (data.status === 'assigned' && data.path && data.room) {
            setRoom(data.room);
            setMode(data.contactMode === 'voice' ? 'voice' : 'chat');
            navigate(data.path, { replace: true });
          } else if (data.message) {
            setStatus(data.message);
          }
        } catch {
          /* keep polling */
        }
      })();
    }, 2500);
    return (): void => window.clearInterval(timer);
  }, [token, room, error, status, navigate]);

  return (
    <div className="page-shell page-shell-tight">
      <h2>Join session</h2>
      {status ? (
        <p className="lede" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <div style={{ color: '#a4262c', whiteSpace: 'pre-wrap' }}>
          <p>{error}</p>
          <p style={{ marginTop: 12 }}>
            <Link to="/chat">Peer chat</Link>
            {' · '}
            <Link to="/voice">Peer voice</Link>
            {' · '}
            <Link to="/request">Request Help</Link>
          </p>
        </div>
      ) : null}
      {room && mode ? (
        <p style={{ fontSize: 14 }}>
          Room <strong>{room}</strong> — if you are not redirected,{' '}
          <Link to={mode === 'voice' ? `/voice?room=${encodeURIComponent(room)}` : `/chat?room=${encodeURIComponent(room)}`}>
            open Peer {mode}
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
