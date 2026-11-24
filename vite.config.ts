import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Get Hitched',
        short_name: 'Get Hitched',
        description: 'Plan your wedding together',
        theme_color: '#1E1A14',
        background_color: '#FDFAF5',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
});
