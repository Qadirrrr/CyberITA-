# Remote Lab Servers (CyberITA+)

This document extends the existing CyberITA+ lab system with two remote EC2 Lab Servers.
The Main Application Server keeps running the full application; the new servers run **only**
student Docker labs via the CyberITA+ Lab Agent.

## 1. Architecture

```
┌────────────────────────────┐        private VPC        ┌──────────────────────┐
│  Main EC2 (existing)       │ ──HTTP (agent secret)──▶ │  Lab Server 1 (EC2)  │
│  frontend + backend + DB   │                          │  Docker + Lab Agent  │
│  scheduler + WS gateway    │ ──HTTP (agent secret)──▶ │  Lab Server 2 (EC2)  │
└────────────────────────────┘                          └──────────────────────┘
```

- Main server never runs student containers when remote execution is enabled.
- Each Lab Server runs the Lab Agent (`server/src/agent.js`) which wraps the local Docker daemon.
- Communication is authenticated with a shared secret (`AGENT_SECRET`) and happens over private IPs.
- The Docker socket is never exposed publicly.

## 2. Database migration

Migration `server/src/db/migrations/024_remote_lab_servers.sql` is applied automatically on startup.
It adds agent columns to `lab_servers` and creates `lab_server_events`. No existing data is removed.

## 3. Main Server configuration

Add to `server/.env` (do not commit secrets):

```dotenv
# Remote agent master key (encrypts agent secrets at rest). Strong random string.
LAB_AGENT_MASTER_KEY=<openssl rand -hex 32>
# Optional: how long before a remote agent is considered offline (ms, default 120000)
LAB_AGENT_HEARTBEAT_TIMEOUT_MS=120000
```

Existing variables (`LAB_PROVIDER=docker`, `LAB_DOCKER_IMAGE`, ...) stay unchanged.

## 4. Register the two Lab Servers (Admin)

In Admin → Lab Infrastructure → Lab Servers, create two servers:

| Field | Lab Server 1 | Lab Server 2 |
| --- | --- | --- |
| Name | Lab Server 1 | Lab Server 2 |
| Server type | Remote Lab Agent | Remote Lab Agent |
| Agent URL | http://<private-ip-1>:9100 | http://<private-ip-2>:9100 |
| Agent secret | <generate, copy to agent> | <generate, copy to agent> |
| Max concurrent sessions | 10 | 10 |
| Status | active | active |

Keep the secret safe; it is stored encrypted. You can also leave "Agent secret" blank on edit to keep the existing one.

## 5. Install Lab Server 1 (and 2 identically)

### 5.1 Base packages

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

### 5.2 Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

### 5.3 Application code (server only)

```bash
sudo mkdir -p /opt/cyberita
sudo chown $USER:$USER /opt/cyberita
cd /opt/cyberita
git clone <your-repo> .
cd server
npm ci --omit=dev
```

### 5.4 Lab image

```bash
cd /opt/cyberita/server
npm run lab:image:build
docker images | grep cyberita/lab-runtime
```

### 5.5 Agent environment

Create `/opt/cyberita/server/.env.agent` (or export in PM2):

```dotenv
NODE_ENV=production
PORT=9100
AGENT_PORT=9100
AGENT_NAME=lab-server-1
AGENT_URL=http://<private-ip-1>:9100
AGENT_SECRET=<same secret as in Admin>
AGENT_MAX_SESSIONS=10
MAIN_SERVER_URL=http://<main-private-ip>:4000
LAB_PROVIDER=docker
LAB_DOCKER_IMAGE=cyberita/lab-runtime:1.0
LAB_DOCKER_NETWORK=true
LAB_DOCKER_PULL=true
LAB_DOCKER_MEMORY_MB=1024
LAB_DOCKER_CPUS=1
LAB_DOCKER_PIDS_LIMIT=256
```

### 5.6 PM2 service

