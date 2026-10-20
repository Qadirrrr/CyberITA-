# Production deployment

CyberITA+ is a single-origin application in production: the Express API also serves the built React frontend. A reverse proxy terminates TLS and forwards HTTP and WebSocket traffic to Node.

## Build and run

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

The server must run with `server` as its working directory because it:

- loads `server/.env`,
- resolves `../client/dist` for static hosting,
- stores uploads in `server/uploads`.

`npm start` already does this through the `server` workspace script. The API listens on `PORT` (default `4000`).

## Environment

Create `server/.env` from `.env.example` and set production values:

```dotenv
NODE_ENV=production
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=cyberita
DB_PASSWORD=<strong-password>
DB_NAME=cyberita
DB_SSL=false
JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<openssl rand -hex 48>
COOKIE_SECURE=true
CORS_ORIGINS=https://cyberita.example.com
LAB_PROVIDER=mock
SEED_PASSWORD=<strong-initial-password>
```

Notes:

- Set `COOKIE_SECURE=true` when the site is served over HTTPS.
- Use distinct, random JWT secrets. Rotating a secret invalidates existing sessions.
- Keep `CORS_ORIGINS` limited to the public origin. It is only needed for cross-origin browser calls; the production frontend is same-origin.
- Set `DB_SSL=true` if your managed PostgreSQL requires TLS.
- Do not commit `.env` files.

Run migrations as part of every release before starting the new process:

```bash
npm run db:migrate
```

Seed only for a first-time demo or staging environment:

```bash
npm run db:seed
```

Never run seeding against production data. `FORCE_SEED=1` clears application tables.

## Process manager (systemd)

Example unit:

```ini
[Unit]
Description=CyberITA+ API and web
After=network.target postgresql.service

[Service]
Type=simple
User=cyberita
WorkingDirectory=/srv/cyberita/server
Environment=NODE_ENV=production
ExecStartPre=/usr/bin/npm run db:migrate
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Create a dedicated system user and make these paths writable by it:

- `server/uploads`
- the application log destination

## Reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name cyberita.example.com;

  ssl_certificate     /etc/letsencrypt/live/cyberita.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cyberita.example.com/privkey.pem;

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }
}

server {
  listen 80;
  server_name cyberita.example.com;
  return 301 https://$host$request_uri;
}
```

Set `client_max_body_size` at or above `MAX_UPLOAD_MB`. Forward WebSocket upgrade headers or live notifications and terminal sessions will fail.

## Health checks

Use `GET /api/health`. It returns:

```json
{ "status": "ok", "name": "CyberITA+ API", "env": "production", "time": "..." }
```

A load balancer should expect HTTP 200. Do not probe `/health`; the SPA fallback serves the frontend for non-API paths.

## Data and backups

Back up PostgreSQL with `pg_dump` and copy `server/uploads` alongside it, because reports and screenshots reference uploaded file paths.

```bash
pg_dump -Fc -d cyberita -f /backups/cyberita-$(date +%F).dump
tar -czf /backups/cyberita-uploads-$(date +%F).tar.gz server/uploads
```

Test restores regularly. Certificates, reports and submissions are not recoverable from the frontend or seed data.

## Scaling and state

The current architecture assumes a single Node instance:

- WebSocket clients and lab terminal sessions are tracked in process memory.
- Lab sessions use the mock provider and virtual filesystem.
- Rate limiting uses in-memory state.

If you need multiple instances, add a shared pub/sub layer for WebSocket events and externalize rate-limit state. Do not enable a real Cloud/VPS lab provider until sessions, terminal I/O and cleanup have been designed for distributed execution.

## Security checklist

- Serve only over HTTPS and set `COOKIE_SECURE=true`.
- Use strong, unique JWT secrets and database credentials.
- Restrict PostgreSQL to the application host or private network.
- Keep `CORS_ORIGINS` minimal.
- Run Node as an unprivileged user.
- Put uploads behind the application; never expose the filesystem directly.
- Keep dependencies patched and review `npm audit` output.
- Rotate `SEED_PASSWORD` and remove demo accounts before a real launch.
- Back up the database and uploads before every migration.
- Add request logging, error tracking and uptime monitoring at the proxy or platform layer.

## Rollback

1. Stop the service.
2. Deploy the previous release artifact.
3. Restore the matching database backup if the release included destructive migrations.
4. Start the service and verify `/api/health`, login and one lab session.
