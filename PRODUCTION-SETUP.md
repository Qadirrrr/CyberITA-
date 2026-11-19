# CyberITA+ : Complete Setup Guide

This guide takes a fresh Ubuntu server to a fully running CyberITA+ platform.
Follow the steps in order. Every command is meant to be copy-pasted as-is;
replace only the parts inside `<ANGLE_BRACKETS>`.

> **Fast path:** this repo ships an installer that performs every step of
> this guide automatically. On a fresh Ubuntu 24.04 server, run as root:
> `bash install.sh` (download `install.sh` from this repo first). It stops
> with clear instructions wherever a human step is needed and continues
> when re-run. Use this guide as the explanation and manual fallback.

---

## 1. What this project is

CyberITA+ is an IT learning platform: courses, lessons, and hands-on Linux labs
that run in the student's browser.

| Layer    | Technology                                   |
|----------|----------------------------------------------|
| Frontend | React 18 + Vite 5 + Tailwind CSS             |
| Backend  | Node.js (Express 4) + WebSockets, port 4000  |
| Database | PostgreSQL 14+                               |
| Labs     | Docker containers (guided/practice labs)     |
| Real labs| Optional: real cloud servers via the NovaVPS gateway (Project 2) |
| Process  | pm2                                          |
| Proxy    | nginx                                        |

Repository: `Qadirrrr/CyberITA-` (private GitHub repo)

---

## 2. Accounts and providers you need BEFORE starting

| # | Provider | Why | What to get from it |
|---|----------|-----|---------------------|
| 1 | A cloud VPS (e.g. Linode) | Hosts the whole platform | One Ubuntu 24.04 server, root access |
| 2 | GitHub | Source code | Access to the private repo (owner adds you, or gives you a deploy key setup) |
| 3 | Gmail account | Verification + password-reset emails | An **App Password** (Google Account > Security > 2-Step Verification > App passwords) |
| 4 | NovaVPS gateway (Project 2) | OPTIONAL, only for "real/VPS" labs | The gateway server's IP and the shared `INTERNAL_LABS_SECRET` |
| 5 | Google Gemini (or OpenAI) | OPTIONAL, AI lab generation | An API key. Without it, lab generation falls back to built-in templates |

Server sizing: 4 GB RAM / 2 CPU recommended (2 GB works, but Docker lab
capacity is smaller). Disk 50 GB+.

---

## 3. Step 1 : Base software (run as root on the new server)

```bash
apt-get update && apt-get upgrade -y
id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu
echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/99-ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs postgresql nginx git build-essential
npm install -g pm2

# Docker (needed for the browser labs)
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

node -v   # must show v20.x
```

Log out and back in once after this step so the `ubuntu` user picks up the
Docker group.

---

## 4. Step 2 : Get the code (as the ubuntu user)

```bash
su - ubuntu
git clone https://github.com/Qadirrrr/CyberITA-.git ~/CyberITA-
cd ~/CyberITA-
npm install
```

Notes:

- This is an npm **workspaces** monorepo. Run `npm install` ONLY at the repo
  root. Installing inside `client/` or `server/` separately breaks the setup.
- If the repo is private for your account, the owner must add you as a
  collaborator, or use an SSH deploy key instead of HTTPS.

---

## 5. Step 3 : Create the database

```bash
sudo -u postgres psql -c "CREATE DATABASE \"CyberITA\";"
```

(The migration command in Step 5 can also create it automatically, but
creating it explicitly avoids permission surprises.)

---

## 6. Step 4 : Configure the environment (.env)

```bash
cd ~/CyberITA-
cp .env.example server/.env
nano server/.env
```

Fill in these values. **Never commit this file to GitHub, and never send it
in chat or email.** Generate the two JWT secrets with
`openssl rand -hex 32` (a different one for each).

### Required

| Variable | Value / where it comes from |
|----------|-----------------------------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `CyberITA` |
| `DB_USER` | `postgres` (or a dedicated user you created) |
| `DB_PASSWORD` | The PostgreSQL user's password |
| `DB_SSL` | `false` for a local database |
| `JWT_ACCESS_SECRET` | Random 64-char hex string |
| `JWT_REFRESH_SECRET` | A DIFFERENT random 64-char hex string |
| `APP_URL` | Public address of the site, e.g. `http://<SERVER_IP>` or your domain with https |
| `CORS_ORIGINS` | Same public address as `APP_URL` |
| `COOKIE_SECURE` | `true` only when the site is served over HTTPS |

### Email (needed for real registration emails)

| Variable | Value |
|----------|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | The FULL Gmail address (e.g. `you@gmail.com`). Only a name here breaks sending (Gmail error 535) |
| `SMTP_PASS` | The Gmail **App Password** (not the normal account password) |
| `SMTP_FROM` | e.g. `CyberITA <you@gmail.com>` : this is the sender name users see |
| `MAIL_FROM` | Same as `SMTP_FROM` |

Without SMTP values the platform still runs, but verification links are only
written to the server log instead of being emailed. Do not run production
that way.

### Labs (defaults are fine to start)

| Variable | Default / note |
|----------|----------------|
| `LAB_PROVIDER` | `docker` |
| `LAB_DOCKER_IMAGE` | `cyberita/lab-runtime:1.0` (built in Step 5) |
| `LAB_SESSION_TTL_MINUTES` | `120` fallback session length |
| `MAX_UPLOAD_MB` | `25` (course video uploads allow up to 200 MB through nginx, see Step 7) |

### Optional: real/VPS labs through the NovaVPS gateway

Only if Project 2 (NovaVPS) is also running and you want real-server labs:

