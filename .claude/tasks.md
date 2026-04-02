# Tasks — WIP QR Code 追蹤系統

## 開發順序
```
M1 基礎設施+DB → M2 後端掃描API → M3 掃描PWA⭐ → M4 管理後台 → M5 看板+追溯 → M6 拆單+上線
```

---

## Phase 1（目前進行中）

---

### 🏗️ M1 — 基礎設施 + DB Schema
> 驗收：`docker compose up -d` → 13 張表 + seed 資料可查

#### DevOps
- [x] 建立目錄結構（`/backend`, `/front`, `/migrations`）
- [x] `docker-compose.yml`（app + nginx + db，db 不對外暴露，含 healthcheck）
- [x] `/backend/Dockerfile`（multi-stage build）
- [x] `.env.example`（列出所有必要環境變數）
- [x] `.gitignore`
- [x] `backend/package.json`（Express + TypeScript + Drizzle ORM + zod + qrcode + pg）
- [x] `backend/tsconfig.json`（strict mode）
- [x] `docker-compose.dev.yml`（hot reload，volume mount source）

#### DB — Schema（Drizzle，一次建完 13 張表）
- [x] `departments`
- [x] `groups`（UNIQUE: department_id + name；UNIQUE: department_id + code）
- [x] `products`（含 Phase 2~3 預留：`bom_version`, `unit_cost`, `category`）
- [x] `process_routes`（含 `version` 欄位）
- [x] `process_steps`（含預留：`is_optional`, `condition_expr`, `rework_step_id`）
- [x] `stations`（`group_id` 允許 NULL）
- [x] `equipment`（含預留：`calibration_due`）
- [x] `devices`（含 fingerprint 欄位：`user_agent`, `screen_info`, `timezone`, `webgl_renderer`）
- [x] `work_orders`（含 self-ref `parent_work_order_id`、拆單欄位、Phase 3 預留）
- [x] `split_logs`
- [x] `station_logs`（含 Phase 2 預留：`operator_id`, `serial_number`, `parent_log_id`, `material_batch_ids`）
- [x] `defect_records`
- [x] `audit_logs`（不可變，只 INSERT）

#### DB — Constraints & Indexes
- [x] `station_logs` UNIQUE `(work_order_id, station_id, check_in_time)`
- [x] `work_orders` CHECK `planned_qty > 0`
- [x] `products` UNIQUE `(department_id, model_number)`
- [x] 所有 indexes（`idx_station_logs_wo`, `idx_work_orders_dept`, 等參照 CLAUDE.md）
- [x] Drizzle migration 產生並執行（確認可 rollback）

#### DB — 管理員認證表
- [x] `admin_users`（`id`, `username`, `password_hash`, `role_id`, `is_active`, `external_id`（Phase 2 Authentik sub，nullable）, `created_at`）
- [x] `roles`（`id`, `name`, `description`, `is_active`, `created_at`）
- [x] seed：預設角色（`super_admin`）+ 預設帳號（從 `.env` 讀取初始帳密）

#### DB — Seed 資料
- [x] 2 個部門（A 線、B 線）
- [x] 各 3 個組別（SMT 組、插件組、測試組）
- [x] 各 6 個站點
- [x] 各 2 台 devices（綁定站點）
- [x] 1 個產品 + 1 個路由（6 步驟，固定線性）
- [x] 2 張工單（status: pending）

---

### ⚙️ M2 — 後端核心 API
> 驗收：Postman 跑完 check-in → check-out → WRONG_DEPARTMENT → DUPLICATE_SCAN 全正確

#### Backend — 專案骨架
- [ ] Express app 初始化（router 結構、morgan logger）
- [ ] Drizzle ORM 連線設定（`/backend/src/models/db.ts`）
- [ ] 統一回傳格式 middleware（`{ success, data, error: { code, message } }`）
- [ ] 全域錯誤處理 middleware
- [ ] 錯誤碼常數定義（`WRONG_DEPARTMENT`, `SKIP_STATION`, `DUPLICATE_SCAN`, `ORDER_CLOSED`, `ORDER_ALREADY_SPLIT`, `SPLIT_QTY_MISMATCH`）
- [ ] device_id 識別 middleware（從 header 讀取，查驗 devices 表）

#### Backend — 基礎查詢 API
- [ ] `GET /api/departments`
- [ ] `GET /api/departments/:id/groups`（該部門的組別列表）
- [ ] `GET /api/groups/:id/stations`（該組的站點列表）
- [ ] `GET /api/stations?department_id=`
- [ ] `GET /api/devices/:id`（回傳設備 + 綁定的 station + department）
- [ ] `GET /api/work-orders?department_id=&status=`（含分頁）
- [ ] `GET /api/work-orders/:id`

