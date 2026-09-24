import * as React from 'react';

type Provider = { username: string; displayName: string };

type PeerEvent = {
  id: string;
  eventDate: string;
  recordedAt: string;
  prpsBureau: string;
  prpsGender: string;
  helpType: string;
  providerDisplayName: string;
  totalMinutes: number;
  createdByDisplay: string;
};

const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonBinary', label: 'Non-binary' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
  { value: 'unknown', label: 'Unknown' }
];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PeerSupportEventLoggerPanel(props: {
  authHeaders: () => HeadersInit;
  defaultProvider?: { username: string; displayName: string };
}): React.ReactElement {
  const [helpTypes, setHelpTypes] = React.useState<string[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [recent, setRecent] = React.useState<PeerEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [success, setSuccess] = React.useState<string | undefined>();

  const [eventDate, setEventDate] = React.useState(todayIsoDate);
  const [prpsBureau, setPrpsBureau] = React.useState('');
  const [prpsGender, setPrpsGender] = React.useState('');
  const [helpType, setHelpType] = React.useState('');
  const [providerUsername, setProviderUsername] = React.useState(props.defaultProvider?.username ?? '');
  const [totalMinutes, setTotalMinutes] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/staff/peer-support-events?limit=15', { headers: props.authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      helpTypes?: string[];
      providers?: Provider[];
      events?: PeerEvent[];
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? `Could not load event logger (${res.status})`);
      return;
    }
    setHelpTypes(data.helpTypes ?? []);
    setProviders(data.providers ?? []);
    setRecent(data.events ?? []);
    setHelpType(prev => prev || data.helpTypes?.[0] || '');
    setProviderUsername(prev => prev || props.defaultProvider?.username || '');
  }, [props]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectedProvider = providers.find(p => p.username === providerUsername);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const res = await fetch('/api/staff/peer-support-events', {
      method: 'POST',
      headers: props.authHeaders(),
      body: JSON.stringify({
        eventDate,
        prpsBureau,
        prpsGender,
        helpType,
        providerUsername,
        providerDisplayName: selectedProvider?.displayName || props.defaultProvider?.displayName || providerUsername,
        totalMinutes: Number(totalMinutes)
      })
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; event?: PeerEvent };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? `Save failed (${res.status})`);
      return;
    }
    setSuccess('Peer Support Event saved.');
    setPrpsBureau('');
    setPrpsGender('');
    setTotalMinutes('');
    setEventDate(todayIsoDate());
    void load();
  }

  return (
    <section className="staff-tab-panel" role="tabpanel" id="panel-peerEvents" aria-labelledby="tab-peerEvents">
      <h3 style={{ marginTop: 0 }}>Peer Support Event Logger</h3>
      <p style={{ fontSize: 14, color: 'var(--text)', maxWidth: 640 }}>
        Record a peer support interaction for reporting. Data syncs to SharePoint through an admin-only refresh flow
        on the SH-PS site.
      </p>

      {loading ? <p style={{ fontSize: 14 }}>Loading…</p> : null}
      {error ? <div style={{ color: '#a4262c', marginBottom: 8 }}>{error}</div> : null}
      {success ? <div style={{ color: 'var(--accent, #0f6a4a)', marginBottom: 8 }}>{success}</div> : null}

      <form
        onSubmit={e => void onSubmit(e)}
        style={{ display: 'grid', gap: 12, maxWidth: 520, marginTop: 12 }}
      >
        <label>
          Date of peer support
          <input type="date" value={eventDate} onChange={ev => setEventDate(ev.target.value)} required />
        </label>
        <label>
          Bureau (person receiving peer support)
          <input
            value={prpsBureau}
            onChange={ev => setPrpsBureau(ev.target.value)}
            placeholder="e.g. Corrections, Patrol, Admin"
            required
            autoComplete="organization"
          />
        </label>
        <label>
          Gender (person receiving peer support)
          <select value={prpsGender} onChange={ev => setPrpsGender(ev.target.value)} required>
            <option value="">Select…</option>
            {GENDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type of help
          <select value={helpType} onChange={ev => setHelpType(ev.target.value)} required>
            {helpTypes.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Person providing peer support
          <select value={providerUsername} onChange={ev => setProviderUsername(ev.target.value)} required>
            <option value="">Select…</option>
            {providers.map(p => (
              <option key={p.username} value={p.username}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Total time spent (minutes)
          <input
            type="number"
            min={1}
            max={1440}
            step={1}
            value={totalMinutes}
            onChange={ev => setTotalMinutes(ev.target.value)}
            placeholder="e.g. 45"
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save event'}
        </button>
      </form>

      <h4 style={{ marginTop: 28 }}>Your recent entries</h4>
      {recent.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text)' }}>No events logged yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 14, maxWidth: 720 }}>
          {recent.map(ev => (
            <li key={ev.id} style={{ marginBottom: 6 }}>
              <strong>{ev.eventDate}</strong> — {ev.helpType} · {ev.prpsBureau} · {ev.totalMinutes} min ·{' '}
              {ev.providerDisplayName}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
