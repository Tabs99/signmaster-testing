import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiRoutesPlugin } from './server/dev/apiRoutesPlugin'

export default defineConfig({
  // `apiRoutesPlugin` only applies to `vite serve`, so it runs the `api/`
  // handlers during development and does nothing to a production build, where
  // Vercel turns the same files into serverless functions.
  plugins: [react(), apiRoutesPlugin()],
  server: {
    port: 4200,
    strictPort: true,
  },
})
