import * as React from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_HOST, isProductionAdminHost, MEMBER_ORIGIN } from '../lib/adminHost';
import {
  installGuidanceKind,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent
} from '../lib/pwaInstall';

const DISMISS_KEY = 'peerpoint_install_hint_dismissed';

/** Canonical URL to open for Add to Home Screen (Safari / Chrome). */
function installSiteUrl(): string {
  if (typeof window !== 'undefined' && isProductionAdminHost()) {
    return `https://${ADMIN_HOST}/`;
  }
  return `${MEMBER_ORIGIN}/`;
}

function InstallSiteLink(props: { children?: React.ReactNode }): React.ReactElement {
  const href = installSiteUrl();
  const label = props.children ?? href.replace(/\/$/, '');
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="install-modal__url">
      {label}
    </a>
  );
}

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

  React.useEffect(() => {
    if (!showHelp) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setShowHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

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

  const helpModal =
    showHelp && typeof document !== 'undefined'
      ? createPortal(
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
                    Open <strong>Safari</strong> on your iPhone or iPad (not Chrome or another browser), then go to{' '}
                    <InstallSiteLink />. If you are already in another browser, copy that link and paste it into Safari.
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
                    Open <strong>Chrome</strong> on your Android phone, then go to <InstallSiteLink />.
                  </li>
                  <li>
                    Open the Chrome menu (<strong>⋮</strong>).
                  </li>
                  <li>
                    Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </li>
                  <li>Confirm — PEERPoint appears like an app icon on your home screen.</li>
                </ol>
              ) : (
                <ol className="install-modal__steps">
                  <li>
                    Use <strong>Microsoft Edge</strong> or <strong>Google Chrome</strong> and open{' '}
                    <InstallSiteLink />.
                  </li>
                  <li>
                    Open the browser menu (<strong>⋯</strong> or <strong>⋮</strong>) → <strong>Apps</strong> →{' '}
                    <strong>Install this site as an app</strong> (Edge), or choose <strong>Install PEERPoint</strong> /
                    <strong> Install app</strong> (Chrome).
                  </li>
                  <li>
                    You can also click the <strong>install icon</strong> in the address bar when it appears.
                  </li>
                  <li>
                    On Windows, pin it to <strong>Start</strong> or the <strong>taskbar</strong> so it opens in its own
                    window.
                  </li>
                </ol>
              )}
              <p className="install-modal__note">
                On some county-managed PCs, install may be blocked by IT policy. You can still use PEERPoint in the
                browser. Once added, you can open PEERPoint without typing the web address each time.
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
          </div>,
          document.body
        )
      : null;

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
      {helpModal}
    </div>
  );
}
