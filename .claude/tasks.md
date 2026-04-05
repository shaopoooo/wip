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
- [x] 建立目錄結構（`/backend`, `/frontend`, `/migrations`）
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
- [x] Express app 初始化（router 結構、morgan logger）
- [x] Drizzle ORM 連線設定（`/backend/src/models/db.ts`）
- [x] 統一回傳格式 middleware（`{ success, data, error: { code, message } }`）
- [x] 全域錯誤處理 middleware
- [x] 錯誤碼常數定義（`WRONG_DEPARTMENT`, `SKIP_STATION`, `DUPLICATE_SCAN`, `ORDER_CLOSED`, `ORDER_ALREADY_SPLIT`, `SPLIT_QTY_MISMATCH`）
- [x] device_id 識別 middleware（從 header 讀取，查驗 devices 表）

#### Backend — 基礎查詢 API
- [x] `GET /api/departments`
- [x] `GET /api/departments/:id/groups`（該部門的組別列表）
- [x] `GET /api/groups/:id/stations`（該組的站點列表）
- [x] `GET /api/stations?department_id=`
- [x] `GET /api/devices/:id`（回傳設備 + 綁定的 station + department）
- [x] `GET /api/work-orders?department_id=&status=`（含分頁）
- [x] `GET /api/work-orders/:id`

#### Backend — 設備管理 API
- [x] `POST /api/devices/register`（BYOD：接收 fingerprint + station_id，回傳 device_id）
- [x] `PATCH /api/devices/:id/heartbeat`（更新 `last_seen_at`）

#### Backend — 掃描報工 API（核心，`ScanService.ts`）
- [x] `GET /api/scan/preview?orderNumber=`（預覽工單狀態、下一站、stepsContext；需 device-auth）
- [x] `GET /api/scan/logs?orderNumber=`（查詢工單所有站別紀錄，含 logId；需 device-auth）
- [x] `POST /api/scan`
  - [x] device → station_id / department_id
  - [x] 驗證 department 一致（`WRONG_DEPARTMENT`）
  - [x] 驗證工單狀態（`ORDER_CLOSED` / `ORDER_ALREADY_SPLIT`）
  - [x] 查最新 station_log → 自動判斷 check-in / check-out
  - [x] check-in：驗前站完成（`SKIP_STATION`）+ 30 秒去重（`DUPLICATE_SCAN`）
  - [x] 跳站偵測 → 自動補填缺漏站點（`status = auto_filled`）
  - [x] 寫入 `station_logs`
  - [x] 寫入 `audit_logs`
  - [x] 末站 check-out → `work_orders.status = completed`
- [x] `PATCH /api/scan/:logId/correction`（時間補正，記錄前後差異至 `audit_logs`）

---

### 📱 M3 — 掃描 PWA ⭐ 最高價值
> 驗收：平板真實掃描 5 張工單，check-in/out 完整，錯誤提示可見

#### 驗收步驟

**前置**
```bash
docker compose up -d --build
docker compose logs -f backend   # 等看到 "listening on port 3000"
docker compose exec backend npm run seed
```

**1. 設備綁定 `/setup`**
- 開啟 `http://localhost:5173` → 確認自動跳到 `/setup`
- 選部門 → 填裝置名稱（選填）→ 點「完成設定」
- 確認跳到 `/scan`，且 localStorage 有 `device_id`

**2. Check-in 流程**
- 輸入 `WO-FPC-2026-001` → 點送出
- 確認出現藍色「入站確認」Modal，WorkOrderCard 含：物料編號、訂單數量、製作數量、作業重點指示
- 工序進度面板：當前站藍色高亮 + ▶ 當前站標籤
- 點「確認入站」→ 綠色成功畫面 → 2 秒後回 idle

**3. Check-out 流程**
- 再次輸入同工單號 → 確認出現橘色「出站確認」Modal
- 點「確認出站」→ 綠色成功畫面，顯示出站數量

