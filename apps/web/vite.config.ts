import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Daylog — Your time, understood',
        short_name: 'Daylog',
        description: 'A private time journal and planning companion.',
        theme_color: '#153dff',
        background_color: '#f5f5f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3080', changeOrigin: false } },
  },
  preview: {
    port: 4380,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3080', changeOrigin: false } },
  },
  build: { target: 'es2022' },
});
