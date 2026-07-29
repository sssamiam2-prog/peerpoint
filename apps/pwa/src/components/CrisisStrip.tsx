import * as React from 'react';
import { canPlacePhoneCall } from '../lib/canPlacePhoneCall';
import { LIFELINE_988_TEL } from '../lib/peerSupportContact';

type ModalKind = '911' | '988' | null;

/**
 * Always-visible crisis contacts (988 + 911).
 * Peer support call/text/email live in Request Help / immediate contact instead.
 */
export function CrisisStrip(): React.ReactElement {
  const [modal, setModal] = React.useState<ModalKind>(null);
  const phoneCapable = React.useMemo(() => canPlacePhoneCall(), []);

  const on911 = (e: React.MouseEvent): void => {
    if (phoneCapable) return; // let tel: navigate
    e.preventDefault();
    setModal('911');
  };

  const on988 = (e: React.MouseEvent): void => {
    e.preventDefault();
    setModal('988');
  };

  const close = (): void => setModal(null);

  React.useEffect(() => {
    if (!modal) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  return (
    <>
      <div className="crisis-strip" role="region" aria-label="Crisis contacts">
        <span className="crisis-strip__label">Need help now?</span>
        <a href={LIFELINE_988_TEL} onClick={on988} className="crisis-strip__link">
          <span className="crisis-strip__full">988 Suicide &amp; Crisis Lifeline</span>
          <span className="crisis-strip__short">988</span>
        </a>
        <span className="crisis-strip__sep" aria-hidden="true">
          ·
        </span>
        <a href="tel:911" onClick={on911} className="crisis-strip__link">
          <span className="crisis-strip__full">911 for emergencies</span>
          <span className="crisis-strip__short">911</span>
        </a>
      </div>

      {modal ? (
        <div
          className="crisis-modal-backdrop"
          role="presentation"
          onClick={e => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="crisis-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crisis-modal-title"
          >
            {modal === '911' ? (
              <>
                <h2 id="crisis-modal-title">Call 911</h2>
                <p>
                  This device cannot place an emergency call from the browser. Use a phone and dial{' '}
                  <strong>911</strong> now if you are in immediate danger or need police, fire, or EMS.
                </p>
                <div className="crisis-modal__actions">
                  <button type="button" onClick={close}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="crisis-modal-title">988 Suicide &amp; Crisis Lifeline</h2>
                <p>
                  <strong>988</strong> is the national Suicide &amp; Crisis Lifeline. Call or text{' '}
                  <strong>988</strong> anytime (24/7) if you or someone else is in emotional distress or
                  suicidal crisis. Trained counselors answer — it is confidential.
                </p>
                <p>
                  988 is <strong>not</strong> a substitute for <strong>911</strong> when there is an
                  immediate threat to life or public safety (police, fire, or EMS).
                </p>
                {phoneCapable ? (
                  <div className="crisis-modal__actions">
                    <a className="crisis-modal__call-btn" href={LIFELINE_988_TEL}>
                      Call 988
                    </a>
                    <button type="button" className="btn-ghost" onClick={close}>
                      Close
                    </button>
                  </div>
                ) : (
                  <>
                    <p>
                      This device cannot place the call from the browser. Use a phone and dial or text{' '}
                      <strong>988</strong>.
                    </p>
                    <div className="crisis-modal__actions">
                      <button type="button" onClick={close}>
                        Close
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
