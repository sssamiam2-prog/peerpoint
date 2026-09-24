import * as React from 'react';
import { Link } from 'react-router-dom';
import { ColoringSvg } from './ColoringSvg';
import { downloadColoringSvg, printColoringPage } from './exportPage';
import { COLORING_CATEGORIES, COLORING_PAGES } from './pages';
import { COLORING_RESEARCH_CITATIONS, COLORING_RESEARCH_SUMMARY } from './research';
import { coloringHasProgress, loadColoringFills } from './storage';
import type { ColoringCategory } from './types';

type Props = {
  variant: 'modern' | 'classic';
  colorPath: (pageId: string) => string;
};

export function ColoringGallery({ variant, colorPath }: Props): React.ReactElement {
  const [filter, setFilter] = React.useState<ColoringCategory | 'all'>('all');
  const pages = COLORING_PAGES.filter(p => filter === 'all' || p.category === filter);

  return (
    <div className={`coloring-gallery coloring-gallery--${variant}`}>
      <p className="coloring-lead">
        These pages follow what the research actually supports: structured adult designs (mandalas, geometric/plaid
        patterns, and nature), colored at your own pace, with no score and no wrong way.
      </p>
      <details className="coloring-research">
        <summary>Why this can help with stress and anxiety</summary>
        {COLORING_RESEARCH_SUMMARY.map(paragraph => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
        <p className="coloring-research__label">Selected research</p>
        <ul>
          {COLORING_RESEARCH_CITATIONS.map(item => (
            <li key={item.label}>
              {item.href ? (
                <a href={item.href} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ) : (
                item.label
              )}
            </li>
          ))}
        </ul>
        <p className="coloring-note">
          Coloring is a self-help activity, not treatment. It is not a substitute for 911, 988, or Peer Support.
        </p>
      </details>
      <p className="coloring-note">Progress stays on this device.</p>
      <div className="coloring-filters" role="group" aria-label="Page type">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {COLORING_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={filter === cat.id ? 'active' : ''}
            onClick={() => setFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="coloring-grid">
        {pages.map(page => {
          const inProgress = coloringHasProgress(page.id);
          return (
            <article key={page.id} className="coloring-card">
              <div className="coloring-card__preview" aria-hidden="true">
                <ColoringSvg page={page} fills={{}} />
              </div>
              <h2>{page.title}</h2>
              <p>{page.description}</p>
              {inProgress ? <span className="coloring-progress">In progress on this device</span> : null}
              <div className="coloring-card__actions">
                <Link className="coloring-btn coloring-btn--primary" to={colorPath(page.id)}>
                  Color in app
                </Link>
                <button
                  type="button"
                  className="coloring-btn"
                  onClick={() => printColoringPage(page, loadColoringFills(page.id), true)}
                >
                  Print blank
                </button>
                <button
                  type="button"
                  className="coloring-btn"
                  onClick={() => downloadColoringSvg(page, {}, true)}
                >
                  Download
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
