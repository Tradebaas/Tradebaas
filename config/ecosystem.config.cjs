module.exports = {
  apps: [
    {
      name: 'tradebaas-backend',
      cwd: '/root/Tradebaas-1/backend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false, // tsx watch handles file watching
      max_memory_restart: '1G',
      log_file: '/root/Tradebaas-1/backend/logs/backend.log',
      out_file: '/root/Tradebaas-1/backend/logs/backend-out.log',
      error_file: '/root/Tradebaas-1/backend/logs/backend-error.log',
      time: true
    },
    {
      name: 'tradebaas-frontend',
      cwd: '/root/Tradebaas-1',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false, // Vite HMR handles file watching
      max_memory_restart: '512M',
      log_file: '/root/Tradebaas-1/logs/frontend.log',
      out_file: '/root/Tradebaas-1/logs/frontend-out.log',
      error_file: '/root/Tradebaas-1/logs/frontend-error.log',
      time: true
    }
  ]
};
