import * as React from 'react';
import { useNavigate } from 'react-router-dom';

type SupportRequest = { id: string; status?: string; publicSupportCode?: string; supportCode?: string; submittedAt?: string; requestId?: string };

export function ModernStaffRequests(): React.ReactElement {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<SupportRequest[]>([]);
  const [tab, setTab] = React.useState('pending');
  const [error, setError] = React.useState('');
  const token = sessionStorage.getItem('peerpoint_staff_token');
  const load = React.useCallback(async (): Promise<void> => {
    if (!token) { navigate('/staff'); return; }
    try { const response = await fetch('/api/staff/requests', { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json() as SupportRequest[] | { requests?: SupportRequest[] }; if (!response.ok) throw new Error('Could not load requests.'); setItems(Array.isArray(data) ? data : data.requests ?? []); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load requests.'); }
  }, [navigate, token]);
  React.useEffect(() => { void load(); }, [load]);
  const accept = async (item: SupportRequest): Promise<void> => { if (!token) return; const id = item.requestId ?? item.id; const response = await fetch(`/api/staff/requests/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'acceptQueue' }) }); if (!response.ok) { setError('Could not accept the request.'); return; } sessionStorage.setItem('peerpoint_modern_staff_session', JSON.stringify({ requestId: id, supportCode: item.publicSupportCode ?? item.supportCode })); navigate('/m/staff/chat'); };
  const filtered = items.filter((item) => tab === 'all' || (tab === 'active' ? item.status === 'active' : !['active', 'closed'].includes(item.status ?? 'pending')));
  return <section className="modern-page modern-staff"><header><p className="modern-eyebrow">STAFF WORKSPACE</p><h1>Support requests</h1></header><div className="modern-segmented">{['pending', 'active', 'all'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>{error ? <p className="modern-error">{error}</p> : null}<div className="modern-staff-list">{filtered.map((item) => <article key={item.id} className="modern-staff-card"><b>{item.publicSupportCode ?? item.supportCode ?? 'Support request'}</b><span>{item.status ?? 'Pending'} · {item.submittedAt ? new Date(item.submittedAt).toLocaleTimeString() : 'Now'}</span>{item.status !== 'active' ? <button onClick={() => void accept(item)}>Accept</button> : <button onClick={() => { sessionStorage.setItem('peerpoint_modern_staff_session', JSON.stringify({ requestId: item.requestId ?? item.id, supportCode: item.publicSupportCode ?? item.supportCode })); navigate('/m/staff/chat'); }}>Open chat</button>}</article>)}{!filtered.length ? <p className="modern-muted">No {tab} requests right now.</p> : null}</div></section>;
}