| Variable | Value |
|----------|-------|
| `LAB_GATEWAY_URL` | `http://<NOVAVPS_SERVER_IP>:3000` |
| `LAB_GATEWAY_WS_URL` | `ws://<NOVAVPS_SERVER_IP>` (port 80, through that server's nginx) |
| `INTERNAL_LABS_SECRET` | Must EXACTLY match the same variable on the NovaVPS server |

### Optional: AI lab generation

| Variable | Value |
|----------|-------|
| `AI_PROVIDER` | `gemini` (or `openai`) |
| `AI_API_KEY` | Your Gemini / OpenAI API key |
| `AI_MODEL` | Optional, provider default is used otherwise |

---

## 7. Step 5 : Migrate the database and build the lab image

```bash
cd ~/CyberITA-
npm run db:migrate
npm run lab:image:build -w server
```

- `db:migrate` applies every file in `server/src/db/migrations` in order
  (001 to 029; number 005 intentionally does not exist).
- **Never run `npm run db:reset` on a production server.** It drops the
  whole database, including all user accounts.
- The lab image build creates the Docker image every practice lab runs in.

---

## 8. Step 6 : Build the frontend and publish it

```bash
cd ~/CyberITA-
npm run build
sudo mkdir -p /var/www/cyberita
sudo rsync -a --delete ~/CyberITA-/client/dist/ /var/www/cyberita/
```

---

## 9. Step 7 : nginx

```bash
sudo tee /etc/nginx/sites-available/cyberita > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/cyberita;
    index index.html;

    location /api/ {
        client_max_body_size 200m;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/cyberita /etc/nginx/sites-enabled/cyberita
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo chmod 751 /home/ubuntu
```

The `chmod 751` matters: without it nginx cannot read files under the
ubuntu home directory and the site returns 403.

---

## 10. Step 8 : Start the backend with pm2

pm2 on this setup runs under the **ubuntu** user (not root):

```bash
su - ubuntu
cd ~/CyberITA-/server
pm2 start src/index.js --name cyberita-backend
pm2 save
pm2 startup systemd
```

`pm2 startup` prints one `sudo ...` line. Run that line once as root, then
again as ubuntu run `pm2 save`. After this, the backend restarts itself on
server reboot.

---

## 11. Step 9 : Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw --force enable
```

If your cloud provider also has a cloud firewall (e.g. Linode Cloud
Firewall), open the same ports there too. Both layers must allow the traffic.

---

## 12. Step 10 : Create the first admin account

```bash
cd ~/CyberITA-
npm run user:create -- --email <ADMIN_EMAIL> --name "Platform Admin" --role admin
```

- If you omit `--password`, a secure password is generated and printed ONCE.
  Save it immediately.
- Create an instructor the same way with `--role instructor`.
- Students register themselves on the site; email verification must work
  (Step 6 SMTP) or their links only appear in the backend log
  (`pm2 logs cyberita-backend`).

The database starts empty: no courses or labs are included. Content is
created from the admin/instructor dashboards (Courses > New, Labs > New or
Generate).

---

## 13. Verification checklist

Do not skip this. The setup is only done when ALL of these pass:

- [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/` prints `200`
- [ ] `curl -s http://127.0.0.1/api/health` returns OK
- [ ] The site opens in a browser at `http://<SERVER_IP>/`
- [ ] Register a test student: the verification email ARRIVES (check spam once)
- [ ] Login as admin works
- [ ] Start a practice (Docker) lab as the student: the terminal opens and
      shows a prompt like `<name>@cyberitalab:~$`
- [ ] If the gateway is connected: start a VPS-mode lab and check the
      Terminal and Desktop tabs both connect

---

## 14. Updating the site later (deploying new code)

```bash
cd ~/CyberITA-
git pull
npm run db:migrate        # only needed when new migrations were added
npm run build
sudo rsync -a --delete ~/CyberITA-/client/dist/ /var/www/cyberita/
sudo -u ubuntu pm2 restart cyberita-backend
```

Frontend-only changes do not need the migrate or restart lines, but running
the full block is always safe.

---

## 15. Backups

Two things hold data, back up BOTH:

```bash
sudo -u postgres pg_dump -Fc "CyberITA" > ~/cyberita-db.dump
tar -czf ~/cyberita-uploads.tar.gz -C ~/CyberITA-/server uploads
```

`server/uploads` holds lesson videos and submission attachments. A database
dump alone does NOT contain them.

---

## 16. Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Site shows an old version after deploy | The build or rsync step was skipped. Re-run Step 6 |
| Registration emails never arrive | `SMTP_USER` is not the full Gmail address, or the app password is wrong. Check `pm2 logs cyberita-backend` for Gmail error 535 |
| Backend keeps restarting | Run `sudo -u ubuntu pm2 logs cyberita-backend` and read the first error; usually a missing .env value or the database is not created |
| Practice lab terminal never opens | Docker is not running (`sudo systemctl status docker`) or the ubuntu user is not in the `docker` group |
| VPS lab terminal/desktop does not connect | The gateway variables in Step 6 are wrong, or port 3000 on the NovaVPS host is not open to THIS server's IP |
| 403 on the website | `/home/ubuntu` permissions; re-run `sudo chmod 751 /home/ubuntu` |

---

## 17. Security rules for whoever runs this

1. `.env` files never go into Git, chat, or email.
2. If a secret is ever pasted anywhere by accident, rotate it the same day:
   issue a new one, update the server, verify, then revoke the old one.
3. JWT secrets: changing them logs out every user. Plan it, do not do it casually.
4. Keep the server updated: `apt-get update && apt-get upgrade -y` monthly.
