---
paths: ["**/*"]
alwaysApply: true
description: "安全性原則"
---

# 安全性原則

- 私鑰與 API Key 僅存於 `.env`，**絕對禁止** commit 到程式碼（`.env.example` 可 commit，但不得含真實值）
- 所有外部呼叫（DB、第三方 API）必須有 try/catch 與統一錯誤回傳格式
- `/api/admin/*` 路由必須掛 JWT auth middleware；掃描、看板、追溯路由不需認證
- JWT 使用 httpOnly cookie 儲存，禁止存入 localStorage（防 XSS）
- SQL 查詢一律透過 Drizzle ORM 參數化，禁止字串拼接 SQL
- 掃描 API 以 `device_id`（header）識別來源，禁止信任 client 傳入的 `department_id`

## npm 套件供應鏈安全

- **版本年齡**：只允許使用發佈超過 **7 天**的版本（防範 npm 套件投毒的黃金視窗）。選版時以 `npm view <pkg> time --json` 確認發佈時間；若最新版未滿 7 天，退回至上一個已滿 7 天的版本
- **精確版本號**：`package.json` 一律使用精確版本，**禁止** `^`、`~` 等模糊範圍符號（例如寫 `"express": "4.18.2"` 而非 `"^4.18.2"`）
- **鎖定檔不得有模糊版本**：`package-lock.json` 中每個套件的 `version` 欄位必須為精確版本，不得出現範圍符號
- **部署指令**：正式環境及 CI 一律使用 `npm ci`（嚴格依 `package-lock.json` 安裝，拒絕 lock 檔與 `package.json` 不一致的情況），**禁止**在部署流程中使用 `npm install`