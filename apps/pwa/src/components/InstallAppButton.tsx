import * as React from 'react';
import {
  installGuidanceKind,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent
} from '../lib/pwaInstall';

const DISMISS_KEY = 'peerpoint_install_hint_dismissed';

function loadDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

type Props = {
  /** Compact control for the top header */
  variant?: 'default' | 'header';
};

/**
 * “Add PEERPoint to this device” — uses native install when the browser allows it;
 * otherwise shows platform-specific Add to Home Screen / Install steps.
 */
export function InstallAppButton(props: Props): React.ReactElement | null {
  const variant = props.variant ?? 'default';
  const header = variant === 'header';

  const [installed, setInstalled] = React.useState(() => isStandaloneDisplay());
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() => loadDismissed());

  React.useEffect(() => {
    const onBip = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      setInstalled(true);
      setDeferred(null);
      setShowHelp(false);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia('(display-mode: standalone)');
    const onMq = (): void => {
      if (isStandaloneDisplay()) setInstalled(true);
    };
    mq.addEventListener?.('change', onMq);

    return (): void => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      mq.removeEventListener?.('change', onMq);
    };
  }, []);

  if (installed || dismissed) return null;

  const onInstallClick = async (): Promise<void> => {
    if (deferred) {
      setBusy(true);
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
        }
        setDeferred(null);
      } catch {
        setShowHelp(true);
      } finally {
        setBusy(false);
      }
      return;
    }
    setShowHelp(true);
  };

  const onDismiss = (): void => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setShowHelp(false);
  };

  const kind = installGuidanceKind();
  const label = busy ? 'Opening…' : 'Add to device';

  return (
    <div className={header ? 'install-app install-app--header' : 'install-app'}>
      <div className="install-app__bar">
        <button
          type="button"
          className={header ? 'install-app__btn install-app__btn--header' : 'install-app__btn'}
          disabled={busy}
          onClick={() => void onInstallClick()}
          title="Add PEERPoint to this device (home screen or desktop)"
        >
          {label}
        </button>
        {!header ? (
          <button type="button" className="btn-ghost install-app__dismiss" onClick={onDismiss} aria-label="Dismiss">
            Not now
          </button>
        ) : (
          <button
            type="button"
            className="install-app__dismiss-x"
            onClick={onDismiss}
            aria-label="Dismiss add to device"
            title="Hide for this session"
          >
            ×
          </button>
        )}
      </div>

      {showHelp ? (
        <div
          className="install-modal-backdrop"
          role="presentation"
          onClick={e => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="install-modal" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
            <h3 id="install-modal-title">Add PEERPoint to this device</h3>
            {kind === 'ios' ? (
              <ol className="install-modal__steps">
                <li>
                  Open this site in <strong>Safari</strong> (required on iPhone / iPad).
                </li>
                <li>
                  Tap the <strong>Share</strong> button (square with an arrow).
                </li>
                <li>
                  Scroll and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </li>
              </ol>
            ) : kind === 'android-manual' ? (
              <ol className="install-modal__steps">
                <li>
                  Open the browser menu (<strong>⋮</strong>).
                </li>
                <li>
                  Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>Confirm — PEERPoint appears like an app icon on your home screen.</li>
              </ol>
            ) : (
              <ol className="install-modal__steps">
                <li>
                  In <strong>Chrome</strong> or <strong>Edge</strong>, look for the install icon in the address bar, or
                  open the browser menu.
                </li>
                <li>
                  Choose <strong>Install PEERPoint</strong> / <strong>Install app</strong>.
                </li>
                <li>On Windows it can pin to Start or the taskbar; on Mac it opens as its own app window.</li>
              </ol>
            )}
            <p className="install-modal__note">
              Once added, you can open PEERPoint without typing the web address each time.
            </p>
            <div className="install-modal__actions">
              <button type="button" onClick={() => setShowHelp(false)}>
                Got it
              </button>
              <button type="button" className="btn-ghost" onClick={onDismiss}>
                Don’t show again this session
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
