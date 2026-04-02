# CLAUDE.md — WIP QR Code 追蹤系統（開發參考）

你現在是本專案的資深 **Node.js 後端工程師 + React 前端工程師**，負責電子組裝廠的漸進式 ERP 系統開發。
請嚴格遵守以下所有規則。

> 專案概述、Phase 規劃、部署架構、硬體建議 → 見 `README.md`
> 功能待辦清單 → 見 `.claude/tasks.md`

---

## 1. 建置與開發指令

```bash
# 後端
cd backend
npm run dev          # 開發模式（載入 .env，nodemon）
npm run build        # TypeScript 編譯
npm run start        # 生產模式
npm test             # Jest 單元測試
npm run migrate      # 執行 Drizzle 遷移
npm run migrate:gen  # 產生新遷移檔

# 前端
cd front
npm run dev          # Vite dev server
npm run build        # 生產打包
npm run preview      # 預覽打包結果

# Docker（根目錄）
docker-compose up -d          # 啟動所有服務
docker-compose up -d --build  # 重新 build 後啟動
docker-compose logs -f app    # 查看 backend log
```

---

## 2. 規則載入原則

- 所有 `.claude/rules/*.md` 會自動載入並生效
- 目前啟用的規則：
  - `naming.md` — 命名慣例（PascalCase service、camelCase module、禁止 `any`）
  - `security.md` — 安全性原則（`.env` 管理、外部呼叫必須有錯誤處理）
- 新增規則請放入 `.claude/rules/`，無需修改本檔案

---

## 3. 任務管理原則（重要！）

- 專案任務統一管理在 `.claude/tasks.md`
- 每次收到新任務或完成任務時，**必須**更新 `tasks.md`（勾選 `[x]` 或新增項目）
- 不要只在對話中說「已完成」，一定要實際修改 `tasks.md`

**收到任務時，請依序思考：**

1. **定位模組**：這個功能屬於 DB / Backend / Frontend / DevOps 哪一層？
2. **確認 Phase 範圍**：是 Phase 1 必做，還是預留欄位就夠？
3. **找資料來源**：Backend service 需要從哪幾張表查？是否需要 JOIN？
4. **防呆邏輯**：是否涉及跨部門、工單狀態、跳站、重複掃描等驗證？
5. **副作用**：操作是否需要寫 `audit_logs`？是否會改變 `work_orders.status`？
6. **產出修改**：確認符合命名規範、API 格式、TypeScript strict，再輸出程式碼。

---

## 4. 組織層級

```
部門 (Department)  →  組 (Group)  →  站點 (Station)
```
- 兩個部門（A 線 / B 線），資料透過 `department_id` 完全隔離，共用同一套系統
- 組：部門下的製程區域（SMT 組、插件組、測試組），用於看板分群
- 一個站點只屬於一個組（多對一）

---

## 5. 技術棧

| 層 | 選擇 |
|----|------|
| 前端 | Vite + React（純 SPA），PWA |
| QR 掃描 | html5-qrcode |
| 後端 | Node.js + Express + TypeScript（strict mode）|
| ORM | Drizzle ORM |
| 資料庫 | PostgreSQL 15 |
| 部署 | Docker Compose（Phase 1），GCP asia-east1 |
| 看板推送 | Phase 1 前端 polling 30s；Phase 2 升級 Socket.io |

---

## 6. 程式碼規範

### 目錄結構
```
/backend
  /src
    /api          — Express 路由（薄層，只做參數解析與回傳）
    /services     — 業務邏輯（PascalCase，如 ScanService.ts）
    /models       — Drizzle schema 定義
    /middleware   — 防呆驗證、錯誤處理
    /utils        — 純函式工具（camelCase，如 qrCode.ts、timeUtil.ts）
    /jobs         — 背景排程（node-cron）
  /tests
/front
  /src
    /pages        — 頁面元件（PascalCase）
    /components   — 共用元件（掃描器、看板卡片）
    /hooks        — 自訂 hooks（use 前綴）
    /api          — API 呼叫封裝
/migrations       — Drizzle 遷移檔
```

