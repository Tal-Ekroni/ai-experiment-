import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Motion Lab: records real device-motion traces with the live shipping
        // recogniser, so gesture tuning runs on reality instead of synthesis.
        capture: resolve(__dirname, 'capture.html'),
      },
    },
  },
})
