import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
      '/api': { target: 'http://backend:8000', changeOrigin: true },
    },
  },
  build: { outDir: 'build' },
})
