import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// RepCount has a single .env in the repo root (see CLAUDE.md), no
// separate copy per app.
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  envPrefix: 'SUPABASE_',
})
