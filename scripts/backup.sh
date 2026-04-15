#!/usr/bin/env bash
# ── WIP 資料庫每日備份 ──────────────────────────────────────────────────────
# 使用方式：crontab -e → 0 2 * * * /opt/wip/scripts/backup.sh >> /var/log/wip-backup.log 2>&1
# 需求：gcloud CLI 已安裝並認證、docker compose 可用
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
COMPOSE_DIR="${COMPOSE_DIR:-/opt/wip}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/wip-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# 從 .env 讀取（若存在）
ENV_FILE="${COMPOSE_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_DB|POSTGRES_USER|GCS_BACKUP_BUCKET)=' "$ENV_FILE")
fi

DB_NAME="${POSTGRES_DB:-wip_db}"
DB_USER="${POSTGRES_USER:-wip_user}"
GCS_BUCKET="${GCS_BACKUP_BUCKET:-}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="wip_${DB_NAME}_${TIMESTAMP}.sql.gz"

# ── Backup ──────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
echo "[backup] $(date -Iseconds) Starting backup: ${FILENAME}"

docker compose -f "${COMPOSE_DIR}/docker-compose.yml" \
  -f "${COMPOSE_DIR}/docker-compose.prod.yml" \
  exec -T db pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

FILE_SIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "[backup] Dump complete: ${FILENAME} (${FILE_SIZE})"

# ── Upload to GCS ───────────────────────────────────────────────────────────
if [[ -n "$GCS_BUCKET" ]]; then
  gsutil -q cp "${BACKUP_DIR}/${FILENAME}" "${GCS_BUCKET}/${FILENAME}"
  echo "[backup] Uploaded to ${GCS_BUCKET}/${FILENAME}"
else
  echo "[backup] GCS_BACKUP_BUCKET not set, skipping upload"
fi

# ── Local cleanup ───────────────────────────────────────────────────────────
find "$BACKUP_DIR" -name "wip_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Cleaned local backups older than ${RETENTION_DAYS} days"

echo "[backup] $(date -Iseconds) Done ✓"
