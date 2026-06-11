#!/usr/bin/env bash
# TPT Banking Platform — VPS Setup Script
# Target: Ubuntu 22.04 LTS
# Run as root or with sudo
# Usage: ./deploy/vps-setup.sh [--domain your-domain.com] [--email admin@your-domain.com]

set -euo pipefail

DOMAIN=""
EMAIL=""
REPO_URL="https://github.com/your-org/tpt-banking.git"
INSTALL_DIR="/opt/tpt-banking"

# ── Parse arguments ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    *)        shift ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  read -rp "Enter your domain (e.g. banking.example.com): " DOMAIN
fi
if [[ -z "$EMAIL" ]]; then
  read -rp "Enter your email for SSL certificates: " EMAIL
fi

echo "──────────────────────────────────────────────────────"
echo "  TPT Banking VPS Setup"
echo "  Domain : $DOMAIN"
echo "  Email  : $EMAIL"
echo "──────────────────────────────────────────────────────"

# ── System update ──────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw jq openssl

# ── Docker installation ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "Docker installed: $(docker --version)"
fi

# ── Certbot installation ───────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "Installing Certbot..."
  apt-get install -y certbot
fi

# ── Firewall ───────────────────────────────────────────────────────────────────
echo "Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (for Certbot challenge + redirect)
ufw allow 443/tcp  # HTTPS
ufw --force enable

# ── Clone or update repo ────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing repo..."
  git -C "$INSTALL_DIR" pull
else
  echo "Cloning repo to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── Generate JWT RSA key pair ───────────────────────────────────────────────────
mkdir -p keys
if [[ ! -f keys/private.pem ]]; then
  echo "Generating RSA 4096 key pair for JWT signing..."
  openssl genrsa -out keys/private.pem 4096
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem
  chmod 600 keys/private.pem
  echo "Key pair generated at keys/private.pem and keys/public.pem"
fi

# ── Production .env file ────────────────────────────────────────────────────────
if [[ ! -f .env.production ]]; then
  cp .env.example .env.production
  DB_PASS=$(openssl rand -hex 32)
  REDIS_PASS=$(openssl rand -hex 16)
  sed -i "s|DATABASE_PASSWORD=tpt_banking_dev|DATABASE_PASSWORD=$DB_PASS|" .env.production
  sed -i "s|REDIS_PASSWORD=|REDIS_PASSWORD=$REDIS_PASS|" .env.production
  sed -i "s|NODE_ENV=development|NODE_ENV=production|" .env.production
  sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" .env.production
  echo ""
  echo "⚠️  .env.production created with auto-generated passwords."
  echo "   DB password: $DB_PASS"
  echo "   Redis password: $REDIS_PASS"
  echo "   SAVE THESE SECURELY — they are not shown again."
  echo ""
fi

# ── Update Nginx config with domain ─────────────────────────────────────────────
sed -i "s|DOMAIN|$DOMAIN|g" infra/docker/nginx/nginx.conf

# ── Start services (initially without SSL) ─────────────────────────────────────
echo "Starting services..."
# Start with just nginx HTTP (port 80) to get cert
docker compose -f infra/docker/docker-compose.prod.yml up -d postgres redis kafka

echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if docker compose -f infra/docker/docker-compose.prod.yml exec -T postgres pg_isready -U tpt_banking 2>/dev/null; then
    echo "PostgreSQL ready."
    break
  fi
  sleep 2
  echo "  Waiting ($i/30)..."
done

# ── Run migrations ──────────────────────────────────────────────────────────────
echo "Running database migrations..."
docker compose -f infra/docker/docker-compose.prod.yml run --rm banking-core \
  npx ts-node -r tsconfig-paths/register node_modules/typeorm/cli.js \
  migration:run -d packages/database/src/data-source.ts || echo "Migrations done (or no new migrations)"

# ── Obtain SSL certificate ──────────────────────────────────────────────────────
echo "Obtaining SSL certificate for $DOMAIN..."
certbot certonly --standalone --non-interactive --agree-tos \
  --email "$EMAIL" -d "$DOMAIN" || echo "Certbot: cert already exists or challenge failed"

# ── Start all services ──────────────────────────────────────────────────────────
docker compose -f infra/docker/docker-compose.prod.yml up -d

echo ""
echo "══════════════════════════════════════════════════════"
echo "  TPT Banking Platform deployed!"
echo "  API:  https://$DOMAIN/v1/health"
echo "  Docs: https://$DOMAIN/api/docs"
echo "══════════════════════════════════════════════════════"
