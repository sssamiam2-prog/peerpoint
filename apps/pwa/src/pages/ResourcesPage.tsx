import * as React from 'react';
import { VideoEmbed } from '../components/VideoEmbed';
import { BUILT_IN_GALLERY_VIDEOS } from '../data/builtInGalleryVideos';

type GalleryItem = {
  id: string;
  title: string;
  description?: string;
  kind: 'file' | 'link';
  fileName?: string;
  contentType?: string;
  size?: number;
  url?: string;
  downloadPath?: string;
  uploadedAt: string;
};

function formatBytes(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreviewInline(contentType?: string, fileName?: string): boolean {
  const ct = (contentType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (ct.startsWith('image/') || ct === 'application/pdf' || ct.startsWith('text/')) return true;
  if (/\.(pdf|png|jpe?g|gif|webp|txt|md)$/i.test(name)) return true;
  return false;
}

export function ResourcesPage(): React.ReactElement {
  const [items, setItems] = React.useState<GalleryItem[]>([]);
  const [error, setError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(true);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<void> => {
    setError(undefined);
    setLoading(true);
    try {
      const res = await fetch('/api/resources');
      const data = (await res.json().catch(() => ({}))) as { items?: GalleryItem[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not load gallery (${res.status})`);
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError('Could not reach Resource Gallery.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="page-shell-wide">
      <h2>Resource Gallery</h2>
      <p className="lede">
        Self-help videos and files shared by Peer Support. Viewing gallery items is not tracked as a help request.
      </p>

      <section className="resource-videos" aria-labelledby="resource-videos-title">
        <h3 id="resource-videos-title" className="resource-videos__title">
          Self-help videos
        </h3>
        <p className="resource-videos__note">
          Short, public education videos from the National Institute of Mental Health. They are not a substitute for 911,
          988, or Peer Support.
        </p>
        <div className="resource-videos__grid">
          {BUILT_IN_GALLERY_VIDEOS.map(video => (
            <article key={video.id} className="resource-video-card">
              <h4 className="resource-video-card__title">{video.title}</h4>
              <p className="resource-video-card__desc">{video.description}</p>
              <VideoEmbed url={video.videoUrl} title={video.title} />
              <p className="resource-video-card__source">Source: {video.sourceLabel}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="resource-files-head">
        <h3 className="resource-files-head__title">Files &amp; links</h3>
        <button type="button" className="btn-ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {error ? <p style={{ color: '#a4262c' }}>{error}</p> : null}
      {loading ? <p style={{ fontSize: 14 }}>Loading…</p> : null}
      {!loading && items.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text)' }}>No additional files published yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 12 }}>
          {items.map(item => {
            const viewHref =
              item.kind === 'link'
                ? item.url
                : item.downloadPath
                  ? `${item.downloadPath}`
                  : undefined;
            const downloadHref =
              item.kind === 'file' && item.downloadPath ? `${item.downloadPath}?download=1` : viewHref;
            const showPreview =
              previewId === item.id && item.kind === 'file' && canPreviewInline(item.contentType, item.fileName);

            return (
              <li
                key={item.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14,
                  background: 'var(--social-bg)'
                }}
              >
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                {item.description ? (
                  <p style={{ margin: '6px 0 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{item.description}</p>
                ) : null}
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {item.kind === 'file'
                    ? `${item.fileName || 'File'}${item.size != null ? ` · ${formatBytes(item.size)}` : ''}`
                    : 'External link'}
                  {' · '}
                  {new Date(item.uploadedAt).toLocaleString()}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {viewHref ? (
                    item.kind === 'link' ? (
                      <a className="btn-ghost" href={viewHref} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    ) : (
                      <>
                        {canPreviewInline(item.contentType, item.fileName) ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setPreviewId(previewId === item.id ? null : item.id)}
                          >
                            {previewId === item.id ? 'Hide preview' : 'View'}
                          </button>
                        ) : (
                          <a className="btn-ghost" href={viewHref} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        )}
                        {downloadHref ? (
                          <a className="btn-ghost" href={downloadHref} download={item.fileName}>
                            Download
                          </a>
                        ) : null}
                      </>
                    )
                  ) : null}
                </div>
                {showPreview && item.downloadPath ? (
                  <div style={{ marginTop: 12 }}>
                    {(item.contentType || '').startsWith('image/') ||
                    /\.(png|jpe?g|gif|webp)$/i.test(item.fileName || '') ? (
                      <img
                        src={item.downloadPath}
                        alt={item.title}
                        style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
                      />
                    ) : (
                      <iframe
                        title={item.title}
                        src={item.downloadPath}
                        style={{
                          width: '100%',
                          minHeight: 420,
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: '#fff'
                        }}
                      />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
