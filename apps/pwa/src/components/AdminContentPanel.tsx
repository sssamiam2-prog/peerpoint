import * as React from 'react';
import { useActionFeedback, type SuccessToast } from './ActionFeedback';
import { VideoEmbed } from './VideoEmbed';
import { BUILT_IN_SELF_HELP } from '../data/builtInSelfHelp';

export type ContentAuthHeaders = HeadersInit;

type SelfHelpArticle = {
  id: string;
  title: string;
  category: string;
  body: string;
  url?: string;
  videoUrl?: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

type GalleryResource = {
  id: string;
  title: string;
  description?: string;
  kind: 'file' | 'link';
  fileName?: string;
  contentType?: string;
  size?: number;
  url?: string;
  uploadedAt: string;
  uploadedByDisplay?: string;
};

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function builtinAsArticles(): SelfHelpArticle[] {
  return BUILT_IN_SELF_HELP.map((i, idx) => {
    const urlField = i.fields.Url;
    let url: string | undefined;
    if (typeof urlField === 'string') url = urlField;
    else if (urlField && typeof urlField === 'object') {
      url = String((urlField as { Url?: string }).Url ?? '') || undefined;
    }
    return {
      id: i.id,
      title: String(i.fields.Title ?? ''),
      category: String(i.fields.Category ?? 'General'),
      body: String(i.fields.Body ?? ''),
      url,
      videoUrl: i.fields.VideoUrl != null ? String(i.fields.VideoUrl) : undefined,
      sortOrder: Number(i.fields.SortOrder) || (idx + 1) * 10,
      isPublished: i.fields.IsPublished !== false
    };
  });
}

function emptyArticle(): SelfHelpArticle {
  return {
    id: newLocalId(),
    title: '',
    category: 'General',
    body: '',
    url: '',
    videoUrl: '',
    sortOrder: 100,
    isPublished: true
  };
}

type Props = {
  authHeaders: () => HeadersInit;
};

export function AdminContentPanel(props: Props): React.ReactElement {
  const { runAction } = useActionFeedback();
  const [articles, setArticles] = React.useState<SelfHelpArticle[]>([]);
  const [customized, setCustomized] = React.useState(false);
  const [editing, setEditing] = React.useState<SelfHelpArticle | null>(null);
  const [resources, setResources] = React.useState<GalleryResource[]>([]);
  const [maxBytes, setMaxBytes] = React.useState(8 * 1024 * 1024);
  const [error, setError] = React.useState<string | undefined>();
  const [resTitle, setResTitle] = React.useState('');
  const [resDesc, setResDesc] = React.useState('');
  const [resUrl, setResUrl] = React.useState('');
  const [resFile, setResFile] = React.useState<File | null>(null);

  const loadSelfHelp = React.useCallback(async (): Promise<void> => {
    const res = await fetch('/api/staff/self-help', { headers: props.authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      items?: SelfHelpArticle[];
      customized?: boolean;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? `Could not load Self Help (${res.status})`);
      return;
    }
    const items = data.items ?? [];
    if (items.length === 0) {
      setArticles(builtinAsArticles());
      setCustomized(false);
    } else {
      setArticles(items);
      setCustomized(true);
    }
  }, [props]);

  const loadResources = React.useCallback(async (): Promise<void> => {
    const res = await fetch('/api/staff/resources', { headers: props.authHeaders() });
    const data = (await res.json().catch(() => ({}))) as {
      items?: GalleryResource[];
      maxBytes?: number;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? `Could not load resources (${res.status})`);
      return;
    }
    setResources(data.items ?? []);
    if (data.maxBytes) setMaxBytes(data.maxBytes);
  }, [props]);

  React.useEffect(() => {
    void loadSelfHelp();
    void loadResources();
  }, [loadSelfHelp, loadResources]);

  const saveArticle = async (): Promise<void> => {
    if (!editing) return;
    setError(undefined);
    if (!editing.title.trim()) {
      setError('Article title is required.');
      return;
    }
    await runAction('Saving Self Help article…', async (): Promise<SuccessToast | null> => {
      const item = {
        ...editing,
        title: editing.title.trim(),
        category: editing.category.trim() || 'General',
        url: editing.url?.trim() || undefined,
        videoUrl: editing.videoUrl?.trim() || undefined
      };
      // First edit from built-in starter: publish the full list so members don't lose other articles.
      const body = !customized
        ? {
            replaceAll: true,
            items: (() => {
              const next = [...articles];
              const idx = next.findIndex(a => a.id === item.id);
              if (idx >= 0) next[idx] = item;
              else next.push(item);
              return next;
            })()
          }
        : { upsert: true, item };
      const res = await fetch('/api/staff/self-help', {
        method: 'PATCH',
        headers: props.authHeaders(),
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: SelfHelpArticle[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Save failed.');
        return null;
      }
      setArticles(data.items ?? []);
      setCustomized(true);
      setEditing(null);
      return { title: 'Self Help saved', message: 'Article is live for members.' };
    }, toast => toast ?? undefined);
  };

  const removeArticle = async (id: string): Promise<void> => {
    setError(undefined);
    await runAction('Removing article…', async (): Promise<SuccessToast | null> => {
      // If still on builtin starter (not customized), save all except removed first via replaceAll
      if (!customized) {
        const next = articles.filter(a => a.id !== id);
        const res = await fetch('/api/staff/self-help', {
          method: 'PATCH',
          headers: props.authHeaders(),
          body: JSON.stringify({ replaceAll: true, items: next })
        });
        const data = (await res.json().catch(() => ({}))) as { items?: SelfHelpArticle[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Remove failed.');
          return null;
        }
        setArticles(data.items ?? next);
        setCustomized(true);
        return { title: 'Article removed' };
      }
      const res = await fetch('/api/staff/self-help', {
        method: 'PATCH',
        headers: props.authHeaders(),
        body: JSON.stringify({ remove: true, id })
      });
      const data = (await res.json().catch(() => ({}))) as { items?: SelfHelpArticle[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Remove failed.');
        return null;
      }
      setArticles(data.items ?? []);
      setCustomized((data.items ?? []).length > 0);
      return { title: 'Article removed' };
    }, toast => toast ?? undefined);
  };

  const publishBuiltinStarter = async (): Promise<void> => {
    setError(undefined);
    await runAction('Publishing built-in Self Help…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/self-help', {
        method: 'PATCH',
        headers: props.authHeaders(),
        body: JSON.stringify({ replaceAll: true, items: articles })
      });
      const data = (await res.json().catch(() => ({}))) as { items?: SelfHelpArticle[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Publish failed.');
        return null;
      }
      setArticles(data.items ?? articles);
      setCustomized(true);
      return { title: 'Self Help published', message: 'Members now see this curated catalog.' };
    }, toast => toast ?? undefined);
  };

  const resetBuiltin = async (): Promise<void> => {
    if (!window.confirm('Reset Self Help to the built-in articles? Custom edits will be cleared.')) return;
    setError(undefined);
    await runAction('Resetting Self Help…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/self-help', {
        method: 'PATCH',
        headers: props.authHeaders(),
        body: JSON.stringify({ resetBuiltin: true })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Reset failed.');
        return null;
      }
      setArticles(builtinAsArticles());
      setCustomized(false);
      setEditing(null);
      return { title: 'Self Help reset', message: 'Members see built-in articles again.' };
    }, toast => toast ?? undefined);
  };

  const uploadResource = async (): Promise<void> => {
    setError(undefined);
    if (!resTitle.trim()) {
      setError('Resource title is required.');
      return;
    }
    if (!resFile && !resUrl.trim()) {
      setError('Choose a file to upload or paste a link.');
      return;
    }
    await runAction('Uploading resource…', async (): Promise<SuccessToast | null> => {
      let res: Response;
      if (resFile) {
        const form = new FormData();
        form.append('title', resTitle.trim());
        if (resDesc.trim()) form.append('description', resDesc.trim());
        form.append('file', resFile);
        const headers = { ...props.authHeaders() } as Record<string, string>;
        delete headers['Content-Type'];
        res = await fetch('/api/staff/resources', { method: 'POST', headers, body: form });
      } else {
        res = await fetch('/api/staff/resources', {
          method: 'POST',
          headers: props.authHeaders(),
          body: JSON.stringify({
            title: resTitle.trim(),
            description: resDesc.trim() || undefined,
            url: resUrl.trim()
          })
        });
      }
      const data = (await res.json().catch(() => ({}))) as {
        items?: GalleryResource[];
        maxBytes?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Upload failed.');
        return null;
      }
      setResources(data.items ?? []);
      if (data.maxBytes) setMaxBytes(data.maxBytes);
      setResTitle('');
      setResDesc('');
      setResUrl('');
      setResFile(null);
      return { title: 'Resource added', message: 'It is available in the Resource Gallery.' };
    }, toast => toast ?? undefined);
  };

  const deleteResource = async (id: string): Promise<void> => {
    if (!window.confirm('Remove this resource from the gallery?')) return;
    setError(undefined);
    await runAction('Removing resource…', async (): Promise<SuccessToast | null> => {
      const res = await fetch('/api/staff/resources', {
        method: 'DELETE',
        headers: props.authHeaders(),
        body: JSON.stringify({ id })
      });
      const data = (await res.json().catch(() => ({}))) as { items?: GalleryResource[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Delete failed.');
        return null;
      }
      setResources(data.items ?? []);
      return { title: 'Resource removed' };
    }, toast => toast ?? undefined);
  };

  return (
    <section className="staff-tab-panel" role="tabpanel" id="panel-content" aria-labelledby="tab-content">
      <h3 style={{ marginTop: 0 }}>Content</h3>
      <p style={{ fontSize: 14, color: 'var(--text)' }}>
        Edit Self Help articles (including embedded video links) and manage the Resource Gallery members can view or
        download.
      </p>
      {error ? <p style={{ color: '#a4262c' }}>{error}</p> : null}

      <h4 style={{ marginTop: 24 }}>Self Help</h4>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {customized
          ? 'Members are viewing your curated catalog.'
          : 'Showing built-in starter articles (not yet saved). Edit and publish, or add a new article to take over the catalog.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setEditing(emptyArticle())}>
          Add article
        </button>
        {!customized ? (
          <button type="button" className="btn-ghost" onClick={() => void publishBuiltinStarter()}>
            Publish current list
          </button>
        ) : null}
        <button type="button" className="btn-ghost" onClick={() => void resetBuiltin()}>
          Reset to built-in
        </button>
        <button type="button" className="btn-ghost" onClick={() => void loadSelfHelp()}>
          Refresh
        </button>
      </div>

      {editing ? (
        <div
          style={{
            border: '2px solid var(--primary)',
            borderRadius: 14,
            padding: 14,
            display: 'grid',
            gap: 10,
            marginBottom: 16,
            maxWidth: 640
          }}
        >
          <h4 style={{ margin: 0 }}>{editing.id.startsWith('local-') ? 'New article' : 'Edit article'}</h4>
          <label style={{ fontWeight: 600 }}>
            Title
            <input
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              required
            />
          </label>
          <label style={{ fontWeight: 600 }}>
            Category
            <input
              value={editing.category}
              onChange={e => setEditing({ ...editing, category: e.target.value })}
            />
          </label>
          <label style={{ fontWeight: 600 }}>
            Body
            <textarea
              rows={8}
              value={editing.body}
              onChange={e => setEditing({ ...editing, body: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>
          <label style={{ fontWeight: 600 }}>
            Related link (optional)
            <input
              value={editing.url ?? ''}
              onChange={e => setEditing({ ...editing, url: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label style={{ fontWeight: 600 }}>
            Embed video link (YouTube, Vimeo, or .mp4)
            <input
              value={editing.videoUrl ?? ''}
              onChange={e => setEditing({ ...editing, videoUrl: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          {editing.videoUrl?.trim() ? <VideoEmbed url={editing.videoUrl.trim()} title={editing.title} /> : null}
          <label style={{ fontWeight: 600 }}>
            Sort order
            <input
              type="number"
              value={editing.sortOrder}
              onChange={e => setEditing({ ...editing, sortOrder: Number(e.target.value) || 0 })}
            />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={editing.isPublished}
              onChange={e => setEditing({ ...editing, isPublished: e.target.checked })}
            />
            Published (visible to members)
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void saveArticle()}>
              Save article
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {articles.map(a => (
          <li
            key={a.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 10,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              background: 'var(--social-bg)'
            }}
          >
            <div>
              <strong>{a.title}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {a.category}
                {a.isPublished ? '' : ' · unpublished'}
                {a.videoUrl ? ' · has video' : ''}
                {' · sort '}
                {a.sortOrder}
              </div>
            </div>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn-ghost" onClick={() => setEditing({ ...a })}>
                Edit
              </button>
              <button type="button" className="btn-ghost" onClick={() => void removeArticle(a.id)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h4 style={{ marginTop: 32 }}>Resource Gallery</h4>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Upload files for members to view/download (max {Math.floor(maxBytes / (1024 * 1024))} MB each), or add an
        external link.
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          void uploadResource();
        }}
        style={{
          display: 'grid',
          gap: 10,
          maxWidth: 560,
          padding: 14,
          borderRadius: 14,
          border: '2px solid var(--primary)',
          background: 'var(--bg)',
          marginBottom: 16
        }}
      >
        <label style={{ fontWeight: 600 }}>
          Title
          <input value={resTitle} onChange={e => setResTitle(e.target.value)} required />
        </label>
        <label style={{ fontWeight: 600 }}>
          Description (optional)
          <textarea rows={3} value={resDesc} onChange={e => setResDesc(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ fontWeight: 600 }}>
          Upload file
          <input
            type="file"
            onChange={e => {
              setResFile(e.target.files?.[0] ?? null);
              if (e.target.files?.[0]) setResUrl('');
            }}
          />
        </label>
        <label style={{ fontWeight: 600 }}>
          Or external link
          <input
            value={resUrl}
            onChange={e => {
              setResUrl(e.target.value);
              if (e.target.value) setResFile(null);
            }}
            placeholder="https://…"
          />
        </label>
        <button type="submit">Add to gallery</button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {resources.length === 0 ? (
          <li style={{ fontSize: 14, color: 'var(--text)' }}>No gallery resources yet.</li>
        ) : (
          resources.map(r => (
            <li
              key={r.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
                background: 'var(--social-bg)'
              }}
            >
              <div>
                <strong>{r.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {r.kind === 'file' ? r.fileName || 'File' : r.url || 'Link'}
                  {' · '}
                  {new Date(r.uploadedAt).toLocaleString()}
                </div>
              </div>
              <button type="button" className="btn-ghost" onClick={() => void deleteResource(r.id)}>
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
