import * as React from 'react';
import { Link } from 'react-router-dom';
import { UiModeToggle } from './UiModeToggle';

type Props = {
  onImmediate: () => void;
  onFaceToFace: () => void;
  onFollowUp: () => void;
  available?: boolean | null;
  chatVoiceCount?: number;
};

function IconNow(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M16 22c0-4.4 3.6-8 8-8s8 3.6 8 8v2.5c0 1.4-.5 2.7-1.4 3.7L28 32H20l-2.6-3.8A5.5 5.5 0 0 1 16 24.5V22Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M20 34h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="20" r="2.2" fill="currentColor" />
    </svg>
  );
}

function IconFaceToFace(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="17" cy="16" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="31" cy="16" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M8 36c1.2-6 5.2-9 9-9s7.8 3 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M22 36c1.2-6 5.2-9 9-9s7.8 3 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRoom(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <rect x="10" y="12" width="28" height="24" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 22h16M16 28h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="34" cy="34" r="7" fill="currentColor" opacity="0.15" />
      <path
        d="M34 30.5v4.2l2.8 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChat(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <path
        d="M10 14.5A4.5 4.5 0 0 1 14.5 10h19A4.5 4.5 0 0 1 38 14.5v12A4.5 4.5 0 0 1 33.5 31H22l-7 6V31h-0.5A4.5 4.5 0 0 1 10 26.5v-12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M18 20h12M18 25h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconVoice(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <rect x="19" y="8" width="10" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 22a12 12 0 0 0 24 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 34v6M18 40h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconFollowUp(): React.ReactElement {
  return (
    <svg className="home-cta__icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <rect x="11" y="8" width="26" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M18 18h12M18 24h12M18 30h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Crisis-first home: colored rounded-square actions with crisp SVG icons. */
export function HomeHub(props: Props): React.ReactElement {
  const { onImmediate, onFaceToFace, onFollowUp, available, chatVoiceCount } = props;
  const [showRoomChoices, setShowRoomChoices] = React.useState(false);

  return (
    <div className="home-hub">
      <p className="home-hub__lede">Confidential peer support for Sheriff’s Office employees.</p>

      {typeof available === 'boolean' ? (
        <p className={`home-hub__status ${available ? 'home-hub__status--open' : ''}`} role="status">
          {available
            ? `${chatVoiceCount ?? 0} peer${chatVoiceCount === 1 ? '' : 's'} free for chat/voice now`
            : 'No peers free for chat/voice right now — you can still request help'}
        </p>
      ) : null}

      <div className="home-hub__actions">
        <button type="button" className="home-cta home-cta--now" onClick={onImmediate}>
          <IconNow />
          <span className="home-cta__label">Talk to a peer now</span>
        </button>
        <button type="button" className="home-cta home-cta--ftf" onClick={onFaceToFace}>
          <IconFaceToFace />
          <span className="home-cta__label">Meet face to face</span>
        </button>

        {showRoomChoices ? (
          <div className="home-hub__room-choices" role="group" aria-label="Open with room code">
            <Link to="/chat" className="home-cta home-cta--chat">
              <IconChat />
              <span className="home-cta__label">Peer chat</span>
            </Link>
            <Link to="/voice" className="home-cta home-cta--voice">
              <IconVoice />
              <span className="home-cta__label">Peer voice</span>
            </Link>
            <button type="button" className="home-cta home-cta--cancel" onClick={() => setShowRoomChoices(false)}>
              <span className="home-cta__label">Cancel</span>
            </button>
          </div>
        ) : (
          <button type="button" className="home-cta home-cta--room" onClick={() => setShowRoomChoices(true)}>
            <IconRoom />
            <span className="home-cta__label">I have a room code</span>
          </button>
        )}

        <button type="button" className="home-cta home-cta--follow" onClick={onFollowUp}>
          <IconFollowUp />
          <span className="home-cta__label">Leave a follow-up request</span>
        </button>
      </div>

      <UiModeToggle variant="card" />
    </div>
  );
}
