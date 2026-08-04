module.exports = {
  apps: [
    {
      name: 'ai-jewelry-design',
      script: 'server/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
