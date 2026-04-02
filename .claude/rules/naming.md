---
paths: ["**/*"]
alwaysApply: true
description: "命名慣例"
---

# 命名慣例

- Class / Service：`PascalCase.ts`（例如 `ScanService.ts`、`WorkOrderService.ts`）
- 純函式模組 / utils：`camelCase.ts`（例如 `qrCode.ts`、`timeUtil.ts`）
- 常數：`UPPER_SNAKE_CASE`
- TypeScript：strict mode，**禁止 `any`**