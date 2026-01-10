# API 規範

> Base URL: `https://cloudflare-9qe.pages.dev` | 更新日期：2025-01-10

---

## 概覽

呢個系統提供 3 個主要 API 端點：
1. `/api/sync` - WordPress 數據同步
2. `/api/purge` - 清除單個頁面緩存
3. `/api/purge-all` - 清除所有緩存

所有 API 都需要 **Secret Key 驗證**。

---

## 認證方式

所有 API 都用 **Header 認證**：

```http
X-Secret-Key: your-secret-key
```

或者用 **URL 參數**（僅 `/api/purge-all`）：

```http
GET /api/purge-all?secret=your-secret-key
```

**Secret Key 位置：**
- `SYNC_SECRET_KEY`：用於 `/api/sync`
- `PURGE_SECRET`：用於 `/api/purge` 和 `/api/purge-all`

⚠️ **安全提示**：Secret Key 應該用 `wrangler secret put` 設定，唔好寫死喺代碼入面。

---

## API 端點

### 1. POST /api/sync

**用途**：同步 WordPress 數據到 Cloudflare D1，並上傳圖片到 R2。

**認證**：
```http
X-Secret-Key: <SYNC_SECRET_KEY>
```

**請求 Body**：
```json
{
  "type": "product",  // 或 "post", "page"
  "payload": {
    "id": 123,
    "sku": "PROD-001",
    "title": "Coffee Beans Premium",
    "content": "<p>Product description...</p>",
    "price": 199.99,
    "stock_status": "instock",
    "categories": ["Coffee", "Beverages"],
    "tags": ["organic", "premium"],
    "brand": "Brand Name",
    "seo_title": "Best Coffee Beans 2024",
    "seo_description": "Premium coffee beans...",
    "seo_keywords": "coffee, beans, organic",
    "image_url": "https://origin.aplus-tech.com.hk/wp-content/uploads/2024/coffee-main.jpg",
    "gallery_images": [
      "https://origin.aplus-tech.com.hk/wp-content/uploads/2024/coffee-1.jpg",
      "https://origin.aplus-tech.com.hk/wp-content/uploads/2024/coffee-2.jpg"
    ],
    "attributes": {
      "color": "Brown",
      "weight": "500g"
    },
    "term_ids": [10, 20, 30]
  }
}
```

**回應（成功）**：
```json
{
  "success": true,
  "image_r2_path": "products/brand-name/coffee-main.jpg",
  "gallery_r2_paths": [
    "products/brand-name/coffee-1.jpg",
    "products/brand-name/coffee-2.jpg"
  ]
}
```

**回應（失敗）**：
```json
{
  "error": "Unauthorized"
}
```

**狀態碼**：
- `200` - 同步成功
- `401` - Secret Key 錯誤
- `400` - 請求格式錯誤
- `500` - 伺服器錯誤

**功能**：
1. 驗證 Secret Key
2. 根據 `type` 決定同步到邊個表（`sync_products`, `sync_posts`, `sync_pages`）
3. 上傳主圖片到 R2（語義化路徑：`products/{brand}/{filename}`）
4. 上傳相簿圖片到 R2（並行上傳，提升速度）
5. 記錄圖片對應關係到 D1 `media_mapping` 表
6. 返回 R2 路徑俾 WordPress 插件寫入 `post_meta`

**檔案位置**：[api/sync/+server.ts](../cloudflare-wordpress/src/routes/api/sync/+server.ts)

---

### 2. POST /api/purge

**用途**：清除單個頁面嘅 KV 緩存。

**認證**：
```http
Content-Type: application/json
```

**請求 Body**：
```json
{
  "url": "https://aplus-tech.com.hk/product/coffee-beans",
  "secret": "<PURGE_SECRET>"
}
```

**回應（成功）**：
```json
{
  "success": true,
  "purged": "html:/product/coffee-beans"
}
```

**回應（失敗）**：
```json
{
  "error": "Unauthorized"
}
```

**狀態碼**：
- `200` - 清除成功
- `401` - Secret 錯誤
- `400` - 缺少 URL
- `500` - 伺服器錯誤

**功能**：
1. 驗證 `secret` 參數
2. 從 URL 提取路徑
3. 構造 KV Key：`html:{pathname}{search}`
4. 從 `HTML_CACHE` KV Namespace 刪除對應 Key
5. 記錄清除日誌

**使用場景**：
- WordPress 文章/產品更新後自動清除緩存
- 手動清除特定頁面緩存

**檔案位置**：[api/purge/+server.ts](../cloudflare-wordpress/src/routes/api/purge/+server.ts)

---

### 3. GET /api/purge-all

**用途**：清除所有 KV 緩存（慎用！）。

**認證**：
```http
GET /api/purge-all?secret=<SYNC_SECRET_KEY>
```

**回應（成功）**：
```json
{
  "success": true,
  "message": "Successfully deleted 1234 items from cache.",
  "status": "Cache Cleared"
}
```

**回應（失敗）**：
```json
{
  "error": "Unauthorized"
}
```

**狀態碼**：
- `200` - 清除成功
- `401` - Secret 錯誤
- `500` - KV Namespace 唔存在 / 伺服器錯誤

**功能**：
1. 驗證 URL 參數 `secret`
2. 列出 `HTML_CACHE` KV Namespace 所有 Key
3. 批量刪除所有 Key（用 `Promise.all` 並行刪除）
4. 返回刪除數量

