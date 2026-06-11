#!/usr/bin/env bash
# TPT Banking Platform — WSL / Native Ubuntu Local Setup
# Installs PostgreSQL 16, Redis 7, and Apache Kafka natively (no Docker required)
# Target: Ubuntu 22.04 on WSL2 or native install
# Usage: bash deploy/wsl-setup.sh

set -euo pipefail

echo "──────────────────────────────────────────────────────"
echo "  TPT Banking — WSL/Native Local Setup"
echo "  Installs: PostgreSQL 16, Redis 7, Kafka 3.6, Node 20"
echo "──────────────────────────────────────────────────────"

# ── System dependencies ────────────────────────────────────────────────────────
sudo apt-get update -y
sudo apt-get install -y curl wget gnupg lsb-release openssl default-jdk-headless

# ── Node.js 20 ─────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version)" != v20* ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node --version) | npm: $(npm --version)"

# ── PostgreSQL 16 ──────────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  echo "Installing PostgreSQL 16..."
  echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
    sudo tee /etc/apt/sources.list.d/pgdg.list
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
    sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  sudo apt-get update -y
  sudo apt-get install -y postgresql-16 postgresql-client-16
fi

# Start PostgreSQL service
if [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
else
  # WSL doesn't have systemd by default — use service command
  sudo service postgresql start
fi

# Create database user and database
sudo -u postgres psql -c "CREATE USER tpt_banking WITH PASSWORD 'tpt_banking_dev' CREATEDB;" 2>/dev/null || \
  sudo -u postgres psql -c "ALTER USER tpt_banking WITH PASSWORD 'tpt_banking_dev';"
sudo -u postgres psql -c "CREATE DATABASE tpt_banking OWNER tpt_banking;" 2>/dev/null || true
echo "PostgreSQL ready. User: tpt_banking | DB: tpt_banking"

# ── Redis 7 ────────────────────────────────────────────────────────────────────
if ! command -v redis-server &>/dev/null; then
  echo "Installing Redis 7..."
  curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis.gpg
  echo "deb [signed-by=/usr/share/keyrings/redis.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | \
    sudo tee /etc/apt/sources.list.d/redis.list
  sudo apt-get update -y
  sudo apt-get install -y redis
fi

if [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
else
  sudo service redis-server start
fi
echo "Redis ready on localhost:6379"

# ── Apache Kafka 3.6 ────────────────────────────────────────────────────────────
KAFKA_VERSION="3.6.1"
KAFKA_SCALA="2.13"
KAFKA_DIR="/opt/kafka"

if [[ ! -d "$KAFKA_DIR" ]]; then
  echo "Installing Kafka $KAFKA_VERSION..."
  KAFKA_PKG="kafka_${KAFKA_SCALA}-${KAFKA_VERSION}"
  wget -q "https://downloads.apache.org/kafka/${KAFKA_VERSION}/${KAFKA_PKG}.tgz" -O /tmp/kafka.tgz
  sudo tar -xzf /tmp/kafka.tgz -C /opt
  sudo mv "/opt/${KAFKA_PKG}" "$KAFKA_DIR"
  rm /tmp/kafka.tgz
fi

# Create systemd-style start scripts for WSL
cat > /tmp/start-kafka.sh << 'KAFKA_SCRIPT'
#!/usr/bin/env bash
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
# Start Zookeeper
/opt/kafka/bin/zookeeper-server-start.sh /opt/kafka/config/zookeeper.properties &
sleep 5
# Start Kafka
/opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties &
echo "Kafka started. Broker: localhost:9092"
KAFKA_SCRIPT
sudo cp /tmp/start-kafka.sh /usr/local/bin/start-kafka
sudo chmod +x /usr/local/bin/start-kafka

cat > /tmp/stop-kafka.sh << 'KAFKA_STOP'
#!/usr/bin/env bash
/opt/kafka/bin/kafka-server-stop.sh
/opt/kafka/bin/zookeeper-server-stop.sh
KAFKA_STOP
sudo cp /tmp/stop-kafka.sh /usr/local/bin/stop-kafka
sudo chmod +x /usr/local/bin/stop-kafka

echo "Kafka installed at $KAFKA_DIR"
echo "Start with: start-kafka | Stop with: stop-kafka"

# ── Generate JWT keys ───────────────────────────────────────────────────────────
mkdir -p keys
if [[ ! -f keys/private.pem ]]; then
  openssl genrsa -out keys/private.pem 4096
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem
  chmod 600 keys/private.pem
  echo "JWT key pair generated at keys/"
fi

# ── .env file ──────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ".env created from .env.example"
fi

# ── Install npm dependencies ────────────────────────────────────────────────────
echo "Installing npm dependencies..."
npm install

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Local setup complete!"
echo ""
echo "  Start Kafka:     start-kafka"
echo "  Run migrations:  npm run migration:run"
echo "  Start app:       npm run banking-core:dev"
echo "  API docs:        http://localhost:3000/api/docs"
echo "══════════════════════════════════════════════════════"
