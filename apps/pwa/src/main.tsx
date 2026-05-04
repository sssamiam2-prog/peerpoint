import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// Production: install SW. Development: do not register (avoids cached bundles hiding fixes);
// also unregister any prior dev SW from older sessions.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const r of registrations) {
      void r.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
