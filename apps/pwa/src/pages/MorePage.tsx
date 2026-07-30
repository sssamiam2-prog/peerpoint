import * as React from 'react';
import { Link } from 'react-router-dom';
import { InstallAppButton } from '../components/InstallAppButton';
import { isStandaloneDisplay } from '../lib/pwaInstall';
import { setUiMode } from '../lib/uiMode';

/** Secondary destinations kept out of the main crisis nav. */
export function MorePage(): React.ReactElement {
  const installed = isStandaloneDisplay();

  return (
    <div className="page-shell more-page">
      <h2 className="more-page__title">More</h2>
      <p className="more-page__lede">
        {installed
          ? 'Room codes, Staff & Admin sign-in, and app settings.'
          : 'Room codes, Staff & Admin tools, and install PEERPoint on this device.'}
      </p>

      <nav className="more-page__list" aria-label="More options">
        <Link to="/chat" className="more-page__link">
          <span className="more-page__link-label">Peer chat</span>
          <span className="more-page__link-hint">Enter a room code to text with a peer</span>
        </Link>
        <Link to="/voice" className="more-page__link">
          <span className="more-page__link-label">Peer voice</span>
          <span className="more-page__link-hint">Enter a room code for a voice call</span>
        </Link>
        <Link to="/staff" className="more-page__link more-page__link--staff">
          <span className="more-page__link-label">Staff &amp; Admin login</span>
          <span className="more-page__link-hint">
            Staff sign-in first — Admin login is available on that screen (works in the Windows installed app)
          </span>
        </Link>
      </nav>

      <section className="more-page__install" aria-labelledby="ui-mode-heading">
        <h3 id="ui-mode-heading">Interface</h3>
        <p className="more-page__install-note">Try the new PEERPoint experience with session-based peer support.</p>
        <button type="button" className="btn-ghost" onClick={() => setUiMode('modern')}>
          Use Modern UI
        </button>
      </section>

      <div className="more-page__install">
        <InstallAppButton />
        {!installed ? (
          <p className="more-page__install-note">
            On Windows: use Edge or Chrome → <strong>Install PEERPoint</strong> / Add to desktop, then open Staff &amp;
            Admin login from More.
          </p>
        ) : null}
      </div>

      <p className="more-page__privacy">
        PEERPoint does not keep or record your chat or voice. The access code identifies the SLCO Sheriff’s Office, not
        you.
      </p>
    </div>
  );
}
