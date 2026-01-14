# Code Style Guide

> 更新日期：2025-01-10 | 專案：Cloudflare WordPress Accelerator

---

## 1. TypeScript / JavaScript

- **Framework**: SvelteKit Standard
- **Indentation**: 4 spaces or Tab (consistent with project)
- **Quotes**: Single quotes `'` preferred
- **Semicolons**: Always use semicolons `;`

### Naming Conventions
- **Variables**: `camelCase` (e.g., `userProfile`)
- **Functions**: `camelCase` (e.g., `fetchData`)
- **Classes**: `PascalCase` (e.g., `UserHandler`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)

---

## 2. SQL (D1)

- **Keywords**: UPPERCASE (e.g., `SELECT`, `FROM`)
- **Table Names**: `snake_case` (e.g., `sync_products`)
- **Column Names**: `snake_case` (e.g., `seo_title`)

---

## 3. Migration Guidelines (Python to TypeScript)

當從 `web/Marketing Automation` (Python) 移植代碼時，請遵循以下規則：

### 3.1 命名轉換
- Python `snake_case` 變數應轉換為 TypeScript `camelCase`。
  - 例子：`seo_score` (Python) -> `seoScore` (TS)
  - 例子：`generate_report()` (Python) -> `generateReport()` (TS)

### 3.2 類型定義
- 必須為所有移植的數據結構定義 TypeScript Interface。
- 避免使用 `any`。

### 3.3 異步處理
- Python 的同步阻塞操作 (Blocking I/O) 必須轉換為 TypeScript 的 `async/await` 非阻塞操作。