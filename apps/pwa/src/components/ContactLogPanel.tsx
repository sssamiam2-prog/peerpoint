import * as React from 'react';

type ContactKey = 'outreach' | 'walkIn' | 'supervisorReferral' | 'ciResponse';
type ResourceKey = 'vestEap' | 'handout';

type MonthLog = {
  year: number;
  month: number;
  contacts: Record<ContactKey, number[]>;
  resources: Record<ResourceKey, number[]>;
  updatedAt: string;
  updatedByDisplay: string;
};

type Totals = {
  contactRowTotals: Record<ContactKey, number>;
  contactDayTotals: number[];
  contactGrand: number;
  resourceRowTotals: Record<ResourceKey, number>;
  resourceDayTotals: number[];
  resourceGrand: number;
  days: number;
};

const CONTACT_ROWS: Array<{ key: ContactKey; label: string }> = [
  { key: 'outreach', label: 'Outreach' },
  { key: 'walkIn', label: 'Walk-ins' },
  { key: 'supervisorReferral', label: 'Supervisor Referral' },
  { key: 'ciResponse', label: 'CI Response' }
];

const RESOURCE_ROWS: Array<{ key: ResourceKey; label: string }> = [
  { key: 'vestEap', label: 'VEST/EAP' },
  { key: 'handout', label: 'Handout' }
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function emptyLog(year: number, month: number): MonthLog {
  const z = (): number[] => Array.from({ length: 31 }, () => 0);
  return {
    year,
    month,
    contacts: { outreach: z(), walkIn: z(), supervisorReferral: z(), ciResponse: z() },
    resources: { vestEap: z(), handout: z() },
    updatedAt: '',
    updatedByDisplay: ''
  };
}

function computeTotals(log: MonthLog): Totals {
  const days = new Date(log.year, log.month, 0).getDate();
  const sum = (row: number[]): number => row.slice(0, days).reduce((a, b) => a + b, 0);
  const contactDayTotals = Array.from({ length: 31 }, (_, i) =>
    i < days
      ? log.contacts.outreach[i]! +
        log.contacts.walkIn[i]! +
        log.contacts.supervisorReferral[i]! +
        log.contacts.ciResponse[i]!
      : 0
  );
  const resourceDayTotals = Array.from({ length: 31 }, (_, i) =>
    i < days ? log.resources.vestEap[i]! + log.resources.handout[i]! : 0
  );
  return {
    contactRowTotals: {
      outreach: sum(log.contacts.outreach),
      walkIn: sum(log.contacts.walkIn),
      supervisorReferral: sum(log.contacts.supervisorReferral),
      ciResponse: sum(log.contacts.ciResponse)
    },
    contactDayTotals,
    contactGrand: contactDayTotals.reduce((a, b) => a + b, 0),
    resourceRowTotals: {
      vestEap: sum(log.resources.vestEap),
      handout: sum(log.resources.handout)
    },
    resourceDayTotals,
    resourceGrand: resourceDayTotals.reduce((a, b) => a + b, 0),
    days
  };
}

type Props = {
  authHeaders: () => HeadersInit;
};

export function ContactLogPanel({ authHeaders }: Props): React.ReactElement {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [log, setLog] = React.useState<MonthLog>(() => emptyLog(now.getFullYear(), now.getMonth() + 1));
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const saveTimer = React.useRef<number | undefined>(undefined);
  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const totals = computeTotals(log);

  const load = React.useCallback(
    async (y: number, m: number): Promise<void> => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/staff/contact-log?year=${y}&month=${m}`, { headers: authHeaders() });
        const data = (await res.json()) as { log?: MonthLog; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not load contact log.');
        setLog(data.log ?? emptyLog(y, m));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load contact log.');
        setLog(emptyLog(y, m));
      } finally {
        setLoading(false);
      }
    },
    [authHeaders]
  );

  React.useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  const save = React.useCallback(
    async (next: MonthLog): Promise<void> => {
      setStatus('Saving…');
      try {
        const res = await fetch('/api/staff/contact-log', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ year: next.year, month: next.month, log: next })
        });
        const data = (await res.json()) as { log?: MonthLog; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not save.');
        if (data.log) setLog(data.log);
        setStatus('Saved');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save.');
        setStatus('');
      }
    },
    [authHeaders]
  );

  const queueSave = (next: MonthLog): void => {
    setLog(next);
    setStatus('Editing…');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(next), 700);
  };

  React.useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const setContact = (key: ContactKey, dayIndex: number, value: string): void => {
    const n = value.trim() === '' ? 0 : Math.max(0, Math.min(999, Math.round(Number(value) || 0)));
    const row = [...log.contacts[key]];
    row[dayIndex] = n;
    queueSave({ ...log, contacts: { ...log.contacts, [key]: row } });
  };

  const setResource = (key: ResourceKey, dayIndex: number, value: string): void => {
    const n = value.trim() === '' ? 0 : Math.max(0, Math.min(999, Math.round(Number(value) || 0)));
    const row = [...log.resources[key]];
    row[dayIndex] = n;
    queueSave({ ...log, resources: { ...log.resources, [key]: row } });
  };

  const downloadCsvWithAuth = async (): Promise<void> => {
    const res = await fetch(`/api/staff/contact-log?year=${year}&month=${month}&format=csv`, { headers: authHeaders() });
    if (!res.ok) {
      setError('Could not download CSV.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peerpoint-contacts-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dayHeaders = Array.from({ length: totals.days }, (_, i) => i + 1);

  return (
    <section className="staff-tab-panel" role="tabpanel" id="panel-contacts" aria-labelledby="tab-contacts">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Monthly contact log</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={() => void downloadCsvWithAuth()}>
            Download CSV
          </button>
          <button type="button" className="btn-ghost" onClick={() => void load(year, month)}>
            Refresh
          </button>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text)' }}>
        Count each contact by type for the day it happened. Totals fill in automatically. CI Response is a critical
        incident response. VEST/EAP and Handout are resources given — they are not extra contacts.
      </p>
      <div className="contact-log-controls">
        <label>
          Month
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Year
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <span className="contact-log-status" role="status">
          {loading ? 'Loading…' : status}
        </span>
      </div>
      {error ? <p style={{ color: '#a4262c' }}>{error}</p> : null}

      <div className="contact-log-scroll">
        <table className="contact-log-table">
          <thead>
            <tr>
              <th scope="col">{MONTHS[month - 1]}</th>
              {dayHeaders.map(day => (
                <th
                  key={day}
                  scope="col"
                  className={isCurrentMonth && day === today ? 'contact-log-today' : undefined}
                >
                  {day}
                </th>
              ))}
              <th scope="col" className="contact-log-total">
                Total
                <br />
                Contact Type
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="contact-log-section">
              <th scope="row">Contact Type</th>
              <td colSpan={totals.days + 1} />
            </tr>
            {CONTACT_ROWS.map(row => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {dayHeaders.map(day => (
                  <td key={day} className={isCurrentMonth && day === today ? 'contact-log-today' : undefined}>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      inputMode="numeric"
                      aria-label={`${row.label}, ${MONTHS[month - 1]} ${day}`}
                      value={log.contacts[row.key][day - 1] || ''}
                      onChange={e => setContact(row.key, day - 1, e.target.value)}
                    />
                  </td>
                ))}
                <td className="contact-log-total">{totals.contactRowTotals[row.key]}</td>
              </tr>
            ))}
            <tr className="contact-log-sum">
              <th scope="row">Total Contacts</th>
              {dayHeaders.map(day => (
                <td key={day} className={isCurrentMonth && day === today ? 'contact-log-today' : undefined}>
                  {totals.contactDayTotals[day - 1]}
                </td>
              ))}
              <td className="contact-log-total">{totals.contactGrand}</td>
            </tr>
            <tr className="contact-log-section">
              <th scope="row">Resource Provided</th>
              <td colSpan={totals.days + 1} />
            </tr>
            {RESOURCE_ROWS.map(row => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {dayHeaders.map(day => (
                  <td key={day} className={isCurrentMonth && day === today ? 'contact-log-today' : undefined}>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      inputMode="numeric"
                      aria-label={`${row.label}, ${MONTHS[month - 1]} ${day}`}
                      value={log.resources[row.key][day - 1] || ''}
                      onChange={e => setResource(row.key, day - 1, e.target.value)}
                    />
                  </td>
                ))}
                <td className="contact-log-total">{totals.resourceRowTotals[row.key]}</td>
              </tr>
            ))}
            <tr className="contact-log-sum">
              <th scope="row">Total resources</th>
              {dayHeaders.map(day => (
                <td key={day} className={isCurrentMonth && day === today ? 'contact-log-today' : undefined}>
                  {totals.resourceDayTotals[day - 1]}
                </td>
              ))}
              <td className="contact-log-total">{totals.resourceGrand}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {log.updatedAt ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last saved {new Date(log.updatedAt).toLocaleString()}
          {log.updatedByDisplay ? ` by ${log.updatedByDisplay}` : ''}.
        </p>
      ) : null}
    </section>
  );
}
