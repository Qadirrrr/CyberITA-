// PM2 ecosystem file for the CyberITA+ Lab Agent.
// Usage on a Lab Server:
//   cd /opt/cyberita/server
//   pm2 start ecosystem.agent.config.cjs
//   pm2 save
//   pm2 startup systemd -u $USER --hp $HOME
module.exports = {
  apps: [
    {
      name: 'cyberita-agent',
      script: 'src/agent.js',
      cwd: __dirname,
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // Load secrets from a dedicated file (chmod 600). Create /opt/cyberita/server/.env.agent
      // and source it, or set these via pm2 --env. Values below are placeholders.
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/cyberita-agent/err.log',
      out_file: '/var/log/cyberita-agent/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
