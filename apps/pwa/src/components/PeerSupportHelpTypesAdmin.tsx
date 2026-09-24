import * as React from 'react';

export function PeerSupportHelpTypesAdmin(props: { authHeaders: () => HeadersInit }): React.ReactElement {
  const [lines, setLines] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [info, setInfo] = React.useState<string | undefined>();

  React.useEffect(() => {
    void (async () => {
      const res = await fetch('/api/staff/peer-support-help-types', { headers: props.authHeaders() });
      const data = (await res.json().catch(() => ({}))) as { helpTypes?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not load help types (${res.status})`);
        return;
      }
      setLines((data.helpTypes ?? []).join('\n'));
    })();
  }, [props]);

  async function onSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    const helpTypes = lines
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const res = await fetch('/api/staff/peer-support-help-types', {
      method: 'PUT',
      headers: props.authHeaders(),
      body: JSON.stringify({ helpTypes })
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; helpTypes?: string[] };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? `Save failed (${res.status})`);
      return;
    }
    setLines((data.helpTypes ?? helpTypes).join('\n'));
    setInfo('Help types updated. Staff event forms will use this list on next load.');
  }

  return (
    <section style={{ marginTop: 24, maxWidth: 560 }}>
      <h4 style={{ margin: '0 0 8px' }}>Peer Support Event — types of help</h4>
      <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 0 }}>
        One option per line. These appear in the staff Event Logger dropdown.
      </p>
      {error ? <div style={{ color: '#a4262c' }}>{error}</div> : null}
      {info ? <div style={{ color: 'var(--accent, #0f6a4a)' }}>{info}</div> : null}
      <form onSubmit={e => void onSave(e)} style={{ display: 'grid', gap: 10 }}>
        <textarea
          rows={8}
          value={lines}
          onChange={ev => setLines(ev.target.value)}
          aria-label="Types of help, one per line"
          style={{ width: '100%', fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save help types'}
        </button>
      </form>
    </section>
  );
}
