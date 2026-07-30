import * as React from 'react';
import {
  acknowledgeConfidentiality,
  PEER_CONFIDENTIALITY_EXCEPTIONS
} from '../lib/peerConfidentiality';

type Props = {
  open: boolean;
  sessionKey: string;
  /** Classic light modal vs Modern dark shell */
  variant?: 'classic' | 'modern';
  onContinue: () => void;
  onCancel: () => void;
};

export function PeerConfidentialityModal({
  open,
  sessionKey,
  variant = 'classic',
  onContinue,
  onCancel
}: Props): React.ReactElement | null {
  const [checked, setChecked] = React.useState(false);
  const titleId = 'peer-confidentiality-title';

  React.useEffect(() => {
    if (!open) setChecked(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const continueToPeer = (): void => {
    if (!checked) return;
    acknowledgeConfidentiality(sessionKey);
    onContinue();
  };

  return (
    <div
      className={`expect-modal-backdrop peer-confidentiality-backdrop${
        variant === 'modern' ? ' peer-confidentiality-backdrop--modern' : ''
      }`}
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={`expect-modal peer-confidentiality-modal${
          variant === 'modern' ? ' peer-confidentiality-modal--modern' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={titleId}>PEERPoint confidentiality</h2>
        <p>
          Conversations with a designated Salt Lake County Sheriff’s Office peer support team member are generally
          confidential under Utah law (Utah Code § 78B-5-903 and Utah Rule of Evidence 507), when the peer is acting
          under agency peer support guidelines.
        </p>
        <p>
          PEERPoint is peer support — not clinical care, legal advice, or a substitute for emergency services.
        </p>
        <p className="peer-confidentiality-modal__exceptions-label">
          <strong>These conversations are not confidential when they involve:</strong>
        </p>
        <ul className="peer-confidentiality-modal__exceptions">
          {PEER_CONFIDENTIALITY_EXCEPTIONS.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="expect-modal__note peer-confidentiality-modal__emergency">
          If you or someone else is in immediate danger, call <strong>911</strong>. For suicidal crisis support, call
          or text <strong>988</strong>.
        </p>
        <label className="peer-confidentiality-modal__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
          />
          <span>I understand these limits and wish to continue</span>
        </label>
        <div className="expect-modal__actions peer-confidentiality-modal__actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={variant === 'modern' ? 'modern-primary peer-confidentiality-modal__continue' : undefined}
            disabled={!checked}
            onClick={continueToPeer}
          >
            Continue to peer support
          </button>
        </div>
        <p className="peer-confidentiality-modal__disclaimer">
          This notice summarizes Utah peer support privilege in plain language. It is not legal advice. Ask your peer
          support coordinator if you have questions about agency guidelines.
        </p>
      </div>
    </div>
  );
}