**4. 防呆驗證**
| 情境 | 預期 |
|------|------|
| 30 秒內重複送出同工單 | 紅色錯誤畫面，含「已掃描」 |
| 輸入不存在的工單號 | 紅色錯誤畫面，含「工單不存在」 |
| 重設裝置選 B 線，掃 `WO-FPC-2026-001` | 紅色錯誤畫面，含「不屬於本產線」 |

**5. 工序進度展開**
- 在 Modal 中點「展開全部 N 站 ↓」→ 顯示所有站
- 點「收合 ↑」→ 回到 ±1 顯示

**6. 時間補正 `/correction`**
- 點右上角「時間補正」
- 輸入 `WO-FPC-2026-001` → 點查詢 → 確認列出站別紀錄
- 點一筆 → 勾選「修正」→ 修改時間 → 填原因 → 點「確認補正」
- 確認顯示「✓ 補正成功」，列表自動刷新

**7. 錯誤頁面**
- 訪問 `http://localhost:5173/nonexistent` → 確認自動導回 `/scan`

#### Frontend — 專案骨架
- [x] 初始化 Vite + React + TypeScript（`/frontend`）
- [x] React Router 設定（`/setup`, `/scan`, `/correction`, `/admin`, `/dashboard`, `/trace`）；共用 Layout（Header + Footer）
- [x] PWA manifest（`/public/manifest.json`，`start_url=/scan`，landscape orientation）
- [ ] PWA Service Worker（離線快取、背景同步）→ 移至 Phase 2（`vite-plugin-pwa`）
- [x] API client 封裝（`/frontend/src/api/`，統一錯誤碼 → 中文訊息對照表）
- [x] 共用 UI 元件（Button、Modal `size=md|lg`、Toast、Badge、Header、Footer、Layout）
- [x] 響應式 layout（平板橫向優先）

#### Frontend — 設備綁定首次流程（`/setup`）
- [x] 檢查 localStorage 有無 `device_id`
- [x] 採集 fingerprint（UA、螢幕、時區、WebGL）
- [x] 引導頁：選部門 → 選填裝置名稱／工號 → 呼叫 `POST /api/devices/register`（Phase 1 不綁站點；Phase 2 加入站點多選）
- [x] 將 `device_id` 存入 localStorage
- [x] 換裝置偵測：fingerprint 不符時提示重新綁定

#### Frontend — 掃描主頁（`/scan`）
- [x] URL Parameter (`?wo=`) 接收工單號（QR Code 掃描觸發）
- [x] 手動輸入工單號（idle 頁面下方 input + 送出按鈕）
- [x] 掃描 → 呼叫 `GET /api/scan/preview?orderNumber=` 取得工單資訊與 stepsContext
- [x] 進站確認 Modal（藍色）：WorkOrderCard（物料編號、訂單數量、製作數量、作業重點指示）+ 工序進度，強制確認後送出 check-in
- [x] 出站確認 Modal（橘色）：WorkOrderCard + 工序進度；defect_qty 輸入 Phase 1 隱藏（預設 0），強制確認後送出 check-out
- [x] 工序進度面板（預設 ±1 站，可展開全部；當前站藍色高亮 + ▶ 當前站標籤）
- [x] 錯誤：紅色全螢幕提示 + 中文錯誤訊息 + 警示音
- [x] 30 秒內重複掃描：顯示「已掃描」提示（後端回傳 `DUPLICATE_SCAN`）

#### Frontend — 時間補正頁（`/correction`）
- [x] 入口：Header 掃描頁「時間補正」按鈕（`/scan` 頁才顯示）
- [x] 輸入工單號 → 呼叫 `GET /api/scan/logs?orderNumber=` 查詢站別紀錄
- [x] 列表顯示各站進出站時間及狀態，可點選單筆編輯
- [x] 編輯：勾選欄位才修改（入站時間 / 出站時間各有獨立「修正」checkbox），填寫補正原因（必填）
- [x] 送出 `PATCH /api/scan/:logId/correction`，寫入 audit_logs；成功後自動重新載入列表

---

