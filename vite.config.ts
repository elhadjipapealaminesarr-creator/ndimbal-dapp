import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP are REQUIRED by the Zama SDK: it runs FHE in a Web Worker that needs SharedArrayBuffer.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
