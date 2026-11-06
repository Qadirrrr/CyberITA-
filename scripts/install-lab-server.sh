#!/usr/bin/env bash
# CyberITA+ Lab Server installer.
# Run on a fresh Ubuntu 22.04/24.04 EC2 instance as a sudo-capable user:
#   curl -fsSL <url>/install-lab-server.sh | bash
# or:
#   bash install-lab-server.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Qadirrrr/CyberITA-.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/cyberita}"
AGENT_PORT="${AGENT_PORT:-9100}"

echo "==> Updating system packages"
sudo apt update
sudo apt install -y ca-certificates curl gnupg git build-essential

echo "==> Installing Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Installing Node.js LTS"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "==> Cloning repository"
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$USER:$USER" "$INSTALL_DIR"
if [ ! -d "$INSTALL_DIR/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

echo "==> Installing server dependencies"
cd "$INSTALL_DIR/server"
npm ci --omit=dev

echo "==> Building lab runtime image"
npm run lab:image:build
docker images | grep cyberita/lab-runtime

echo "==> Preparing log directory"
sudo mkdir -p /var/log/cyberita-agent
sudo chown "$USER:$USER" /var/log/cyberita-agent

echo "==> Installing PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo ""
echo "================================================================"
echo " Base installation complete."
echo " Next steps:"
echo "  1. Create $INSTALL_DIR/server/.env from .env.agent.example"
echo "     and fill AGENT_SECRET, AGENT_URL, MAIN_SERVER_URL, etc."
echo "     chmod 600 $INSTALL_DIR/server/.env"
echo "  2. Start the agent:"
echo "     cd $INSTALL_DIR/server && pm2 start ecosystem.agent.config.cjs"
echo "     pm2 save && pm2 startup systemd -u \$USER --hp \$HOME"
echo "  3. In Main Server Admin -> Lab Infrastructure -> Lab Servers,"
echo "     create a Remote Lab Agent entry with the same secret and URL."
echo "  4. Verify: curl http://127.0.0.1:$AGENT_PORT/health"
echo "================================================================"
