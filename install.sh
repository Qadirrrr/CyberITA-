#!/usr/bin/env bash
# ============================================================
# CyberITA+ : one-command installer for a FRESH Ubuntu 24.04 server
# Run as root:   bash cyberita-install.sh
#
# How it works (error-proof, 2 phases):
#   Phase 1: installs everything, clones the code, creates server/.env
#            from the example, then STOPS and asks you to fill the .env.
#   Phase 2: run the SAME script again. It detects the filled .env and
#            finishes: database, migrations, build, nginx, pm2, verify.
# Nothing is ever overwritten: an existing .env and an existing
# clone are kept as they are.
# ============================================================
set -e

REPO_URL="https://github.com/Qadirrrr/CyberITA-.git"
APP_DIR="/home/ubuntu/CyberITA-"
WEB_ROOT="/var/www/cyberita"

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: run this script as root (sudo bash cyberita-install.sh)"
  exit 1
fi

echo "==> [1/9] Base packages (Node 20, PostgreSQL, nginx, Docker, pm2)"
apt-get update -y
id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu
echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/99-ubuntu
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
fi
apt-get install -y nodejs postgresql nginx git build-essential rsync
npm install -g pm2 >/dev/null 2>&1 || true
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker ubuntu || true
systemctl enable --now postgresql nginx docker >/dev/null 2>&1 || true
node -v

echo "==> [2/9] Getting the code"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u ubuntu git -C "$APP_DIR" pull --ff-only || echo "NOTE: git pull skipped, keeping existing code"
else
  sudo -u ubuntu git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> [3/9] Environment file (.env)"
ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  sudo -u ubuntu cp "$APP_DIR/.env.example" "$ENV_FILE"
  # The example ships the Gmail lines commented out; uncomment them so the
  # SMTP_USER / SMTP_PASS below can actually be filled in (otherwise
  # verification emails silently never send).
  sudo -u ubuntu sed -i 's/^# SMTP_/SMTP_/' "$ENV_FILE"
  echo ""
  echo "============================================================"
  echo "ACTION NEEDED: the settings file was created here:"
  echo "  $ENV_FILE"
  echo ""
  echo "Open it:   nano $ENV_FILE"
  echo "Fill at least these (press Ctrl+O, Enter, Ctrl+X to save):"
  echo "  DB_PASSWORD      = your PostgreSQL password (you choose it)"
  echo "  JWT_ACCESS_SECRET  = run: openssl rand -hex 32"
  echo "  JWT_REFRESH_SECRET = run: openssl rand -hex 32 (a DIFFERENT one)"
  echo "  SMTP_USER        = your full Gmail address"
  echo "  SMTP_PASS        = your Gmail App Password"
  echo "  APP_URL          = http://THIS-SERVER-IP"
  echo "  CORS_ORIGINS     = http://THIS-SERVER-IP"
  echo "  (Only if linking to a NovaVPS server for real VPS labs, also fill"
  echo "   LAB_GATEWAY_URL, LAB_GATEWAY_WS_URL and INTERNAL_LABS_SECRET -"
  echo "   the secret must be the SAME value on both servers.)"
  echo ""
  echo "Then run this script AGAIN:  bash cyberita-install.sh"
  echo "============================================================"
  exit 0
fi

# .env exists: refuse to continue while the example defaults are still in
# place. The example file ships with real-looking defaults (DB_PASSWORD
# "postgresql", JWT secrets "change-me-..."), so an empty-only check would
# silently let them through.
if grep -qE '^DB_PASSWORD=(postgresql)?[[:space:]]*$' "$ENV_FILE" || grep -qE '^JWT_(ACCESS|REFRESH)_SECRET=(change-me-[a-z]+-secret)?[[:space:]]*$' "$ENV_FILE"; then
  echo "ERROR: $ENV_FILE still has the example DB_PASSWORD / JWT secrets."
  echo "Fill them with your own values (nano $ENV_FILE), then run this script again."
  exit 1
fi
DB_PASS=$(grep "^DB_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
DB_NAME=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d= -f2-); DB_NAME=${DB_NAME:-CyberITA}
DB_USER=$(grep "^DB_USER=" "$ENV_FILE" | cut -d= -f2-); DB_USER=${DB_USER:-postgres}

echo "==> [4/9] Database"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$DB_PASS';" >/dev/null
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  echo "Creating database role $DB_USER (does not exist yet)"
  sudo -u postgres psql -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASSWORD';"
fi
sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME" || \
  sudo -u postgres psql -c "CREATE DATABASE \"$DB_NAME\" OWNER $DB_USER;"

echo "==> [5/9] Installing dependencies (this takes a few minutes)"
sudo -u ubuntu bash -c "cd $APP_DIR && npm install"

echo "==> [6/9] Database migrations + lab Docker image"
sudo -u ubuntu bash -c "cd $APP_DIR && npm run db:migrate"
sudo -u ubuntu bash -c "cd $APP_DIR && npm run lab:image:build -w server" || \
  echo "NOTE: lab image build failed, practice labs need Docker running. Fix Docker, then: cd $APP_DIR && npm run lab:image:build -w server"

echo "==> [7/9] Building the website"
sudo -u ubuntu bash -c "cd $APP_DIR && npm run build"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_DIR/client/dist/" "$WEB_ROOT/"

echo "==> [8/9] nginx + firewall"
cat > /etc/nginx/sites-available/cyberita <<'EOF'
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
ln -sf /etc/nginx/sites-available/cyberita /etc/nginx/sites-enabled/cyberita
rm -f /etc/nginx/sites-enabled/default
chmod 751 /home/ubuntu
nginx -t && systemctl reload nginx
ufw allow 22 >/dev/null; ufw allow 80 >/dev/null; ufw --force enable >/dev/null

echo "==> [9/9] Starting the backend (pm2, ubuntu user)"
sudo -u ubuntu bash -c "cd $APP_DIR/server && (pm2 restart cyberita-backend || pm2 start src/index.js --name cyberita-backend) && pm2 save"
sudo -u ubuntu pm2 startup systemd -u ubuntu --hp /home/ubuntu >/dev/null 2>&1 || true

sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ || echo "000")
echo ""
echo "============================================================"
if [ "$CODE" = "200" ]; then
  echo "SUCCESS: CyberITA+ is running. Open:  http://$(curl -s ifconfig.me)/"
else
  echo "Website check returned HTTP $CODE. See the backend log:"
  echo "  sudo -u ubuntu pm2 logs cyberita-backend --lines 30"
fi
echo ""
echo "Last step, create the admin account:"
echo "  cd $APP_DIR"
echo "  npm run user:create -- --email YOUR_EMAIL --name \"Admin\" --role admin"
echo "============================================================"