### 命名規範（見 `.claude/rules/naming.md`）
- Service / Class：`PascalCase.ts`（`ScanService.ts`, `WorkOrderService.ts`）
- 純函式模組 / utils：`camelCase.ts`（`qrCode.ts`, `timeUtil.ts`）
- DB 表名：`snake_case` 複數（`work_orders`, `station_logs`）
- API 路徑：`kebab-case`（`/api/work-orders/:id/check-in`）
- 常數：`UPPER_SNAKE_CASE`
- TypeScript：**strict mode，禁止 `any`**

### 時間處理
- DB 一律存 UTC（`TIMESTAMPTZ`）
- 前端依時區顯示（台灣 UTC+8）
- API 傳輸用 ISO 8601

### API 回傳格式
```typescript
{ success: boolean, data?: any, error?: { code: string, message: string } }
```

### 防呆錯誤碼
`WRONG_DEPARTMENT` / `SKIP_STATION` / `DUPLICATE_SCAN` / `ORDER_CLOSED` / `ORDER_ALREADY_SPLIT` / `SPLIT_QTY_MISMATCH`

### 安全性（見 `.claude/rules/security.md`）
- `.env` 管理所有敏感設定，禁止 commit
- 所有外部呼叫（DB、第三方 API）必須有 try/catch 與錯誤回傳

### Git 規範
- 分支：`main` → `develop` → `feature/*`
- Commit：`feat:` / `fix:` / `docs:` / `refactor:` / `test:`
- Tag：`v1.0`（Phase 1）/ `v2.0`（Phase 2）...

---

## Phase 1 範圍

### 必做
- 部門管理（department_id 隔離）
- 產品型號、工序路由、站點管理
- 工單管理（建單、QR Code、狀態追蹤）
- 拆單（急件抽出 / 分批出貨）
- 掃描報工（Check-in / Check-out），設備端識別
- 工序防呆（跳站自動補填、重複掃描提示）
- 看板（WIP 堆積、工單進度、母單匯總）
- 基礎追溯（工單級歷程）

### 不做但預留欄位
| 欄位 | 預留在哪 | 啟用於 |
|------|----------|--------|
| `operator_id` | `station_logs` | Phase 2 |
| `role` | `operators` | Phase 2 |
| `serial_number` | `station_logs` | Phase 2 |
| `parent_id`, `material_batch_ids` | `station_logs` | Phase 2 |
| `sales_order_id` | `work_orders` | Phase 3 |
| `bom_version`, `unit_cost`, `category` | `products` | Phase 2~3 |
| `calibration_due` | `equipment` | Phase 2 |
| `group_id` NOT NULL | `stations` | Phase 2（目前允許 NULL）|

---

## 資料庫 Schema（Phase 1）

### 核心表清單
```
departments    — 部門（兩條產線）
groups         — 組（製程區域）
products       — 產品型號
process_routes — 工序路由
process_steps  — 工序步驟
stations       — 工作站
equipment      — 設備（機台）
devices        — 掃描裝置（BYOD）
work_orders    — 工單
split_logs     — 拆單紀錄
station_logs   — 掃描報工（核心事實表）
defect_records — 不良品紀錄
audit_logs     — 不可變操作日誌
```

