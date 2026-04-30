import * as React from 'react';

/**
 * Normalized path after `#/` (e.g. `self-help`, `request`, `request/new`).
 * Empty hash defaults to `request` (Request Help landing, not the form).
 */
export function readHashRoute(): string {
  const h = window.location.hash || '';
  const raw = h.replace(/^#/, '').replace(/^\//, '').split('?')[0].toLowerCase().trim();
  if (!raw) {
    return 'request';
  }
  return raw;
}

export function useHashRoute(): string {
  const [route, setRoute] = React.useState(readHashRoute);

  React.useEffect(() => {
    const onHashChange = (): void => {
      setRoute(readHashRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