#### Backend — 設備管理 API
- [ ] `POST /api/devices/register`（BYOD：接收 fingerprint + station_id，回傳 device_id）
- [ ] `PATCH /api/devices/:id/heartbeat`（更新 `last_seen_at`）

#### Backend — 掃描報工 API（核心，`ScanService.ts`）
- [ ] `POST /api/scan`
  - [ ] device → station_id / department_id
  - [ ] 驗證 department 一致（`WRONG_DEPARTMENT`）
  - [ ] 驗證工單狀態（`ORDER_CLOSED` / `ORDER_ALREADY_SPLIT`）
  - [ ] 查最新 station_log → 自動判斷 check-in / check-out
  - [ ] check-in：驗前站完成（`SKIP_STATION`）+ 30 秒去重（`DUPLICATE_SCAN`）
  - [ ] 跳站偵測 → 自動補填缺漏站點（`status = auto_filled`）
  - [ ] 寫入 `station_logs`
  - [ ] 寫入 `audit_logs`
  - [ ] 末站 check-out → `work_orders.status = completed`
- [ ] `PATCH /api/scan/:logId/correction`（時間補正，記錄前後差異至 `audit_logs`）

---

### 📱 M3 — 掃描 PWA ⭐ 最高價值
> 驗收：平板真實掃描 5 張工單，check-in/out 完整，錯誤提示可見

#### Frontend — 專案骨架
- [ ] 初始化 Vite + React + TypeScript（`/front`）
- [ ] React Router 設定（`/setup`, `/scan`, `/admin`, `/dashboard`, `/trace`）
- [ ] PWA manifest + service worker（可加至主畫面）
- [ ] API client 封裝（`/front/src/api/`，統一錯誤碼 → 中文訊息對照表）
- [ ] 共用 UI 元件（Button、Modal、Toast、Badge）
- [ ] 響應式 layout（平板橫向優先）

#### Frontend — 設備綁定首次流程（`/setup`）
- [ ] 檢查 localStorage 有無 `device_id`
- [ ] 採集 fingerprint（UA、螢幕、時區、WebGL）
- [ ] 引導頁：選部門 → 選站點 → 選填工號 → 呼叫 `POST /api/devices/register`
- [ ] 將 `device_id` 存入 localStorage
- [ ] 換裝置偵測：fingerprint 不符時提示重新綁定

#### Frontend — 掃描主頁（`/scan`）
- [ ] html5-qrcode 全螢幕相機元件
- [ ] 掃描 → 呼叫 `POST /api/scan`
- [ ] 成功 check-in：綠色動畫 + 工單資訊（工單號、產品、數量）+ 2 秒後回待掃
- [ ] 成功 check-out：跳出站確認頁（填 actual_qty_out + defect_qty）→ 確認送出 → 綠色動畫 + 2 秒後回待掃
- [ ] 錯誤：紅色提示框 + 中文錯誤訊息 + 警示音
- [ ] 30 秒內重複掃描：顯示「已掃描」提示

---

### 🖥️ M4 — 管理後台
> 驗收：建產品 → 建路由 → 建工單 → 印 QR Code → 掃描 → 完工，全閉環

#### Backend — 管理後台認證 API
- [ ] `POST /api/admin/auth/login`（帳密登入，回傳 JWT access token + refresh token）
- [ ] `POST /api/admin/auth/refresh`（用 refresh token 換新 access token）
- [ ] `POST /api/admin/auth/logout`（廢棄 refresh token）
- [ ] `GET /api/admin/auth/me`（取當前登入帳號資訊）
- [ ] JWT auth middleware（驗 Bearer token，掛在所有 `/api/admin/*` 路由）
- [ ] `GET /api/admin/roles`（角色列表）
- [ ] `POST /api/admin/roles`（新增角色）
- [ ] `DELETE /api/admin/roles/:id`（刪除角色，需確認無人使用中）
- [ ] `GET /api/admin/users`（管理員帳號列表）
- [ ] `POST /api/admin/users`（新增管理員帳號，指定角色）
- [ ] `PATCH /api/admin/users/:id`（修改角色 / 停用帳號）
- [ ] `DELETE /api/admin/users/:id`

#### Backend — 補充 API（需掛 JWT middleware）
- [ ] `POST/PATCH/DELETE /api/admin/groups`
- [ ] `POST/PATCH/DELETE /api/admin/products`
- [ ] `POST/PATCH/DELETE /api/admin/stations`
- [ ] `POST/PATCH/DELETE /api/admin/equipment`
- [ ] `POST/PATCH/DELETE /api/admin/process-routes`
- [ ] `POST/PATCH/DELETE /api/admin/process-routes/:id/steps`
- [ ] `POST /api/admin/work-orders`（自動產生 `WO-A-2026-XXX` 編號）
- [ ] `PATCH /api/admin/work-orders/:id/status`
- [ ] `GET /api/admin/work-orders/:id/qrcode`（回傳 QR PNG base64）
- [ ] `GET /api/admin/work-orders/print?ids=...`（批次列印資料）

