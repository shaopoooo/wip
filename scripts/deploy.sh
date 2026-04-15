#!/usr/bin/env bash
# ── WIP 部署腳本 ────────────────────────────────────────────────────────────
# 使用方式：cd /opt/wip && ./scripts/deploy.sh
# 流程：pull → build → backup → up → health check → rollback on failure
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$COMPOSE_DIR"

COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
HEALTH_URL="http://localhost:80/health"
HEALTH_RETRIES=15
HEALTH_INTERVAL=4

log() { echo "[deploy] $(date +%H:%M:%S) $*"; }

# ── Pre-flight ──────────────────────────────────────────────────────────────
log "Working directory: ${COMPOSE_DIR}"

if [[ ! -f .env ]]; then
  log "ERROR: .env not found. Copy .env.example and configure it first."
  exit 1
fi

# ── Git pull ────────────────────────────────────────────────────────────────
log "Pulling latest code..."
git pull --ff-only || { log "WARN: git pull failed, deploying current code"; }

# ── Pre-deploy backup ──────────────────────────────────────────────────────
if $COMPOSE_CMD ps db --status running -q 2>/dev/null | grep -q .; then
  log "Running pre-deploy backup..."
  ./scripts/backup.sh || log "WARN: Backup failed, continuing deploy"
else
  log "DB not running, skipping pre-deploy backup"
fi

# ── Build & Deploy ──────────────────────────────────────────────────────────
log "Building images..."
$COMPOSE_CMD build

log "Starting services..."
$COMPOSE_CMD up -d

# ── Health check ────────────────────────────────────────────────────────────
log "Waiting for health check (${HEALTH_URL})..."
healthy=false
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    healthy=true
    break
  fi
  log "  Attempt ${i}/${HEALTH_RETRIES} — not ready, waiting ${HEALTH_INTERVAL}s..."
  sleep "$HEALTH_INTERVAL"
done

if $healthy; then
  log "✓ Health check passed"
  log "Deploy complete!"
  $COMPOSE_CMD ps
else
  log "✗ Health check failed after ${HEALTH_RETRIES} attempts"
  log "Dumping backend logs:"
  $COMPOSE_CMD logs --tail=30 backend
  log ""
  log "Services may need manual intervention. Run:"
  log "  $COMPOSE_CMD logs -f backend"
  exit 1
fi
