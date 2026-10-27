# CyberITA+

A professional IT learning platform built around practice, not just video. CyberITA+ combines structured courses with browser-based Linux labs, verified lab reports, certificates and instructor-reviewed publishing.

## What is included

- Public marketing site with course catalog, learning paths, blog, contact form and certificate verification.
- Role-based accounts for students, instructors and administrators.
- Course curriculum with modules, lessons, progress tracking and completion certificates.
- Quizzes with server-side grading, attempts history and per-question explanations.
- Assignments with submissions, grading, feedback and resubmission.
- Practical labs running in isolated Docker containers with an in-browser Linux terminal.
- Lab sessions with step verification, hints, screenshot evidence, cleanup and expiry.
- Admin-managed lab servers: register Docker hosts, assign one per lab and route each student's separate container to it.
- Lab submissions: students upload a finished lab, the course instructor approves or requests changes, and admins keep a read-only record.
- Practical report editor that turns completed lab work into a reviewable markdown report.
- Instructor review workflow: approve or reject reports, then publish selected reports as blog articles.
- Dashboards for students, instructors and admins, including activity history, role mix, enrollment analytics and course performance.
- Admin tools for provisioning additional administrators and instructors from Users & Roles.
- In-app notifications with live WebSocket delivery and admin broadcasts.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3 |
| Backend | Node.js, Express 4, ws WebSockets |
| Database | PostgreSQL with SQL migrations |
| Auth | JWT access token (httpOnly cookie + Bearer) and rotating refresh tokens |
| Validation | Zod |
| Tests | Vitest, Testing Library (client) |

## Quick start

Prerequisites: Node.js 18+ (20+ recommended) and PostgreSQL 14+ running locally.

```bash
npm install
cp .env.example server/.env
cp .env.example .env
# Set DB_PORT=5432, DB_NAME=CyberITA, DB_USER, DB_PASSWORD, JWT secrets and CORS_ORIGINS
npm run db:migrate
npm run dev
```

Use `npm run db:reset` only when you intentionally want to drop and recreate the configured database.

Open http://localhost:5173. The API runs on http://localhost:4000 and the Vite dev server proxies `/api`, `/uploads` and `/ws`.

The database starts empty. Create the first administrator from another terminal:

```bash
npm run user:create -- --email admin@example.com --name "Platform Admin" --role admin
```

## Accounts

CyberITA+ does not ship with demo users. Provision every account explicitly:

```bash
npm run user:create -- --email tutor@example.com --name "Course Tutor" --role instructor
npm run user:create -- --email learner@example.com --name "New Learner" --role student
```

Supported roles are `admin`, `instructor` and `student`. Omit `--password` to generate a secure password; it is printed once, so store it immediately. New accounts can sign in at `/login`. Students can also self-register, while instructor and administrator accounts must be provisioned with the command above or by an administrator from **Users & Roles**.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and Vite dev server together |
| `npm run build` | Build the frontend into `client/dist` |
| `npm start` | Run the production server (serves the built frontend) |
| `npm run test` | Run server and client tests |
| `npm run test:client` | Run client unit tests |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:reset` | Drop, recreate and migrate an empty database |
| `npm run user:create` | Provision an admin, instructor or student account |
| `npm run lab:smoke` | Verify the Docker lab container lifecycle |

## Project structure

```text
client/
  public/                 Static assets (favicon, course and path artwork)
  src/
    components/           Shared UI, layout, markdown and lab terminal
    context/              Auth, toast and notification providers
    lib/                  API client, formatting, validation, constants
    pages/                Public, auth, student, instructor and admin pages
server/
  src/
    config/               Environment, database, logger
    db/                   Migrations, runner and reset scripts
    labs/                 Provider abstraction, Docker runtime and test mock
    middleware/           Auth, RBAC, validation, error handling
    routes/               REST endpoints
    scripts/              Account provisioning CLI
    services/             Business logic
    websocket/            WebSocket hub
    utils/                Shared helpers and validation schemas
```

## Lab provider

`LAB_PROVIDER=docker` runs real Linux commands in a dedicated container per session. Every learner gets a real terminal: full root permission inside their own disposable container, so they can install any package and use professional tooling, and the shell shows their own name/student id. The container is still isolated from the host (no `--privileged`, no host mounts, no Docker socket) and keeps CPU/memory/PID limits and a non-persistent filesystem. Network access is on by default so package installs work, and instructors can disable it per lab. Sessions are removed on stop or expiry. See [Setup](docs/SETUP.md#labs) for Docker and image requirements and [Lab runtime runbook](docs/LABS.md) for the full guide (host requirements, building the `cyberita/lab-runtime` image, the admin readiness check and troubleshooting).

Each lab also offers simulated practice mode. Practice uses an in-memory shell, is clearly labelled as simulated, persists progress, supports reset/repeat, and never provisions a container or requires screenshots. See [Setup](docs/SETUP.md#practice-mode) for the practice workflow and API.

`LAB_PROVIDER=mock` remains available for automated tests only; it does not execute real commands.

## Documentation

- [Setup and local development](docs/SETUP.md)
- [Production deployment](docs/DEPLOYMENT.md)

## License

Proprietary. All rights reserved.
