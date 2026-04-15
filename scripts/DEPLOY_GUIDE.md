# WIP 系統 — GCP VM 部署指南

## 1. GCP VM 建立

```bash
# 建立 VM（e2-small, 2 vCPU / 2GB RAM, asia-east1-b）
gcloud compute instances create wip-prod \
  --zone=asia-east1-b \
  --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server

# 預留靜態 IP
gcloud compute addresses create wip-ip --region=asia-east1
gcloud compute instances add-access-config wip-prod \
  --zone=asia-east1-b \
  --access-config-name="External NAT" \
  --address=$(gcloud compute addresses describe wip-ip --region=asia-east1 --format='value(address)')
```

## 2. 防火牆規則

```bash
# HTTP + HTTPS（通常預設 tag 已建立，確認即可）
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 --target-tags=http-server --source-ranges=0.0.0.0/0
gcloud compute firewall-rules create allow-https \
  --allow=tcp:443 --target-tags=https-server --source-ranges=0.0.0.0/0
```

## 3. DNS 設定

在你的 DNS provider 新增 A record：

```
wip.yourfactory.com → <VM 靜態 IP>
```

等待 DNS 生效（通常 5-15 分鐘）。

## 4. VM 環境安裝

```bash
# SSH 進入 VM
gcloud compute ssh wip-prod --zone=asia-east1-b

# 安裝 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登入讓 group 生效
exit
gcloud compute ssh wip-prod --zone=asia-east1-b

# 安裝 gcloud CLI（備份上傳用）
# Ubuntu 24.04 通常已預裝，確認：
gcloud version

# Clone 專案
sudo mkdir -p /opt/wip
sudo chown $USER:$USER /opt/wip
git clone <your-repo-url> /opt/wip
cd /opt/wip
```

## 5. 環境變數設定

```bash
cd /opt/wip
cp .env.example .env
nano .env
```

**必須修改的項目：**

| 變數 | 說明 |
|------|------|
| `POSTGRES_PASSWORD` | 改為強密碼 |
| `DATABASE_URL` | 同步更新密碼 |
| `JWT_SECRET` | `openssl rand -hex 64` 產生 |
| `ADMIN_INITIAL_PASSWORD` | 首次登入密碼 |
| `APP_URL` | `https://wip.yourfactory.com` |
| `CORS_ORIGIN` | `https://wip.yourfactory.com` |
| `GCS_BACKUP_BUCKET` | `gs://your-factory-wip-backup` |

## 6. 上傳 Seed Data

`backend/src/seed-data/` 含工廠真實資料，不在 git 中，需從本機手動上傳至 VM。

```bash
# 在本機執行（將 seed-data 上傳到 VM）
gcloud compute scp --recurse \
  backend/src/seed-data \
  wip-prod:/opt/wip/backend/src/seed-data \
  --zone=asia-east1-b
```

> 也可用 `rsync` 或 `scp`：
> ```bash
> scp -r backend/src/seed-data user@<VM_IP>:/opt/wip/backend/src/seed-data
> ```

上傳後在 VM 確認：
```bash
ls /opt/wip/backend/src/seed-data/
# 應看到：capacities.json  customers.json  parts.json  processes.json  routes.json  vendors.json  work-orders.json
```

## 7. 首次部署（HTTP 模式）

```bash
cd /opt/wip

# 啟動服務（HTTP only，先讓 certbot 取得證書）
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 確認後端啟動完成
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
# 看到 "listening on port 3000" 後 Ctrl+C

# 執行 seed
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend npm run seed

# 確認 http://<IP>/health 回傳 OK
curl http://localhost/health
```

## 8. SSL 證書（Let's Encrypt）

```bash
cd /opt/wip
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# 取得證書（替換 domain 和 email）
$COMPOSE run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d wip.yourfactory.com \
  --cert-name wip \
  --agree-tos \
  -m admin@yourfactory.com

# 切換到 SSL nginx config
sed -i 's|nginx/nginx.conf|nginx/nginx.ssl.conf|' docker-compose.prod.yml

# 重啟 nginx 載入證書
$COMPOSE up -d nginx

# 驗證 HTTPS
curl https://wip.yourfactory.com/health
```

> certbot container 會自動每 12 小時檢查續期。Nginx 需 reload 才能載入新證書：
> ```bash
> # 可加入 crontab：每週一凌晨 3 點 reload nginx
> 0 3 * * 1 docker compose -f /opt/wip/docker-compose.yml -f /opt/wip/docker-compose.prod.yml exec nginx nginx -s reload
> ```

## 9. GCS 備份 Bucket 建立

```bash
# 建立 bucket（asia-east1, nearline）
gsutil mb -l asia-east1 -c nearline gs://your-factory-wip-backup

# 設定 lifecycle：7 天後自動刪除
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [{
    "action": {"type": "Delete"},
    "condition": {"age": 7}
  }]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://your-factory-wip-backup

# 設定備份 cron（每天凌晨 2 點）
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/wip/scripts/backup.sh >> /var/log/wip-backup.log 2>&1") | crontab -
```

## 10. 後續部署

```bash
cd /opt/wip
./scripts/deploy.sh
```

deploy.sh 會自動：git pull → 備份 DB → build → up → health check。

## 11. 常用維運指令

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# 查看狀態
$COMPOSE ps

# 查看後端 log
$COMPOSE logs -f backend

# 手動備份
./scripts/backup.sh

# 重啟單一服務
$COMPOSE restart backend

# 進入 DB console
$COMPOSE exec db psql -U wip_user -d wip_db
```
