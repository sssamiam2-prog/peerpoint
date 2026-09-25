import * as React from 'react';

export function PeerSupportHelpTypesAdmin(props: { authHeaders: () => HeadersInit }): React.ReactElement {
  const [options, setOptions] = React.useState<string[]>([]);
  const [newOption, setNewOption] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();
  const [info, setInfo] = React.useState<string | undefined>();

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await fetch('/api/staff/peer-support-help-types', { headers: props.authHeaders() });
      const data = (await res.json().catch(() => ({}))) as { helpTypes?: string[]; error?: string };
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? `Could not load options (${res.status})`);
        return;
      }
      setOptions(data.helpTypes ?? []);
    })();
  }, [props]);

  function moveOption(index: number, delta: number): void {
    setOptions(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
    setInfo(undefined);
  }

  function removeOption(index: number): void {
    setOptions(prev => prev.filter((_, i) => i !== index));
    setInfo(undefined);
  }

  function addOption(): void {
    const label = newOption.trim();
    if (!label) return;
    setOptions(prev => (prev.some(o => o.toLowerCase() === label.toLowerCase()) ? prev : [...prev, label]));
    setNewOption('');
    setInfo(undefined);
  }

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    const res = await fetch('/api/staff/peer-support-help-types', {
      method: 'PUT',
      headers: props.authHeaders(),
      body: JSON.stringify({ helpTypes: options })
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; helpTypes?: string[] };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? `Save failed (${res.status})`);
      return;
    }
    setOptions(data.helpTypes ?? options);
    setInfo('Resources / Referrals list saved. Staff see this order in the Event Logger dropdown.');
  }

  return (
    <section className="event-logger-help-types">
      <h4 style={{ margin: '0 0 8px' }}>Event Logger — Resources / Referrals</h4>
      <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 0 }}>
        Add dropdown options and use the arrows to set the order staff see on the Event Logger form (field 6 of 7).
      </p>
      {loading ? <p style={{ fontSize: 14 }}>Loading…</p> : null}
      {error ? <div style={{ color: '#a4262c' }}>{error}</div> : null}
      {info ? <div style={{ color: 'var(--accent, #0f6a4a)' }}>{info}</div> : null}

      <ul className="help-types-admin-list" aria-label="Resources and referrals options">
        {options.length === 0 ? (
          <li className="help-types-admin-list__empty">No options yet. Add one below.</li>
        ) : (
          options.map((label, index) => (
            <li key={`${label}-${index}`} className="help-types-admin-list__row">
              <span className="help-types-admin-list__label">{label}</span>
              <span className="help-types-admin-list__actions">
                <button
                  type="button"
                  className="btn-ghost help-types-admin-list__btn"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => moveOption(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost help-types-admin-list__btn"
                  aria-label={`Move ${label} down`}
                  disabled={index === options.length - 1}
                  onClick={() => moveOption(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn-ghost help-types-admin-list__btn help-types-admin-list__btn--remove"
                  aria-label={`Remove ${label}`}
                  onClick={() => removeOption(index)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))
        )}
      </ul>

      <form
        onSubmit={e => {
          e.preventDefault();
          addOption();
        }}
        className="help-types-admin-add"
      >
        <label>
          Add option
          <input
            value={newOption}
            onChange={ev => setNewOption(ev.target.value)}
            placeholder="e.g. EAP referral"
            maxLength={120}
          />
        </label>
        <button type="submit" className="btn-ghost" disabled={!newOption.trim()}>
          Add to list
        </button>
      </form>

      <form onSubmit={e => void onSave(e)} style={{ marginTop: 16 }}>
        <button type="submit" disabled={busy || loading}>
          {busy ? 'Saving…' : 'Save Resources / Referrals'}
        </button>
      </form>
    </section>
  );
}
