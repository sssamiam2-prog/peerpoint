import * as React from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { RequestHelpPage } from './pages/RequestHelpPage';
import { SelfHelpPage } from './pages/SelfHelpPage';

function Layout(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="app-layout">
      <header>
        <div>
          <div className="app-header-brand">
            <img src="/peerpoint-icon.png" alt="" width={44} height={44} style={{ borderRadius: 10 }} />
            <img src="/peerpoint-logo.png" alt="PEERPoint — Salt Lake County Sheriff’s Office" style={{ maxHeight: 48, width: 'auto', maxWidth: 360 }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: '#1b4332' }}>
            STRONGER TOGETHER · ALWAYS HERE
          </div>
        </div>
      </header>

      <nav className="app-nav">
        <Link to="/request">
          Request Help
        </Link>
        <Link to="/self-help">
          Self Help
        </Link>
        <Link to="/chat">
          Peer chat
        </Link>
      </nav>

      <main className="app-main">{props.children}</main>
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
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<div>Not found</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
