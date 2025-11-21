import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173, // Vite default port for dev server
    strictPort: false, // Allow fallback if needed
    allowedHosts: ['localhost', '127.0.0.1'], // Add your production domain here
    hmr: {
      clientPort: 443, // HMR via HTTPS reverse proxy
      protocol: 'wss', // WebSocket Secure for HMR
      host: 'localhost', // Change to your production domain
    },
    watch: {
      // Ignore backend files that change frequently
      ignored: [
        '**/state/backend-state.json',
        '**/backend/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/data/**',
        '**/logs/**',
        '**/.env',
        '**/.env.*',
      ],
    },
  },
});
