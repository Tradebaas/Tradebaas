export default {
  apps: [
    {
      name: 'tradebaas-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_file: './logs/backend.log',
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      time: true
    },
    {
      name: 'tradebaas-frontend',
      cwd: './',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 5000',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_file: './logs/frontend.log',
      out_file: './logs/frontend-out.log',
      error_file: './logs/frontend-error.log',
      time: true
    }
  ]
};
