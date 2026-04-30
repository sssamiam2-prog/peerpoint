import * as React from 'react';
import { DefaultButton, MessageBar, MessageBarType, PrimaryButton, Stack } from '@fluentui/react';
import { calmPrimaryButtonStyles } from './calmFluentUi';

type Props = {
  onOpenPrivacy?: () => void;
};

export function RequestHelpLanding(props: Props): React.ReactElement {
  const { onOpenPrivacy } = props;
  return (
    <Stack tokens={{ childrenGap: 16 }} styles={{ root: { maxWidth: 720 } }}>
      <h2>Request peer support</h2>
      <p style={{ margin: 0, lineHeight: 1.55 }}>
        You can reach peer support through the contact options above (email, call, or text), or submit a confidential
        request using the form. The form is optional and opens only when you are ready.
      </p>
      <p style={{ margin: 0, lineHeight: 1.55, color: '#5c6e66' }}>
        <strong>Off duty?</strong> The fastest path is usually the <strong>PEERPoint mobile app</strong> (chat is there,
        not in this SharePoint view). Use{' '}
        <a href="#/mobile-apps">Mobile apps</a> for QR codes and store links.
      </p>
      <MessageBar messageBarType={MessageBarType.info} isMultiline={true}>
        If this is an emergency or you are in immediate danger, call <strong>911</strong> or your local emergency
        number—not this form.
      </MessageBar>
      <Stack horizontal={true} tokens={{ childrenGap: 10 }} wrap={true}>
        <PrimaryButton
          href="#/request/new"
          text="Open peer support request form"
          styles={calmPrimaryButtonStyles}
        />
        {onOpenPrivacy ? (
          <DefaultButton
            text="Our privacy promise"
            iconProps={{ iconName: 'Shield' }}
            onClick={onOpenPrivacy}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