### departments
```sql
departments (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  VARCHAR(100) NOT NULL,
  code  VARCHAR(10) NOT NULL UNIQUE,  -- 'A', 'B'，用於工單編號前綴
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### groups
```sql
groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20),
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (department_id, name),
  UNIQUE (department_id, code)
);
CREATE INDEX idx_groups_dept ON groups(department_id);
```

### products
```sql
products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  name          VARCHAR(200) NOT NULL,
  model_number  VARCHAR(50) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  bom_version   VARCHAR(20),           -- Phase 2
  unit_cost     NUMERIC(12,2),         -- Phase 3
  category      VARCHAR(50),           -- Phase 3
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (department_id, model_number)
);
CREATE INDEX idx_products_dept ON products(department_id);
```

### process_routes
```sql
process_routes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  version       INTEGER DEFAULT 1,  -- 同料號可有多版本路由
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (department_id, name, version)
);
CREATE INDEX idx_routes_dept ON process_routes(department_id);
```

### process_steps
```sql
process_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES process_routes(id),
  station_id     UUID NOT NULL REFERENCES stations(id),
  step_order     INTEGER NOT NULL,
  is_optional    BOOLEAN DEFAULT FALSE,  -- Phase 1 不使用（固定線性）
  condition_expr JSONB,                  -- Phase 2+ 條件分支
  standard_time  INTEGER,               -- 標準工時（秒）
  next_step_id   UUID,
  rework_step_id UUID,                  -- Phase 2+ 返修迴路
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### stations
```sql
stations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  group_id      UUID REFERENCES groups(id),  -- Phase 1: NULL 允許；Phase 2: NOT NULL
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20),
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (department_id, name),
  UNIQUE (department_id, code)
);
CREATE INDEX idx_stations_dept ON stations(department_id);
CREATE INDEX idx_stations_group ON stations(group_id);
```

### equipment
```sql
equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      UUID NOT NULL REFERENCES stations(id),
  name            VARCHAR(100) NOT NULL,
  model           VARCHAR(100),
  serial_number   VARCHAR(100),
  is_active       BOOLEAN DEFAULT TRUE,
  calibration_due DATE,  -- Phase 2
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_equipment_station ON equipment(station_id);
```

### devices（BYOD 方案）
```sql
devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id     UUID NOT NULL REFERENCES stations(id),
  name           VARCHAR(100),          -- 員工自填暱稱（選填）
  device_type    VARCHAR(20) NOT NULL,  -- tablet / phone / scanner
  user_agent     TEXT,
  screen_info    JSONB,                 -- {"width":1920,"height":1080,"colorDepth":24}
  timezone       VARCHAR(50),
  webgl_renderer VARCHAR(200),
  ip_address     INET,
  employee_id    VARCHAR(50),           -- 選填工號
  is_active      BOOLEAN DEFAULT TRUE,
  last_seen_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_devices_station ON devices(station_id);
```

**BYOD 首次使用流程：**
1. PWA 開啟 → 檢查 localStorage 有無 `device_id`
2. 無 → 自動產生 UUID，採集 fingerprint，引導員工選擇站點（選填工號）→ 後端建立 devices 紀錄
3. 有 → 自動帶入，無需操作
4. 換裝置 → localStorage 消失 → 重走步驟 2，無需管理員介入

### work_orders
```sql
work_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id        UUID NOT NULL REFERENCES departments(id),
  order_number         VARCHAR(50) NOT NULL UNIQUE,
  -- 編號規則：WO-A-2026-001（母單）/ WO-A-2026-001-A（子單）/ WO-A-2026-001-A1（子子單）
  product_id           UUID NOT NULL REFERENCES products(id),
  route_id             UUID NOT NULL REFERENCES process_routes(id),
  planned_qty          INTEGER NOT NULL,
  status               VARCHAR(20) NOT NULL,
  -- pending / in_progress / completed / cancelled / split
  priority             VARCHAR(10) DEFAULT 'normal',  -- normal / urgent
  due_date             DATE,
  parent_work_order_id UUID REFERENCES work_orders(id),  -- NULL = 母單或獨立單
  split_reason         VARCHAR(20),  -- rush / batch_shipment
  is_split             BOOLEAN DEFAULT FALSE,
  sales_order_id       UUID,         -- Phase 3
  scheduled_start      TIMESTAMPTZ,  -- Phase 3
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_positive_qty CHECK (planned_qty > 0)
);
CREATE INDEX idx_work_orders_parent ON work_orders(parent_work_order_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_dept ON work_orders(department_id);
```

