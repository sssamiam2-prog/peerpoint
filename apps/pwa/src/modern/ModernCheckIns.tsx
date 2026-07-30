import * as React from 'react';
import { ModernBackButton } from './ModernBackButton';

const KEY = 'peerpoint_modern_checkins';

export function ModernCheckIns(): React.ReactElement {
  const [selected, setSelected] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  const save = (): void => {
    if (!selected) return;
    try {
      const current = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[];
      localStorage.setItem(KEY, JSON.stringify([...current, { mood: selected, at: Date.now() }]));
    } catch {
      /* ignore */
    }
    setSaved(true);
  };

  return (
    <section className="modern-page modern-checkin">
      <ModernBackButton to="/" label="Home" />
      <p className="modern-eyebrow">PEERPOINT · CHECK-IN</p>
      <h1>How are you feeling?</h1>
      <p>Take a moment to check in with yourself. This stays on your device.</p>
      <div className="modern-moods">
        {(
          [
            ['😔', 'Rough'],
            ['😕', 'Low'],
            ['😐', 'Okay'],
            ['🙂', 'Good'],
            ['😊', 'Great']
          ] as const
        ).map(([icon, label]) => (
          <button
            key={label}
            type="button"
            className={selected === label ? 'selected' : ''}
            onClick={() => {
              setSelected(label);
              setSaved(false);
            }}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="modern-primary" disabled={!selected} onClick={save}>
        {saved ? 'Check-in saved' : 'Save check-in'}
      </button>
    </section>
  );
}
