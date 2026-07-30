import { type CallState } from '../lib/callState';

export function ModernCallOverlay(props: { state: CallState; onAccept: () => void; onDecline: () => void; onEnd: () => void }): React.ReactElement | null {
  if (!['ringing', 'joining', 'active'].includes(props.state)) return null;
  const active = props.state === 'active';
  return <div className="modern-call-overlay" role="dialog" aria-modal="true"><div className="modern-call-avatar">⌁</div><p>{active ? 'Voice call connected' : props.state === 'joining' ? 'Joining voice call…' : 'Incoming voice call'}</p><h2>Peer Support</h2>{active ? <button className="modern-call-end" onClick={props.onEnd}>End call</button> : <div className="modern-call-actions"><button onClick={props.onDecline}>Decline</button><button className="modern-call-accept" onClick={props.onAccept}>Accept</button></div>}</div>;
}
