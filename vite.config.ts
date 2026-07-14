import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHmac } from 'node:crypto'

// Sign a long-lived dev session token from the machine's env, so local dev stays
// authenticated against the (now token-gated) API without shipping any secret to the client.
function devSessionToken(): string | null {
  const secret = process.env.MINDMAP_JWT_SECRET
  const sub = process.env.MINDMAP_USER_ID
  const email = process.env.MINDMAP_AUTH_EMAIL || 'dev@localhost'
  if (!secret || !sub) return null
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub, email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 })
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

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
        // Inject a dev session token (signed from the machine's env) so local dev is
        // authenticated against the token-gated API. Never bundled into client source.
        configure: (proxy) => {
          const token = devSessionToken()
          if (token) proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Authorization', `Bearer ${token}`))
        },
      },
    },
  },
})
