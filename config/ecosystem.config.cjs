// PM2 Ecosystem Configuration for Tradebaas
// Production setup voor app.tradebazen.nl
// Updated for monorepo structure (FASE 7)

const path = require('path');
const dotenv = require('dotenv');

// Load production environment variables
const envPath = path.join(__dirname, '../.env.production');
const envConfig = dotenv.config({ path: envPath });

if (envConfig.error) {
  console.error('Failed to load .env.production:', envConfig.error);
  process.exit(1);
}

module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      script: 'src/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/root/Tradebaas-1/apps/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        ...envConfig.parsed, // Spread all env vars from .env.production
      },
      error_file: '/root/Tradebaas-1/apps/backend/logs/error.log',
      out_file: '/root/Tradebaas-1/apps/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
