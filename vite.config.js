import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/transactions': 'http://localhost:5000',
      '/budget': 'http://localhost:5000'
    }
  }
})
