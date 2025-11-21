// PM2 Ecosystem Configuration for Tradebaas
// Copy this file to ecosystem.config.cjs and update paths for your system
//
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      script: 'npm',
      args: 'start',
      cwd: '/absolute/path/to/Tradebaas/backend',  // ⚠️ CHANGE THIS TO YOUR PATH!
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'tradebaas-frontend',
      script: 'npx',
      args: 'serve -s dist -l 5000',
      cwd: '/absolute/path/to/Tradebaas',  // ⚠️ CHANGE THIS TO YOUR PATH!
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
