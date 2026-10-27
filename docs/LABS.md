# Real lab runtime runbook

Real hands-on labs run one isolated Docker container per learner session. This
document explains exactly what is required to run them for real, how to verify
the stack end to end, and how to troubleshoot it.

## 1. What the platform already provides (no setup needed)

| Piece | Where it lives | What it does |
| --- | --- | --- |
| Container provider | `server/src/labs/docker/` | Creates one disposable container per session (memory/CPU/PID limits, no `--privileged`, no host mounts, no Docker socket), creates a per-session root identity named after the learner, bootstraps the workspace, and executes commands as UID 0 inside the container. |
| Terminal bridge | `server/src/websocket/index.js` | Line-oriented terminal over `/ws` (`lab.attach`, `lab.exec`), with per-session history persisted in PostgreSQL. |
| Session lifecycle | `server/src/services/labService.js` | Start/reuse sessions, verify lab steps against executed commands, expire after `LAB_SESSION_TTL_MINUTES`, sweep expired containers every `LAB_CLEANUP_INTERVAL_MINUTES`. |
| Practice mode | `server/src/labs/mock/` + `PracticeLabPage` | Simulated fallback so learners keep working when no Docker engine is available. |
| Admin monitoring | **Admin → Lab Infrastructure** | Service health, provider breakdown, sessions, failed labs, limits, cleanup, plus a live **Runtime readiness** check. |
| Smoke test | `npm run lab:smoke` (in `/server`) | Provisions a throwaway container, runs real commands, removes the container. |

## 2. What your machine/host must provide

Real labs need a Docker engine reachable by the API process:

1. **A Docker engine** — Docker Desktop (Windows/macOS) or Docker Engine (Linux).
2. **Disk space** — plan for ~4-6 GB (Docker Desktop + WSL2 data + the lab image).
   On Windows, if `C:` is full, install Docker Desktop on another drive and move
   the WSL2 data there (Docker Desktop *Settings → Resources → Advanced →
   Disk image location*).
3. **The API process must reach the daemon** — verify from the same user that
   runs the server:

```bash
docker version
```

### Windows install options

**Option A — Docker Desktop (recommended for development)**

1. Install Docker Desktop: `winget install Docker.DockerDesktop` (needs an
   elevated shell) or download from docker.com. WSL2 is already enabled on this
   machine, so the WSL2 backend is picked automatically.
2. Start Docker Desktop once, accept the license, and keep *Start Docker
   Desktop when you sign in* enabled.
3. Verify: `docker version` shows a `Server.Version`.

**Option B — docker-ce inside the existing WSL2 Ubuntu distro (no Desktop)**

```bash
wsl -d Ubuntu
sudo apt-get update && sudo apt-get install -y docker.io
sudo service docker start
sudo usermod -aG docker "$USER"   # re-login afterwards
docker version
```

Note: with option B, Windows-side `docker` commands need the WSL integration or
`docker context`; the API therefore also needs a way to reach that daemon. The
simplest reliable setup is Option A, or run the API inside the same WSL distro.

## 3. Build the lab image

The default image is `cyberita/lab-runtime:1.0`, built from `docker/lab-image/`:

```bash
cd server
npm run lab:image:build
```

It contains:

- the everyday tooling lab steps rely on: `ss` (iproute2), `free`/`ps` (procps),
  `ip` (iproute2), `net-tools`, `curl`, `wget`, `dnsutils`, `jq`, `tree`, `lsof`,
  `git`, `vim-tiny`, `nano`, `python3`, `sqlite3`, `postgresql-client`,
  `openssh-client`, `nmap`, `netcat`, `traceroute`, `whois`, `zip`/`unzip`;
- a `student` user (UID/GID 1000, home `/home/student`, passwordless sudo);
- the apt package lists, so `apt-get install <package>` works immediately, plus
  an apt config that keeps installs non-interactive;
- **demo system logs**: the entrypoint seeds a labelled demo `/var/log/syslog`
  (cron, sshd, session and sudo events) and starts `rsyslogd`, so the
  log-analysis labs have realistic data on a fresh container;
- an honest **`systemctl` shim** that explains systemd is unavailable in lab
  containers instead of failing with *command not found*.

Labs must only rely on tools listed here (plus their own `initial_files`). If a
new lab needs extra tools, extend the Dockerfile, bump the tag and rebuild.
Learners can also install anything they want themselves with `apt`.

### Image contract

