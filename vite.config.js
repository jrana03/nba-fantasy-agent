import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep the OpenAI key in .env server-side only: Vite exposes VITE_* vars, nothing else.
  envPrefix: 'VITE_',
})