### split_logs
```sql
split_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_work_order_id UUID NOT NULL REFERENCES work_orders(id),
  child_work_order_ids UUID[] NOT NULL,
  split_reason         VARCHAR(20) NOT NULL,  -- rush / batch_shipment
  split_note           TEXT,
  qty_before_split     INTEGER NOT NULL,
  qty_distribution     JSONB NOT NULL,  -- {"WO-...-A": 200, "WO-...-B": 800}
  device_id            UUID REFERENCES devices(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
```

### station_logs（核心事實表）
```sql
station_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id      UUID NOT NULL REFERENCES work_orders(id),
  station_id         UUID NOT NULL REFERENCES stations(id),
  equipment_id       UUID REFERENCES equipment(id),
  device_id          UUID NOT NULL REFERENCES devices(id),
  operator_id        UUID,           -- Phase 1 NULL；Phase 2 啟用
  step_id            UUID NOT NULL REFERENCES process_steps(id),
  check_in_time      TIMESTAMPTZ NOT NULL,
  check_out_time     TIMESTAMPTZ,   -- 進站時 NULL
  actual_qty_in      INTEGER,
  actual_qty_out     INTEGER,       -- = actual_qty_in - defect_qty
  defect_qty         INTEGER DEFAULT 0,
  status             VARCHAR(20) NOT NULL,
  -- in_progress / completed / abnormal / auto_filled
  machine_params     JSONB,
  serial_number      VARCHAR(100),  -- Phase 2
  parent_log_id      UUID,          -- Phase 2
  material_batch_ids JSONB,         -- Phase 2
  previous_log_id    UUID,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (work_order_id, station_id, check_in_time)
);
CREATE INDEX idx_station_logs_wo ON station_logs(work_order_id);
CREATE INDEX idx_station_logs_station ON station_logs(station_id);
CREATE INDEX idx_station_logs_time ON station_logs(check_in_time);
CREATE INDEX idx_station_logs_device ON station_logs(device_id);
```

**數量規則：**
```
actual_qty_in  = 前站 actual_qty_out（首站 = planned_qty）
actual_qty_out = actual_qty_in - defect_qty
Phase 1：數量選填，預設整批（actual_qty_in = planned_qty，defect_qty = 0）
```

### defect_records
```sql
defect_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_log_id UUID NOT NULL REFERENCES station_logs(id),
  defect_type    VARCHAR(50) NOT NULL,
  defect_name    VARCHAR(200) NOT NULL,
  qty            INTEGER NOT NULL DEFAULT 1,
  severity       VARCHAR(10) DEFAULT 'minor',  -- minor / major / critical
  disposition    VARCHAR(20),  -- rework / scrap / accept
  note           TEXT,
  image_url      VARCHAR(500),  -- Phase 2
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_defects_log ON defect_records(station_log_id);
```

### audit_logs（不可變，只 INSERT）
```sql
audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id   UUID NOT NULL,
  action      VARCHAR(20) NOT NULL,
  -- create / update / delete / check_in / check_out / split / time_correction
  changes     JSONB,    -- {"field": {"old": "...", "new": "..."}}
  device_id   UUID REFERENCES devices(id),
  operator_id UUID,     -- Phase 2
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at);
```

### Phase 2 遷移：stations.group_id NOT NULL
```sql
-- 執行前確認所有活躍站點已指定組別
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stations WHERE group_id IS NULL AND is_active = TRUE) THEN
    RAISE EXCEPTION '仍有活躍站點未指定組別';
  END IF;
END $$;
ALTER TABLE stations ALTER COLUMN group_id SET NOT NULL;
```

---

## 掃描報工流程（Phase 1）

### 主流程
```
員工掃描工單 QR Code
  → 部門歸屬檢查（device 所屬部門 = 工單部門？）
      └─ 否 → 拒絕「此工單不屬於本產線」
  → 工單狀態檢查（非 cancelled / completed / split）
      └─ split → 「此工單已拆分，請掃描子單」
  → 依當前狀態自動判斷：
      ├─ 無進行中 check-in → 執行 Check-in
      └─ 有進行中 check-in → 執行 Check-out
  → 一鍵操作，數量預設整批，無需輸入
```