Every lab image must provide `/bin/sh`, `base64`, `grep` and basic coreutils. A
session runs as UID 0 with a generated account named after the learner, so the
provider can create `/home/student` when missing, write the apt config and
`chown` the home itself. `cyberita/lab-runtime` ships a private (750)
student-owned home out of the box.

Each session's `/etc/passwd` gets a UID-0 entry with the learner's sanitized
name (first ASCII name word, or `student-<id>` when the name is non-ASCII or
reserved), so `whoami`, `$USER`, `id -un` and the prompt show their identity
while they still have full root permission. Inside the container this is a real
terminal: package installs, service configuration and file edits all work. It
all lives in the disposable container filesystem and disappears when the
session is removed.

## 4. Verify end to end

```bash
cd server
npm run lab:smoke       # CLI: provision → execute → cleanup
```

Then, in the app: **Admin → Lab Infrastructure → Runtime readiness → Run
readiness check**. It verifies, in order:

1. Docker engine reachable,
2. lab image available on the host,
3. full container lifecycle (provision, run commands as root with the learner
   identity, home read/write, a simulated package install, deprovision),
4. lab container inventory (spot orphans),
5. expired session sweep.

Learner view: **Lab detail → Launch hands-on lab**. When Docker is down, the
same page clearly offers practice mode instead — nothing breaks.

## 5. Lab servers and student submissions

### Lab servers (admin-owned)

**Admin → Lab Infrastructure → Servers & assignment** registers the Docker
hosts that run student containers:

- **Docker host** is a `DOCKER_HOST` value (`ssh://lab@host`,
  `tcp://host:2376`, `npipe:////./pipe/docker_engine`, …) or empty for the API
  host's own daemon.
- **Status**: `active` accepts new sessions; `maintenance` / `disabled` refuse
  them with HTTP 503.
- **Max concurrent sessions** (`0` = unlimited) is checked before provisioning.
- **Verify** runs the daemon check and image check against that specific host.

Each lab is then assigned exactly one server in the **Lab → server assignment**
table. Every student still gets an isolated container; the assignment only
decides where it runs. Reassigning a lab affects new sessions — running sessions
keep the host they started on, and stop/cleanup always targets that host.

Deleting a server is blocked while it has running sessions. Deleting it
otherwise sets `labs.lab_server_id = NULL`, so those labs fall back to the
default host.

### Student upload

On the session page (`/labs/session/:id`), once every required step is verified,
the student sees **Finish and upload this lab**:

1. optional note and optional attachment (PNG/JPEG/WEBP screenshot or PDF),
2. submit **POST `/api/labs/sessions/:sessionId/submit`**.

The API then captures an **evidence snapshot** (checklist status, commands,
output excerpts, screenshots, lab server, session ids) into
`lab_submissions.evidence`. The snapshot is never accepted from the client.

### Instructor review

Instructors open **Lab submissions** (`/instructor/lab-submissions`). The API
only returns submissions whose `instructor_id` is that instructor — there is no
client-side filtering and no cross-instructor visibility.

- **Approve** → `approved` (final).
- **Request changes** → `changes_requested` (feedback required). The student can
  resubmit the same session; the submission is re-opened, re-notified and
  re-reviewed.
- Only the course's instructor (or an admin) can review; students only see
  their own submission.

### Admin record

**Admin → Lab Infrastructure → Submission record** is the read-only platform
ledger: student, lab, course, instructor, status, timestamps, evidence and
attachments. Admins can **Acknowledge** a submission
(`admin_acknowledged_by/at`) which is written to the activity log.

