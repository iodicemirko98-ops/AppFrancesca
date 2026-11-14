import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'] },
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'NoiDue',
        short_name: 'NoiDue',
        description: 'Il nostro spazio privato',
        lang: 'it',
        start_url: '/',
        share_target: { action: '/ricette', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        display: 'standalone',
        background_color: '#FBF6F0',
        theme_color: '#C2603F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
