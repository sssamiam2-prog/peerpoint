import * as React from 'react';
import styles from './PeerSupport.module.scss';
import type { IPeerSupportProps } from './IPeerSupportProps';
import { RequestHelpForm } from './RequestHelpForm';
import { RequestHelpLanding } from './RequestHelpLanding';
import { SelfHelpPage } from './SelfHelpPage';
import { DashboardPage } from './DashboardPage';
import { MyAssignmentsPage } from './MyAssignmentsPage';
import { MessageBar, MessageBarType, Spinner, DefaultButton, PrimaryButton } from '@fluentui/react';
import { PrivacyPromisePanel } from './PrivacyPromisePanel';
import { MobileAppDownloads } from './MobileAppDownloads';
import { MobileAppsPage } from './MobileAppsPage';
import { useRoles } from './useRoles';
import {
  LIFELINE_988_TEL,
  PEER_SUPPORT_EMAIL,
  PEER_SUPPORT_MAILTO,
  PEER_SUPPORT_PHONE_DISPLAY,
  PEER_SUPPORT_SMS,
  PEER_SUPPORT_TEL
} from './peerSupportContact';
import { useHashRoute } from './useHashRoute';

const SPLASH_FADE_MS = 420;
const SPLASH_AUTO_MS = 2600;

export default function PeerSupport(props: IPeerSupportProps): React.ReactElement<IPeerSupportProps> {
  const {
    isDarkTheme,
    hasTeamsContext,
    userDisplayName,
    userEmail,
    spHttpClient,
    msGraphClientFactory,
    webAbsoluteUrl
  } = props;

  const route = useHashRoute();

  const { loading: rolesLoading, error: rolesError, roles } = useRoles(msGraphClientFactory);
  const canSeeDashboard = roles.has('Admin') || roles.has('HR');
  const isPeerSupporter = roles.has('PeerSupporter');

  const [showSplash, setShowSplash] = React.useState(true);
  const [splashExiting, setSplashExiting] = React.useState(false);
  const splashDismissedRef = React.useRef(false);
  const splashHideTimerRef = React.useRef<number | undefined>(undefined);
  const splashRef = React.useRef<HTMLDivElement>(null);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);

  const dismissSplash = React.useCallback((): void => {
    if (splashDismissedRef.current) {
      return;
    }
    splashDismissedRef.current = true;
    setSplashExiting(true);
    splashHideTimerRef.current = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_FADE_MS);
  }, []);

  React.useEffect(() => {
    splashRef.current?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const autoId = window.setTimeout(() => dismissSplash(), SPLASH_AUTO_MS);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        dismissSplash();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(autoId);
      window.removeEventListener('keydown', onKeyDown);
      if (splashHideTimerRef.current !== undefined) {
        window.clearTimeout(splashHideTimerRef.current);
      }
    };
  }, [dismissSplash]);

  return (
    <section className={`${styles.peerSupport} ${hasTeamsContext ? styles.teams : ''}`}>
      {showSplash ? (
        <div
          ref={splashRef}
          className={`${styles.splash} ${splashExiting ? styles.splashExiting : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="peerpoint-splash-hint"
          onClick={dismissSplash}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              dismissSplash();
            }
          }}
          tabIndex={0}
        >
          <div className={styles.splashInner}>
            <img
              className={styles.splashLogo}
              src={require('../assets/peerpoint-logo.png')}
              alt="PEERPoint — Salt Lake County Sheriff’s Office"
            />
            <p id="peerpoint-splash-hint" className={styles.splashHint}>
              Tap anywhere or press Escape to continue
            </p>
          </div>
        </div>
      ) : null}

      <div className={styles.appShell}>
        <div className={styles.appFrame}>
          <header className={styles.header}>
            <div className={styles.brand}>
              <div className={styles.brandMark}>
                <img
                  className={styles.brandLogo}
                  src={require('../assets/peerpoint-logo.png')}
                  alt="PEERPoint — Salt Lake County Sheriff’s Office"
                />
              </div>
            </div>
            <div className={styles.user}>
              <span className={styles.userLabel}>Signed in</span>
              <strong className={styles.userName}>{userDisplayName}</strong>
              {isDarkTheme ? <span className={styles.themePill}>Dark</span> : <span className={styles.themePill}>Light</span>}
            </div>
          </header>

          <div className={styles.privacyStrip}>
            <DefaultButton
              className={styles.privacyPromiseButton}
              text="Our privacy promise"
              iconProps={{ iconName: 'Shield' }}
              onClick={() => setPrivacyOpen(true)}
              ariaLabel="Open our privacy promise"
            />
          </div>

          <PrivacyPromisePanel isOpen={privacyOpen} onDismiss={() => setPrivacyOpen(false)} />

          <div className={styles.contactPanel} aria-label="Contact peer support">
            <div className={styles.contactPanelTitle}>Reach peer support</div>
            <div className={styles.contactActions}>
              <DefaultButton
                className={styles.contactBtn}
                href={PEER_SUPPORT_MAILTO}
                iconProps={{ iconName: 'Mail' }}
                text="Email"
                title={`Email ${PEER_SUPPORT_EMAIL}`}
              />
              <DefaultButton
                className={styles.contactBtn}
                href={PEER_SUPPORT_TEL}
                iconProps={{ iconName: 'Phone' }}
                text="Call"
                title={`Call ${PEER_SUPPORT_PHONE_DISPLAY}`}
              />
              <DefaultButton
                className={styles.contactBtn}
                href={PEER_SUPPORT_SMS}
                iconProps={{ iconName: 'Chat' }}
                text="Text"
                title={`Text ${PEER_SUPPORT_PHONE_DISPLAY}`}
              />
            </div>
            <div className={styles.contactMeta}>
              <span className={styles.contactMetaLine}>{PEER_SUPPORT_EMAIL}</span>
              <span className={styles.contactMetaLine}>{PEER_SUPPORT_PHONE_DISPLAY}</span>
            </div>
            <div className={styles.crisisRow}>
              <PrimaryButton
                className={styles.crisis988}
                href={LIFELINE_988_TEL}
                iconProps={{ iconName: 'Phone' }}
                text="Dial 988 — Suicide & Crisis Lifeline"
                title="Opens your phone app to call 988"
              />
            </div>
          </div>

          {route !== 'mobile-apps' ? <MobileAppDownloads variant="strip" /> : null}

          <nav className={styles.nav} aria-label="Main">
            <a
              className={route === 'request' || route === 'request/new' ? styles.navActive : styles.navLink}
              href="#/request"
            >
              Request Help
            </a>
            <a className={route === 'self-help' ? styles.navActive : styles.navLink} href="#/self-help">
              Self Help
            </a>
            <a className={route === 'mobile-apps' ? styles.navActive : styles.navLink} href="#/mobile-apps">
              Mobile apps
            </a>
            <a className={route === 'dashboard' ? styles.navActive : styles.navLink} href="#/dashboard">
              Dashboard
            </a>
            <a className={route === 'my-assignments' ? styles.navActive : styles.navLink} href="#/my-assignments">
              My Assignments
            </a>
          </nav>

          <main className={styles.main}>
            {rolesLoading ? (
              <Spinner label="Loading permissions…" />
            ) : rolesError ? (
              <MessageBar messageBarType={MessageBarType.warning} isMultiline={true}>
                Could not load role membership from Microsoft Graph. Protected areas may be unavailable until Graph
                permissions are granted.
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{rolesError}</div>
              </MessageBar>
            ) : route === 'self-help' ? (
              <SelfHelpPage spHttpClient={spHttpClient} webAbsoluteUrl={webAbsoluteUrl} />
            ) : route === 'mobile-apps' ? (
              <MobileAppsPage />
            ) : route === 'request/new' ? (
              <RequestHelpForm
                spHttpClient={spHttpClient}
                webAbsoluteUrl={webAbsoluteUrl}
                onOpenPrivacy={() => setPrivacyOpen(true)}
              />
            ) : route === 'request' ? (
              <RequestHelpLanding onOpenPrivacy={() => setPrivacyOpen(true)} />
            ) : route === 'dashboard' ? (
              canSeeDashboard ? (
                <DashboardPage spHttpClient={spHttpClient} webAbsoluteUrl={webAbsoluteUrl} />
              ) : (
                <MessageBar messageBarType={MessageBarType.error}>
                  Access denied. This page is for Admin/HR only.
                </MessageBar>
              )
            ) : route === 'my-assignments' ? (
              isPeerSupporter ? (
                <MyAssignmentsPage spHttpClient={spHttpClient} webAbsoluteUrl={webAbsoluteUrl} userEmail={userEmail} />
              ) : (
                <MessageBar messageBarType={MessageBarType.error}>
                  Access denied. This page is for Peer Supporters only.
                </MessageBar>
              )
            ) : (
              <MessageBar messageBarType={MessageBarType.info}>Unknown route.</MessageBar>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
