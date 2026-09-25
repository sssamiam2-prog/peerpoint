import * as React from 'react';

type Provider = { username: string; displayName: string };

type PeerEvent = {
  id: string;
  eventDate: string;
  recordedAt: string;
  prpsBureau: string;
  prpsGender: string;
  workRelatedIncident?: 'yes' | 'no';
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

const WORK_INCIDENT_OPTIONS: Array<{ value: 'yes' | 'no'; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

const DEFAULT_PRPS_BUREAUS = ['Corrections', 'Public Safety', 'Law Enforcement', 'Admin'] as const;
const DEFAULT_TOTAL_TIME_MINUTES = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480] as const;
const DEFAULT_DATE_LOOKBACK_DAYS = 365;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildEventDateOptions(lookbackDays: number): string[] {
  const days = Math.max(1, Math.min(lookbackDays, 3660));
  const out: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

function formatEventDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTotalMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return '1 hour';
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} hr ${rem} min`;
}

function formatWorkIncident(value: PeerEvent['workRelatedIncident']): string {
  if (value === 'yes') return 'Work related: Yes';
  if (value === 'no') return 'Work related: No';
  return '';
}

export function PeerSupportEventLoggerPanel(props: {
  authHeaders: () => HeadersInit;
  defaultProvider?: { username: string; displayName: string };
}): React.ReactElement {
  const [helpTypes, setHelpTypes] = React.useState<string[]>([]);
  const [prpsBureaus, setPrpsBureaus] = React.useState<string[]>([...DEFAULT_PRPS_BUREAUS]);
  const [totalTimeOptions, setTotalTimeOptions] = React.useState<number[]>([...DEFAULT_TOTAL_TIME_MINUTES]);
  const [eventDateOptions, setEventDateOptions] = React.useState<string[]>(() =>
    buildEventDateOptions(DEFAULT_DATE_LOOKBACK_DAYS)
  );
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [recent, setRecent] = React.useState<PeerEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [success, setSuccess] = React.useState<string | undefined>();

  const [eventDate, setEventDate] = React.useState(todayIsoDate);
  const [providerUsername, setProviderUsername] = React.useState(props.defaultProvider?.username ?? '');
  const [prpsBureau, setPrpsBureau] = React.useState('');
  const [prpsGender, setPrpsGender] = React.useState('');
  const [workRelatedIncident, setWorkRelatedIncident] = React.useState<'yes' | 'no' | ''>('');
  const [selectedHelpTypes, setSelectedHelpTypes] = React.useState<string[]>([]);
  const [totalMinutes, setTotalMinutes] = React.useState<number | ''>('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    const res = await fetch('/api/staff/peer-support-events?limit=15', { headers: props.authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      helpTypes?: string[];
      prpsBureaus?: string[];
      totalTimeMinutesOptions?: number[];
      eventDateLookbackDays?: number;
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
    if (data.prpsBureaus?.length) setPrpsBureaus(data.prpsBureaus);
    if (data.totalTimeMinutesOptions?.length) setTotalTimeOptions(data.totalTimeMinutesOptions);
    const lookback = data.eventDateLookbackDays ?? DEFAULT_DATE_LOOKBACK_DAYS;
    setEventDateOptions(buildEventDateOptions(lookback));
    setProviders(data.providers ?? []);
    setRecent(data.events ?? []);
    setSelectedHelpTypes([]);
    setProviderUsername(prev => prev || props.defaultProvider?.username || '');
    setEventDate(prev => prev || todayIsoDate());
  }, [props]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectedProvider = providers.find(p => p.username === providerUsername);

  function toggleHelpType(option: string): void {
    setSelectedHelpTypes(prev =>
      prev.includes(option) ? prev.filter(t => t !== option) : [...prev, option]
    );
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (selectedHelpTypes.length === 0) {
      setError('Select at least one Resources / Referrals option.');
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const res = await fetch('/api/staff/peer-support-events', {
      method: 'POST',
      headers: props.authHeaders(),
      body: JSON.stringify({
        eventDate,
        providerUsername,
        providerDisplayName: selectedProvider?.displayName || props.defaultProvider?.displayName || providerUsername,
        prpsBureau,
        prpsGender,
        workRelatedIncident,
        helpTypes: selectedHelpTypes,
        totalMinutes
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
    setWorkRelatedIncident('');
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
          Date of Peer Support
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={eventDate}
            onChange={ev => setEventDate(ev.target.value)}
            required
          >
            <option value="">Select…</option>
            {eventDateOptions.map(iso => (
              <option key={iso} value={iso}>
                {formatEventDateLabel(iso)}
              </option>
            ))}
          </select>
        </label>
        <label className="event-logger-form__field">
          Person Providing Peer Support
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
          Bureau <span>(person receiving support)</span>
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={prpsBureau}
            onChange={ev => setPrpsBureau(ev.target.value)}
            required
          >
            <option value="">Select…</option>
            {prpsBureaus.map(b => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="event-logger-form__field">
          Gender <span>(person receiving support)</span>
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
          Work Related Incident
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={workRelatedIncident}
            onChange={ev => setWorkRelatedIncident(ev.target.value as 'yes' | 'no' | '')}
            required
          >
            <option value="">Select…</option>
            {WORK_INCIDENT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="event-logger-form__field event-logger-form__field--checklist">
          <legend>
            Resources / Referrals <span>(select all that apply)</span>
          </legend>
          {helpTypes.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 400, textTransform: 'none' }}>
              No options yet — ask an admin to add Resources / Referrals.
            </p>
          ) : (
            <div className="event-logger-form__option-list" role="group" aria-label="Resources and referrals">
              {helpTypes.map(t => {
                const checked = selectedHelpTypes.includes(t);
                const inputId = `help-type-${t.replace(/\W+/g, '-').slice(0, 48)}`;
                return (
                  <label
                    key={t}
                    htmlFor={inputId}
                    className={`event-logger-form__option${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      name="helpTypes"
                      value={t}
                      checked={checked}
                      onChange={() => toggleHelpType(t)}
                    />
                    <span>{t}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <label className="event-logger-form__field">
          Total Time Spent
          <select
            className="event-logger-form__control event-logger-form__control--select"
            value={totalMinutes === '' ? '' : String(totalMinutes)}
            onChange={ev => {
              const v = ev.target.value;
              setTotalMinutes(v === '' ? '' : Number(v));
            }}
            required
          >
            <option value="">Select…</option>
            {totalTimeOptions.map(m => (
              <option key={m} value={m}>
                {formatTotalMinutesLabel(m)}
              </option>
            ))}
          </select>
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
          {recent.map(ev => {
            const incident = formatWorkIncident(ev.workRelatedIncident);
            return (
              <li key={ev.id} style={{ marginBottom: 8 }}>
                <strong>{ev.eventDate}</strong> — {ev.helpType}
                {incident ? ` · ${incident}` : ''} · {ev.prpsBureau} · {ev.totalMinutes} min ·{' '}
                {ev.providerDisplayName}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
