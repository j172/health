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
      // V8 sizes its default heap ceiling (~4.3GB observed) off the host's full
      // visible memory, not this shared account's actual CloudLinux LVE
      // allowance — so a real memory squeeze shows up as an external, silent
      // SIGKILL from the host's resource governor instead of a catchable V8
      // heap OOM. Capping it here, comfortably under both the LVE ceiling and
      // the max_memory_restart RSS trip-wire below, makes memory pressure show
      // up as a normal, visible error in pm2's logs instead.
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '1024M',
      autorestart: true,
      // Caps a broken-deploy crash loop instead of letting it retry forever.
      // Confirmed live 2026-08-02: a deploy that left node_modules/next
      // missing made this process fail-and-immediately-restart thousands of
      // times (↺ 3220 in `pm2 status`), which itself burned enough CPU/RAM
      // on this shared host to help OOM-kill the very npm ci trying to fix
      // it — a self-reinforcing loop. With these set, pm2 gives up (goes to
      // "errored") after max_restarts failures that each occur before
      // min_uptime, instead of retrying indefinitely.
      min_uptime: '10s',
      max_restarts: 10,
      watch: false,
    },
  ],
};