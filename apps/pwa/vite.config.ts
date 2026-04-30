import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
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
        theme_color: '#1b4332',
        background_color: '#1b4332',
        display: 'standalone',
        orientation: 'natural',
        start_url: '/',
        scope: '/',
        categories: ['health', 'medical'],
        icons: [
          {
            src: 'peerpoint-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/]
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
