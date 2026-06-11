# TPT Banking — Deployment Guide

## Option 1: Docker Compose (recommended for dev and VPS)

### Local development (Docker Desktop or Docker Engine)

```bash
# Start all infrastructure services
npm run docker:up

# Wait ~30s for services to initialize, then run migrations
npm run migration:run

# Start the banking core app in dev mode
npm run banking-core:dev

# API: http://localhost:3000/v1/health
# Swagger: http://localhost:3000/api/docs
# Kafka UI: http://localhost:8080
# Vault: http://localhost:8200 (token: dev-root-token)
```

### VPS deployment (Ubuntu 22.04)

```bash
# Copy the repo to your VPS then run:
chmod +x deploy/vps-setup.sh
sudo ./deploy/vps-setup.sh --domain your-domain.com --email admin@your-domain.com
```

The script will:
1. Install Docker, Docker Compose, Certbot, UFW
2. Generate JWT RSA key pair
3. Create `.env.production` with random passwords
4. Obtain Let's Encrypt SSL certificate
5. Start all services via `docker-compose.prod.yml`
6. Run database migrations
7. Configure Nginx reverse proxy

---

## Option 2: WSL / Native Ubuntu (no Docker)

### Requirements
- WSL2 on Windows, or native Ubuntu 22.04
- Java 11+ (for Kafka)

```bash
chmod +x deploy/wsl-setup.sh
./deploy/wsl-setup.sh

# After setup:
start-kafka          # starts Zookeeper + Kafka
npm run migration:run
npm run banking-core:dev
```

---

## Environment Variables

Copy `.env.example` to `.env` (local) or `.env.production` (VPS) and fill in:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PASSWORD` | DB password | (generate random) |
| `REDIS_PASSWORD` | Redis password | (generate random) |
| `JWT_PRIVATE_KEY_PATH` | Path to RSA private key | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RSA public key | `./keys/public.pem` |
| `VAULT_TOKEN` | HashiCorp Vault token | `dev-root-token` (dev only) |
| `CORS_ORIGINS` | Allowed frontend origins | `https://your-domain.com` |

---

## Generating JWT Keys

```bash
mkdir keys
openssl genrsa -out keys/private.pem 4096
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
chmod 600 keys/private.pem
```

Never commit `keys/private.pem`. It is in `.gitignore`.

---

## Running migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

---

## Health checks

| Service | URL |
|---------|-----|
| Banking Core | `GET /v1/health` |
| API Gateway | `GET /health` |
| Kafka UI | `http://localhost:8080` (dev only) |
| Vault | `http://localhost:8200` (dev only) |
