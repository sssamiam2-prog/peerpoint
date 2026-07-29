import * as React from 'react';
import { isDirectVideoUrl, toVideoEmbedSrc } from '../lib/videoEmbed';

export function VideoEmbed(props: { url: string; title?: string }): React.ReactElement | null {
  const src = toVideoEmbedSrc(props.url);
  if (!src) {
    return (
      <p style={{ marginTop: 8, fontSize: 14 }}>
        <a href={props.url} target="_blank" rel="noreferrer">
          Open video link
        </a>
      </p>
    );
  }

  if (isDirectVideoUrl(props.url) || isDirectVideoUrl(src)) {
    return (
      <video
        controls
        playsInline
        src={src}
        title={props.title || 'Video'}
        style={{ width: '100%', maxHeight: 360, marginTop: 10, borderRadius: 10, background: '#000' }}
      />
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        paddingBottom: '56.25%',
        height: 0,
        marginTop: 10,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#111'
      }}
    >
      <iframe
        src={src}
        title={props.title || 'Embedded video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}
