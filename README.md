# WIP QR Code 追蹤系統（漸進式自建 ERP）

## 專案概述

以 QR Code 為核心的 WIP（Work In Progress）追蹤系統，服務對象為**電子組裝產線**，涵蓋**兩個獨立部門（兩條獨立產線）**，各有 10 站以上工序，從零開始建立數位追蹤能力。系統設計為漸進式架構，Phase 1 從 WIP 追蹤起步，最終演進為完整的輕量製造業 ERP。

### 組織層級
```
部門 (Department)  →  組 (Group)  →  站點 (Station)
  例：A 線              SMT 組         印刷機、貼片機、迴焊爐
                        插件組         插件站、波焊爐
                        測試組         ICT、FCT
```

## 產業背景

- **產業類型**：電子組裝（SMT、插件、波焊、測試、包裝）
- **部門結構**：兩個獨立部門，不同產品、工序完全無交集，透過 `department_id` 做資料隔離
- **產線規模**：每條產線各 10+ 道工序站點
- **現有追蹤方式**：完全沒有（從零開始）
- **追溯粒度**：Phase 1 工單（批次）級，Phase 2 升級序號級

## 技術棧

| 層 | 選擇 | 原因 |
|----|------|------|
| 前端 | Vite + React（純 SPA），PWA | 工廠內部系統不需 SSR/SEO；Vite 建構快 |
| QR 掃描 | html5-qrcode | API 簡單開箱即用、多引擎擇優 |
| 後端 | Node.js + Express + TypeScript | — |
| ORM | Drizzle ORM | 型別安全、SQL 風格直覺、原生支援 JSONB/CTE/UUID |
| 資料庫 | PostgreSQL 15 | JSONB、TIMESTAMPTZ、UUID 原生支援 |
| 看板推送 | Phase 1 polling 30s；Phase 2 Socket.io | 先求穩，Phase 2 再升即時 |

## 部署架構

### Phase 1 — VM + Docker Compose（月費約 NT$1,500~3,000）

```
現場平板 ──Wi-Fi──▶  單台 VM (e2-small)
                     docker-compose
                     ├─ app   (Node.js + Express)
                     ├─ nginx (反向代理 + SSL)
                     └─ db    (PostgreSQL 15)
                              │ 每日 pg_dump
                              ▼
                     Cloud Storage（備份桶）
```

| 服務 | GCP 建議 | AWS | Azure |
|------|----------|-----|-------|
| VM | Compute Engine e2-small | EC2 t3.small | B2s VM |
| 備份 | Cloud Storage Standard | S3 | Blob Storage |
| SSL | Let's Encrypt | Route 53 | Azure DNS |

**為什麼不用 Cloud SQL：** Phase 1 用量極小，Managed DB 最低 ~NT$3,000/月不划算。Phase 2 資料量成長後再遷移。

### Phase 2 — DB 遷移 Cloud SQL + Redis（月費約 NT$4,000~8,000）

```
VM (e2-medium)              Cloud SQL
docker-compose          →   PostgreSQL 15
├─ app                      db-f1-micro
├─ nginx
└─ redis (快取)
```

新增：Cloud SQL 自動備份 + PITR、GitHub Actions 自動部署、WebSocket 即時推送、Rate limiting。

### Phase 3 — Cloud Run + 前後端分離（月費約 NT$6,000~12,000）

```
Cloud Storage (React SPA)    Cloud Run (API)
       + CDN             →   min 0, max 3
                              ├─ Cloud SQL (db-g1-small)
                              ├─ Memorystore Redis (M1)
                              └─ Cloud Storage (備份+附件)
```

因 Phase 1 已容器化，image 直推 Cloud Run，零改動。

### Phase 4 — 企業級（月費 NT$15,000~30,000+）

GKE Autopilot + Cloud SQL HA + Memorystore Standard + Cloud Pub/Sub（IoT）+ BigQuery（BI）

---

### 跨 Phase 通用建議

| 項目 | 建議 |
|------|------|
| 容器化 | Phase 1 即採用 Docker Compose，確保 dev/prod 一致 |
| 區域 | asia-east1（彰化），延遲 < 10ms |
| 環境 | dev（本地）/ prod（雲端），Phase 2 加 staging |
| 機密管理 | Phase 1~2 用 .env；Phase 3+ 用 Secret Manager |
| 備份 | 每日自動備份 + 7 天保留 |
| 域名 | 建議正式域名，如 `wip.yourfactory.com` |

## Phase 規劃

### Phase 1 — WIP 核心（4~6 週, 1~2 人）
> 讓每張工單在每一站留下數位足跡

詳見 `.claude/tasks.md`

### Phase 2 — WIP 進階 + 庫存基礎（6~8 週, 2~3 人）
> 串起 BOM 與庫存，形成進銷存的「存」

