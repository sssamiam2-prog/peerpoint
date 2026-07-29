import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version: appVersion } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['peerpoint-icon.png', 'peerpoint-logo.png'],
      devOptions: {
        // Enable install + SW while using `npm run dev` (e.g. phone via HTTPS tunnel).
        enabled: true
      },
      manifest: {
        id: '/',
        name: 'PEERPoint — Salt Lake County Sheriff’s Office',
        short_name: 'PEERPoint',
        description: 'Peer support for Salt Lake County Sheriff’s Office',
        lang: 'en-US',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'natural',
        start_url: '/',
        scope: '/',
        categories: ['health', 'medical'],
        icons: [
          {
            src: 'peerpoint-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'peerpoint-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'peerpoint-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // New deploys activate immediately and drop old precaches (cache bust).
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Do NOT precache HTML — refresh must hit the network for a fresh shell
        // that points at new hashed /assets/* filenames.
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff2,webmanifest}'],
        globIgnores: ['**/docs/**', '**/_headers', '**/index.html'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/docs\//],
        runtimeCaching: [
          {
            // Always try the network first for page loads / refresh.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'peerpoint-pages',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname === '/sw.js' || url.pathname.startsWith('/workbox-'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    // Listen on all interfaces so a tunnel (ngrok, cloudflared) or your phone on LAN can reach dev.
    host: true,
    port: 5173,
    strictPort: true
  }
});
