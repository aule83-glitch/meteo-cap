import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({command}) => ({
  plugins: [react({ include: '**/*.{jsx,js}' })],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  server: {
    port: 3000,
    proxy: {
      // W trybie dev bez Dockera: backend na localhost:8000
      // W Dockerze nginx obsługuje proxy — ten config jest ignorowany
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'build' },
}))
