# 產生 Commit 訊息

!git diff --cached

依照以下規則產生 commit 訊息：
- type 使用：feat、fix、refactor、chore、docs、style、test、perf
- Subject line 保持在 50 字元以內（中文）
- Body 使用**繁體中文**條列說明變更內容
輸出格式：
<type>(<scope>): <subject>

<body>
- 詢問使用者是否有問題
- git commit -m "<type>(<scope>): <subject>\n\n<body>"
