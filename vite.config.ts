import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5000,
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
