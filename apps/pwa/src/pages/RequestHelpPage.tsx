import * as React from 'react';
import { Link } from 'react-router-dom';
import { useActionFeedback, type SuccessToast } from '../components/ActionFeedback';
import { HomeHub } from '../components/HomeHub';
import { appendLocalRequest, exportLocalRequestsJson, loadLocalRequests } from '../lib/localRequests';
import { getStoredSiteUseCode } from '../lib/memberAccess';

type EmploymentType = 'civilian' | 'sworn' | '';

type FormState = {
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string;
  preferredContact: string;
  description: string;
  consentAcknowledged: boolean;
  employmentAttested: boolean;
  bureau: string;
  employmentType: EmploymentType;
};

const defaultState: FormState = {
  requesterName: '',
  requesterPhone: '',
  requesterEmail: '',
  preferredContact: '',
  description: '',
  consentAcknowledged: false,
  employmentAttested: false,
  bureau: '',
  employmentType: ''
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function EmploymentFields(props: {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}): React.ReactElement {
  const { state, setState } = props;
  return (
    <>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={state.employmentAttested}
          onChange={e => setState(s => ({ ...s, employmentAttested: e.target.checked }))}
        />
        <span>
          I attest that I am <strong>currently employed</strong> by the Salt Lake County Sheriff’s Office.
        </span>
      </label>
      <label>
        Bureau
        <input
          value={state.bureau}
          onChange={e => setState(s => ({ ...s, bureau: e.target.value }))}
          placeholder="e.g. Corrections, Enforcement, Court Services"
          autoComplete="organization-title"
        />
      </label>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
        <legend style={{ padding: '0 4px' }}>I am</legend>
        <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
          <input
            type="radio"
            name="employmentType"
            checked={state.employmentType === 'sworn'}
            onChange={() => setState(s => ({ ...s, employmentType: 'sworn' }))}
          />
          Sworn
        </label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            name="employmentType"
            checked={state.employmentType === 'civilian'}
            onChange={() => setState(s => ({ ...s, employmentType: 'civilian' }))}
          />
          Civilian
        </label>
      </fieldset>
    </>
  );
}

async function postRemoteRequest(
  payload: FormState,
  contactMode: 'form' | 'faceToFace'
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const accessCode = getStoredSiteUseCode();
  if (!accessCode) {
    return { ok: false, error: 'Site use code missing. Refresh and unlock PEERPoint again.' };
  }
  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode,
        requesterName: payload.requesterName.trim() || undefined,
        requesterPhone: payload.requesterPhone.trim(),
        requesterEmail: payload.requesterEmail.trim(),
        preferredContact: payload.preferredContact.trim() || undefined,
        description: payload.description.trim() || undefined,
        consentAcknowledged: payload.consentAcknowledged,
        employmentAttested: payload.employmentAttested,
        bureau: payload.bureau.trim(),
        employmentType: payload.employmentType,
        contactMode
      })
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `Request failed (${res.status}).` };
    }
    return {
      ok: true,
      message:
        data.message ??
        'Request received. A Peer Support Therapist will follow up and may share a room code for chat or voice.'
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function RequestHelpPage(): React.ReactElement {
  const { runAction } = useActionFeedback();
  const [state, setState] = React.useState<FormState>(defaultState);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [success, setSuccess] = React.useState<string | undefined>(undefined);
  const [localOnly, setLocalOnly] = React.useState(false);

  const [showImmediate, setShowImmediate] = React.useState(false);
  const [showFaceToFace, setShowFaceToFace] = React.useState(false);
  const [showFollowUp, setShowFollowUp] = React.useState(false);
  const [sexPreference, setSexPreference] = React.useState<'male' | 'female' | 'either' | ''>('');
  const [contactMode, setContactMode] = React.useState<'chat' | 'voice' | ''>('');
  const [immediateBusy, setImmediateBusy] = React.useState(false);
  const [immediateError, setImmediateError] = React.useState<string | undefined>();
  const [queueWait, setQueueWait] = React.useState<
    | {
        requestId: string;
        memberJoinToken: string;
        contactMode: 'chat' | 'voice';
        status: 'queued' | 'assigned' | 'closed';
        message: string;
      }
    | undefined
  >();
  const [immediateResult, setImmediateResult] = React.useState<
    | { roomCode: string; contactMode: 'chat' | 'voice'; joinUrl: string; message: string }
    | undefined
  >();
  const [availability, setAvailability] = React.useState<{
    available: boolean;
    maleAvailable: number;
    femaleAvailable: number;
    eitherAvailable: number;
    faceToFaceAvailable: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/immediate-contact');
        const data = (await res.json().catch(() => ({}))) as {
          available?: boolean;
          maleAvailable?: number;
          femaleAvailable?: number;
          eitherAvailable?: number;
          faceToFaceAvailable?: number;
        };
        if (cancelled || !res.ok) return;
        setAvailability({
          available: Boolean(data.available),
          maleAvailable: data.maleAvailable ?? 0,
          femaleAvailable: data.femaleAvailable ?? 0,
          eitherAvailable: data.eitherAvailable ?? 0,
          faceToFaceAvailable: data.faceToFaceAvailable ?? 0
        });
      } catch {
        /* ignore */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const phoneError = state.requesterPhone.trim().length === 0 ? 'Phone number is required.' : undefined;
  const emailError =
    state.requesterEmail.trim().length === 0
      ? 'Email is required.'
      : !isValidEmail(state.requesterEmail)
        ? 'Enter a valid email address.'
        : undefined;
  const consentError = !state.consentAcknowledged ? 'Please acknowledge the confidentiality notice.' : undefined;
  const employmentError = !state.employmentAttested
    ? 'Employment attestation is required.'
    : !state.bureau.trim()
      ? 'Bureau is required.'
      : state.employmentType !== 'civilian' && state.employmentType !== 'sworn'
        ? 'Select Civilian or Sworn.'
        : undefined;

  const baseReady = !phoneError && !emailError && !consentError && !employmentError;
  const canSubmit = !submitting && baseReady;
  const canImmediate =
    !immediateBusy && baseReady && Boolean(sexPreference) && Boolean(contactMode);

  const submitRequest = async (mode: 'form' | 'faceToFace'): Promise<void> => {
    setError(undefined);
    setSuccess(undefined);
    setLocalOnly(false);
    if (!canSubmit) return;

    setSubmitting(true);
    await runAction(
      mode === 'faceToFace' ? 'Submitting face-to-face request…' : 'Submitting request…',
      async (): Promise<SuccessToast | null> => {
        try {
          const remote = await postRemoteRequest(state, mode);
          if (remote.ok) {
            setSuccess(remote.message);
            setState(defaultState);
            setShowFaceToFace(false);
            return {
              title: mode === 'faceToFace' ? 'Face-to-face request sent' : 'Request submitted',
              message: remote.message
            };
          }

          appendLocalRequest({
            submittedAt: new Date().toISOString(),
            requesterName: state.requesterName.trim() || undefined,
            requesterPhone: state.requesterPhone.trim(),
            requesterEmail: state.requesterEmail.trim(),
            preferredContact: state.preferredContact.trim() || undefined,
            description: state.description.trim() || undefined,
            consentAcknowledged: state.consentAcknowledged
          });
          setLocalOnly(true);
          const msg =
            remote.error === 'network' || /503|404|Failed/.test(remote.error)
              ? 'Saved on this device only (intake API not reachable). Contact the Peer Support Therapist directly.'
              : `Could not reach staff (${remote.error}). Saved on this device as a backup.`;
          setSuccess(msg);
          setState(defaultState);
          setShowFaceToFace(false);
          return { title: 'Saved on this device', message: msg };
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Unknown error submitting request.');
          return null;
        } finally {
          setSubmitting(false);
        }
      },
      toast => toast ?? undefined
    );
  };

  const onImmediate = async (): Promise<void> => {
    setImmediateError(undefined);
    setImmediateResult(undefined);
    setQueueWait(undefined);
    if (!canImmediate) return;
    if (sexPreference !== 'male' && sexPreference !== 'female' && sexPreference !== 'either') return;
    if (contactMode !== 'chat' && contactMode !== 'voice') return;
    setImmediateBusy(true);
    await runAction('Connecting you with a peer…', async (): Promise<SuccessToast | null> => {
      try {
        const accessCode = getStoredSiteUseCode();
        if (!accessCode) {
          setImmediateError('Site use code missing. Refresh and unlock PEERPoint again.');
          return null;
        }
        const res = await fetch('/api/immediate-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessCode,
            sexPreference,
            contactMode,
            requesterName: state.requesterName.trim() || undefined,
            requesterPhone: state.requesterPhone.trim(),
            requesterEmail: state.requesterEmail.trim(),
            consentAcknowledged: state.consentAcknowledged,
            employmentAttested: state.employmentAttested,
            bureau: state.bureau.trim(),
            employmentType: state.employmentType
          })
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          requestId?: string;
          memberJoinToken?: string;
          contactMode?: 'chat' | 'voice';
          status?: string;
          message?: string;
          leadersNotified?: number;
          leaderCount?: number;
          roomCode?: string;
          joinUrl?: string;
        };
        if (!res.ok) {
          const leaderNote =
            typeof data.leaderCount === 'number' && data.leaderCount > 0
              ? ' Peer Support Leaders were notified.'
              : '';
          setImmediateError((data.error ?? 'Could not start immediate contact.') + leaderNote);
          return null;
        }
        if (data.roomCode && data.contactMode) {
          setImmediateResult({
            roomCode: data.roomCode,
            contactMode: data.contactMode,
            joinUrl:
              data.joinUrl ??
              (data.contactMode === 'voice' ? `/voice?room=${data.roomCode}` : `/chat?room=${data.roomCode}`),
            message: data.message ?? 'A peer is ready.'
          });
          return { title: 'Connected', message: `Room code ${data.roomCode} is ready.` };
        }
        if (!data.requestId || !data.memberJoinToken || !data.contactMode) {
          setImmediateError(data.error ?? 'Could not start immediate contact.');
          return null;
        }
        setQueueWait({
          requestId: data.requestId,
          memberJoinToken: data.memberJoinToken,
          contactMode: data.contactMode,
          status: 'queued',
          message:
            data.message ??
            'Waiting for an on-call peer to accept. Stay on this page — we will show your room code when ready, and email it to you.'
        });
        return {
          title: 'In the queue',
          message: 'An on-call peer was notified. Keep this page open.'
        };
      } catch {
        setImmediateError('Network error. Try again, or submit a regular request below.');
        return null;
      } finally {
        setImmediateBusy(false);
      }
    }, toast => toast ?? undefined);
  };

  React.useEffect(() => {
    if (!queueWait || queueWait.status !== 'queued') return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(
          `/api/peer-queue?id=${encodeURIComponent(queueWait.requestId)}&token=${encodeURIComponent(queueWait.memberJoinToken)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          room?: string;
          contactMode?: 'chat' | 'voice';
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setImmediateError(data.error ?? 'Queue session expired. Start again if you still need help.');
          setQueueWait(undefined);
          return;
        }
        if (data.status === 'closed') {
          setImmediateError(
            'The on-call peer could not take this request. Peer Support Leaders were notified — try again shortly or submit a follow-up below.'
          );
          setQueueWait(undefined);
          return;
        }
        if (data.status === 'assigned' && data.room) {
          const mode = data.contactMode === 'voice' ? 'voice' : queueWait.contactMode;
          const joinUrl = mode === 'voice' ? `/voice?room=${data.room}` : `/chat?room=${data.room}`;
          setImmediateResult({
            roomCode: data.room,
            contactMode: mode,
            joinUrl,
            message:
              'A peer accepted. Check your email for this room code (and a one-tap join link). If you get disconnected, enter the same code to reconnect. Codes expire after 24 hours of no use.'
          });
          setQueueWait(prev => (prev ? { ...prev, status: 'assigned', message: data.message ?? prev.message } : prev));
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return (): void => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [queueWait]);

  const localCount = loadLocalRequests().length;

  return (
    <div className="page-shell page-shell-wide">
      {!showImmediate && !showFaceToFace && !showFollowUp ? (
        <HomeHub
          available={availability?.available ?? null}
          chatVoiceCount={availability?.eitherAvailable}
          onImmediate={() => {
            setShowImmediate(true);
            setShowFaceToFace(false);
            setShowFollowUp(false);
          }}
          onFaceToFace={() => {
            setShowFaceToFace(true);
            setShowImmediate(false);
            setShowFollowUp(false);
          }}
          onFollowUp={() => {
            setShowFollowUp(true);
            setShowImmediate(false);
            setShowFaceToFace(false);
          }}
        />
      ) : null}

      {showImmediate || showFaceToFace || showFollowUp ? (
        <>
          <h2>Request Peer Support</h2>
          <p className="lede">If this is an emergency, call 911. For crisis support, call or text 988.</p>
        </>
      ) : null}

      {showImmediate ? (
      <section
        className="home-form-panel"
      >
        <div className="home-form-panel__head">
          <h3 style={{ margin: 0 }}>Talk to a peer now</h3>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setShowImmediate(false);
              setQueueWait(undefined);
            }}
          >
            Back
          </button>
        </div>
        <p className="home-form-panel__intro">
          Choose how you’d like to connect. When a peer accepts, you’ll get a room code by email. Keep this page open.
        </p>

        {availability ? (
          <div
            className={`availability-board ${availability.available ? 'availability-board--open' : 'availability-board--closed'}`}
            role="status"
            aria-live="polite"
          >
            <div className="availability-board__title">
              {availability.available ? 'Peers free on call now' : 'No peers free on call right now'}
            </div>
            <div className="availability-board__stats">
              <div className="availability-stat">
                <span className="availability-stat__value">{availability.maleAvailable}</span>
                <span className="availability-stat__label">Male</span>
              </div>
              <div className="availability-stat">
                <span className="availability-stat__value">{availability.femaleAvailable}</span>
                <span className="availability-stat__label">Female</span>
              </div>
              <div className="availability-stat availability-stat--total">
                <span className="availability-stat__value">{availability.eitherAvailable}</span>
                <span className="availability-stat__label">Chat / voice</span>
              </div>
              <div className="availability-stat">
                <span className="availability-stat__value">{availability.faceToFaceAvailable}</span>
                <span className="availability-stat__label">Face to face</span>
              </div>
            </div>
            <p className="availability-board__note">
              {availability.available
                ? 'Names are not shown. Peers already helping someone else are not counted as free.'
                : 'You can still request face-to-face or leave a follow-up request.'}
            </p>
          </div>
        ) : (
          <p className="availability-board availability-board--loading" role="status">
            Checking who is free on call…
          </p>
        )}

          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label>
              Name (optional)
              <input
                value={state.requesterName}
                onChange={e => setState(s => ({ ...s, requesterName: e.target.value }))}
              />
            </label>
            <label>
              Phone number (required)
              <input
                value={state.requesterPhone}
                onChange={e => setState(s => ({ ...s, requesterPhone: e.target.value }))}
              />
            </label>
            <label>
              Email (required)
              <input
                value={state.requesterEmail}
                onChange={e => setState(s => ({ ...s, requesterEmail: e.target.value }))}
              />
            </label>
            <EmploymentFields state={state} setState={setState} />

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <legend style={{ padding: '0 4px' }}>I am most comfortable talking with</legend>
              <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="sexPreference"
                  checked={sexPreference === 'male'}
                  onChange={() => setSexPreference('male')}
                />
                Male peer
              </label>
              <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="sexPreference"
                  checked={sexPreference === 'female'}
                  onChange={() => setSexPreference('female')}
                />
                Female peer
              </label>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="sexPreference"
                  checked={sexPreference === 'either'}
                  onChange={() => setSexPreference('either')}
                />
                Either
              </label>
            </fieldset>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <legend style={{ padding: '0 4px' }}>Connect by</legend>
              <label style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="contactMode"
                  checked={contactMode === 'chat'}
                  onChange={() => setContactMode('chat')}
                />
                Chat
              </label>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="contactMode"
                  checked={contactMode === 'voice'}
                  onChange={() => setContactMode('voice')}
                />
                Voice call
              </label>
            </fieldset>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={state.consentAcknowledged}
                onChange={e => setState(s => ({ ...s, consentAcknowledged: e.target.checked }))}
              />
              <span>
                I understand this is peer support (not clinical care or emergency services) and that staff may contact me
                using the details I provide.
              </span>
            </label>

            {immediateError ? <div style={{ color: '#a4262c' }}>{immediateError}</div> : null}
            {queueWait && queueWait.status === 'queued' ? (
              <div role="status" style={{ color: '#0f766e' }}>
                <p style={{ margin: '0 0 6px' }}>{queueWait.message}</p>
                <p style={{ margin: 0, fontSize: 13 }}>Waiting for peer to accept…</p>
              </div>
            ) : null}
            {immediateResult ? (
              <div style={{ color: '#107c10' }}>
                <p>{immediateResult.message}</p>
                <p>
                  Room code:{' '}
                  <strong style={{ letterSpacing: '0.06em', fontSize: 18 }}>{immediateResult.roomCode}</strong>
                </p>
                <p style={{ fontSize: 13 }}>
                  We also emailed this code to you. If you disconnect, open{' '}
                  {immediateResult.contactMode === 'voice' ? 'Peer voice' : 'Peer chat'} and enter the same code.
                </p>
                <p>
                  <Link to={immediateResult.joinUrl}>
                    Open {immediateResult.contactMode === 'voice' ? 'Peer voice' : 'Peer chat'} now
                  </Link>
                </p>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!canImmediate || Boolean(queueWait && queueWait.status === 'queued')}
                onClick={() => void onImmediate()}
              >
                {immediateBusy
                  ? 'Connecting…'
                  : queueWait && queueWait.status === 'queued'
                    ? 'Waiting…'
                    : 'Connect now'}
              </button>
            </div>
          </div>
      </section>
      ) : null}

      {showFaceToFace ? (
      <section
        className="home-form-panel"
      >
        <div className="home-form-panel__head">
          <h3 style={{ margin: 0 }}>Meet face to face</h3>
          <button type="button" className="btn-ghost" onClick={() => setShowFaceToFace(false)}>
            Back
          </button>
        </div>
        <p className="home-form-panel__intro">
          Request an in-person meeting. Staff will follow up to arrange time and place.
        </p>
        {availability ? (
          <p
            className={`ftf-availability ${availability.faceToFaceAvailable > 0 ? 'ftf-availability--open' : ''}`}
            role="status"
          >
            {availability.faceToFaceAvailable > 0
              ? `${availability.faceToFaceAvailable} on-call peer${availability.faceToFaceAvailable === 1 ? '' : 's'} available for face to face right now.`
              : 'No on-call peers are marked available for face to face right now — you can still submit a request for follow-up.'}
          </p>
        ) : null}
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label>
              Name (optional)
              <input
                value={state.requesterName}
                onChange={e => setState(s => ({ ...s, requesterName: e.target.value }))}
              />
            </label>
            <label>
              Phone number (required)
              <input
                value={state.requesterPhone}
                onChange={e => setState(s => ({ ...s, requesterPhone: e.target.value }))}
              />
            </label>
            <label>
              Email (required)
              <input
                value={state.requesterEmail}
                onChange={e => setState(s => ({ ...s, requesterEmail: e.target.value }))}
              />
            </label>
            <EmploymentFields state={state} setState={setState} />
            <label>
              What would help? / scheduling notes (optional)
              <textarea
                rows={3}
                value={state.description}
                onChange={e => setState(s => ({ ...s, description: e.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={state.consentAcknowledged}
                onChange={e => setState(s => ({ ...s, consentAcknowledged: e.target.checked }))}
              />
              <span>
                I understand this is peer support (not clinical care or emergency services) and that staff may contact me
                using the details I provide.
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={!canSubmit} onClick={() => void submitRequest('faceToFace')}>
                {submitting ? 'Submitting…' : 'Submit face-to-face request'}
              </button>
            </div>
          </div>
      </section>
      ) : null}

      {showFollowUp ? (
        <section className="home-form-panel">
          <div className="home-form-panel__head">
            <h3 style={{ margin: 0 }}>Leave a follow-up request</h3>
            <button type="button" className="btn-ghost" onClick={() => setShowFollowUp(false)}>
              Back
            </button>
          </div>
          <p className="home-form-panel__intro">
            Not urgent? Submit a written request and staff will follow up.
          </p>

          {error && <div style={{ marginTop: 12, color: '#a4262c', whiteSpace: 'pre-wrap' }}>{error}</div>}
          {success && (
            <div style={{ marginTop: 12, color: localOnly ? '#8a6116' : '#107c10', whiteSpace: 'pre-wrap' }}>
              {success}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <label>
              Name (optional)
              <input
                value={state.requesterName}
                onChange={e => setState(s => ({ ...s, requesterName: e.target.value }))}
              />
            </label>
            <label>
              Phone number (required)
              <input
                value={state.requesterPhone}
                onChange={e => setState(s => ({ ...s, requesterPhone: e.target.value }))}
              />
              {phoneError && <div style={{ color: '#a4262c' }}>{phoneError}</div>}
            </label>
            <label>
              Email (required)
              <input
                value={state.requesterEmail}
                onChange={e => setState(s => ({ ...s, requesterEmail: e.target.value }))}
              />
              {emailError && <div style={{ color: '#a4262c' }}>{emailError}</div>}
            </label>
            <EmploymentFields state={state} setState={setState} />
            {employmentError && <div style={{ color: '#a4262c' }}>{employmentError}</div>}
            <label>
              Preferred contact (optional)
              <input
                value={state.preferredContact}
                onChange={e => setState(s => ({ ...s, preferredContact: e.target.value }))}
                placeholder="Phone, email, or text"
              />
            </label>
            <label>
              What would help? (optional)
              <textarea
                rows={4}
                value={state.description}
                onChange={e => setState(s => ({ ...s, description: e.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={state.consentAcknowledged}
                onChange={e => setState(s => ({ ...s, consentAcknowledged: e.target.checked }))}
              />
              <span>
                I understand this is peer support (not clinical care or emergency services) and that staff may contact me
                using the details I provide.
              </span>
            </label>
            {consentError && <div style={{ color: '#a4262c' }}>{consentError}</div>}
            <button type="button" disabled={!canSubmit} onClick={() => void submitRequest('form')}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>

          {localCount > 0 ? (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text)' }}>
              Local backups on this device: {localCount}.{' '}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const blob = new Blob([exportLocalRequestsJson()], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'peerpoint-local-requests.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export JSON
              </button>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
