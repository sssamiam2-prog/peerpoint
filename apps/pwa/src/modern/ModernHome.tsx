import { Link } from 'react-router-dom';
import { ModernBrandMark } from './ModernBrandMark';

export function ModernHome(): React.ReactElement {
  return (
    <section className="modern-home modern-home--fit">
      <ModernBrandMark size="hero" />
      <div className="modern-hero">
        <p className="modern-eyebrow">PEERPOINT · CONFIDENTIAL</p>
        <h1 className="modern-brand-title">
          <span className="modern-brand-title__peer">PEER</span>
          <span className="modern-brand-title__point">POINT</span>
        </h1>
        <p className="modern-hero-tagline">Stronger together — always here.</p>
        <Link className="modern-crisis-card" to="/m/resources#crisis">
          <strong>Emergency resources</strong>
          <span>In immediate danger, call 911. Call or text 988 for crisis support. →</span>
        </Link>
        <Link className="modern-primary" to="/m/request">
          Request Peer Support <span>→</span>
        </Link>
        <Link className="modern-secondary" to="/m/resources">
          I’m OK for Now
        </Link>
      </div>
    </section>
  );
}
