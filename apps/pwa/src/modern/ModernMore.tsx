import { Link } from 'react-router-dom';
import { InstallAppButton } from '../components/InstallAppButton';
import { setUiMode } from '../lib/uiMode';

export function ModernMore(): React.ReactElement {
  return <section className="modern-page modern-more"><p className="modern-eyebrow">SETTINGS</p><h1>More</h1><div className="modern-settings"><div><b>Appearance</b><span>Modern interface</span><button onClick={() => setUiMode('classic')}>Use classic UI</button></div><Link to="/m/staff"><b>Staff sign-in</b><span>View and respond to support requests</span></Link><div><b>Install PEERPoint</b><InstallAppButton /></div></div></section>;
}