### 🖥️ M4 — 管理後台
> 驗收：建產品 → 建路由 → 建工單 → 印 QR Code → 掃描 → 完工，全閉環

#### 驗收步驟

**前置**
```bash
docker compose up -d --build
docker compose logs -f backend   # 等看到 "listening on port 3000"
docker compose exec backend npm run seed
```

**1. 登入管理後台**
- 開啟 `http://localhost:5173/admin/login`
- 輸入 seed 預設帳密（從 `.env.dev` 確認 `ADMIN_USERNAME` / `ADMIN_PASSWORD`）
- 確認跳轉至 `/admin/work-orders`，左側 sidebar 顯示 8 個選單項目
- 重整頁面確認維持登入狀態（refresh token 自動補發）

**2. 新增組別**
- 進入「組別管理」→ 選部門（A 線）→ 點「+ 新增組別」
- 填寫名稱（測試組 Ω）→ 確認儲存成功、列表出現新項目
- 點「編輯」→ 修改說明 → 確認更新成功
- 點「停用」→ 確認從列表消失（soft delete，`is_active = false`）

**3. 新增站點**
- 進入「站點管理」→ 選部門 A 線 → 點「+ 新增站點」
- 填站點名稱（測試站 T1）、代碼（T-01）、選組別 → 儲存
- 確認列表出現新站點，組別欄顯示正確組名

**4. 新增產品型號**
- 進入「產品型號」→ 選部門 A 線 → 點「+ 新增產品」
- 填寫產品名稱（FPC 測試板）、物料編號（FPC-TEST-001）→ 儲存
- 確認列表出現新產品

**5. 建立工序路由 + 步驟**
- 進入「工序路由」→ 選部門 A 線 → 點「+ 新增路由」
- 填路由名稱（測試路由 R1）、版本號 1 → 儲存
- 點「管理步驟」→ 確認步驟管理 Modal 開啟
- 下拉選站點（測試站 T1）→ 標準工時填 120 → 點「新增」
- 確認步驟出現在列表，顯示站點名稱與標準工時
- 再新增 1 個步驟（選另一已存在站點）
- 點 ▲▼ 調整順序 → 確認 stepOrder 變動

**6. 建立工單**
- 進入「工單管理」→ 點「+ 建立工單」
- 選部門（A 線）→ 選產品（FPC 測試板）→ 選路由（測試路由 R1）
- 填數量 50、交期今天 → 點「建立」
- 確認工單號格式符合 `WO-A-{YEAR}-{SEQ}`（例 `WO-A-2026-003`）
- 確認工單出現在列表，狀態為「待生產」

**7. QR Code 預覽 + 列印**
- 點工單號進入詳情頁
- 確認「QR Code」區塊顯示 QR 圖片（base64 PNG）
- 點「列印此工單」→ 確認瀏覽器開啟列印預覽，QR Code 可見
- 回到工單列表，勾選剛建立的工單 → 點「批次列印」
- 確認跳轉至 `/admin/print?ids=...`，顯示 QR Code 卡片

**8. 掃描閉環驗證**
- 開啟 `http://localhost:5173/setup`（若尚未綁定）→ 選部門 A 線 → 完成設定
- 進入 `/scan` → 輸入工單號（步驟 6 所建立的）→ 確認出現「入站確認」Modal
  - WorkOrderCard 顯示「FPC 測試板」、物料編號 FPC-TEST-001
  - 工序進度顯示第 1 站
- 點「確認入站」→ 成功畫面
- 再次輸入同工單號 → 確認出現「出站確認」Modal → 確認出站
- 回到管理後台工單詳情頁 → 確認站點歷程出現 check-in / check-out 紀錄
- 依序完成路由所有站點（或驗證自動補填邏輯）
- 末站出站後 → 確認工單狀態更新為「已完成」

**9. 管理員帳號 / 角色管理**
- 進入「角色管理」→ 新增角色（操作員）→ 確認儲存
- 進入「管理員帳號」→ 新增帳號（test_user / Test@1234，指定操作員角色）→ 確認儲存
- 點「停用」→ 確認帳號列表顯示為停用狀態
- 點「刪除」→ 確認帳號消失