- **統一身份認證（Authentik + Google SSO）**：部署自建 IdP，員工用 Google 帳號登入所有內部服務（WIP、Email、共享硬碟），WIP /admin 從 Phase 1 的本地 JWT 遷移至 OIDC
- 操作員登入（掃描側啟用，工號綁定 Google 帳號）
- BOM 管理（多階 BOM、替代料、版本控管）
- 倉庫 / 庫存管理（三倉、儲位、安全庫存）
- 自動扣料 / 入庫
- 序號級追溯
- 異常通報（LINE/Email 分級推播）
- RBAC 權限管理
- **日報 / 月報**：每日產出、不良率、各站工時；月度稼動率、交工率、趨勢圖，支援 PDF / CSV 輸出

### Phase 3 — 進銷存完整化（8~10 週, 2~3 人）
> 串起「進」和「銷」，形成完整進銷存 + 生產管理

- 採購管理（供應商、請購→採購→到貨→驗收）
- 銷售訂單（報價→訂單→出貨→對帳，訂單自動轉工單）
- 生產排程（依交期 + 產能 + 物料齊套）
- SPC 品質管制（管制圖、Cpk）
- 成本計算
- 報表 / BI

### Phase 4 — 企業級擴展（持續迭代）
- 應收 / 應付帳款
- 設備 IoT 連線（迴焊爐溫度曲線、AOI 結果匯入）
- 多廠區 / 多倉調撥
- 客戶入口網站

## QR Code 規範

**Phase 1：** `https://{domain}/wo/{work_order_id}`（明碼 UUID，內網可接受）

**Phase 2+：** `https://{domain}/scan?token={HMAC-SHA256 signed token}`

**標籤規格：**
- 糾錯級別：Q（容忍 25% 損毀）
- 材質：熱轉印標籤（不用熱感應紙）
- 邊框顏色：急件紅 / 一般件綠
- 部門識別：印部門代碼（A 線 / B 線），建議不同底色色帶
- 尺寸：至少 25mm × 25mm

## 異常通報設計（Phase 2）

| 類型 | 觸發條件（預設，可依站點調整）|
|------|------|
| 時間異常 | 超過標準工時 1.2 倍未出站 |
| 品質異常 | 單次不良率 > 5% 或連續 3 批相同缺陷 |
| 工序異常 | 跳站掃描、未授權操作（固定邏輯）|

| 等級 | 觸發 | 管道 | 對象 |
|------|------|------|------|
| L1 提示 | 即將逾期（剩 10%）| 看板閃爍 | 作業員 |
| L2 警告 | 逾期、單次不良 | LINE / Email | 領班、組長 |
| L3 緊急 | 連續品質異常 | LINE + 強制彈窗 | 廠長、品管 |

閉環：異常須管理員確認 → 記錄原因 + 處置 → 15 分鐘未處理自動升級。

## 追溯設計

**Phase 1（工單級）：** 工單號 → 完整站點歷程、時間、掃描設備

**Phase 2（序號級）：**
- 正向：某批原料有問題 → 找出所有相關工單
- 逆向：客戶回報故障 → 追溯人機料法環
- 父子件關聯：組裝站掃主件再掃子件
- 人員追溯：Phase 2 啟用後新紀錄記 operator_id，Phase 1 歷史無法回補

## 硬體建議

- **平板**：Android 8~10 吋，兩條產線各自配備，不跨線共用
- **固定式掃描器**：Phase 2+，用於傳送帶工位
- **標籤印表機**：熱轉印機（如 Zebra ZD421）× 1 台，備兩種色帶
- **網路**：確保 Wi-Fi 覆蓋完整；Phase 1 信任 Wi-Fi，掃描失敗由員工重試

## 3 年 TCO 估算

| 方案 | 項目 | 估算 |
|------|------|------|
| 自建 | Phase 1~3 開發（2~3 人 × 6~8 月）| NT$150~300 萬 |
| 自建 | 硬體（平板、條碼機、伺服器）| NT$20~50 萬 |
| 自建 | 3 年維護（1 人 part-time）| NT$50~100 萬 |
| **自建合計** | | **NT$220~450 萬** |
| 外購 | 中階 MES + 輕量 ERP（月費 × 36 月）| NT$180~540 萬 |
| 外購 | 導入 / 客製 / 教育訓練 | NT$30~100 萬 |
| **外購合計** | | **NT$210~640 萬** |

## 注意事項

1. **每個 Phase 結束後必須有 4~6 週的穩定觀察期**，確認數據正確、現場適應後再開下一階段
2. **Phase 1 不記錄操作員是有意的取捨**：只能追到「哪台設備做的」。如果客戶稽核要求人員追溯，需 Phase 2 補上，歷史資料無法回補
3. **Phase 2 的 BOM + 庫存是整個 ERP 的心臟**，多階 BOM 和替代料邏輯複雜，要給足夠時間
4. **自建最大風險是人員流動**，從第一天就做好文件和程式碼規範
5. **Phase 1 schema 決定整條路能不能走通**，預留欄位比事後重構便宜 100 倍
6. **先跑 2~3 條產線驗證**，不要一次全廠推行
7. **新部門上線順序**：先讓一個部門跑穩（4~6 週），再上第二個部門
8. **兩條產線用同一套系統**，靠 department_id 隔離，不要建獨立實例
