import * as React from 'react';
import { ModernSessionChat } from './ModernSessionChat';

export function ModernStaffChat(): React.ReactElement {
  const session = React.useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('peerpoint_modern_staff_session') ?? '{}') as { requestId?: string; supportCode?: string }; } catch { return {}; }
  }, []);
  return <ModernSessionChat staff requestId={session.requestId} supportCode={session.supportCode} />;
}
