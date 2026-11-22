import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Anime World',
        short_name: 'AnimeWorld',
        description: 'An explorable stylized 3D island world.',
        theme_color: '#7ec8f0',
        background_color: '#bfe6fb',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,glb}'],
        // large environment kits are cached on first use instead of precached
        globIgnores: ['**/assets/environment/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/environment/'),
            handler: 'CacheFirst',
            options: { cacheName: 'environment-assets', expiration: { maxEntries: 40 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  server: { host: true },
})