```bash
sudo npm install -g pm2
cd /opt/cyberita/server
pm2 start src/agent.js --name cyberita-agent --interpreter node
pm2 save
pm2 startup systemd -u $USER --hp $HOME
# follow the printed command
pm2 status
```

### 5.7 Verify

```bash
curl http://127.0.0.1:9100/health
curl -H "Authorization: Bearer <secret>" http://127.0.0.1:9100/metrics
```

In Admin → Lab Infrastructure → Lab Servers, click "Verify" on the server; status should become active with CPU/RAM/disk metrics after the first heartbeat (≤ 15 s).

## 6. AWS Security Groups

**Main Server**
- Inbound: 80/443 (public), 22 (restricted admin IP).
- Outbound: allow TCP 9100 to the Lab Servers' security group (private).

**Lab Servers**
- Inbound: 22 (restricted admin IP), 9100 (only from Main Server's security group).
- No public 2375/2376, no public container ports.
- Outbound: standard (apt, docker pull) as needed.

Prefer placing all three instances in the same region and VPC, communicating over private IPs.

## 7. Automatic allocation

When a student starts a lab:
1. Existing auth + access checks run.
2. An existing running session is reused if present.
3. `resolveServerForNewSession` picks the best active server (capacity, CPU, RAM, heartbeat).
4. Capacity is reserved atomically (`UPDATE ... WHERE active_sessions < max_sessions`).
5. The Lab Agent provisions the container.
6. On failure, capacity is released and the session is marked error.
7. If no server has capacity, the student sees: "All lab servers are currently busy. Please try again later."

## 8. Terminal

The existing browser terminal is unchanged. `executeInSession` resolves the session's server and uses `RemoteTerminal` for agent-backed sessions, which calls the agent's `/containers/:id/exec`. WebSocket disconnections are handled by the existing flow.

## 9. Failure handling

- Agent offline (> 2 min without heartbeat): server marked disabled for new assignments, admin notified via events.
- Container creation failure: capacity released, session status `error`, useful message returned.
- Existing sessions on a failed server are preserved in the DB; admin can inspect/recover.
- No automatic container migration between hosts.

## 10. Testing

1. Existing website/auth/courses still work (smoke).
2. Both agents register and heartbeat (Admin shows metrics).
3. `npm run lab:smoke` still passes on Main (local fallback) and on each agent host.
4. Assign a lab to Lab Server 1, start a session, run `whoami`/`hostname` (should show the agent host).
5. Capacity: with max_sessions=10, the 11th concurrent start is rejected with the busy message.
6. Load test 20 concurrent starts (10 per server) using e.g. `artillery`/`k6` or a script; verify no over-allocation (`active_sessions` never exceeds `max_sessions`).
7. Stop a server (kill agent) → new assignments skip it; existing sessions preserved.
8. Failed provision (bad image) releases capacity.

Do not claim the 20-session target until actually tested.

## 11. Rollback

- Set the affected labs' `lab_server_id` to NULL (or the local server) in Admin → Lab Infrastructure.
- Set remote servers to `disabled`.
- Stop agents: `pm2 stop cyberita-agent`.
- The Main Server falls back to its default Docker daemon (existing behavior).
- Migration 024 only adds columns/tables; it does not remove existing data. To revert schema, drop the added columns/table manually (not recommended; harmless to leave).

## 12. Troubleshooting

- Agent won't start: check `pm2 logs cyberita-agent`, Docker daemon, `.env.agent`.
- "Invalid agent secret": ensure the secret in the agent env matches the one stored (re-enter in Admin).
- "Lab server not registered by admin": create the server record in Admin first.
- Metrics stay null: heartbeat not reaching Main (check security group, MAIN_SERVER_URL, private IP).
- Container provision fails on agent: check image present (`docker images`), disk space, `pm2 logs`.
- Capacity stuck: `UPDATE lab_servers SET active_sessions = 0 WHERE id = <id>;` after confirming no running sessions.
