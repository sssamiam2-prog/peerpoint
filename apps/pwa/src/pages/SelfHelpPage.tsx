import * as React from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { BUILT_IN_SELF_HELP_GRAPH } from '../data/builtInSelfHelp';
import { getSelfHelp, writeAudit } from '../graph/sharepointLists';

export function SelfHelpPage(): React.ReactElement {
  const { instance } = useMsal();
  const authed = useIsAuthenticated();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [items, setItems] = React.useState<Array<{ id: string; fields: Record<string, unknown> }>>([]);
  const [q, setQ] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await getSelfHelp(instance);
      setItems(data);
      await writeAudit(instance, 'SelfHelpViewed');
    } catch (e: unknown) {
      setItems(BUILT_IN_SELF_HELP_GRAPH);
      setError(e instanceof Error ? e.message : 'Unknown error loading self help.');
    } finally {
      setLoading(false);
    }
  }, [instance]);

  React.useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter(i => JSON.stringify(i.fields).toLowerCase().includes(query))
    : items;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Self Help</h2>
      <p style={{ margin: '0 0 12px', color: '#5c6e66', lineHeight: 1.5 }}>
        Includes topics for <strong>sworn law enforcement</strong> and <strong>civilian staff at law enforcement agencies</strong>.
        Your agency can add items in the SharePoint <em>SelfHelpContent</em> list.
      </p>
      {!authed ? (
        <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8 }}>Sign in to view self help materials.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
            <button onClick={load} disabled={loading}>Refresh</button>
          </div>

          {error && <div style={{ marginTop: 12, color: '#a4262c', whiteSpace: 'pre-wrap' }}>{error}</div>}
          {loading ? (
            <div style={{ marginTop: 12 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ marginTop: 12 }}>No items found.</div>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              {filtered.map(i => (
                <div key={i.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>{String(i.fields.Title ?? '')}</div>
                  {i.fields.Category != null && <div style={{ color: '#666', marginTop: 4 }}>{String(i.fields.Category)}</div>}
                  {i.fields.Body != null && <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{String(i.fields.Body)}</div>}
                  {i.fields.Url != null && (
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={
                          typeof i.fields.Url === 'string'
                            ? i.fields.Url
                            : String((i.fields.Url as { Url?: string }).Url ?? i.fields.Url)
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {typeof i.fields.Url === 'string'
                          ? i.fields.Url
                          : String((i.fields.Url as { Description?: string }).Description ?? (i.fields.Url as { Url?: string }).Url ?? 'Link')}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

