import * as React from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  /** Fallback path when history is empty / when onClick is not provided */
  to?: string;
  label?: string;
  /** Custom back handler (e.g. multi-step screens) */
  onClick?: () => void;
};

/** Top-left back control for Modern sub-screens. */
export function ModernBackButton({ to = '/', label = 'Back', onClick }: Props): React.ReactElement {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="modern-back"
      onClick={() => {
        if (onClick) {
          onClick();
          return;
        }
        if (to) {
          navigate(to);
          return;
        }
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
      }}
      aria-label={label}
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
