import * as React from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { Link } from 'react-router-dom';

export function ProtectedRoute(props: { children: React.ReactNode }): React.ReactElement {
  const authed = useIsAuthenticated();
  if (authed) return <>{props.children}</>;

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h2>Sign in required</h2>
      <p>This area is protected. Please sign in with your Sheriff’s Office Microsoft 365 account.</p>
      <p>
        Go to <Link to="/">Home</Link>.
      </p>
    </div>
  );
}

