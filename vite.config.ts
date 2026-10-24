import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'map-pin-icon-180.png', 'map-pin-icon-512.png'],
      manifest: {
        id: './',
        name: 'Travel Archive',
        short_name: 'Travel Archive',
        description: '旅の記憶をiPhoneの中に残す、オフライン対応の旅行記録アプリ',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        theme_color: '#f4f0e7',
        background_color: '#f4f0e7',
        icons: [
          {
            src: 'map-pin-icon-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'map-pin-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2,json,geojson}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
})

