import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InstallAppButton } from '../components/InstallAppButton';
import { setUiMode } from '../lib/uiMode';
import { ModernBackButton } from './ModernBackButton';

export function ModernMore(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <section className="modern-page modern-more">
      <ModernBackButton to="/" label="Home" />
      <p className="modern-eyebrow">PEERPOINT</p>
      <h1>More</h1>
      <div className="modern-settings">
        <div>
          <b>Appearance</b>
          <span>Modern interface</span>
          <button
            type="button"
            onClick={() => {
              setUiMode('classic');
              navigate('/more');
            }}
          >
            Use classic UI
          </button>
        </div>
        <Link to="/m/staff">
          <b>Staff sign-in</b>
          <span>View and respond to support requests</span>
        </Link>
        <div>
          <b>Install PEERPoint</b>
          <InstallAppButton />
        </div>
      </div>
    </section>
  );
}
