import * as React from 'react';
import { Link } from 'react-router-dom';
import { InstallAppButton } from '../components/InstallAppButton';

/** Secondary destinations kept out of the main crisis nav. */
export function MorePage(): React.ReactElement {
  return (
    <div className="page-shell more-page">
      <h2 className="more-page__title">More</h2>
      <p className="more-page__lede">Room codes, staff tools, and app install.</p>

      <nav className="more-page__list" aria-label="More options">
        <Link to="/chat" className="more-page__link">
          <span className="more-page__link-label">Peer chat</span>
          <span className="more-page__link-hint">Enter a room code to text with a peer</span>
        </Link>
        <Link to="/voice" className="more-page__link">
          <span className="more-page__link-label">Peer voice</span>
          <span className="more-page__link-hint">Enter a room code for a voice call</span>
        </Link>
        <Link to="/staff" className="more-page__link">
          <span className="more-page__link-label">Staff sign-in</span>
          <span className="more-page__link-hint">For Peer Support staff only</span>
        </Link>
      </nav>

      <div className="more-page__install">
        <InstallAppButton />
      </div>

      <p className="more-page__privacy">
        PEERPoint does not keep or record your chat or voice. The access code identifies the SLCO Sheriff’s Office, not
        you.
      </p>
    </div>
  );
}
