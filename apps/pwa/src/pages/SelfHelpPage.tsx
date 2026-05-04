import * as React from 'react';
import { BUILT_IN_SELF_HELP } from '../data/builtInSelfHelp';

export function SelfHelpPage(): React.ReactElement {
  const [q, setQ] = React.useState('');

  const query = q.trim().toLowerCase();
  const filtered = query
    ? BUILT_IN_SELF_HELP.filter(i => JSON.stringify(i.fields).toLowerCase().includes(query))
    : BUILT_IN_SELF_HELP;

  return (
    <div className="page-shell-wide">
      <h2>Self Help</h2>
      <p style={{ margin: '0 0 12px', color: '#5c6e66', lineHeight: 1.5 }}>
        Includes topics for <strong>sworn law enforcement</strong> and <strong>civilian staff at law enforcement agencies</strong>.
        This build uses built-in articles only (no sign-in, no cloud list).
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
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
                      : String(
                          (i.fields.Url as { Description?: string }).Description ??
                            (i.fields.Url as { Url?: string }).Url ??
                            'Link'
                        )}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
