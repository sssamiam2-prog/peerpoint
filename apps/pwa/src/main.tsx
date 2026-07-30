import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// Inline CSS into the JS bundle so a poisoned CDN cache for *.css cannot leave the app unstyled.
import appCss from './index.css?inline';
import App from './App.tsx';

(function injectAppCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('peerpoint-app-css')) return;
  const style = document.createElement('style');
  style.id = 'peerpoint-app-css';
  style.textContent = appCss;
  document.head.appendChild(style);
})();

// Production: install SW with update checks. Avoid reload loops that brick installed PWAs.
if (import.meta.env.PROD) {
  const RELOAD_KEY = 'peerpoint_sw_reload_once';

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === '1') return;
        sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        /* ignore */
      }
      window.location.reload();
    });
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Activate new SW once; do not keep prompting/reloading in a loop.
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = (): void => {
        void registration.update().catch(() => undefined);
      };

      check();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);

      // Occasional check while open (not aggressive enough to thrash).
      window.setInterval(check, 5 * 60 * 1000);
    }
  });
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const r of registrations) {
      void r.unregister();
    }
  });
  if (typeof caches !== 'undefined') {
    void caches.keys().then(keys => {
      for (const key of keys) {
        if (key.toLowerCase().includes('workbox') || key.toLowerCase().includes('peerpoint')) {
          void caches.delete(key);
        }
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
