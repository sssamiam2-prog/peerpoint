import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredSiteUseCode, saveModernSession } from '../lib/modernSession';
import { ModernBackButton } from './ModernBackButton';

type PeerOption = {
  username: string;
  displayName: string;
  firstName: string;
  bureau: string;
  sex?: 'male' | 'female';
};

type Step = 'intro' | 'choice' | 'person' | 'sex';

export function ModernRequestIntro(): React.ReactElement {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>('intro');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [peers, setPeers] = React.useState<PeerOption[]>([]);
  const [peersLoading, setPeersLoading] = React.useState(false);
  const [maleAvailable, setMaleAvailable] = React.useState(0);
  const [femaleAvailable, setFemaleAvailable] = React.useState(0);

  const loadAvailability = React.useCallback(async (): Promise<void> => {
    setPeersLoading(true);
    try {
      const res = await fetch('/api/peer-queue');
      const data = (await res.json()) as {
        peers?: PeerOption[];
        maleAvailable?: number;
        femaleAvailable?: number;
      };
      setPeers(Array.isArray(data.peers) ? data.peers : []);
      setMaleAvailable(typeof data.maleAvailable === 'number' ? data.maleAvailable : 0);
      setFemaleAvailable(typeof data.femaleAvailable === 'number' ? data.femaleAvailable : 0);
    } catch {
      setPeers([]);
      setMaleAvailable(0);
      setFemaleAvailable(0);
    } finally {
      setPeersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (step === 'choice' || step === 'person' || step === 'sex') {
      void loadAvailability();
    }
  }, [step, loadAvailability]);

  const begin = async (payload: {
    matchMode: 'anyone' | 'specific';
    sexPreference?: 'male' | 'female' | 'either';
    preferredUsername?: string;
  }): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/peer-support/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUseCode: getStoredSiteUseCode(),
          matchMode: payload.matchMode,
          sexPreference: payload.sexPreference ?? 'either',
          preferredUsername: payload.preferredUsername
        })
      });
      const data = (await response.json()) as {
        requestId?: string;
        anonymousSessionToken?: string;
        sessionToken?: string;
        publicSupportCode?: string;
        supportCode?: string;
        error?: string;
      };
      const token = data.anonymousSessionToken ?? data.sessionToken;
      const code = data.publicSupportCode ?? data.supportCode;
      if (!response.ok || !data.requestId || !token || !code) {
        throw new Error(data.error || 'Could not start a support session.');
      }
      saveModernSession({
        requestId: data.requestId,
        anonymousSessionToken: token,
        publicSupportCode: code
      });
      navigate('/m/waiting');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a support session.');
    } finally {
      setBusy(false);
    }
  };

  const backFromDetail = (): void => {
    setError('');
    setStep('choice');
  };

  if (step === 'intro') {
    return (
      <section className="modern-page modern-intro">
        <ModernBackButton to="/" label="Back" />
        <p className="modern-eyebrow">PEERPOINT</p>
        <h1>Asking for support is a strength.</h1>
        <ul className="modern-feature-list" aria-label="What to expect">
          <li>
            <b>Confidential</b>
            <span>Your identity is kept private.</span>
          </li>
          <li>
            <b>Trained peers</b>
            <span>Connect with trained support staff.</span>
          </li>
          <li>
            <b>No judgment</b>
            <span>A space to talk, your way.</span>
          </li>
        </ul>
        <button className="modern-primary" type="button" onClick={() => setStep('choice')}>
          Continue →
        </button>
      </section>
    );
  }

  if (step === 'choice') {
    return (
      <section className="modern-page modern-intro">
        <ModernBackButton onClick={() => setStep('intro')} label="Back" />
        <p className="modern-eyebrow">WHO DO YOU WANT TO TALK TO?</p>
        <h1>Choose how we connect you.</h1>
        <p className="modern-choice-lead">
          Pick a specific person, a sex preference, or the next free peer.
        </p>
        {error ? <p className="modern-error">{error}</p> : null}
        <div className="modern-choice-grid" role="group" aria-label="Peer preference">
          <button
            type="button"
            className="modern-choice-card"
            disabled={busy}
            onClick={() => {
              setError('');
              setStep('person');
            }}
          >
            <strong>A specific person</strong>
            <span>Choose from peers free on call right now.</span>
          </button>
          <button
            type="button"
            className="modern-choice-card"
            disabled={busy}
            onClick={() => {
              setError('');
              setStep('sex');
            }}
          >
            <strong>A specific sex</strong>
            <span>Prefer a male or female peer.</span>
          </button>
          <button
            type="button"
            className="modern-choice-card modern-choice-card--primary"
            disabled={busy}
            onClick={() => void begin({ matchMode: 'anyone', sexPreference: 'either' })}
          >
            <strong>I just want to talk</strong>
            <span>Connect me with the next free peer — I don’t care who.</span>
          </button>
        </div>
        {busy ? <p className="modern-muted-status">Starting session…</p> : null}
      </section>
    );
  }

  if (step === 'person') {
    return (
      <section className="modern-page modern-intro">
        <ModernBackButton onClick={backFromDetail} label="Back" />
        <p className="modern-eyebrow">SPECIFIC PERSON</p>
        <h1>Who would you like to talk with?</h1>
        <p className="modern-choice-lead">Only peers free on call for chat or voice are listed.</p>
        {error ? <p className="modern-error">{error}</p> : null}
        {peersLoading ? <p className="modern-muted-status">Loading available peers…</p> : null}
        {!peersLoading && peers.length === 0 ? (
          <p className="modern-error">No peers are free on call right now. Go back and try “I just want to talk,” or try again shortly.</p>
        ) : null}
        <div className="modern-peer-list" role="list">
          {peers.map(peer => (
            <button
              key={peer.username}
              type="button"
              className="modern-peer-option"
              role="listitem"
              disabled={busy}
              onClick={() =>
                void begin({
                  matchMode: 'specific',
                  preferredUsername: peer.username,
                  sexPreference: 'either'
                })
              }
            >
              <strong>{peer.firstName || peer.displayName}</strong>
              <span>
                {[peer.bureau, peer.sex === 'male' ? 'Male' : peer.sex === 'female' ? 'Female' : '']
                  .filter(Boolean)
                  .join(' · ') || 'On call now'}
              </span>
            </button>
          ))}
        </div>
        {busy ? <p className="modern-muted-status">Starting session…</p> : null}
      </section>
    );
  }

  return (
    <section className="modern-page modern-intro">
      <ModernBackButton onClick={backFromDetail} label="Back" />
      <p className="modern-eyebrow">SEX PREFERENCE</p>
      <h1>Who would you prefer to talk with?</h1>
      <p className="modern-choice-lead">We’ll match you with a free peer of that preference when available.</p>
      {error ? <p className="modern-error">{error}</p> : null}
      <div className="modern-choice-grid" role="group" aria-label="Sex preference">
        <button
          type="button"
          className="modern-choice-card"
          disabled={busy || peersLoading || maleAvailable < 1}
          onClick={() => void begin({ matchMode: 'anyone', sexPreference: 'male' })}
        >
          <strong>Male peer</strong>
          <span>
            {peersLoading
              ? 'Checking availability…'
              : maleAvailable > 0
                ? `${maleAvailable} free on call`
                : 'None free on call right now'}
          </span>
        </button>
        <button
          type="button"
          className="modern-choice-card"
          disabled={busy || peersLoading || femaleAvailable < 1}
          onClick={() => void begin({ matchMode: 'anyone', sexPreference: 'female' })}
        >
          <strong>Female peer</strong>
          <span>
            {peersLoading
              ? 'Checking availability…'
              : femaleAvailable > 0
                ? `${femaleAvailable} free on call`
                : 'None free on call right now'}
          </span>
        </button>
      </div>
      {busy ? <p className="modern-muted-status">Starting session…</p> : null}
    </section>
  );
}
