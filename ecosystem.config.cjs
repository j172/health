module.exports = {
  apps: [
    {
      name: 'health-web',
      cwd: '/var/www/health',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
    },
  ],
};