#### Frontend — 管理後台（`/admin`）
- [ ] 登入頁（`/admin/login`）：帳號 + 密碼表單，JWT 存入 httpOnly cookie（禁止 localStorage）
- [ ] Auth context / hook（`useAdminAuth`）：管理登入狀態、自動 refresh token
- [ ] Protected Route wrapper（未登入自動跳 `/admin/login`）
- [ ] 角色管理頁（`/admin/roles`）：角色列表、新增角色（填名稱/描述）、刪除角色
- [ ] 管理員帳號頁（`/admin/users`）：帳號列表、新增帳號（填帳號/密碼/角色）、停用/刪除
- [ ] 組別管理頁（樹狀：部門 → 組 → 站點，CRUD）
- [ ] 站點管理頁（含組別下拉）
- [ ] 設備管理頁（含站點綁定）
- [ ] 產品型號管理頁（CRUD）
- [ ] 工序路由管理頁（步驟可拖曳排序）
- [ ] 工單列表頁（部門 + 狀態篩選，分頁）
- [ ] 建立工單頁（選部門 → 產品 → 路由 → 數量、交期、優先級）
- [ ] 工單詳情頁（站點歷程進度）
- [ ] QR Code 預覽 + 單張列印
- [ ] 批次列印頁（勾選多張工單 → 列印版面）

---

### 📊 M5 — 即時看板 + 追溯查詢
> 驗收：看板數據與 DB 吻合；30 秒後自動更新；追溯顯示完整歷程

#### Backend — 看板 + 追溯 API
- [ ] `GET /api/dashboard/wip?department_id=&mode=`（mode: `in_station` or `queuing`）
- [ ] `GET /api/dashboard/today?department_id=`（當日產出統計）
- [ ] `GET /api/dashboard/work-order-progress?department_id=`
- [ ] `GET /api/traceability/:workOrderId`（完整站點歷程）
- [ ] `GET /api/traceability/:workOrderId/family`（母子單關聯樹）

#### Frontend — 看板（`/dashboard`）
- [ ] 部門切換 tab（A 線 / B 線 / 全廠）
- [ ] 各站 WIP 數量卡片（顏色：0=灰, 1~3=綠, 4~7=黃, 8+=紅）
- [ ] WIP 模式切換（站內 / 待入站）
- [ ] 當日產出統計
- [ ] 工單進度列表（組別 + 站數基準）
- [ ] 30 秒 polling 自動刷新

#### Frontend — 追溯（`/trace`）
- [ ] 輸入工單號（或掃 QR Code）
- [ ] 時間軸顯示各站 check-in → check-out（台灣時區）
- [ ] 母子單關聯樹（可展開 / 收合）

---

### 🔀 M6 — 拆單 + 上線
> 驗收：拆單後母單 QR 失效；部署到 VM 後平板可正常存取

#### Backend — 拆單 API
- [ ] `POST /api/work-orders/:id/split`
  - [ ] 驗數量總和 = 母單 `planned_qty`（`SPLIT_QTY_MISMATCH`）
  - [ ] 取母單最新一筆 log 的站點作為子單起始站
  - [ ] 建立子單（繼承產品、路由，設 `parent_work_order_id`）
  - [ ] 母單狀態改 `split`，QR Code 立即失效
  - [ ] 寫入 `split_logs` + `audit_logs`
- [ ] `GET /api/work-orders/:id/split-history`
- [ ] `GET /health`（健康檢查 endpoint）

#### Frontend — 拆單介面
- [ ] 工單詳情頁加「拆單」按鈕（母單且非 split 才顯示）
- [ ] 拆單 modal（選原因 → 輸入子單數量/交期/優先級 → 即時驗證總和）
- [ ] 拆單後顯示子單列表 + 各自 QR Code

#### DevOps — 上線準備
- [ ] Nginx config（反向代理 `/api` → backend，其他 → front 靜態，gzip）
- [ ] 備份 cron script（每日 `pg_dump` → gzip → `gsutil cp` 上傳 Cloud Storage）
- [ ] 備份保留策略（Cloud Storage bucket lifecycle rule：保留 7 天，自動刪除舊檔）
- [ ] 首次部署：手動建立 GCS bucket 並設定 lifecycle 規則
- [ ] 部署腳本（`docker compose pull && up -d`）
- [ ] 環境變數清單確認（`.env.example` 完整）
- [ ] GCP VM 建立（e2-small, asia-east1）
- [ ] Let's Encrypt SSL（certbot）
- [ ] 防火牆規則（80, 443）
- [ ] DNS 設定（`wip.yourfactory.com`）

