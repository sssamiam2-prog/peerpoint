import { Link } from 'react-router-dom';

export function ModernHome(): React.ReactElement {
  return <section className="modern-home">
    <img src="/peerpoint-logo.png" alt="PEERPoint" className="modern-logo" />
    <div className="modern-hero"><p className="modern-eyebrow">CONFIDENTIAL PEER SUPPORT</p><h1>You’re not alone.</h1><p>Connect with trained peer support staff when you need someone who understands.</p>
      <Link className="modern-primary" to="/m/request">Request Peer Support <span>→</span></Link>
      <Link className="modern-secondary" to="/m/resources">I’m OK for Now</Link>
    </div>
    <Link className="modern-crisis-card" to="/m/resources#crisis"><strong>Emergency resources</strong><span>If you are in immediate danger, call 911. Call or text 988 for crisis support. →</span></Link>
  </section>;
}
