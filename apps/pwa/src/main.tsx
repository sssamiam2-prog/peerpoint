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

// Production: install SW with aggressive update checks so a refresh shows new deploys.
// Development: do not register (avoids cached bundles hiding fixes).
if (import.meta.env.PROD) {
  let refreshing = false;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = () => {
        void registration.update();
      };

      check();

      // Re-check when the tab becomes visible (common after a deploy).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);

      // While the app is open, poll for a new service worker.
      window.setInterval(check, 60 * 1000);
    }
  });
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const r of registrations) {
      void r.unregister();
    }
  });
  // Clear leftover Workbox caches from older sessions.
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
