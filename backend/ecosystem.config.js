/**
 * PM2 ecosystem configuration for FindMyCat backend (PostgreSQL)
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'findmycat-backend',
      script: 'dist/server-postgres.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        // CORS supports comma-separated list (dev + prod)
        CORS_ORIGIN: 'https://findmycat.goldmansoap.com',
  // If you serve the backend under a path prefix, set it here (e.g., "/findmy").
  // Leave empty for root-hosted deployments.
  PATH_PREFIX: '',

        // PostgreSQL connection
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'findmycat',
        DB_USER: 'findmycat',
        DB_PASSWORD: 'CAT123',

        // Auth
        JWT_SECRET: '/A/pKJkZDnYZCFwgNa4IKFjK3F+MLhkQjw+g5KRoxVNt+b6SJEnxgF9inXjol5Iq',
        JWT_EXPIRES_IN: '24h',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Replace with your production origin(s)
        CORS_ORIGIN: 'https://findmycat.goldmansoap.com',
  // Leave empty for root-hosted deployments.
  PATH_PREFIX: '',

        // PostgreSQL (override with real values or load from environment)
        DB_HOST: 'YOUR_DB_HOST',
        DB_PORT: '5432',
        DB_NAME: 'findmycat',
        DB_USER: 'findmycat',
        DB_PASSWORD: 'CAT123',

        // Auth
        JWT_SECRET: '/A/pKJkZDnYZCFwgNa4IKFjK3F+MLhkQjw+g5KRoxVNt+b6SJEnxgF9inXjol5Iq',
        JWT_EXPIRES_IN: '30d',
      },
    },
  ],
};