**10. 登出**
- 點 sidebar 底部「登出」→ 確認跳回 `/admin/login`
- 重整頁面確認不會自動登入（cookie 已清除）
- 直接訪問 `http://localhost:5173/admin/work-orders` → 確認被重導至 `/admin/login`

#### Backend — 管理後台認證 API
- [x] `POST /api/admin/auth/login`（帳密登入，回傳 JWT access token + refresh token）
- [x] `POST /api/admin/auth/refresh`（用 refresh token 換新 access token）
- [x] `POST /api/admin/auth/logout`（廢棄 refresh token）
- [x] `GET /api/admin/auth/me`（取當前登入帳號資訊）
- [x] JWT auth middleware（驗 httpOnly cookie，掛在所有 `/api/admin/*` 路由）
- [x] `GET /api/admin/roles`（角色列表）
- [x] `POST /api/admin/roles`（新增角色）
- [x] `DELETE /api/admin/roles/:id`（刪除角色，需確認無人使用中）
- [x] `GET /api/admin/users`（管理員帳號列表）
- [x] `POST /api/admin/users`（新增管理員帳號，指定角色）
- [x] `PATCH /api/admin/users/:id`（修改角色 / 停用帳號）
- [x] `DELETE /api/admin/users/:id`

#### Backend — 補充 API（需掛 JWT middleware）
- [x] `POST/PATCH/DELETE /api/admin/groups`
- [x] `POST/PATCH/DELETE /api/admin/products`
- [x] `POST/PATCH/DELETE /api/admin/stations`
- [x] `GET/POST/PATCH/DELETE /api/admin/equipment`
- [x] `POST/PATCH/DELETE /api/admin/process-routes`
- [x] `GET/POST/PATCH/DELETE /api/admin/process-routes/:id/steps`
- [x] `POST /api/admin/work-orders`（自動產生 `WO-{DEPT}-{YEAR}-{SEQ}` 編號）
- [x] `PATCH /api/admin/work-orders/:id/status`
- [x] `GET /api/admin/work-orders/:id/qrcode`（回傳 QR PNG base64）
- [x] `GET /api/admin/work-orders/print?ids=...`（批次列印資料）
- [x] `GET /api/products?department_id=`（公開，供前端下拉選單用）
- [x] `GET /api/process-routes?department_id=`（公開）
- [x] `GET /api/process-routes/:id/steps`（公開）

#### Frontend — 管理後台（`/admin`）
- [x] 登入頁（`/admin/login`）：帳號 + 密碼表單，JWT 存入 httpOnly cookie（禁止 localStorage）
- [x] Auth context / hook（`useAdminAuth`）：管理登入狀態、自動 refresh token
- [x] Protected Route wrapper（未登入自動跳 `/admin/login`）
- [x] 角色管理頁（`/admin/roles`）：角色列表、新增角色（填名稱/描述）、刪除角色
- [x] 管理員帳號頁（`/admin/users`）：帳號列表、新增帳號（填帳號/密碼/角色）、停用/刪除
- [x] 組別管理頁（CRUD，含部門篩選）
- [x] 站點管理頁（含組別下拉）
- [x] 設備管理頁（含站點篩選）
- [x] 產品型號管理頁（CRUD）
- [x] 工序路由管理頁（步驟上下移動排序）
- [x] 工單列表頁（部門 + 狀態篩選）
- [x] 建立工單頁（Modal：選部門 → 產品 → 路由 → 數量、交期、優先級）
- [x] 工單詳情頁（站點歷程進度）
- [x] QR Code 預覽 + 單張列印
- [x] 批次列印頁（`/admin/print?ids=...`）

---

### 🔧 Bugfix / 改進（跨 Milestone）

#### P0 — 阻斷性修正
- [x] Nginx `proxy_pass` service name 錯誤（`app` → `backend`），修正 `nginx/nginx.conf`
- [x] JWT TTL 寫死 `8h`，改為讀取環境變數 `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`（`AuthService.ts` + `auth.ts`）

