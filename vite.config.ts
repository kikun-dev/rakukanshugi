import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '楽勘主義',
        short_name: '楽勘',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#742581',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
      },
      workbox: {
        // まずは静的アセットのみキャッシュ。後でオフラインfallback/同期を拡張
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
})
