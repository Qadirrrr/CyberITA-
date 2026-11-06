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
DB_NAME=CyberITA
DB_SSL=false
JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<openssl rand -hex 48>
COOKIE_SECURE=true
CORS_ORIGINS=https://cyberita.example.com
APP_URL=https://cyberita.example.com
LAB_PROVIDER=docker
LAB_DOCKER_IMAGE=cyberita/lab-runtime:1.0
LAB_DOCKER_NETWORK=true
```

Notes:

- Set `COOKIE_SECURE=true` when the site is served over HTTPS.
- `APP_URL` is the public origin of the site (scheme + host + port, no trailing slash), e.g. `https://cyberita.example.com` or `http://203.0.113.10:4000`. Verification and password-reset emails prefer the origin of the request that triggered them, so a stale `APP_URL` no longer produces an unreachable link; keep it correct for background emails. Make sure the port in the link is open in your firewall / cloud security group (or serve the app through port 80/443).
- Use distinct, random JWT secrets. Rotating a secret invalidates existing sessions.
- Keep `CORS_ORIGINS` limited to the public origin. It is only needed for cross-origin browser calls; the production frontend is same-origin.
- Set `DB_SSL=true` if your managed PostgreSQL requires TLS.
- Do not commit `.env` files.
- Install Docker Engine and keep the daemon running on the lab host. The API user must be able to run `docker`; add it to the `docker` group or configure a rootless daemon. Services usually start with a minimal `PATH`: the API looks for the CLI on `PATH` and in the usual install locations, and you can pin it with `LAB_DOCKER_BINARY=/usr/bin/docker`. If the API itself runs in a container, install the Docker CLI in that image and mount `/var/run/docker.sock`.
- Lab sessions run as root *inside* their disposable container (real terminal, package installs). Containers are never privileged, have no host mounts and no Docker socket. Network access is on by default for `apt`; restrict egress at the network firewalling level if required.
- Pre-pull `LAB_DOCKER_IMAGE` during deployment so students do not wait for image downloads. Per-lab images are pulled on first start when `LAB_DOCKER_PULL=true`.

Run migrations as part of every release before starting the new process:

```bash
npm run db:migrate
```

The database ships empty. Provision the first administrator explicitly:

```bash
npm run user:create -- --email admin@example.com --name "Platform Admin" --role admin
```

After signing in, that administrator can create additional admins, instructors and students from **Users & Roles**.

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

For Docker labs, that user must also be able to run `docker` (for example via the `docker` group) or `LAB_DOCKER_HOST` must point at an accessible daemon.

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
pg_dump -Fc -d CyberITA -f /backups/cyberita-$(date +%F).dump
tar -czf /backups/cyberita-uploads-$(date +%F).tar.gz server/uploads
```

Test restores regularly. Certificates, reports and submissions are not recoverable from the frontend or seed data.

## Scaling and state

The current architecture assumes a single Node instance:

- WebSocket clients and terminal rooms are tracked in process memory.
- Lab sessions use the Docker provider on the host reachable by the API process.
- Expired sessions are swept by one process, so running multiple API instances against the same Docker host requires coordination.
- Rate limiting uses in-memory state.

If you need multiple instances, add a shared pub/sub layer for WebSocket events, externalize rate-limit state, and run lab cleanup as a single worker. A remote Docker host can be shared with `LAB_DOCKER_HOST`, but container naming and cleanup must remain coordinated.

## Security checklist

- Serve only over HTTPS and set `COOKIE_SECURE=true`.
- Use strong, unique JWT secrets and database credentials.
- Restrict PostgreSQL to the application host or private network.
- Keep `CORS_ORIGINS` minimal.
- Run Node as an unprivileged user.
- Treat Docker daemon access as root-equivalent. Use a dedicated lab host, a rootless daemon where possible, and never expose the Docker socket over the network.
- Lab sessions are root inside their own disposable container by design. Do not give containers `--privileged`, host mounts or the Docker socket, keep the memory/CPU/PID limits, and treat the lab host as untrusted-workload infrastructure.
- Egress from lab containers is enabled by default for package installs. Add host/network firewall rules if learners must not reach arbitrary internet hosts.
- Put uploads behind the application; never expose the filesystem directly.
- Keep dependencies patched and review `npm audit` output.
- Back up the database and uploads before every migration.
- Add request logging, error tracking and uptime monitoring at the proxy or platform layer.

## Rollback

1. Stop the service.
2. Deploy the previous release artifact.
3. Restore the matching database backup if the release included destructive migrations.
4. Start the service and verify `/api/health`, login and one lab session.
