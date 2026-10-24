import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), mkcert()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'react-icons/tb': path.resolve(import.meta.dirname, './src/lib/customIcons.js'),
      'react-icons/bi': path.resolve(import.meta.dirname, './src/lib/customIcons.js'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'react-icons', 'react-icons/fi', 'sweetalert2', 'qrcode.react'],
  },
  server: { 
    host: '0.0.0.0', 
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/storage': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
              return 'vendor-recharts'
            }
            if (id.includes('html5-qrcode')) {
              return 'vendor-qr-scanner'
            }
            if (id.includes('sweetalert2')) {
              return 'vendor-swal'
            }
            if (id.includes('react-icons')) {
              return 'vendor-icons'
            }
            if (
              id.includes('/react/') ||
              id.includes('\\react\\') ||
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('scheduler')
            ) {
              return 'vendor-react'
            }
          }
        },
      },
    },
  },
})
