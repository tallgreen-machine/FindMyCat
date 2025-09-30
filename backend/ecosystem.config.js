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
        CORS_ORIGIN: 'http://localhost:3000',
        // If you serve the backend under a path prefix, set it here (e.g., "/findmy")
        PATH_PREFIX: '/findmy',

        // PostgreSQL connection
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'findmycat',
        DB_USER: 'postgres',
        DB_PASSWORD: 'changeme',

        // Auth
        JWT_SECRET: 'dev-secret-change-me',
        JWT_EXPIRES_IN: '24h',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Replace with your production origin(s)
        CORS_ORIGIN: 'https://YOUR_DOMAIN_HERE',
        PATH_PREFIX: '/findmy',

        // PostgreSQL (override with real values or load from environment)
        DB_HOST: 'YOUR_DB_HOST',
        DB_PORT: '5432',
        DB_NAME: 'findmycat',
        DB_USER: 'YOUR_DB_USER',
        DB_PASSWORD: 'YOUR_DB_PASSWORD',

        // Auth
        JWT_SECRET: 'set-a-strong-secret',
        JWT_EXPIRES_IN: '30d',
      },
    },
  ],
};
