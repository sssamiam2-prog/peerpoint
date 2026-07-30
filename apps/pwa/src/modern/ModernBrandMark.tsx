import { Link } from 'react-router-dom';

type Props = {
  /** Compact bar for inner pages; hero for home */
  size?: 'bar' | 'hero';
};

export function ModernBrandMark({ size = 'bar' }: Props): React.ReactElement {
  if (size === 'hero') {
    return (
      <div className="modern-brand-hero">
        <img
          src="/peerpoint-logo.png"
          alt="PEERPoint — Salt Lake County Sheriff’s Office"
          className="modern-logo"
        />
      </div>
    );
  }

  return (
    <Link to="/" className="modern-brand-bar" aria-label="PEERPoint home">
      <img src="/peerpoint-icon.png" alt="" className="modern-brand-bar__icon" width={40} height={40} />
      <span className="modern-brand-bar__text">
        <strong>
          <span className="modern-brand-bar__peer">PEER</span>
          <span className="modern-brand-bar__point">POINT</span>
        </strong>
        <small>Salt Lake County Sheriff’s Office</small>
      </span>
    </Link>
  );
}
