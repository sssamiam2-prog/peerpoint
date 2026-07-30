import * as React from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  /** Fallback path when history is empty */
  to?: string;
  label?: string;
};

/** Top-left back control for Modern sub-screens. */
export function ModernBackButton({ to = '/', label = 'Back' }: Props): React.ReactElement {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="modern-back"
      onClick={() => {
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
