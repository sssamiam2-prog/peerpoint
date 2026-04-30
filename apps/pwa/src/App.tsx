import * as React from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { graphScopes } from './auth/msalConfig';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RequestHelpPage } from './pages/RequestHelpPage';
import { SelfHelpPage } from './pages/SelfHelpPage';

function Layout(props: { children: React.ReactNode }): React.ReactElement {
  const { instance, accounts } = useMsal();
  const authed = useIsAuthenticated();

  const onSignIn = async (): Promise<void> => {
    await instance.loginRedirect({ scopes: graphScopes });
  };

  const onSignOut = (): void => {
    const account = instance.getActiveAccount() || accounts[0];
    instance.logoutRedirect({ account });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <img src="/peerpoint-icon.png" alt="" width={44} height={44} style={{ borderRadius: 10 }} />
            <img src="/peerpoint-logo.png" alt="PEERPoint — Salt Lake County Sheriff’s Office" style={{ maxHeight: 48, width: 'auto', maxWidth: 360 }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: '#1b4332' }}>
            STRONGER TOGETHER · ALWAYS HERE
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {authed ? (
            <>
              <span style={{ fontSize: 12, color: '#666' }}>{accounts[0]?.username}</span>
              <button onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <button onClick={onSignIn}>Sign in</button>
          )}
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Link to="/request">Request Help</Link>
        <Link to="/self-help">Self Help</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/my-assignments">My Assignments</Link>
      </nav>

      <main style={{ marginTop: 16 }}>{props.children}</main>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<RequestHelpPage />} />
          <Route path="/request" element={<RequestHelpPage />} />
          <Route path="/self-help" element={<SelfHelpPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard (PWA): sign-in protected. Assignment workflows will be finalized in the SPFx experience.</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-assignments"
            element={
              <ProtectedRoute>
                <div>My Assignments (PWA): sign-in protected. Full parity is provided in SPFx.</div>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<div>Not found</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
