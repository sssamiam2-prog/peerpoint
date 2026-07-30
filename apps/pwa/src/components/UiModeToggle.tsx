import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { getUiMode, setUiMode, subscribeUiMode, type UiMode } from '../lib/uiMode';

type Props = {
  /** Visual variant */
  variant?: 'header' | 'card' | 'inline';
};

/** Classic → Modern appearance switch (pulsing button to draw attention). */
export function UiModeToggle({ variant = 'inline' }: Props): React.ReactElement {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<UiMode>(getUiMode);
  React.useEffect(() => subscribeUiMode(() => setMode(getUiMode())), []);

  const toModern = (): void => {
    setUiMode('modern');
    navigate('/');
  };
  const toClassic = (): void => {
    setUiMode('classic');
    navigate('/');
  };

  if (variant === 'header') {
    return (
      <button
        type="button"
        className="ui-mode-pulse-btn ui-mode-pulse-btn--header"
        onClick={toModern}
        aria-label="Switch to Modern UI"
      >
        Try Modern UI
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <section className="ui-mode-card" aria-labelledby="ui-mode-card-heading">
        <h3 id="ui-mode-card-heading">New look available</h3>
        <p>Try the Modern interface for peer support requests, waiting, and chat. Switch back anytime.</p>
        <button
          type="button"
          className="ui-mode-pulse-btn ui-mode-pulse-btn--card"
          onClick={toModern}
        >
          Try Modern UI
        </button>
      </section>
    );
  }

  return (
    <div className="ui-mode-toggle-row" role="group" aria-label="Interface style">
      <button
        type="button"
        className={mode === 'classic' ? 'ui-mode-chip ui-mode-chip--active' : 'ui-mode-chip'}
        onClick={toClassic}
        aria-pressed={mode === 'classic'}
      >
        Classic
      </button>
      <button
        type="button"
        className={
          mode === 'modern'
            ? 'ui-mode-chip ui-mode-chip--active'
            : 'ui-mode-chip ui-mode-pulse-btn ui-mode-pulse-btn--chip'
        }
        onClick={toModern}
        aria-pressed={mode === 'modern'}
      >
        Modern
      </button>
    </div>
  );
}
