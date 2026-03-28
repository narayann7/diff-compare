import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use relative paths so the built index.html works both as a web app
  // (served from a web server) and inside a VSCode WebviewPanel (where
  // asset URIs are rewritten by the extension host).
  base: './',
  build: {
    outDir: 'dist/webview',
  },
})
