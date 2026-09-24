import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ModernBrandMark } from './ModernBrandMark';

export function ModernShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const { pathname } = useLocation();
  const showTopBrand = pathname !== '/' && pathname !== '/m' && !pathname.startsWith('/m/chat');
  const hideNav = /\/coloring\/[^/]+$/.test(pathname);

  return (
    <div className={`ui-modern${hideNav ? ' ui-modern--studio' : ''}`}>
      {showTopBrand ? (
        <div className="modern-shell-brand">
          <ModernBrandMark size="bar" />
        </div>
      ) : null}
      <main className="modern-main">{children}</main>
      {hideNav ? null : (
      <nav className="modern-nav" aria-label="Main navigation">
        <NavLink to="/" end>
          <span>⌂</span>Home
        </NavLink>
        <NavLink to="/m/resources">
          <span>✦</span>Resources
        </NavLink>
        <NavLink to="/m/check-ins">
          <span>♡</span>Check-ins
        </NavLink>
        <NavLink to="/m/more">
          <span>☰</span>More
        </NavLink>
      </nav>
      )}
    </div>
  );
}
