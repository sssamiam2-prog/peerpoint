import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ensureSoftAudioGestureHook,
  startAssignmentAlertLoop,
  stopAssignmentAlertLoop,
  testAlertSound,
  unlockSoftAudio
} from '../lib/softSounds';
import { ModernBackButton } from './ModernBackButton';

type SupportRequest = {
  id: string;
  status?: string;
  publicSupportCode?: string;
  supportCode?: string;
  submittedAt?: string;
  requestId?: string;
  assignedPeerUsername?: string;
};

function loadStaffUsername(): string {
  try {
    const raw = sessionStorage.getItem('peerpoint_staff_meta');
    if (!raw) return '';
    const meta = JSON.parse(raw) as { username?: string };
    return String(meta.username ?? '').toLowerCase();
  } catch {
    return '';
  }
}

export function ModernStaffRequests(): React.ReactElement {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<SupportRequest[]>([]);
  const [tab, setTab] = React.useState('pending');
  const [error, setError] = React.useState('');
  const [alertIds, setAlertIds] = React.useState<string[]>([]);
  const [cleared, setCleared] = React.useState<Set<string>>(() => new Set());
  const prevOffered = React.useRef<Set<string>>(new Set());
  const token =
    (typeof localStorage !== 'undefined' && localStorage.getItem('peerpoint_staff_token')) ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('peerpoint_staff_token'));
  const me = loadStaffUsername();

  const load = React.useCallback(async (): Promise<void> => {
    if (!token) {
      navigate('/staff');
      return;
    }
    try {
      const response = await fetch('/api/staff/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = (await response.json()) as SupportRequest[] | { requests?: SupportRequest[] };
      if (!response.ok) throw new Error('Could not load requests.');
      setItems(Array.isArray(data) ? data : (data.requests ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests.');
    }
  }, [navigate, token]);

  React.useEffect(() => {
    ensureSoftAudioGestureHook();
  }, []);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return (): void => window.clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    if (!me) {
      stopAssignmentAlertLoop();
      setAlertIds([]);
      return;
    }
    const meLocal = me.includes('@') ? me.split('@')[0]! : me;
    const offered = items.filter(r => {
      if (r.status !== 'queued' && r.status !== 'pending') return false;
      const assigned = String(r.assignedPeerUsername || '').toLowerCase();
      if (!assigned) return false;
      const assignedLocal = assigned.includes('@') ? assigned.split('@')[0]! : assigned;
      return assigned === me || assignedLocal === meLocal;
    });
    const offeredIds = new Set(offered.map(r => r.requestId ?? r.id));
    const newly: string[] = [];
    for (const id of offeredIds) {
      if (!prevOffered.current.has(id) && !cleared.has(id)) newly.push(id);
    }
    prevOffered.current = offeredIds;
    setAlertIds(prev => {
      const still = prev.filter(id => offeredIds.has(id) && !cleared.has(id));
      return Array.from(new Set([...still, ...newly]));
    });
  }, [items, me, cleared]);

  React.useEffect(() => {
    if (alertIds.length > 0) startAssignmentAlertLoop();
    else stopAssignmentAlertLoop();
    return (): void => stopAssignmentAlertLoop();
  }, [alertIds.length]);

  React.useEffect(() => {
    if (alertIds.length === 0) return;
    const original = document.title;
    let flip = false;
    const id = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? '⚠ Request waiting — PEERPoint' : original;
    }, 1200);
    return (): void => {
      window.clearInterval(id);
      document.title = original;
    };
  }, [alertIds.length]);

  const clearAlert = (): void => {
    unlockSoftAudio();
    setCleared(prev => {
      const next = new Set(prev);
      for (const id of alertIds) next.add(id);
      return next;
    });
    setAlertIds([]);
    stopAssignmentAlertLoop();
  };

  const accept = async (item: SupportRequest): Promise<void> => {
    if (!token) return;
    const id = item.requestId ?? item.id;
    const response = await fetch(`/api/staff/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'acceptQueue' })
    });
    if (!response.ok) {
      // Classic API uses body id on /api/staff/requests
      const fallback = await fetch('/api/staff/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'acceptQueue', id })
      });
      if (!fallback.ok) {
        setError('Could not accept the request.');
        return;
      }
    }
    clearAlert();
    sessionStorage.setItem(
      'peerpoint_modern_staff_session',
      JSON.stringify({
        requestId: id,
        supportCode: item.publicSupportCode ?? item.supportCode
      })
    );
    navigate('/m/staff/chat');
  };

  const filtered = items.filter(
    item =>
      tab === 'all' ||
      (tab === 'active' ? item.status === 'active' || item.status === 'assigned' : !['active', 'assigned', 'closed'].includes(item.status ?? 'pending'))
  );

  return (
    <section className="modern-page modern-staff" onPointerDownCapture={() => unlockSoftAudio()}>
      <ModernBackButton to="/m/more" label="More" />
      {alertIds.length > 0 ? (
        <div className="staff-assignment-alert" role="alertdialog" aria-live="assertive">
          <div>
            <strong>Peer support request waiting for you</strong>
            <p style={{ margin: '6px 0 0', fontSize: 14 }}>
              Soft alert continues until you clear this notice or Accept the request.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                unlockSoftAudio();
                testAlertSound();
              }}
            >
              Test sound
            </button>
            <button type="button" className="btn-ghost" onClick={clearAlert}>
              Clear notice &amp; stop sound
            </button>
          </div>
        </div>
      ) : null}
      <header>
        <p className="modern-eyebrow">PEERPOINT · STAFF</p>
        <h1>Support requests</h1>
      </header>
      <div className="modern-segmented">
        {['pending', 'active', 'all'].map(name => (
          <button
            key={name}
            type="button"
            className={tab === name ? 'active' : ''}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {error ? <p className="modern-error">{error}</p> : null}
      <div className="modern-staff-list">
        {filtered.map(item => (
          <article key={item.id} className="modern-staff-card">
            <b>{item.publicSupportCode ?? item.supportCode ?? 'Support request'}</b>
            <span>
              {item.status ?? 'Pending'} ·{' '}
              {item.submittedAt ? new Date(item.submittedAt).toLocaleTimeString() : 'Now'}
            </span>
            {item.status !== 'active' && item.status !== 'assigned' ? (
              <button type="button" onClick={() => void accept(item)}>
                Accept
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem(
                    'peerpoint_modern_staff_session',
                    JSON.stringify({
                      requestId: item.requestId ?? item.id,
                      supportCode: item.publicSupportCode ?? item.supportCode
                    })
                  );
                  navigate('/m/staff/chat');
                }}
              >
                Open chat
              </button>
            )}
          </article>
        ))}
        {filtered.length === 0 ? <p className="modern-muted">No requests in this view.</p> : null}
      </div>
    </section>
  );
}
