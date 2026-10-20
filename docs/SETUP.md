# Setup and local development

This guide gets CyberITA+ running on a development machine. For production, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Prerequisites

- Node.js 18 or newer (Node 20+ recommended)
- npm 9+
- PostgreSQL 14+ (local service or a cluster you control)
- OpenSSL (optional, for generating secrets)

No Docker or external cloud account is required. Labs use the mock provider.

## 1. Install dependencies

From the repository root:

```bash
npm install
```

The repository uses npm workspaces for `server` and `client`, so one install covers both.

## 2. Configure the database

Create a database user and database if you do not already have them. Example with `psql`:

```sql
CREATE DATABASE cyberita;
CREATE DATABASE cyberita_test;
```

The migration runner can also create the databases automatically when the configured user has permission.

## 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
cp .env.example server/.env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.example server/.env
```

Edit both copies:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `TEST_DB_NAME` for the integration test database
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- `CORS_ORIGINS` (defaults to `http://localhost:5173`)
- `PORT` if port 4000 is already in use

Generate production-grade secrets with:

```bash
openssl rand -hex 48
```

The server loads `.env` from its working directory. Running `npm run ... -w server` executes with `server` as the working directory, which is why `server/.env` is required. The root `.env` keeps tooling and root-level scripts consistent.

Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ACCESS_TOKEN_TTL` | `12h` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | `7d` | Refresh token lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `LAB_PROVIDER` | `mock` | Lab provider implementation |
| `LAB_SESSION_TTL_MINUTES` | `120` | Lab session lifetime |
| `MAX_UPLOAD_MB` | `8` | Screenshot and assignment upload limit |
| `SEED_PASSWORD` | `Passw0rd!` | Password for demo accounts |

## 4. Run migrations and seed data

```bash
npm run db:migrate
npm run db:seed
```

For a clean slate, `npm run db:reset` drops, recreates and migrates the main database. It does not seed. Run `npm run db:seed` afterwards.

Seed behaviour:

- Seeding is skipped when users already exist.
- Set `FORCE_SEED=1` to clear and reseed a populated development database.
- Demo accounts are listed in the root [README](../README.md).

## 5. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000
- API health: http://localhost:4000/api/health
- WebSocket: ws://localhost:4000/ws

The Vite dev server proxies `/api`, `/uploads` and `/ws` to the API.

## 6. Run the tests

```bash
npm run test
```

Useful variants:

```bash
npm run test:server
npm run test:client
```

Server tests create and migrate `TEST_DB_NAME` and should not point at a database you care about. Set `LOG_LEVEL=error` to reduce test noise.

## Everyday commands

| Task | Command |
| --- | --- |
| Reseed demo content only | `npm run db:seed` |
| Force a full reseed | `$env:FORCE_SEED='1'; npm run db:seed` (PowerShell) |
| Rebuild frontend | `npm run build` |
| Run the production build locally | `npm run build; npm start` |

## Troubleshooting

**API cannot connect to PostgreSQL**

- Confirm `DB_PORT` matches the running cluster.
- Check `pg_isready -h <host> -p <port>`.
- If the user has no password, leave `DB_PASSWORD` empty.

**Login fails with demo accounts**

- Run `npm run db:seed`.
- If the database already had users, use `FORCE_SEED=1`.
- Confirm `SEED_PASSWORD` was not changed after seeding.

**Course images are missing**

- The seed references `/images/courses/*.svg` and `/images/paths/*.svg`.
- Rebuild the frontend after changing files in `client/public`.
- Reseed after changing seeded image paths.

**Uploads fail**

- Check `MAX_UPLOAD_MB`.
- Ensure `server/uploads` is writable.
- Uploaded files are served from `/uploads`.

**Port already in use**

- Change `PORT` in `server/.env` and update the Vite proxy in `client/vite.config.js`.
- For the frontend, Vite falls back to another port automatically, but `CORS_ORIGINS` must include the actual origin.

**Tests fail with migration checksum errors**

- The test runner resets its database. If it persists, drop and recreate `TEST_DB_NAME`.
- Never edit an applied migration. Add a new migration file instead.

## Resetting everything

```bash
npm run db:reset
npm run db:seed
```

This removes all users, courses, lab sessions, submissions, reports and certificates in the configured development database.
