import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages: repo will be renamed to `pulse` → https://gfxroy.github.io/pulse/
// Keep base in sync even before rename so `npm run build` emits correct asset paths.
export default defineConfig({
  base: '/pulse/',
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    port: 4173,
    // Allow Cloudflare quick-tunnel hostnames when sharing to a phone
    allowedHosts: true,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
