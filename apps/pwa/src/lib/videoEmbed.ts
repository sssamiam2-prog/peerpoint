/** Convert common video share URLs into embeddable iframe src values. */

export function toVideoEmbedSrc(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname.startsWith('/embed/')) {
      return `https://www.youtube.com${url.pathname}${url.search}`;
    }
    const v = url.searchParams.get('v');
    if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' && parts[1]) {
      return `https://www.youtube.com/embed/${encodeURIComponent(parts[1])}`;
    }
    if (parts[0] === 'live' && parts[1]) {
      return `https://www.youtube.com/embed/${encodeURIComponent(parts[1])}`;
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    if (host === 'player.vimeo.com' && url.pathname.startsWith('/video/')) {
      return `https://player.vimeo.com${url.pathname}`;
    }
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }

  // Direct media URL — use as video src (not iframe).
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url.pathname)) {
    return input;
  }

  return null;
}

export function isDirectVideoUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return /\.(mp4|webm|ogg)(\?|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}
