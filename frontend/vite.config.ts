import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    proxy: {
      '/run': 'http://localhost:3000',
      '/agent': 'http://localhost:3000',
      '/config': 'http://localhost:3000',
      '/reset': 'http://localhost:3000',
    },
  },
})
