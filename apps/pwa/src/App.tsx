import * as React from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ActionFeedbackProvider } from './components/ActionFeedback';
import { CrisisStrip } from './components/CrisisStrip';
import { InstallAppButton } from './components/InstallAppButton';
import { MemberAccessGate } from './components/MemberAccessGate';
import { isProductionAdminHost } from './lib/adminHost';
import { ChatPage } from './pages/ChatPage';
import { JoinPage } from './pages/JoinPage';
import { MorePage } from './pages/MorePage';
import { PeerVoicePage } from './pages/PeerVoicePage';
import { RequestHelpPage } from './pages/RequestHelpPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { SelfHelpPage } from './pages/SelfHelpPage';
import { SetupPage } from './pages/SetupPage';
import { StaffPage } from './pages/StaffPage';
import { VoiceTestPage } from './pages/VoiceTestPage';

function MemberNav(): React.ReactElement {
  const { pathname } = useLocation();
  const helpActive = pathname === '/' || pathname === '/request';
  const moreActive =
    pathname === '/more' ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/voice') ||
    pathname.startsWith('/staff');

  return (
    <>
      <nav className="app-nav app-nav--member app-nav--top" aria-label="Main navigation">
        <NavLink
          to="/request"
          className={() => (helpActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
        >
          Get Help
        </NavLink>
        <NavLink
          to="/self-help"
          className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
        >
          Self Help
        </NavLink>
        <NavLink
          to="/resources"
          className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
        >
          Resources
        </NavLink>
        <NavLink
          to="/more"
          className={() => (moreActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
        >
          More
        </NavLink>
      </nav>

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
          className={() => (moreActive ? 'app-nav__tab app-nav__tab--active' : 'app-nav__tab')}
        >
          <span className="app-nav__tab-label">More</span>
        </NavLink>
      </nav>
    </>
  );
}

function Layout(props: { children: React.ReactNode }): React.ReactElement {
  const { pathname } = useLocation();
  const adminSite = isProductionAdminHost();
  const isSetup = pathname.startsWith('/setup');
  const isStaff = pathname.startsWith('/staff');
  const isVoiceTest = pathname.startsWith('/voice-test');
  const isJoin = pathname.startsWith('/join');
  // Voice check + join links are open (no site-use code) so Staff/members can open devices/links freely.
  const memberGateRoutes = !adminSite && !isSetup && !isStaff && !isVoiceTest && !isJoin;
  const memberChrome = !adminSite && !isSetup && !isStaff;

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
              <InstallAppButton variant="header" />
            </div>
          ) : null}
        </div>
      </header>

      {!adminSite && !isSetup ? <CrisisStrip /> : null}

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

export default function App(): React.ReactElement {
  const adminSite = isProductionAdminHost();

  return (
    <BrowserRouter>
      <ActionFeedbackProvider>
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
                <Route path="*" element={<div className="page-shell page-missing">Page not found.</div>} />
              </>
            )}
          </Routes>
        </Layout>
      </ActionFeedbackProvider>
    </BrowserRouter>
  );
}
