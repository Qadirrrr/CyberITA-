# Setup and local development

## Prerequisites

- Node.js 18 or newer
- PostgreSQL 14 or newer
- Docker Engine 24 or newer (or Docker Desktop with WSL2 or Hyper-V on Windows)
- Windows PowerShell, macOS or Linux shell

## Database

CyberITA+ uses one real PostgreSQL database:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `CyberITA` |
| User | `postgres` |
| Password | set in `.env` and `server/.env` |

Create the database if it does not exist:

```sql
CREATE DATABASE "CyberITA";
```

`npm run db:migrate` also creates the database when it is missing. It applies every file in `server/src/db/migrations` in order and records them in `schema_migrations`.

The database starts empty: there are no demo users, courses or labs. Create the first administrator explicitly:

```bash
npm run user:create -- --email admin@example.com --name "Platform Admin" --role admin
```

Omit `--password` to generate a secure password. It is printed once, so store it immediately. Students can self-register at `/login`; instructor and admin accounts must be provisioned with `user:create`. After the first admin signs in, additional admins and instructors can be created from **Users & Roles**.

## Environment

Copy the example files and set the database, JWT and CORS values:

```bash
cp .env.example .env
cp .env.example server/.env
```

Required values for this database:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=CyberITA
DB_USER=postgres
DB_PASSWORD=<your-password>
```

Keep the two env files in sync. `server/.env` overrides `.env` because the server loads both.

## Install and run

```bash
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000 and Vite proxies `/api`, `/uploads` and `/ws`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and Vite dev server together |
| `npm run build` | Build the frontend into `client/dist` |
| `npm start` | Run the production server |
| `npm run test` | Run server and client tests |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:reset` | Drop, recreate and migrate the configured database |
| `npm run user:create` | Provision an admin, instructor or student account |

`npm run db:reset` is destructive. Only run it when you intend to erase all data in `CyberITA`.

## Labs

Real labs run inside isolated Docker containers. Each session gets its own container, filesystem and Linux shell. Learners get a real terminal: commands run as root (UID 0) inside their own disposable container, so they can install any package with `apt` and use professional tooling, and the shell/prompt shows their own name or student id (for example `saif@cyberita-lab`). The container is still isolated from the host: no `--privileged`, no host mounts, no Docker socket, CPU/memory/PID limits, and no network unless enabled. Network access is on by default so package installs work, and instructors can turn it off per lab.

Prerequisites:

1. Install and start Docker Engine or Docker Desktop.
2. Confirm the API process can reach the daemon:

```bash
docker version
```

3. Build the CyberITA+ lab runtime image (ships the tools labs expect: `ss`, `ip`, `free`, `ps`, demo system logs, and an honest `systemctl` shim for containers):

```bash
npm run lab:image:build
```

4. Set the runtime in `.env` and `server/.env`:

```dotenv
LAB_PROVIDER=docker
LAB_DOCKER_IMAGE=cyberita/lab-runtime:1.0
LAB_DOCKER_NETWORK=true
LAB_DOCKER_PULL=true
LAB_DOCKER_MEMORY_MB=1024
LAB_DOCKER_CPUS=1
LAB_DOCKER_PIDS_LIMIT=256
LAB_DOCKER_TIMEOUT_MS=180000
```

`LAB_DOCKER_IMAGE` is the default image. Instructors can override it per lab from **Lab settings > Container image**. Images must provide `/bin/sh`, `base64`, `grep` and basic coreutils; the provider runs as root inside the container, creates `/home/student` if the image has none, and installs the session's identity. The bundled runtime image ships a `student` account (UID 1000) with a writable `/home/student`, the apt package lists and the usual lab tooling. Ubuntu, Debian, Alpine and Kali images also work, but minimal scratch images do not.

> Full runbook — install options on Windows (Docker Desktop vs docker-ce in WSL2), image contents, the admin readiness check and troubleshooting: **[docs/LABS.md](./LABS.md)**.

To use a remote Docker host, set `LAB_DOCKER_HOST=ssh://labuser@lab-host` and configure SSH key authentication for the API process. The SSH user must be allowed to use the Docker daemon.

For more than one Docker host, keep `LAB_DOCKER_HOST` as the default and register extra hosts in **Admin → Lab Infrastructure → Servers & assignment**; each lab is assigned one server there, so every student's separate container runs on that host. The same screen holds the read-only **Submission record** for completed labs (student upload → instructor review → admin acknowledgement). Details and API reference: **[docs/LABS.md](./LABS.md#5-lab-servers-and-student-submissions)**.

Verify the complete container lifecycle without touching application data:

```bash
npm run lab:smoke
```

The smoke test provisions a temporary container, checks the learner identity, root access, working directory, file writes and that `apt` can install packages, then removes the container.

Session containers are named `cyberita-lab-*`, labelled with the lab/user IDs, and removed when the session is stopped or expires. The API also sweeps expired sessions every `LAB_CLEANUP_INTERVAL_MINUTES` (default 5).

The browser terminal is line-oriented. Commands, pipes, redirections, scripts and persistent files/directories work normally, but full-screen interactive programs such as `vi`, `nano` or `top` are not supported.

Security notes:

- Access to the Docker daemon is root-equivalent. Run the API and Docker on a dedicated lab host, restrict host access, and prefer rootless Docker where possible.
- Root inside the session container is intentional and gives learners a real terminal. Containers are never privileged, have no host mounts and no Docker socket, and keep resource limits, so root applies only to the disposable container.
- Network access is on by default so `apt` works. Restrict outbound traffic at the host/network level if learners should not reach arbitrary internet hosts, or disable networking per lab.
- `LAB_PROVIDER=mock` remains available for automated tests only. It does not execute real commands and must not be used for real lab delivery.

### Practice mode

Every lab exposes a simulated practice mode alongside the real Docker lab. Practice is designed for safe, repeatable rehearsal before a learner starts a billable container session:

- Commands run against an in-memory mock shell, never against a server or Docker container.
- The UI shows a permanent "simulated" notice and never claims that a real machine was provisioned.
- Learners can reset the simulation, repeat commands, and mark steps as practised.
- Completing a step requires running the lab author's `practiceCommand`; the expected output and explanation are shown to guide the learner.
- Progress is stored in `lab_practice_sessions` and survives page reloads.
- Practice requires course enrollment, creates no `lab_sessions` row, and does not require screenshots.
- Practice content is authored per step in the instructor lab editor (`practiceCommand`, `practiceOutput`, `practiceExplanation`).

Practice API:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/labs/:id/practice` | Load simulated session, steps and progress |
| `POST` | `/api/labs/:id/practice/exec` | Run a simulated command |
| `POST` | `/api/labs/:id/practice/steps/:stepId/complete` | Mark a step as practised |
| `POST` | `/api/labs/:id/practice/reset` | Reset the simulation |

Only the real lab starts a container session. Real sessions use the WebSocket endpoint at `/ws` with `lab.attach` and `lab.exec` messages, and require screenshot evidence plus the written report workflow.

## Troubleshooting

- If pgAdmin shows no data, confirm it is connected to `127.0.0.1:5432` and the `CyberITA` database. The old `cyberita` database on port `5433` is not used by the application.
- If the API cannot connect, check `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` in both `.env` and `server/.env`, then restart the server.
- If migrations report a checksum mismatch, create a new migration instead of editing an already applied file.
- If login fails after a reset, provision an account with `npm run user:create`.
