import * as React from 'react';
import { createPortal } from 'react-dom';

type Props = {
  onComplete: () => void;
};

/**
 * Full-screen paper-shredder beat when leaving a private session.
 * Signals that the conversation is being destroyed on this device.
 */
export function ConversationDestroyOverlay({ onComplete }: Props): React.ReactElement {
  React.useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? 450 : 2300;
    const t = window.setTimeout(onComplete, ms);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return createPortal(
    <div className="chat-destroy" role="status" aria-live="assertive" aria-atomic="true">
      <div className="chat-destroy__stage" aria-hidden="true">
        <div className="chat-destroy__papers">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`chat-destroy__sheet chat-destroy__sheet--${i + 1}`}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>

        <div className="chat-destroy__machine">
          <div className="chat-destroy__mouth" />
          <div className="chat-destroy__blades">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="chat-destroy__body">
            <div className="chat-destroy__slot" />
          </div>
        </div>

        <div className="chat-destroy__shreds">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={`chat-destroy__strip chat-destroy__strip--${i + 1}`} />
          ))}
        </div>
      </div>

      <p className="chat-destroy__caption">Destroying conversation…</p>
      <p className="chat-destroy__sub">Cleared from this device</p>
    </div>,
    document.body
  );
}
