import * as React from 'react';
import { VideoEmbed } from '../components/VideoEmbed';
import { BUILT_IN_SELF_HELP } from '../data/builtInSelfHelp';

type ApiArticle = {
  id: string;
  title: string;
  category: string;
  body: string;
  url?: string;
  videoUrl?: string;
  sortOrder: number;
  isPublished: boolean;
};

type DisplayItem = {
  id: string;
  title: string;
  category: string;
  body: string;
  url?: string;
  videoUrl?: string;
};

function fromBuiltin(): DisplayItem[] {
  return BUILT_IN_SELF_HELP.map(i => {
    const urlField = i.fields.Url;
    let url: string | undefined;
    if (typeof urlField === 'string') url = urlField;
    else if (urlField && typeof urlField === 'object') {
      url = String((urlField as { Url?: string }).Url ?? '') || undefined;
    }
    return {
      id: i.id,
      title: String(i.fields.Title ?? ''),
      category: String(i.fields.Category ?? ''),
      body: String(i.fields.Body ?? ''),
      url,
      videoUrl: i.fields.VideoUrl != null ? String(i.fields.VideoUrl) : undefined
    };
  });
}

export function SelfHelpPage(): React.ReactElement {
  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState<DisplayItem[]>(() => fromBuiltin());
  const [source, setSource] = React.useState<'builtin' | 'custom'>('builtin');
  const [loadError, setLoadError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/self-help');
        const data = (await res.json().catch(() => ({}))) as {
          useBuiltin?: boolean;
          items?: ApiArticle[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? 'Could not load Self Help from server; showing built-in articles.');
          return;
        }
        if (data.useBuiltin || !data.items?.length) {
          setItems(fromBuiltin());
          setSource('builtin');
          return;
        }
        setItems(
          data.items.map(a => ({
            id: a.id,
            title: a.title,
            category: a.category,
            body: a.body,
            url: a.url,
            videoUrl: a.videoUrl
          }))
        );
        setSource('custom');
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach Self Help API; showing built-in articles.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter(i => `${i.title} ${i.category} ${i.body} ${i.url ?? ''}`.toLowerCase().includes(query))
    : items;

  return (
    <div className="page-shell-wide">
      <h2>Self Help</h2>
      <p className="lede">
        Short articles and videos for sworn and civilian staff. Reading here does not create a help request.
      </p>
      {loadError ? <p style={{ color: '#a4262c', fontSize: 13 }}>{loadError}</p> : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search Self Help" />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
        Showing {source === 'custom' ? 'Admin-curated' : 'built-in'} articles ({filtered.length})
      </p>

      {filtered.length === 0 ? (
        <div style={{ marginTop: 12 }}>No items found.</div>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {filtered.map(i => (
            <article
              key={i.id}
              style={{ border: '1px solid var(--border, #eee)', borderRadius: 12, padding: 14, background: 'var(--social-bg, #fff)' }}
            >
              <h3 style={{ margin: 0, fontSize: 17 }}>{i.title}</h3>
              {i.category ? (
                <div style={{ color: 'var(--text-muted, #666)', marginTop: 4, fontSize: 13 }}>{i.category}</div>
              ) : null}
              {i.body ? (
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>{i.body}</div>
              ) : null}
              {i.videoUrl ? <VideoEmbed url={i.videoUrl} title={i.title} /> : null}
              {i.url ? (
                <div style={{ marginTop: 8 }}>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    Open related link
                  </a>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
