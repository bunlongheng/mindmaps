import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mindmaps',
        short_name: 'Mindmaps',
        description: 'Visual mind map and diagram tool',
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
      devOptions: { enabled: true, type: 'module' },
      workbox: {
        // Don't precache HTML — always fetch fresh from network to avoid stale-cache blank screen.
        // Precaching '/' pinned a stale index.html referencing purged chunk hashes after each deploy,
        // causing intermittent white screens; navigation is served by the NetworkFirst rule below.
        globPatterns: ['**/*.{js,css,png,svg,ico}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          // Navigation requests: always try network first, fall back to cache
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html-cache', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://mindmaps-bheng.vercel.app',
        changeOrigin: true,
        secure: true,
        // Inject the AI bearer key from the dev machine's env so it is never bundled
        // into client source. Prod trusts same-origin browser calls instead.
        configure: (proxy) => {
          const key = process.env.MINDMAP_AI_API_KEY
          if (key) proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Authorization', `Bearer ${key}`))
        },
      },
    },
  },
})
