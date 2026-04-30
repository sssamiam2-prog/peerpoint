import * as React from 'react';
import { MessageBar, MessageBarType, Stack } from '@fluentui/react';
import { MobileAppDownloads } from './MobileAppDownloads';

/**
 * Full-page: store links + QR codes, plus notes for IT on chat backends (native apps only).
 */
export function MobileAppsPage(): React.ReactElement {
  return (
    <Stack tokens={{ childrenGap: 20 }} styles={{ root: { maxWidth: 720 } }}>
      <MobileAppDownloads variant="page" />

      <Stack tokens={{ childrenGap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>About chat on mobile</h2>
        <MessageBar messageBarType={MessageBarType.info} isMultiline={true}>
          Live chat is intended for the <strong>iOS and Android</strong> apps only. Implementation typically uses{' '}
          <strong>Azure Communication Services (ACS) Chat</strong> or another approved messaging service, with your API
          enforcing pairing (for example a short code the peer supporter must enter to join the correct thread).
        </MessageBar>
        <p style={{ margin: 0, lineHeight: 1.55, color: '#5c6e66' }}>
          A passcode can gate <strong>which conversation</strong> a supporter joins; it does not replace your
          agency’s rules about identity, logging, and who may see what. Work with IT and your Licensed Therapist on the
          final privacy model before enabling chat in production.
        </p>
      </Stack>
    </Stack>
  );
}
