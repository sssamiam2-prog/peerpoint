import * as React from 'react';
import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  PrimaryButton,
  DefaultButton,
  TextField,
  MessageBar,
  MessageBarType,
  Checkbox,
  Stack
} from '@fluentui/react';
import { writeAuditLog } from './auditLogApi';
import { calmPrimaryButtonStyles } from './calmFluentUi';

type Props = {
  spHttpClient: SPHttpClient;
  webAbsoluteUrl: string;
  onOpenPrivacy?: () => void;
};

type FormState = {
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact: string;
  description: string;
  consentAcknowledged: boolean;
};

const defaultState: FormState = {
  requesterName: '',
  requesterPhone: '',
  requesterEmail: '',
  preferredContact: '',
  description: '',
  consentAcknowledged: false
};

function isValidEmail(value: string): boolean {
  // Intentionally simple: SharePoint will still accept/deny; this is UX validation only.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function RequestHelpForm(props: Props): React.ReactElement<Props> {
  const [state, setState] = React.useState<FormState>(defaultState);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [success, setSuccess] = React.useState(false);

  const phoneError = state.requesterPhone.trim().length === 0 ? 'Phone number is required.' : undefined;
  const emailError =
    state.requesterEmail.trim().length === 0
      ? 'Email is required.'
      : !isValidEmail(state.requesterEmail)
        ? 'Enter a valid email address.'
        : undefined;
  const consentError = !state.consentAcknowledged ? 'Please acknowledge the confidentiality notice.' : undefined;

  const canSubmit = !submitting && !phoneError && !emailError && !consentError;

  const onSubmit = async (): Promise<void> => {
    setError(undefined);
    setSuccess(false);

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        Title: `Peer Support Request - ${new Date().toISOString()}`,
        RequesterName: state.requesterName.trim() || null,
        RequesterPhone: state.requesterPhone.trim(),
        RequesterEmail: state.requesterEmail.trim(),
        PreferredContact: state.preferredContact.trim() || null,
        Description: state.description.trim() || null,
        ConsentAcknowledged: state.consentAcknowledged,
        Status: 'New',
        ShowNameToPeer: true,
        ShowPhoneToPeer: true,
        ShowEmailToPeer: true,
        ShowPreferredContactToPeer: true,
        ShowDescriptionToPeer: true
      };

      const url = `${props.webAbsoluteUrl}/_api/web/lists/GetByTitle('PeerSupportRequests')/items`;
      const resp: SPHttpClientResponse = await props.spHttpClient.post(url, SPHttpClient.configurations.v1, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Request failed (${resp.status}): ${text}`);
      }

      const created = (await resp.json()) as { Id?: number };
      if (created?.Id) {
        await writeAuditLog(props.spHttpClient, props.webAbsoluteUrl, 'RequestCreated', created.Id, {
          hasName: !!state.requesterName.trim()
        });
      }

      setSuccess(true);
      setState(defaultState);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error submitting request.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={{ root: { maxWidth: 720 } }}>
      <Stack horizontal={true} horizontalAlign="space-between" verticalAlign="center" wrap={true} tokens={{ childrenGap: 8 }}>
        <h2 style={{ margin: 0 }}>Request Peer Support</h2>
        {props.onOpenPrivacy ? (
          <DefaultButton
            text="Our privacy promise"
            iconProps={{ iconName: 'Shield' }}
            onClick={props.onOpenPrivacy}
          />
        ) : null}
      </Stack>
      <p>
        If this is an emergency or you are in immediate danger, call 911 or your local emergency number.
      </p>

      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline={true}>
          {error}
        </MessageBar>
      )}
      {success && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline={true}>
          Your request was sent. A Peer Support member will reach out as soon as possible.
        </MessageBar>
      )}

      <TextField
        label="Name (optional)"
        value={state.requesterName}
        onChange={(_, v) => setState(s => ({ ...s, requesterName: v || '' }))}
      />
      <TextField
        label="Phone number"
        required={true}
        value={state.requesterPhone}
        errorMessage={phoneError}
        onChange={(_, v) => setState(s => ({ ...s, requesterPhone: v || '' }))}
      />
      <TextField
        label="Email"
        required={true}
        value={state.requesterEmail}
        errorMessage={emailError}
        onChange={(_, v) => setState(s => ({ ...s, requesterEmail: v || '' }))}
      />
      <TextField
        label="Preferred contact method / best time to reach you (optional)"
        multiline={true}
        value={state.preferredContact}
        onChange={(_, v) => setState(s => ({ ...s, preferredContact: v || '' }))}
      />
      <TextField
        label="What’s going on? (optional)"
        multiline={true}
        rows={5}
        value={state.description}
        onChange={(_, v) => setState(s => ({ ...s, description: v || '' }))}
      />

      <Checkbox
        label="I understand this is not an emergency service, and I acknowledge the confidentiality notice."
        checked={state.consentAcknowledged}
        onChange={(_, checked) => setState(s => ({ ...s, consentAcknowledged: !!checked }))}
      />
      {consentError && <div style={{ color: '#6d534d' }}>{consentError}</div>}

      <PrimaryButton
        text={submitting ? 'Submitting…' : 'Submit request'}
        disabled={!canSubmit}
        onClick={onSubmit}
        styles={calmPrimaryButtonStyles}
      />
    </Stack>
  );
}

