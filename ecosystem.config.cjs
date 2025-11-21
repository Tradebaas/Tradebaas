module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      cwd: '/root/Tradebaas/backend',
      script: 'npm',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/root/Tradebaas/logs/backend-error.log',
      out_file: '/root/Tradebaas/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'tradebaas-frontend',
      cwd: '/root/Tradebaas',
      script: 'npm',
      args: 'run dev:frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'development'
      },
      error_file: '/root/Tradebaas/logs/frontend-error.log',
      out_file: '/root/Tradebaas/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
