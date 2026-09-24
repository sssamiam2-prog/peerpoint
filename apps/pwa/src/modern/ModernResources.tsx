import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { ColoringGallery } from '../coloring/ColoringGallery';
import { VideoEmbed } from '../components/VideoEmbed';
import { BUILT_IN_GALLERY_VIDEOS } from '../data/builtInGalleryVideos';
import { ModernBackButton } from './ModernBackButton';

type ResourceTab = 'helplines' | 'videos' | 'coloring';

function tabFromHash(hash: string): ResourceTab {
  if (hash === '#videos') return 'videos';
  if (hash === '#coloring') return 'coloring';
  return 'helplines';
}

export function ModernResources(): React.ReactElement {
  const location = useLocation();
  const [tab, setTab] = React.useState<ResourceTab>(() => tabFromHash(location.hash));

  React.useEffect(() => {
    setTab(tabFromHash(location.hash));
  }, [location.hash]);

  React.useEffect(() => {
    if (tab !== 'helplines' || location.hash !== '#crisis') return;
    const el = document.getElementById('crisis');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tab, location.hash]);

  return (
    <section className="modern-page modern-resources">
      <ModernBackButton to="/" label="Home" />
      <p className="modern-eyebrow">PEERPOINT</p>
      <h1>Resources</h1>

      <div className="modern-tabs modern-tabs--3" role="tablist" aria-label="Resource sections">
        <button
          type="button"
          role="tab"
          id="tab-helplines"
          aria-selected={tab === 'helplines'}
          aria-controls="panel-helplines"
          className={tab === 'helplines' ? 'modern-tab active' : 'modern-tab'}
          onClick={() => {
            setTab('helplines');
            window.history.replaceState(null, '', '#helplines');
          }}
        >
          Helplines
        </button>
        <button
          type="button"
          role="tab"
          id="tab-videos"
          aria-selected={tab === 'videos'}
          aria-controls="panel-videos"
          className={tab === 'videos' ? 'modern-tab active' : 'modern-tab'}
          onClick={() => {
            setTab('videos');
            window.history.replaceState(null, '', '#videos');
          }}
        >
          Videos
        </button>
        <button
          type="button"
          role="tab"
          id="tab-coloring"
          aria-selected={tab === 'coloring'}
          aria-controls="panel-coloring"
          className={tab === 'coloring' ? 'modern-tab active' : 'modern-tab'}
          onClick={() => {
            setTab('coloring');
            window.history.replaceState(null, '', '#coloring');
          }}
        >
          Coloring
        </button>
      </div>

      {tab === 'helplines' ? (
        <div role="tabpanel" id="panel-helplines" aria-labelledby="tab-helplines">
          <article id="crisis" className="modern-crisis-resource">
            <h2>In crisis or immediate danger?</h2>
            <p>
              Call 911 for emergency help. Call or text <a href="tel:988">988</a> for the Suicide &amp; Crisis
              Lifeline.
            </p>
          </article>
          <div className="modern-resource-list">
            <a href="https://www.samhsa.gov/find-help/national-helpline" target="_blank" rel="noreferrer">
              <b>SAMHSA National Helpline</b>
              <span>Free, confidential treatment referral and information.</span>
            </a>
            <a href="https://www.211.org/" target="_blank" rel="noreferrer">
              <b>211 Community Resources</b>
              <span>Find local support, housing, food, and more.</span>
            </a>
            <a href="https://www.veteranscrisisline.net/" target="_blank" rel="noreferrer">
              <b>Veterans Crisis Line</b>
              <span>Support for veterans and those who care about them.</span>
            </a>
          </div>
        </div>
      ) : null}

      {tab === 'videos' ? (
        <div role="tabpanel" id="panel-videos" aria-labelledby="tab-videos" className="modern-videos">
          <p className="modern-choice-lead">
            Short public education videos from NIMH. They are not a substitute for 911, 988, or Peer Support.
          </p>
          <div className="modern-video-grid">
            {BUILT_IN_GALLERY_VIDEOS.map(video => (
              <article key={video.id} className="modern-video-card">
                <h2>{video.title}</h2>
                <p>{video.description}</p>
                <VideoEmbed url={video.videoUrl} title={video.title} />
                <span className="modern-muted">Source: {video.sourceLabel}</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'coloring' ? (
        <div role="tabpanel" id="panel-coloring" aria-labelledby="tab-coloring">
          <ColoringGallery variant="modern" colorPath={id => `/m/coloring/${id}`} />
        </div>
      ) : null}
    </section>
  );
}
