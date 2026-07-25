module.exports = {
  apps: [
    {
      name: 'health-web',
      cwd: '/home/tw123457/health_app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      interpreter: '/home/tw123457/.nvm/versions/node/v20.20.2/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '1024M',
      autorestart: true,
      watch: false,
    },
  ],
};