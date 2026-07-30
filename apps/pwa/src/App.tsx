import * as React from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ActionFeedbackProvider } from './components/ActionFeedback';
import { CrisisStrip } from './components/CrisisStrip';
import { InstallAppButton } from './components/InstallAppButton';
import { MemberAccessGate } from './components/MemberAccessGate';
import { UiModeToggle } from './components/UiModeToggle';
import { isProductionAdminHost } from './lib/adminHost';
import { ChatPage } from './pages/ChatPage';
import { JoinPage } from './pages/JoinPage';
import { MorePage } from './pages/MorePage';
import { PeerVoicePage } from './pages/PeerVoicePage';
import { RequestHelpPage } from './pages/RequestHelpPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { SelfHelpPage } from './pages/SelfHelpPage';
import { SetupPage } from './pages/SetupPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { StaffPage } from './pages/StaffPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { VoiceTestPage } from './pages/VoiceTestPage';
import { getUiMode, subscribeUiMode } from './lib/uiMode';
import { ModernShell } from './modern/ModernShell';
import { ModernHome } from './modern/ModernHome';
import { ModernRequestIntro } from './modern/ModernRequestIntro';
import { ModernWaiting } from './modern/ModernWaiting';
import { ModernSessionChat } from './modern/ModernSessionChat';
import { ModernResources } from './modern/ModernResources';
import { ModernCheckIns } from './modern/ModernCheckIns';
import { ModernMore } from './modern/ModernMore';
import { ModernStaffRequests } from './modern/ModernStaffRequests';
import { ModernStaffChat } from './modern/ModernStaffChat';

function MemberNav(): React.ReactElement {
  const { pathname } = useLocation();
  const helpActive = pathname === '/' || pathname === '/request';
  const chatActive = pathname.startsWith('/chat');
  const voiceActive = pathname.startsWith('/voice') && !pathname.startsWith('/voice-test');
  const staffActive = pathname.startsWith('/staff');
  // "More" only for overflow routes on narrow layouts (install, etc.)
  const moreActive = pathname === '/more' || pathname.startsWith('/voice-test');

  const linkClass = (active: boolean): string =>
    active ? 'app-nav__link app-nav__link--active' : 'app-nav__link';

  return (
    <>
      {/* Wide / desktop: all primary destinations — no More */}
      <nav className="app-nav app-nav--member app-nav--top app-nav--top-full" aria-label="Main navigation">
        <NavLink to="/request" className={() => linkClass(helpActive)}>
          Get Help
        </NavLink>
        <NavLink
          to="/self-help"
          className={({ isActive }) => linkClass(isActive)}
        >
          Self Help
        </NavLink>
        <NavLink
          to="/resources"
          className={({ isActive }) => linkClass(isActive)}
        >
          Resources
        </NavLink>
        <NavLink to="/chat" className={() => linkClass(chatActive)}>
          Chat
        </NavLink>
        <NavLink to="/voice" className={() => linkClass(voiceActive)}>
          Voice
        </NavLink>
        <NavLink to="/staff" className={() => linkClass(staffActive)}>
          Staff
        </NavLink>
      </nav>

      {/* Mid-width: still top bar, shorter labels if needed, includes More only when compact */}
      <nav className="app-nav app-nav--member app-nav--top app-nav--top-compact" aria-label="Main navigation">
        <NavLink to="/request" className={() => linkClass(helpActive)}>
          Help
        </NavLink>
        <NavLink
          to="/self-help"
          className={({ isActive }) => linkClass(isActive)}
        >
          Self Help
        </NavLink>
        <NavLink
          to="/resources"
          className={({ isActive }) => linkClass(isActive)}
        >
          Resources
        </NavLink>
        <NavLink
          to="/more"
          className={() =>
            moreActive || chatActive || voiceActive || staffActive
              ? 'app-nav__link app-nav__link--active'
              : 'app-nav__link'
          }
        >
          More
        </NavLink>
      </nav>

      {/* Phones: bottom tabs — More holds Chat / Voice / Staff / Install */}
      <nav className="app-nav app-nav--member app-nav--bottom" aria-label="Main navigation">
        <NavLink
          to="/request"
          className={() => (helpActive ? 'app-nav__tab app-nav__tab--active' : 'app-nav__tab')}
        >
          <span className="app-nav__tab-label">Get Help</span>
        </NavLink>
        <NavLink
          to="/self-help"
          className={({ isActive }) => (isActive ? 'app-nav__tab app-nav__tab--active' : 'app-nav__tab')}
        >
          <span className="app-nav__tab-label">Self Help</span>
        </NavLink>
        <NavLink
          to="/resources"
          className={({ isActive }) => (isActive ? 'app-nav__tab app-nav__tab--active' : 'app-nav__tab')}
        >
          <span className="app-nav__tab-label">Resources</span>
        </NavLink>
        <NavLink
          to="/more"
          className={() =>
            moreActive || chatActive || voiceActive || staffActive
              ? 'app-nav__tab app-nav__tab--active'
              : 'app-nav__tab'
          }
        >
          <span className="app-nav__tab-label">More</span>
        </NavLink>
      </nav>
    </>
  );
}