**使用場景**：
- 大規模內容更新後重置緩存
- 緊急情況下清除所有緩存
- 測試時重置緩存狀態

⚠️ **注意**：呢個操作會清除所有頁面緩存，導致短期內 TTFB 上升。

**檔案位置**：[api/purge-all/+server.ts](../cloudflare-wordpress/src/routes/api/purge-all/+server.ts)

---

## WordPress 插件整合

### wp-d1-sync.php

**觸發時機**：
- `save_post` - 文章/產品儲存時
- `woocommerce_update_product` - WooCommerce 產品更新時

**流程**：
```php
// 1. 收集產品數據
$data = [
    'type' => 'product',
    'payload' => [
        'id' => $post_id,
        'title' => get_the_title($post_id),
        'price' => get_post_meta($post_id, '_price', true),
        'brand' => wp_get_post_terms($post_id, 'product_brand')[0]->name,
        'image_url' => wp_get_attachment_url(get_post_thumbnail_id($post_id)),
        // ... 其他欄位
    ]
];

// 2. POST 到 Cloudflare Worker
wp_remote_post('https://cloudflare-9qe.pages.dev/api/sync', [
    'headers' => [
        'Content-Type' => 'application/json',
        'X-Secret-Key' => 'your-secret-key'
    ],
    'body' => json_encode($data)
]);

// 3. 接收 R2 路徑並儲存到 post_meta
$response = json_decode($body, true);
if ($response['success']) {
    update_post_meta($post_id, '_cloudflare_r2_url', $response['image_r2_path']);
}
```

**檔案位置**：[Wordpress Plugin/wp-d1-sync.php](../Wordpress%20Plugin/wp-d1-sync.php)

---

### wp-cache-purge.php

**觸發時機**：
- `save_post` - 文章/產品儲存後

**流程**：
```php
// 1. 取得文章 URL
$post_url = get_permalink($post_id);

// 2. POST 到 Cloudflare Worker
wp_remote_post('https://cloudflare-9qe.pages.dev/api/purge', [
    'headers' => ['Content-Type' => 'application/json'],
    'body' => json_encode([
        'url' => $post_url,
        'secret' => 'your-purge-secret'
    ])
]);
```

**檔案位置**：[Wordpress Plugin/wp-cache-purge.php](../Wordpress%20Plugin/wp-cache-purge.php)

---

## 錯誤處理

### 常見錯誤

| 錯誤碼 | 錯誤訊息 | 原因 | 解決方法 |
|--------|---------|------|---------|
| `401` | `Unauthorized` | Secret Key 錯誤 | 檢查 `wrangler.toml` 或 `wrangler secret` 設定 |
| `400` | `URL is required` | 缺少必要參數 | 檢查請求 Body |
| `500` | `KV Namespace not found` | KV 綁定配置錯誤 | 檢查 `wrangler.toml` 的 `kv_namespaces` |
| `500` | `DB not found` | D1 綁定配置錯誤 | 檢查 `wrangler.toml` 的 `d1_databases` |

### 除錯技巧

1. **檢查 Worker 日誌**：
   ```bash
   wrangler pages deployment tail --project-name=cloudflare-9qe
   ```

2. **測試 API**：
   ```bash
   curl -X POST https://cloudflare-9qe.pages.dev/api/sync \
     -H "Content-Type: application/json" \
     -H "X-Secret-Key: your-secret" \
     -d '{"type":"product","payload":{...}}'
   ```

3. **檢查 D1 數據**：
   ```bash
   wrangler d1 execute wordpress-cloudflare \
     --command="SELECT * FROM sync_products LIMIT 5"
   ```

---

## 效能優化建議

### 1. 圖片上傳優化
- ✅ 已實現：並行上傳相簿圖片（`Promise.all`）
- ⏳ 待實現：加入重試機制（Exponential Backoff）

### 2. 緩存查詢優化
- ⏳ 待實現：`media_mapping` 表查詢加 KV Cache

### 3. 錯誤處理優化
- ⏳ 待實現：圖片上傳失敗時重試 3 次

---

## 版本歷史

### v1.0（當前版本）
- ✅ POST `/api/sync` - WordPress → D1 同步
- ✅ POST `/api/purge` - 清除單頁緩存
- ✅ GET `/api/purge-all` - 清除所有緩存
- ✅ R2 圖片遷移（語義化路徑）
- ✅ D1 `media_mapping` 表

### v2.0（計劃中 - Phase 5）
- ⏳ POST `/api/invoice/generate` - 生成 Invoice PDF
- ⏳ POST `/api/quote/generate` - 生成 Quotation PDF
- ⏳ GET `/api/invoices` - 取得 Invoice 列表
- ⏳ GET `/api/quotes` - 取得 Quotation 列表

### v3.0（計劃中 - Phase 6）
- ⏳ POST `/api/seo/enqueue` - 加入 AI SEO 隊列
- ⏳ GET `/api/seo/queue` - 取得 SEO 隊列狀態

---

## 相關文檔

- **[系統架構](./ARCHITECTURE.md)** - 整體架構概覽
- **[完整架構設計](../architecture_design.md)** - 詳細技術設計
- **[實施計劃](../implementation_plan.md)** - 分階段實施步驟
- **[進度追蹤](../PROGRESS.md)** - 當前進度

---

**最後更新：2025-01-10**