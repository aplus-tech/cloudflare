# API Specification

> 更新日期：2025-01-10 | 專案：Cloudflare WordPress Accelerator

---

## 概覽

本文件定義所有 Cloudflare Workers 和 SvelteKit API 端點的規範。

---

## 1. Sync API (Phase 4)

### 1.1 同步數據
- **Endpoint**: `POST /api/sync`
- **Auth**: `X-Secret-Key` Header
- **Description**: 接收 WordPress Webhook，同步數據到 D1 和 R2。

**Request Body:**
```json
{
  "type": "product",
  "id": 123,
  "title": "Coffee Beans",
  "payload": { ... }
}
```

---

## 2. Purge API (Phase 4)

### 2.1 清除緩存
- **Endpoint**: `POST /api/purge`
- **Auth**: `X-Secret-Key` Header
- **Description**: 清除指定 URL 的 KV 緩存。

---

## 3. Invoice API (Phase 5 - Planned)

> 此模組將在 `web/Svelte` 項目中實現。

### 3.1 生成 Invoice
- **Endpoint**: `POST /api/invoice/generate`
- **Description**: 根據訂單生成 Invoice PDF 並存儲到 R2。

### 3.2 生成 Quotation
- **Endpoint**: `POST /api/quotation/generate`
- **Description**: 生成報價單 PDF。

---

## 4. AI SEO API (Phase 6 - Planned)

> 此模組將從 `WordPress_Maintenance/WP_Content_System` (Python) 移植到 Cloudflare Workers。
> 參考 `web/Search_Console_Auto` 實現 GSC 連結登記功能。

### 4.1 分析文章
- **Endpoint**: `POST /api/seo/analyze`
- **Description**: 調用 Claude API 分析文章並生成 SEO 建議。

### 4.2 關鍵字聚類
- **Endpoint**: `POST /api/seo/cluster`
- **Description**: 執行關鍵字聚類算法。