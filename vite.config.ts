import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MindMap',
        short_name: 'MindMap',
        description: 'Visual mind mapping and diagram tool',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#6366f1',
        icons: [
          { src: '/icons/favicon-16x16.png',          sizes: '16x16',   type: 'image/png' },
          { src: '/icons/favicon-32x32.png',          sizes: '32x32',   type: 'image/png' },
          { src: '/icons/pwa-64x64.png',              sizes: '64x64',   type: 'image/png' },
          { src: '/icons/apple-touch-icon.png',       sizes: '180x180', type: 'image/png' },
          { src: '/icons/pwa-192x192.png',            sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512x512.png',            sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-icon-512x512.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
})
