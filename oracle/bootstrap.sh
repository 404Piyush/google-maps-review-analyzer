#!/bin/bash
# oracle/bootstrap.sh — One-shot deploy for gmaps-scraper on Oracle Cloud Always Free.
#
# Paste the body of this script into the "Cloud-init script" field when creating
# an Ampere A1.Flex (ARM64) Ubuntu 22.04 instance, OR run via SSH:
#   scp oracle/bootstrap.sh ubuntu@<public-ip>:~/
#   ssh ubuntu@<public-ip> 'sudo bash bootstrap.sh'
#
# Env overrides (set before invoking, or hardcode below):
#   REPO_URL          Git repo to clone (default: 404Piyush/google-maps-review-analyzer)
#   BRANCH            Git branch / tag (default: main)
#   SCRAPER_API_KEY   Shared secret for /scrape (default: random hex)
#   HTTP_PORT         Public port (default: 8080)

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_URL="${REPO_URL:-https://github.com/404Piyush/google-maps-review-analyzer.git}"
BRANCH="${BRANCH:-main}"
HTTP_PORT="${HTTP_PORT:-8080}"
SCRAPER_API_KEY="${SCRAPER_API_KEY:-$(openssl rand -hex 24)}"

echo "[bootstrap] updating apt"
apt-get update -qq

echo "[bootstrap] installing prereqs (git, ca-certificates, curl)"
apt-get install -y -qq ca-certificates curl gnupg git ufw apt-transport-https

echo "[bootstrap] installing Docker (ARM64)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" \
    > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin

echo "[bootstrap] enabling + starting Docker"
systemctl enable --now docker

echo "[bootstrap] cloning $REPO_URL @ $BRANCH"
mkdir -p /opt/gmaps-scraper
git clone --depth 1 -b "$BRANCH" "$REPO_URL" /opt/gmaps-scraper
cd /opt/gmaps-scraper

echo "[bootstrap] writing .env"
cat > .env <<EOF
PORT=8080
NO_PROXY=1
FAST=1
CACHE_TTL_HOURS=24
SCRAPER_API_KEY=$SCRAPER_API_KEY
EOF

echo "[bootstrap] building image (this may take a few minutes on a free ARM tier)"
docker build -t gmaps-scraper .

echo "[bootstrap] starting container on :$HTTP_PORT"
docker rm -f gmaps-scraper 2>/dev/null || true
docker run -d \
    --name gmaps-scraper \
    --restart unless-stopped \
    -p 80:"$HTTP_PORT" \
    --env-file .env \
    -v /opt/gmaps-scraper/cache:/app/cache \
    gmaps-scraper

echo "[bootstrap] opening firewall"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw --force enable || true

echo "[bootstrap] waiting for service to come up"
for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$HTTP_PORT/health" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

PUBIP="$(curl -s --max-time 5 http://169.254.169.254/opc/v2/instance/metadata/public-ip || echo '<unknown>')"

cat <<EOF

============================================================
  gmaps-scraper is live!

  Public URL    http://$PUBIP:$HTTP_PORT
  Health check  http://$PUBIP:$HTTP_PORT/health
  Scrape        http://$PUBIP:$HTTP_PORT/scrape?url=<MAPS_URL>

  SCRAPER_API_KEY  $SCRAPER_API_KEY
  (paste into Vercel env as SCRAPER_API_KEY, then set)

  Vercel env vars to set:
    SCRAPER_URL    =  http://$PUBIP:$HTTP_PORT
    SCRAPER_API_KEY = $SCRAPER_API_KEY
============================================================

EOF
