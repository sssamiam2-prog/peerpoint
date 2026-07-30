import * as React from 'react';
import {
  clearMemberAccessUnlock,
  unlockMemberAccess,
  verifySiteUseCode
} from '../lib/memberAccess';
import { isStandaloneDisplay } from '../lib/pwaInstall';

type Props = {
  children: React.ReactNode;
};

/**
 * Soft gate for the public member app: shared workplace site use code only.
 * Shows a blocking modal over a greyed-out app shell until the code is entered.
 * Required on every fresh open — including when PEERPoint is installed on a phone.
 */
export function MemberAccessGate(props: Props): React.ReactElement {
  const [unlocked, setUnlocked] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    // Wipe any leftover unlock from a prior PWA/browser session.
    clearMemberAccessUnlock();
    setUnlocked(false);

    const relock = (): void => {
      clearMemberAccessUnlock();
      setUnlocked(false);
      setCode('');
      setError(undefined);
    };

    // bfcache restore (common when reopening an installed PWA)
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) relock();
    };

    // If the installed app was backgrounded then fully restarted via pageshow without persist,
    // React already remounted. Also relock when returning to a standalone app after a long hide
    // is too aggressive for quick app-switching — only cold start + bfcache above.

    window.addEventListener('pageshow', onPageShow);
    return (): void => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  React.useEffect(() => {
    if (unlocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return (): void => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [unlocked]);

  const onUnlock = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(undefined);
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the site use code.');
      return;
    }
    setBusy(true);
    try {
      const result = await verifySiteUseCode(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      unlockMemberAccess(trimmed);
      setUnlocked(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) return <>{props.children}</>;

  return (
    <>
      <div className="member-access-dimmed" aria-hidden="true">
        {props.children}
      </div>
      <div className="member-access-backdrop" role="presentation">
        <div
          className="member-access-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-access-title"
          aria-describedby="member-access-desc"
        >
          <h2 id="member-access-title">PEERPoint access</h2>
          <p id="member-access-desc" className="member-access-modal__lede">
            This app is for current Salt Lake County Sheriff’s Office employees. Enter the site use code to continue
            {isStandaloneDisplay() ? ' (required each time you open the app).' : '.'}
          </p>
          <p className="callout callout--privacy member-access-modal__privacy">
            <strong>Privacy.</strong> PEERPoint does not keep or record your chat or voice. The access code is an
            identifier for the SLCO Sheriff’s Office and does not identify you.
          </p>
          <form className="member-access-modal__form" onSubmit={e => void onUnlock(e)}>
            <label>
              Site use code
              <input
                ref={inputRef}
                type="password"
                name="peerpoint-site-use-code"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Enter site use code"
                required
              />
            </label>
            {error ? <div className="member-access-modal__error">{error}</div> : null}
            <button type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
          <p className="member-access-modal__crisis">
            In an emergency, call <strong>911</strong>. For crisis support, call or text <strong>988</strong>.
          </p>
        </div>
      </div>
    </>
  );
}