---

## 不做但預留（Phase 1 schema 已埋欄位）

- `station_logs.operator_id` — Phase 2
- `station_logs.serial_number` — Phase 2
- `station_logs.parent_log_id`, `material_batch_ids` — Phase 2
- `work_orders.sales_order_id` — Phase 3
- `work_orders.scheduled_start` — Phase 3
- `products.bom_version`, `unit_cost`, `category` — Phase 2~3
- `equipment.calibration_due` — Phase 2
- `operators` 表 — Phase 2
- `process_steps.is_optional`, `condition_expr`, `rework_step_id` — Phase 2+
- `stations.group_id` NOT NULL — Phase 2

---

## Phase 2 功能清單

### 🔐 統一身份認證 SSO（另立獨立 infra 專案）

> **注意：Authentik 部署與設定另開 `factory-infra` 專案管理，不放在此 repo。**
> Authentik 為共用 IdP，供 WIP、Email、共享硬碟、NAS 使用同一組 Google 帳號登入。
> WIP 這邊只需對接 Authentik 提供的 OIDC endpoint。

#### WIP 端需做（待 `factory-infra` 就緒後執行）
- [ ] Backend：`AuthService.verifyToken()` 改向 Authentik introspect endpoint 驗證（取代本地 JWT）
- [ ] Backend：`admin_users.external_id` 對應 Authentik user `sub`（Phase 1 已預留欄位）
- [ ] Frontend：`/admin/login` 改為 OIDC 登入（「Login with Google」→ Authentik → callback）
- [ ] Frontend：`useAdminAuth` hook 改從 Authentik userinfo endpoint 取用戶資訊

#### 相關外部服務預留接口（未來 `factory-infra` 開案時實作）
- 共享硬碟：Nextcloud on Docker 或 Synology DSM 7.1+，透過 OIDC 接 Authentik
- Email：Roundcube 或 Mailcow，透過 OIDC/SAML 接 Authentik
- NAS：Synology DSM 7.1+ 原生 OIDC SSO（推薦），或 QNAP（僅 LDAP，較受限）

---

### DB
- [ ] 建立 `operators` 表（`employee_id`, `name`, `role_id`, `department_id`, `authentik_sub`）
- [ ] `station_logs.operator_id` 啟用外鍵
- [ ] BOM 相關表（`bom_headers`, `bom_items`）
- [ ] 庫存相關表（`warehouses`, `locations`, `inventory`, `inventory_transactions`）
- [ ] 異常通報表（`alert_rules`, `alert_events`, `alert_responses`）
- [ ] `stations.group_id` 改為 NOT NULL（執行遷移腳本）

### Backend
- [ ] 操作員登入（掃描側，工號綁定 Authentik 帳號）
- [ ] RBAC middleware（從 Authentik token claims 取角色）
- [ ] BOM CRUD API
- [ ] 庫存管理 API
- [ ] 自動扣料 service
- [ ] 異常通報 service（LINE / Email）
- [ ] Socket.io 看板即時推送
- [ ] 日報產生 service（每日 00:00 自動）
- [ ] 月報產生 service（每月 1 日自動）
- [ ] 報表 API（選日期範圍 + 部門，PDF + CSV）

### Frontend
- [ ] RBAC 權限控制（頁面 / 按鈕依角色顯示）
- [ ] BOM 管理頁
- [ ] 庫存管理頁
- [ ] 異常通報設定頁
- [ ] 報表頁（日報 / 月報，PDF 下載 / CSV 下載）
- [ ] 不良品照片上傳

### DevOps
- [ ] DB 遷移至 Cloud SQL
- [ ] docker-compose 加入 redis service
- [ ] GitHub Actions 自動部署
- [ ] Nginx rate limiting

---

## Phase 3 功能清單

### Backend
- [ ] 採購管理 API
- [ ] 銷售訂單 API（訂單自動轉工單）
- [ ] 生產排程 service
- [ ] SPC 計算 service（Cpk、管制圖）
- [ ] 成本計算 service

### Frontend
- [ ] 採購管理頁
- [ ] 銷售訂單頁
- [ ] 生產排程看板
- [ ] SPC 品質管制頁
- [ ] 成本分析頁

### DevOps
- [ ] 遷移至 Cloud Run + 前後端分離
- [ ] Memorystore Redis

---

## Phase 4 功能清單
- [ ] 應收 / 應付帳款
- [ ] 設備 IoT 連線（Cloud Pub/Sub）
- [ ] 多廠區 / 多倉調撥
- [ ] 客戶入口網站
- [ ] GKE Autopilot 部署
