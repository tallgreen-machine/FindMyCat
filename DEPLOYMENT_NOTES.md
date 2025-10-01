# FindMyCat - Deployment Notes (updated Oct 01, 2025)

This document explains how to deploy the current repository to your server, where to place files, and what changed today to make the app available at the site root: https://findmycat.goldmansoap.com

Server layout (what we'll use)
- Frontend (static files): /var/www/findmycat/frontend
- Backend (node + dist): /srv/findmycat/backend
- Backend database files (if using SQLite in fallback): /srv/findmycat/data (or your PostgreSQL instance as configured)

Artifacts created
- dist-packages/frontend-build.tar.gz  (contains the `build/` folder ready for deployment)
- dist-packages/backend-build.tar.gz   (contains backend dist and pm2 ecosystem config)

Summary of what I changed today
- Removed the hard /findmy URL base so the site is accessible at the root domain.
  - `Caddyfile.template` updated to proxy /api/*, /health and /socket.io/* to backend and serve the React app at `/`.
  - Backend `PATH_PREFIX` cleared (pm2 ecosystem and env examples updated) so the server exposes `/api/*` and `/socket.io/*`.
  - Frontend envs (`frontend/.env.production` and `.env.development`) updated to REACT_APP_API_URL=https://findmycat.goldmansoap.com.
  - Frontend rebuilt with PUBLIC_URL=/ so all asset references are correct for root hosting.
  - Small support files updated to use root URLs (mac client defaults, import script, docs, debug page, etc.).
- Created deployment packages (tarballs) under `dist-packages/` for quick deployment.

Deploy steps (one-shot)
1) Copy artifacts to the server

  # from your local machine (adjust user@host)
  scp dist-packages/frontend-build.tar.gz user@findmycat.goldmansoap.com:/tmp/
  scp dist-packages/backend-build.tar.gz user@findmycat.goldmansoap.com:/tmp/

2) Prepare directories on the server

  # run on server
  sudo mkdir -p /var/www/findmycat/frontend
  sudo mkdir -p /srv/findmycat
  sudo chown -R $USER:$USER /var/www/findmycat /srv/findmycat

3) Install frontend files

  # on server
  cd /var/www/findmycat/frontend
  sudo tar -xzf /tmp/frontend-build.tar.gz -C /var/www/findmycat/frontend
  # Ensure Caddy (or your webserver user) can read the files
  sudo chown -R www-data:www-data /var/www/findmycat/frontend || true

4) Install backend files

  # on server
  cd /srv/findmycat
  sudo tar -xzf /tmp/backend-build.tar.gz -C /srv/findmycat
  # If tarball contains `backend/` directory, move contents to /srv/findmycat/backend
  # Example (safe move if tar created backend/):
  if [ -d /srv/findmycat/backend ]; then
    echo "backend dir present"
  fi

  cd /srv/findmycat/backend || true
  # Install production dependencies
  npm ci --omit=dev

5) Configure environment (important)
- Create `/srv/findmycat/.env` with production settings. Minimal required values:

  PORT=3001
  NODE_ENV=production
  # If using SQLite fallback, ensure DATABASE_URL points to /srv/findmycat/data/findmycat.db
  # If using PostgreSQL, set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD accordingly
  CORS_ORIGIN=https://findmycat.goldmansoap.com
  JWT_SECRET=YOUR_STRONG_JWT_SECRET_HERE
  JWT_EXPIRES_IN=30d
  # PATH_PREFIX should be empty for root hosting
  PATH_PREFIX=

6) Start backend with PM2

  # from /srv/findmycat/backend
  pm2 start ecosystem.config.js --env production
  pm2 save
  # Confirm running
  pm2 status

7) Install/Update Caddy (reverse proxy) and reload config
- Edit `/etc/caddy/Caddyfile` (or the site Caddyfile) using the updated `Caddyfile.template`. The important rules:
  - Proxy /api/* to 127.0.0.1:3001
  - Proxy /socket.io/* to 127.0.0.1:3001 (allow websockets)
  - Proxy /health to 127.0.0.1:3001
  - Serve static files from /var/www/findmycat/frontend (catch-all)

  After editing:
  sudo systemctl reload caddy
  # or
  caddy reload --config /etc/caddy/Caddyfile

8) Quick verification
- Check health endpoint:
  curl -I https://findmycat.goldmansoap.com/health
- Check API:
  curl -sS https://findmycat.goldmansoap.com/api/admin/db-info | jq .
- Open the site in a browser and verify:
  - Page loads and assets are fetched from /static/ (no /findmy prefix)
  - WebSocket connection attempts to `https://findmycat.goldmansoap.com/socket.io/` (check DevTools network tab)
  - Login / pairing flows work

Optional: temporary backwards-compat redirect (if you need to keep supporting old clients)
- If you want `/findmy/*` to continue to work during the transition, you can add redirect rules in Caddy:

  @old path /findmy/*
  handle @old {
    uri replace /findmy /  # or redir 308 /{path} /{path}
    reverse_proxy 127.0.0.1:3001
  }

But it's cleaner to update clients to use root.

Rollback plan
- If anything goes wrong, you can:
  - Restore previous Caddyfile and reload Caddy
  - pm2 stop or restart previous backend process
  - Replace frontend files with the previous build

What I can do next (pick one or more)
- Produce a `deploy.sh` script that automates the copy, extract and pm2 start steps using the server paths you supplied.
- Add a temporary Caddy redirect for `/findmy/*` so old clients keep working during migration.
- Run an additional quick smoke test script that calls /health and /api/locations/latest and reports status.

If you want the deploy script, tell me whether SSH access requires a particular user (e.g., `root` or `ubuntu`) or whether you prefer me to produce a local script you can run on the server.

---

End of notes.