### 跳站處理
偵測到跳站（前置站未完成）時，**自動補填**缺漏站點：
- `check_in` = 最近一筆已完成站點的 `check_out` 時間
- `check_out` = 當下時間
- `qty` = `planned_qty`（最大值）
- `status` = `auto_filled`

### 其他防呆規則
| 情況 | 處理 |
|------|------|
| 30 秒內重複掃描同工單同站 | 顯示提示訊息 |
| 已 check-in 未 check-out，再次掃描 | 視為 check-out |

### 時間補正
員工可開選單補正過往時間（漏掃描情況），須在備注欄記錄變更前後差異，寫入 `audit_logs`（action = `time_correction`）。

---

## 拆單功能（Phase 1）

### 規則
- 子單數量總和 = 母單 `planned_qty`（應用層驗證）
- 每張子單取得獨立 QR Code
- 母單狀態設為 `split`，QR Code **立即失效**
- 子單繼承產品型號與路由（可覆寫 `priority` / `due_date`）
- 母單的 `station_logs` 保留在母單，不搬移
- **子單起始工序**：取母單最新一筆 `station_log`（in 或 out 皆可）所在站點，子單從該站重新 check-in 開始
- 允許母單有進行中 check-in 時拆單；當前站 log 保留在母單，`status` 設為 `abnormal`
- 拆單不可逆，但子單可再次拆單（多層級）

### 操作流程
```
管理介面 → 選擇母單 → 拆單
  → 選原因（rush / batch_shipment）
  → 輸入各子單數量、交期、優先級
  → 系統驗證數量總和
  → 確認 → 建立子單 + 新 QR Code + 母單改 split + 寫 split_logs
```

### 編號規則
```
母單：WO-A-2026-001
子單：WO-A-2026-001-A / -B / -C
子子單：WO-A-2026-001-A1 / -A2
```

---

## 工序路由（Phase 1）

Phase 1 為**固定線性**：無可選站、無條件分支、無返修迴路。
- 返修另開新工單
- `is_optional`、`condition_expr`、`rework_step_id` 欄位預留但不使用

---

## 資料隔離原則

- `departments` 為根節點
- `groups` / `products` / `process_routes` / `stations` / `work_orders` 各帶 `department_id`
- `station_logs` 不需自帶 `department_id`，透過 `work_order_id → work_orders.department_id` 關聯
- 所有列表 API 預設加 `WHERE department_id = ?`
- `device → station → group → department` 鏈條推導

---

## 看板

- **母單進度**：以組別 + 站數為基準（例：SMT 組 3/3 → 插件組 1/2）
- **WIP 定義**（UI 可切換）：
  - 站內 WIP = 已 check-in 未 check-out 的工單數
  - 待入站 WIP = 前站已完成、尚未到達此站的工單數

---

## 關鍵設計決策（速查）

| 決策 | 選擇 |
|------|------|
| Phase 1 工序路由 | 固定線性，返修另開新單 |
| Check-in/out 判斷 | 掃描自動切換；提供補正選單 |
| Phase 1 數量 | 選填，預設整批，不強制不良率 |
| 跳站 | 自動補填（status=auto_filled） |
| 重複掃描 | 顯示提示（非靜默） |
| 已 check-in 再掃 | 視為 check-out |
| 設備識別 | BYOD，localStorage UUID + fingerprint |
| 換裝置 | 重新選站點，自動建立新 device_id |
| 拆單允許時機 | 有進行中 check-in 也可拆 |
| 子單起始站 | 母單最新一筆 log 的站點 |
| 母單 QR Code | 拆單後立即失效 |
| 路由版本 | 料號變更對應新路由，支援多版本 |
| 操作員辨識 | Phase 1 不做，只記設備端 |
| 登入認證 | Phase 1 不做 |
| RBAC | Phase 1 不做，預留欄位 |
| DB 部署 | Phase 1 同 VM，Phase 2 遷 Cloud SQL |
| 離線模式 | 不做，信任 Wi-Fi |