function Layout(props: { children: React.ReactNode }): React.ReactElement {
  const { pathname, search } = useLocation();
  const adminSite = isProductionAdminHost();
  const isSetup = pathname.startsWith('/setup');
  const isResetPassword = pathname.startsWith('/reset-password');
  const isVerifyEmail = pathname.startsWith('/verify-email');
  const isStaff = pathname.startsWith('/staff');
  const isVoiceTest = pathname.startsWith('/voice-test');
  const isJoin = pathname.startsWith('/join');
  // Email/SMS join links land on /join, then /chat|/voice?room=… — never ask for site use code.
  const roomInvite = React.useMemo(() => {
    if (!(pathname.startsWith('/chat') || pathname.startsWith('/voice'))) return false;
    const room = new URLSearchParams(search).get('room')?.trim();
    return Boolean(room);
  }, [pathname, search]);
  // Voice check + join links + room invites are open (no site-use code).
  const memberGateRoutes =
    !adminSite &&
    !isSetup &&
    !isResetPassword &&
    !isVerifyEmail &&
    !isStaff &&
    !isVoiceTest &&
    !isJoin &&
    !roomInvite;
  const memberChrome = !adminSite && !isSetup && !isResetPassword && !isVerifyEmail && !isStaff;

  const shell = (
    <div className={`app-layout${memberChrome ? ' app-layout--member' : ''}`}>
      <header className="app-header">
        <div className="app-header__row">
          <div className="app-header-logo">
            <img
              src="/peerpoint-logo.png"
              alt="PEERPoint — Salt Lake County Sheriff’s Office"
              className="app-header-logo__img"
            />
          </div>
          {adminSite && !isSetup ? <InstallAppButton variant="header" /> : null}
          {!adminSite && !isSetup && !memberChrome ? <InstallAppButton variant="header" /> : null}
          {/* Desktop only: install stays in header; mobile uses More page */}
          {memberChrome ? (
            <div className="app-header__install-desktop">
              <UiModeToggle variant="header" />
              <InstallAppButton variant="header" />
            </div>
          ) : null}
          {memberChrome ? (
            <div className="app-header__modern-mobile">
              <UiModeToggle variant="header" />
            </div>
          ) : null}
        </div>
      </header>

      {!adminSite && !isSetup && !isResetPassword ? <CrisisStrip /> : null}

      {adminSite && !isSetup ? (
        <p className="app-privacy-note">
          <strong>Admin site.</strong> Sign in with your Admin username and password. Staff accounts sign in at{' '}
          <a href="https://mypeerpoint.com/staff">mypeerpoint.com/staff</a>.
        </p>
      ) : null}

      {adminSite ? (
        <nav className="app-nav" aria-label="Main navigation">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
          >
            Admin
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
          >
            Peer chat
          </NavLink>
          <NavLink
            to="/voice"
            className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
          >
            Peer voice
          </NavLink>
          <NavLink
            to="/voice-test"
            className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
          >
            Voice check
          </NavLink>
        </nav>
      ) : memberChrome ? (
        <MemberNav />
      ) : null}

      <main className="app-main">
        <div className="app-main-card">{props.children}</div>
      </main>

      <footer className="app-version" aria-label="App version">
        PEERPoint v{import.meta.env.VITE_APP_VERSION}
      </footer>
    </div>
  );

  if (memberGateRoutes) {
    return <MemberAccessGate>{shell}</MemberAccessGate>;
  }
  return shell;
}

function ModernMemberLayout(): React.ReactElement {
  return (
    <MemberAccessGate>
      <ModernShell>
        <Outlet />
      </ModernShell>
    </MemberAccessGate>
  );
}

function ModernRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/voice" element={<PeerVoicePage />} />
      <Route path="/staff" element={<ModernStaffRequests />} />
      <Route path="/m/staff" element={<ModernStaffRequests />} />
      <Route path="/m/staff/chat" element={<ModernStaffChat />} />
      <Route element={<ModernMemberLayout />}>
        <Route path="/" element={<ModernHome />} />
        <Route path="/m/request" element={<ModernRequestIntro />} />
        <Route path="/m/waiting" element={<ModernWaiting />} />
        <Route path="/m/chat" element={<ModernSessionChat />} />
        <Route path="/m/resources" element={<ModernResources />} />
        <Route path="/m/check-ins" element={<ModernCheckIns />} />
        <Route path="/m/more" element={<ModernMore />} />
        <Route path="/request" element={<Navigate to="/m/request" replace />} />
        <Route path="/resources" element={<Navigate to="/m/resources" replace />} />
        <Route path="/more" element={<Navigate to="/m/more" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function AppRoutes(): React.ReactElement {
  const adminSite = isProductionAdminHost();
  const [mode, setMode] = React.useState(getUiMode);
  React.useEffect(() => subscribeUiMode(() => setMode(getUiMode())), []);
  if (mode === 'modern' && !adminSite) return <ModernRoutes />;

  return (
    <Layout>
          <Routes>
            {adminSite ? (
              <>
                <Route path="/" element={<StaffPage />} />
                <Route path="/staff" element={<Navigate to="/" replace />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/voice" element={<PeerVoicePage />} />
                <Route path="/voice-test" element={<VoiceTestPage />} />
                <Route path="/self-help" element={<SelfHelpPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/join" element={<JoinPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route path="/" element={<RequestHelpPage />} />
                <Route path="/request" element={<RequestHelpPage />} />
                <Route path="/self-help" element={<SelfHelpPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/voice" element={<PeerVoicePage />} />
                <Route path="/voice-test" element={<VoiceTestPage />} />
                <Route path="/join" element={<JoinPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="*" element={<div className="page-shell page-missing">Page not found.</div>} />
              </>
            )}
          </Routes>
        </Layout>
  );
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <ActionFeedbackProvider>
        <AppRoutes />
      </ActionFeedbackProvider>
    </BrowserRouter>
  );
}