#### P1 — 規範/安全修正
- [x] CORS_ORIGIN `.env.dev` 修正為 `http://localhost:5173`（含 protocol + port）
- [x] Cookie `sameSite` 開發環境改為 `lax`，production 維持 `strict`
- [x] Frontend Dockerfile `npm install --legacy-peer-deps` → `npm ci`（符合安全規範）
- [x] 補建 `.env.dev.example`（development 範本，不含真實密碼）
- [x] Cookie `maxAge` 改為從環境變數動態計算（`parseTtlMs`），與 JWT TTL 一致

#### 系統設計改進（已完成）
- [x] 掃描並發控制：`ScanService.scan()` 整合為單一 transaction + `SELECT ... FOR UPDATE` 鎖定工單列
- [x] Idempotency Key：`POST /api/scan` 支援 `idempotencyKey` 參數，後端 in-memory cache 60 秒去重
- [x] 前端網路重試：掃描請求自動重試 2 次（僅限網路錯誤），搭配 idempotency key 確保安全
- [x] 新增 `NETWORK_ERROR` 中文錯誤訊息

#### Bug 修正 — 高優先
- [x] 工單狀態轉換無驗證：`PATCH /api/admin/work-orders/:id/status` 允許任意狀態轉換（如 completed→pending），需實作 state machine
- [x] 工序步驟跨部門指派：新增/修改步驟未驗證 station.department_id 與 route.department_id 一致

#### Bug 修正 — 中優先
- [ ] 刪除工序步驟觸發 FK 錯誤：`station_logs.step_id` 參照存在時 DELETE 回 500，改為先檢查或 soft-delete
- [ ] Admin 前端 raw fetch：`admin.ts` 多處用 `fetch()` 呼叫公開 API，未經統一錯誤處理
- [ ] 前端靜默吞錯：`WorkOrdersPage` 等頁面 `.catch(() => {})` 吞掉載入錯誤，使用者看到空白無提示
- [ ] 分頁缺 total count：工單列表 API 未回傳 `total` / `totalPages`，前端無法顯示完整分頁資訊
- [ ] 管理操作缺 audit log：管理後台 CRUD / 狀態變更未寫入 `audit_logs`（掃描側有，管理側沒有）

#### Bug 修正 — 低優先
- [ ] 批次列印 `Promise.all` 一筆失敗全部失敗，改用 `Promise.allSettled()`
- [ ] `process_steps.step_order` 缺唯一約束，同路由可有重複 step_order
- [ ] 前端刪除/建立按鈕無 loading 防連點

#### P2 — 待處理
- [ ] 拆單 API 路徑改到 `/api/admin/work-orders/:id/split`（需 JWT 認證）
- [ ] 登入端點 `POST /api/admin/auth/login` 加入 rate limiting（IP-based，建議 5 次/分鐘）
- [ ] CLAUDE.md devices schema 同步更新（補上 `department_id`、`station_id` nullable 變更）

#### P3 — 待處理
- [ ] 補 `ScanService` 單元測試（核心業務邏輯：check-in / check-out / 跳站補填 / 並發 / idempotency）
- [ ] 工單序號產生加入並發保護（`SELECT MAX(...) FOR UPDATE` 或 PostgreSQL sequence + retry）
- [ ] QR Code 內容加入簡易 HMAC 簽名防偽造
- [ ] DB 連線池 `max` 改為環境變數控制（`DB_POOL_MAX`，production 建議 20）
- [ ] Audit log 長期策略：Phase 2 啟用 PostgreSQL range partitioning by `created_at`（按月分區）

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
- [ ] PWA Service Worker（`vite-plugin-pwa`）：離線快取、背景同步、自動更新通知
- [ ] 設備綁定流程加入站點多選（`/setup`：選部門後顯示該部門所有站點，可勾選多個；`POST /api/devices/register` 送出 `stationIds[]`）
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
