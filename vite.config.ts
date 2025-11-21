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
    port: 5000, // Production port (was 5173)
    strictPort: false, // Allow fallback if needed
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'app.tradebazen.nl',
      '.tradebazen.nl', // Allow all subdomains
    ],
    hmr: {
      overlay: true, // Show errors in overlay
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