### API summary

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET/POST /api/admin/lab-servers` | admin | List / create servers |
| `PUT/DELETE /api/admin/lab-servers/:id` | admin | Update / delete a server |
| `POST /api/admin/lab-servers/:id/verify` | admin | Daemon + image check on that host |
| `GET /api/admin/labs` | admin | Labs with their assigned server |
| `PUT /api/admin/labs/:id/server` | admin | Assign / clear the lab's server |
| `GET /api/admin/lab-submissions` | admin | Submission ledger + stats |
| `POST /api/admin/lab-submissions/:id/acknowledge` | admin | Acknowledge record |
| `POST /api/labs/sessions/:sessionId/submit` | session owner | Upload finished lab |
| `GET /api/lab-submissions` | staff/student | Role-scoped queue |
| `GET /api/lab-submissions/stats` | auth | Queue counters |
| `GET /api/lab-submissions/:id` | owner/instructor/admin | Detail + evidence |
| `GET /api/lab-submissions/:id/attachment` | owner/instructor/admin | Authorized download |
| `POST /api/lab-submissions/:id/review` | owning instructor/admin | Approve / request changes |

## 6. Configuration reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `LAB_PROVIDER` | `docker` | `docker` for real labs, `mock` for automated tests only. |
| `LAB_DOCKER_IMAGE` | `cyberita/lab-runtime:1.0` | Default image; overridable per lab in the lab editor. |
| `LAB_DOCKER_BINARY` | `docker` | Docker CLI binary (or full path). |
| `LAB_DOCKER_HOST` | *(empty)* | Remote daemon, e.g. `ssh://labuser@lab-host`. |
| `LAB_DOCKER_NETWORK` | `true` | Global network allowance. Lab sessions need it for `apt` installs; instructors can still disable it per lab. |
| `LAB_DOCKER_PULL` | `true` | Pull the image when it is missing locally. |
| `LAB_DOCKER_MEMORY_MB` / `LAB_DOCKER_CPUS` / `LAB_DOCKER_PIDS_LIMIT` | `1024` / `1` / `256` | Per-session resource limits (sizeable enough for package installs). |
| `LAB_DOCKER_TIMEOUT_MS` | `180000` | Per-command timeout in a session. |
| `LAB_DOCKER_PROVISION_TIMEOUT_MS` | `180000` | Timeout for image/creation steps. |
| `LAB_DOCKER_MAX_OUTPUT_BYTES` | `65536` | Output cap per command. |
| `LAB_SESSION_TTL_MINUTES` | `120` | Session lifetime; expired sessions are swept. |
| `LAB_CLEANUP_INTERVAL_MINUTES` | `5` | Background sweep interval. |

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Lab page shows *"Docker CLI is not installed or is not on PATH."* | No Docker on the API host (or the API runs under a user without it). | Install/start the engine (§2), restart the API if the PATH changed. |
| *"Docker daemon is not reachable."* | Desktop/engine stopped, or wrong `DOCKER_HOST`. | Start Docker Desktop / `service docker start`; check `LAB_DOCKER_HOST`. |
| *"Lab image … is not available"* + build hint | `cyberita/lab-runtime:1.0` never built and not pullable. | `npm run lab:image:build`. |
| Commands fail with *permission denied* inside `/home/student` | The image ships `/home/student` owned by another UID and the provider could not take it over. | Use the runtime image, or rebuild the image with a `/home/student` the provider can chown. |
| *"System has not been booted with systemd"* | Intentional: lab containers have no systemd. | Use the container-valid commands shown in the message context (`ps`, `ss`, `cat /etc/resolv.conf`, …). |
| `apt-get install` cannot reach the archive | Network access is disabled for that lab, or the host has no outbound internet. | Enable *Allow outbound network access* in the lab editor and check the Docker host's connectivity. |
| Containers accumulate | Sessions never expire/swept. | Admin → Lab Infrastructure → *Cleanup Expired*; check the readiness check's sweep result. |
| Very slow first session | Image being pulled/built. | Pre-pull: `docker pull ubuntu:22.04` and build the runtime image. |

## 8. Security notes

- Access to the Docker daemon is root-equivalent. Run the API and Docker on a
  dedicated lab host, restrict host access, and prefer rootless Docker where
  possible.
- **Root inside the container is intentional.** Learners get a real terminal, so
  session commands run as UID 0 inside their own container and can install
  packages. That does *not* make the host root: containers are never started
  with `--privileged`, have no host bind mounts, no Docker socket and no access
  to other sessions' containers. CPU, memory and PID limits still apply, and
  each session is deleted on stop/expiry. Only run the lab host on infrastructure
  you are willing to dedicate to untrusted workloads.
- Network access is enabled by default so package installs work. Restrict
  outbound traffic on the lab host/network if learners must not reach arbitrary
  internet hosts, or disable networking per lab from the lab editor.
- Deleting a session destroys everything installed in it; there is no persistent
  storage between sessions.
- Session containers are labelled `cyberita.lab=true`, named `cyberita-lab-*`
  and removed on stop/expiry; the readiness check surfaces orphans.
- `LAB_PROVIDER=mock` never executes real commands and must not be used for
  real lab delivery.
- Lab submissions are scoped server-side: students see only their own, an
  instructor only their own courses' submissions, admins the whole ledger.
  Attachments are served through an authorized download endpoint and stored
  outside the public `/uploads` directory.
