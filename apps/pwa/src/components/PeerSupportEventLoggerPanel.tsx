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
      <p style={{ fontSize: 15, color: 'var(--text)', maxWidth: 720, lineHeight: 1.5 }}>
        Record a peer support interaction for reporting. Your recent entries stay here for <strong>5 days</strong>,
        then drop from the app after they are synced to the SharePoint list on SH-PS.
      </p>

      {loading ? <p style={{ fontSize: 15 }}>Loading…</p> : null}
      {error ? <div style={{ color: '#a4262c', marginBottom: 8, fontSize: 15 }}>{error}</div> : null}
      {success ? <div style={{ color: 'var(--accent, #0f6a4a)', marginBottom: 8, fontSize: 15 }}>{success}</div> : null}

      <form className="event-logger-form" onSubmit={e => void onSubmit(e)}>
        <label className="event-logger-form__field">
          Date of peer support
          <input
            className="event-logger-form__control"
            type="date"
            value={eventDate}
            onChange={ev => setEventDate(ev.target.value)}
            required
          />
        </label>
        <label className="event-logger-form__field">
          Bureau <span>(person receiving peer support)</span>
          <input
            className="event-logger-form__control"
            value={prpsBureau}
            onChange={ev => setPrpsBureau(ev.target.value)}
            placeholder="e.g. Corrections, Patrol, Administration"
            required
            autoComplete="organization"
          />
        </label>
        <label className="event-logger-form__field">
          Gender <span>(person receiving peer support)</span>
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={prpsGender}
            onChange={ev => setPrpsGender(ev.target.value)}
            required
          >
            <option value="">Select…</option>
            {GENDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="event-logger-form__field">
          Type of help
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={helpType}
            onChange={ev => setHelpType(ev.target.value)}
            required
          >
            {helpTypes.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="event-logger-form__field">
          Person providing peer support
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={providerUsername}
            onChange={ev => setProviderUsername(ev.target.value)}
            required
          >
            <option value="">Select…</option>
            {providers.map(p => (
              <option key={p.username} value={p.username}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="event-logger-form__field">
          Total time spent (minutes)
          <input
            className="event-logger-form__control event-logger-form__control--minutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            inputMode="numeric"
            value={totalMinutes}
            onChange={ev => setTotalMinutes(ev.target.value)}
            placeholder="45"
            required
          />
        </label>
        <button type="submit" className="event-logger-form__submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save event'}
        </button>
      </form>

      <h4 style={{ marginTop: 32, fontSize: '1.125rem' }}>Your recent entries (last 5 days)</h4>
      {recent.length === 0 ? (
        <p style={{ fontSize: 15, color: 'var(--text)' }}>No events logged yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 15, maxWidth: 720, lineHeight: 1.5 }}>
          {recent.map(ev => (
            <li key={ev.id} style={{ marginBottom: 8 }}>
              <strong>{ev.eventDate}</strong> — {ev.helpType} · {ev.prpsBureau} · {ev.totalMinutes} min ·{' '}
              {ev.providerDisplayName}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
