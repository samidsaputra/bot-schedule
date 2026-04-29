module.exports = {
  apps: [
    {
      name: 'bot-jadwal',
      script: 'dist/index.js',
      watch: false,
      autorestart: true,
      restart_delay: 3000,    // Tunggu 3 detik sebelum restart
      max_restarts: 10,       // Maksimal restart 10x
      env: {
        NODE_ENV: 'production',
      },
      // Log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      merge_logs: true,
    },
  ],
};
