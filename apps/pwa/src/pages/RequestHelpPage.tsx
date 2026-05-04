import * as React from 'react';
import { appendLocalRequest, exportLocalRequestsJson, loadLocalRequests } from '../lib/localRequests';

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function RequestHelpPage(): React.ReactElement {
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
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      appendLocalRequest({
        submittedAt: new Date().toISOString(),
        requesterName: state.requesterName.trim() || undefined,
        requesterPhone: state.requesterPhone.trim(),
        requesterEmail: state.requesterEmail.trim(),
        preferredContact: state.preferredContact.trim() || undefined,
        description: state.description.trim() || undefined,
        consentAcknowledged: state.consentAcknowledged
      });
      setSuccess(true);
      setState(defaultState);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error submitting request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <h2>Request Peer Support</h2>
      <p>If this is an emergency, call 911.</p>
      <p style={{ margin: '8px 0 0', padding: 10, background: '#f4f9f6', borderRadius: 8, fontSize: 13, color: '#2d6a4f' }}>
        This standalone app saves your request <strong>only on this device</strong> (browser storage). It is not sent to a
        server. Use export or a future agency integration when you connect a backend.
      </p>

      {error && <div style={{ marginTop: 12, color: '#a4262c', whiteSpace: 'pre-wrap' }}>{error}</div>}
      {success && (
        <div style={{ marginTop: 12, color: '#107c10' }}>
          Saved on this device. Your peer support team cannot see it until you use an integrated version or share the data
          another way.
        </div>
      )}

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        <label>
          Name (optional)
          <input value={state.requesterName} onChange={e => setState(s => ({ ...s, requesterName: e.target.value }))} />
        </label>
        <label>
          Phone number (required)
          <input value={state.requesterPhone} onChange={e => setState(s => ({ ...s, requesterPhone: e.target.value }))} />
          {phoneError && <div style={{ color: '#a4262c' }}>{phoneError}</div>}
        </label>
        <label>
          Email (required)
          <input value={state.requesterEmail} onChange={e => setState(s => ({ ...s, requesterEmail: e.target.value }))} />
          {emailError && <div style={{ color: '#a4262c' }}>{emailError}</div>}
        </label>
        <label>
          Preferred contact (optional)
          <textarea value={state.preferredContact} onChange={e => setState(s => ({ ...s, preferredContact: e.target.value }))} />
        </label>
        <label>
          Description (optional)
          <textarea rows={5} value={state.description} onChange={e => setState(s => ({ ...s, description: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={state.consentAcknowledged}
            onChange={e => setState(s => ({ ...s, consentAcknowledged: e.target.checked }))}
          />
          I acknowledge the confidentiality notice.
        </label>
        {consentError && <div style={{ color: '#a4262c' }}>{consentError}</div>}

        <button type="button" disabled={!canSubmit} onClick={() => void onSubmit()}>
          {submitting ? 'Saving…' : 'Save request on this device'}
        </button>

        <p style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
          <button
            type="button"
            style={{ fontSize: 13 }}
            onClick={() => {
              const blob = new Blob([exportLocalRequestsJson()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `peerpoint-requests-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            disabled={loadLocalRequests().length === 0}
          >
            Export saved requests (JSON)
          </button>
          {loadLocalRequests().length > 0 && (
            <span style={{ marginLeft: 8 }}>{loadLocalRequests().length} saved on this device</span>
          )}
        </p>
      </div>
    </div>
  );
}
