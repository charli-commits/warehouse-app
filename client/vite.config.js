import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isDev = process.env.NODE_ENV !== 'production'

let plugins = [react()]
if (isDev) {
  try {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    plugins.push(basicSsl())
  } catch {}
}

export default defineConfig({
  plugins,
  server: {
    port: 5173,
    host: true,
    https: isDev,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001'
    }
  }
})
