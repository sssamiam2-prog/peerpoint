import type { ReactElement } from 'react';
import type { ColoringFills } from './storage';
import type { ColoringPage } from './types';

type Props = {
  page: ColoringPage;
  fills: ColoringFills;
  onFillRegion?: (regionId: string) => void;
  className?: string;
  /** Line art over a paint canvas: unfilled regions are transparent. */
  overlay?: boolean;
};

export function ColoringSvg({ page, fills, onFillRegion, className, overlay }: Props): ReactElement {
  return (
    <svg
      className={className}
      viewBox={page.viewBox}
      role="img"
      aria-label={page.title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {overlay ? null : <rect width="100%" height="100%" fill="#ffffff" />}
      {page.regions.map(region => (
        <path
          key={region.id}
          d={region.d}
          fill={overlay ? 'none' : fills[region.id] || '#ffffff'}
          stroke="#1a1a1a"
          strokeWidth={page.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ cursor: onFillRegion ? 'pointer' : 'default' }}
          onClick={
            onFillRegion
              ? e => {
                  e.stopPropagation();
                  onFillRegion(region.id);
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
