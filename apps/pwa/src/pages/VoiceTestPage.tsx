import * as React from 'react';
import { Link } from 'react-router-dom';
import { VoiceCheckPanel, loadVoiceDisguisePref } from '../components/VoiceCheckModal';
import type { VoiceDisguisePreset } from '../lib/voiceDisguise';

/**
 * Full-page mic + speaker self-check (Staff / deep link /voice-test).
 * Members normally open the same tools from a modal on Peer voice.
 */
export function VoiceTestPage(): React.ReactElement {
  const [disguise, setDisguise] = React.useState<VoiceDisguisePreset>(() => loadVoiceDisguisePref());

  return (
    <div className="page-shell">
      <h2>Voice check</h2>
      <VoiceCheckPanel disguise={disguise} onDisguiseChange={setDisguise} />
      <p style={{ fontSize: 14, marginTop: 16 }}>
        Ready for a session? <Link to="/voice">Peer voice</Link>
        {' · '}
        <Link to="/staff">Staff</Link>
      </p>
    </div>
  );
}
