import * as React from 'react';
import { NavLink } from 'react-router-dom';

export function ModernShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="ui-modern">
      <main className="modern-main">{children}</main>
      <nav className="modern-nav" aria-label="Main navigation">
        <NavLink to="/" end><span>⌂</span>Home</NavLink>
        <NavLink to="/m/resources"><span>✦</span>Resources</NavLink>
        <NavLink to="/m/check-ins"><span>♡</span>Check-ins</NavLink>
        <NavLink to="/m/more"><span>☰</span>More</NavLink>
      </nav>
    </div>
  );
}
