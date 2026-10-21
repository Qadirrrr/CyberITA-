# CyberITA+

A professional IT learning platform built around practice, not just video. CyberITA+ combines structured courses with browser-based Linux labs, verified lab reports, certificates and instructor-reviewed publishing.

## What is included

- Public marketing site with course catalog, learning paths, blog, contact form and certificate verification.
- Role-based accounts for students, instructors and administrators.
- Course curriculum with modules, lessons, progress tracking and completion certificates.
- Quizzes with server-side grading, attempts history and per-question explanations.
- Assignments with submissions, grading, feedback and resubmission.
- Practical labs with a simulated Linux provider and an in-browser terminal.
- Lab sessions with step verification, hints, screenshot evidence and expiry.
- Practical report editor that turns completed lab work into a reviewable markdown report.
- Instructor review workflow: approve or reject reports, then publish selected reports as blog articles.
- Dashboards for students, instructors and admins, including activity history and platform analytics.
- In-app notifications with live WebSocket delivery and admin broadcasts.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3 |
| Backend | Node.js, Express 4, ws WebSockets |
| Database | PostgreSQL with SQL migrations |
| Auth | JWT access token (httpOnly cookie + Bearer) and rotating refresh tokens |
| Validation | Zod |
| Tests | Vitest, Supertest, Testing Library |

## Quick start

Prerequisites: Node.js 18+ (20+ recommended) and PostgreSQL 14+ running locally.

```bash
npm install
cp .env.example server/.env
cp .env.example .env
# Edit DB_PORT, DB_USER, DB_PASSWORD, JWT secrets and CORS_ORIGINS as needed
npm run db:reset
npm run db:seed
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000 and the Vite dev server proxies `/api`, `/uploads` and `/ws`.

## Demo accounts

All seeded accounts use the password from `SEED_PASSWORD` (`Passw0rd!` by default).

| Role | Email |
| --- | --- |
| Admin | admin@cyberita.plus |
| Instructor | sarah.chen@cyberita.plus |
| Instructor | marcus.reid@cyberita.plus |
| Student | alex.rivera@cyberita.plus |
| Student | priya.sharma@cyberita.plus |
| Student | tom.becker@cyberita.plus |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and Vite dev server together |
| `npm run build` | Build the frontend into `client/dist` |
| `npm start` | Run the production server (serves the built frontend) |
| `npm run test` | Run server and client test suites |
| `npm run test:server` | Run server integration tests |
| `npm run test:client` | Run client unit tests |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Seed demo content (skipped if users already exist) |
| `npm run db:seed:extra` | Add the extended course and lab catalog to an existing database (idempotent) |
| `npm run db:reset` | Drop, recreate and migrate the database |

Set `FORCE_SEED=1` with `npm run db:seed` to reseed a populated development database (this clears existing data).

## Project structure

```text
client/
  public/                 Static assets and generated course posters
  src/
    components/           Shared UI, layout, markdown and lab terminal
    context/              Auth, toast and notification providers
    lib/                  API client, formatting, constants, activity helpers
    pages/                Public, auth, student, instructor and admin pages
server/
  src/
    config/               Environment, database, logger
    db/                   Migrations, runner, seed and reset scripts
    labs/                 Provider abstraction and mock provider
    middleware/           Auth, RBAC, uploads, error handling
    routes/               REST endpoints
    services/             Business logic
    ws/                   WebSocket hub
  tests/                  Integration tests against a test database
```

## Lab provider

`LAB_PROVIDER=mock` is the only implemented provider. It simulates provisioning and runs commands through a safe virtual filesystem, so no external infrastructure is created. The provider interface under `server/src/labs` is the place to add a real Cloud/VPS adapter later.

## Documentation

- [Setup and local development](docs/SETUP.md)
- [Production deployment](docs/DEPLOYMENT.md)

## License

Proprietary. All rights reserved.
