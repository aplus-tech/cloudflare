# Cloudflare Workers + KV + D1 架構缺點分析與決策

> **分析日期**：2026-01-24
> **討論模型**：Claude Sonnet 4.5
> **決策**：暫停 Worker/KV/D1，只保留 R2 圖片 CDN
> **原因**：VPS 本身夠快（TTFB 0.37s），Workers 架構複雜度高於收益

---

## 📊 VPS 速度測試結果

### 新 VPS (76.13.30.201) 直接訪問測試

**測試時間**：2026-01-24 23:05 UTC
**測試指令**：`curl -w "Time: %{time_total}s\nTTFB: %{time_starttransfer}s"`

```
TTFB: 0.369602s ✅  (首字節時間)
Total Time: 0.666938s
Size: 226655 bytes (221 KB)
Status: 200 OK
Server: LiteSpeed
```

### 效能分析

| 指標 | 數值 | 評價 |
|------|------|------|
| **TTFB** | 0.37s | ✅ 快速（<0.5s） |
| **Total Time** | 0.67s | ✅ 可接受 |
| **對比 KV Cache HIT** | 0.08s | KV 只快 0.29s |
| **對比 KV Cache MISS** | 3.59s | VPS 快 10 倍 |

**結論**：
- ✅ VPS LiteSpeed 本身已經夠快（0.37s TTFB）
- ✅ 唔需要 KV Cache 加速 HTML（收益只有 0.29s）
- ✅ Workers 架構複雜度唔值得

**【來源證據】**
- VPS SSH: root@76.13.30.201
- PROGRESS.md:191-222（Phase 4.8 效能測試：KV Hit 0.08s, Miss 3.59s）
- 今次測試：VPS 直接訪問 0.37s（無 Worker）

---

## 🔴 架構缺點清單（8 個）

---

### 缺點 1：Cache Invalidation 慢（用戶提出）

#### 【問題原因】

根據現有 purge 機制，只有 2 種清除方式：

**方法 A：Purge 單頁**
```typescript
// cloudflare-wordpress/src/routes/api/purge/+server.ts
await platform?.env.HTML_CACHE.delete(cacheKey);
```

**方法 B：Purge All**
```typescript
// 需要遍歷所有 keys
const keys = await env.HTML_CACHE.list();
for (const key of keys.keys) {
  await env.HTML_CACHE.delete(key.name);
}
```

#### 【實際影響】

**場景 1：編輯單個產品**
1. 用戶編輯產品 A
2. WordPress 觸發 purge → 只清除產品 A 詳情頁
3. ❌ 但產品列表頁（/shop/）仍然係舊 cache
4. ❌ 首頁（/）產品列表仍然係舊 cache
5. ❌ 分類頁（/category/brand/）仍然係舊 cache
6. ❌ 搜尋結果頁仍然係舊 cache

**場景 2：使用 Purge All**
1. WordPress 發送 purge-all 請求
2. Worker 遍歷所有 KV keys（假設 100 個頁面）
3. 逐個刪除 keys（需要 100 次 KV write 操作）
4. **耗時**：假設每次 50ms，總共 5 秒
5. **期間問題**：用戶訪問 → cache miss → 回源 VPS（3.59s TTFB）
6. **需要 Cache Warming**：爬取 sitemap 預熱（50 頁 × 3s = 2.5 分鐘）

#### 【來源證據】
- cloudflare-wordpress/src/routes/api/purge/+server.ts（現有 purge 邏輯）
- task.md:226-297（Task 4.7.6 Cache Warming 方案）
- IDEAS.md:1412-1675（Phase E Cache Warming 詳細設計）

---

### 缺點 2：D1 同步延遲 + 失敗風險

#### 【問題原因】

WordPress 到 D1 同步流程：

```
WordPress 儲存產品
    ↓ (觸發 hook)
wp-d1-sync.php 發送 HTTP request
    ↓
Cloudflare Worker API (/api/sync)
    ↓
D1 Database INSERT/UPDATE
```

#### 【實際影響】

**問題 1：網絡延遲**
- WordPress → Worker：網絡延遲（通常 <1s，但唔保證）
- D1 寫入：10-50ms

**問題 2：失敗風險（無重試機制）**
```php
// Wordpress Plugin/wp-d1-sync.php
$response = wp_remote_post($d1_api_url, [
    'body' => json_encode($payload),
    'timeout' => 10
]);

// ❌ 如果失敗，就失敗咗，冇重試
if (is_wp_error($response)) {
    error_log('D1 sync failed');
    return; // 直接返回，數據唔同步
}
```

**問題 3：原子性問題**
- WordPress 已經儲存到 MySQL
- 但 D1 同步失敗
- 結果：MySQL 有新資料，D1 冇 → 數據唔一致

#### 【來源證據】
- Wordpress Plugin/wp-d1-sync.php（同步邏輯）
- IDEAS.md:131-144（Phase 4.7.4 提案：建議加重試機制）
- cloudflare-wordpress/src/routes/api/sync/+server.ts（Worker 端處理）

---

### 缺點 3：Cold Start 效能問題

#### 【問題原因】

根據 Phase 4.8 效能測試結果：

| 狀態 | TTFB | Total Time | 說明 |
|------|------|------------|------|
| **Cache Miss** | 3.59s | 4.2s | Worker fetch VPS + 生成 HTML + 寫入 KV |
| **Cache Hit** | 0.08s | 0.15s | 直接由 KV 返回 |
| **加速比** | 45x | 28x | 96% 效能提升 |

#### 【實際影響】

**場景：Purge All 後的冷啟動**
1. 管理員執行 purge-all
2. 所有頁面 cache 被清空
3. 用戶訪問任何頁面：
   - 第 1 個訪問：3.59s TTFB（cache miss）
   - 第 2 個訪問：0.08s TTFB（cache hit）

**問題：首個訪問者體驗差**
- 網站有 50 個主要頁面
- Purge all 後，首 50 個訪問者每人等 3.59s
- **需要 Cache Warming**：後台爬取 sitemap 預熱所有頁面

**Cache Warming 成本**
- 50 個頁面 × 3.59s = 179 秒（約 3 分鐘）
- 需要實作 Task 4.7.6（Sitemap Crawler）
- 需要 Cron Job 定期執行

#### 【來源證據】
- PROGRESS.md:191-222（Phase 4.8.5 效能測試詳情）
- task.md:226-297（Task 4.7.6 Cache Warming 解決方案）
- IDEAS.md:1412-1619（Cache Warming API 完整代碼設計）

---

### 缺點 4：無法精準 Invalidate 關聯頁面

#### 【問題原因】

現有架構**冇記錄頁面之間嘅依賴關係**。

#### 【實際場景】

**場景 A：編輯產品 "iPhone 15 Pro"**

產品出現喺以下頁面：
1. ✅ 產品詳情頁 `/product/iphone-15-pro/` → 可以 purge
2. ❌ 產品列表頁 `/shop/` → 唔知要 purge
3. ❌ 首頁 `/` → 唔知要 purge（如果首頁有「最新產品」）
4. ❌ 品牌頁 `/brand/apple/` → 唔知要 purge
5. ❌ 分類頁 `/category/smartphones/` → 唔知要 purge
6. ❌ 搜尋結果頁 `/search?q=iphone` → 唔知要 purge
7. ❌ 相關產品推薦 → 唔知要 purge（其他產品詳情頁嘅側邊欄）

**結果**：
- 只有產品詳情頁更新
- 其他 6+ 個頁面仍然顯示舊價錢/舊標題/舊圖片
- 直到 cache 過期（如果有 TTL）或者 purge-all

#### 【解決方案複雜度】

要解決呢個問題，需要 **Dependency Tracking**：

```typescript
// 需要建立依賴關係表
dependencies = {
  'product:123': [
    'page:/',
    'page:/shop/',
    'page:/brand/apple/',
    'page:/category/smartphones/',
    'search:iphone',
    'product:456', // 相關產品
  ]
}

// Purge 時需要：
function purgeProduct(productId) {
  const relatedPages = dependencies[`product:${productId}`];
  for (const page of relatedPages) {
    await KV.delete(page);
  }
}
```

**問題**：
- 需要額外開發 dependency tracking 系統
- 需要額外 KV namespace 存儲依賴關係
- 複雜度高，容易出錯

#### 【來源證據】
- cloudflare-wordpress/src/routes/api/purge/+server.ts（現有簡單 purge 邏輯）
- 現有架構冇 dependency tracking 機制

---

### 缺點 5：KV 免費額度限制

#### 【問題原因】

Cloudflare KV 免費版限制：

| 項目 | 免費版 | 付費版 (Workers Paid: $5/mo) |
|------|--------|------------------------------|
| **Reads** | 100,000 / day | Unlimited ($0.50 per million) |
| **Writes** | 1,000 / day | Unlimited ($5.00 per million) |
| **Deletes** | 1,000 / day | Unlimited ($5.00 per million) |
| **Storage** | 1 GB | 無限制 |

#### 【實際影響】

**場景 1：高流量網站**
- 網站流量：200,000 pageviews / day
- KV reads：200,000 / day
- ❌ 超出免費額度（100,000）
- 需要升級付費版：$5/mo + $0.50 per million reads

**場景 2：頻繁更新**
- 每日更新產品：50 次
- 每次 purge-all：100 個頁面 × 1 delete = 100 deletes
- 總共：50 × 100 = 5,000 deletes / day
- ❌ 超出免費額度（1,000）
- 需要升級付費版

**場景 3：Cache Warming**
- 每次 purge-all 後執行 cache warming
- 50 個頁面 × 1 write = 50 writes
- 每日執行 3 次 = 150 writes / day
- ✅ 未超出免費額度（1,000）

#### 【成本計算】

**假設**：
- 流量：200k pageviews / day = 6M / month
- 更新：50 purge-all / day = 1,500 / month
- Cache warming：150 writes / day = 4,500 / month

**付費版成本**：
- Base: $5/mo
- Reads: 6M × $0.50 / 1M = $3/mo
- Deletes: 1,500 purge × 100 pages × $5 / 1M = $0.75/mo
- Writes: 4,500 × $5 / 1M = $0.02/mo
- **總共**：$5 + $3 + $0.75 + $0.02 = **$8.77/mo**

#### 【來源證據】
- Cloudflare 官方文檔：https://developers.cloudflare.com/kv/platform/limits/
- Cloudflare 價格：https://developers.cloudflare.com/workers/platform/pricing/

---

### 缺點 6：動態內容需要繞過 Cache

#### 【問題原因】

根據現有 Worker 邏輯，以下情況繞過 cache：

```typescript
// cloudflare-wordpress/src/hooks.server.ts

// 繞過條件 1：管理後台
if (url.pathname.startsWith('/wp-admin/') ||
    url.pathname.startsWith('/wp-login.php')) {
  return fetch(ORIGIN + url.pathname + url.search);
}

// 繞過條件 2：用戶已登入（有 cookie）
const cookies = request.headers.get('cookie');
if (cookies && (
    cookies.includes('wordpress_logged_in') ||
    cookies.includes('wp-postpass') ||
    cookies.includes('comment_author')
)) {
  return fetch(ORIGIN + url.pathname + url.search);
}

// 繞過條件 3：POST 請求
if (request.method !== 'GET') {
  return fetch(ORIGIN);
}
```

#### 【實際影響】

**場景 1：登入用戶體驗差**
- 用戶登入 WordPress
- 所有請求繞過 KV cache
- TTFB：3.59s（回源 VPS，冇 cache）
- **Edge Compute 優勢完全喪失**

**場景 2：WooCommerce 購物車**
- 購物車內容係動態嘅（每個用戶唔同）
- 需要繞過 cache
- 購物流程全程慢（3.59s TTFB）

**場景 3：個人化內容**
- 「你好，John」（顯示用戶名）
- 「我的訂單」（用戶專屬內容）
- 全部需要繞過 cache

#### 【解決方案複雜度】

要支援動態內容，需要：

**方法 A：Partial Caching（部分 cache）**
```html
<!-- Cache 靜態部分 -->
<header>...</header>
<nav>...</nav>

<!-- 動態部分用 AJAX 載入 -->
<div id="user-info">Loading...</div>
<script>
  fetch('/api/user-info').then(r => r.json()).then(data => {
    document.getElementById('user-info').innerHTML = data.html;
  });
</script>
```

**問題**：
- 需要重構 WordPress theme
- 需要建立 REST API endpoints
- 複雜度高

**方法 B：Edge Side Includes (ESI)**
```html
<esi:include src="/api/user-info" />
```

**問題**：
- ❌ Cloudflare Workers 唔支援 ESI
- 需要自己實作（複雜）

#### 【來源證據】
- cloudflare-wordpress/src/hooks.server.ts:20-45（繞過邏輯）
- WordPress 登入機制（cookie-based）

---

### 缺點 7：Debug 困難

#### 【問題原因】

現有架構包含 6 個組件：

```
1. WordPress (VPS)
   ↓
2. Nginx Proxy Manager (VPS)
   ↓
3. Cloudflare Workers (Edge)
   ↓
4. KV Cache (Edge)
   ↓
5. D1 Database (Edge)
   ↓
6. R2 Storage (Edge)
```

#### 【實際影響】

**場景：用戶報告「產品頁面顯示錯誤」**

**Step 1：判斷問題出喺邊？**
- ❓ WordPress 生成錯誤 HTML？
- ❓ Worker 處理邏輯錯誤？
- ❓ KV cache 存咗錯誤內容？
- ❓ D1 數據唔同步？
- ❓ R2 圖片遺失？
- ❓ NPM proxy 配置錯誤？

**Step 2：檢查多個 log**
```bash
# VPS WordPress log
ssh root@76.13.30.201
tail -f /opt/aplus-tech/wordpress/wp-content/debug.log

# Cloudflare Workers log
npx wrangler tail

# D1 Database query
npx wrangler d1 execute wordpress-cloudflare --command="SELECT ..."

# R2 Storage
npx wrangler r2 object get ...

# NPM log
docker logs aplus-tech-npm-1
```

**Step 3：重現問題**
- 需要清 cache？
- 需要同步 D1？
- 需要重新上傳圖片？
- **唔知由邊度開始**

#### 【來源證據】
- docs/ARCHITECTURE.md（架構複雜度圖）
- 實際 debug 經驗（需要檢查多個組件）

---

### 缺點 8：R2 圖片同步唔保證原子性

#### 【問題原因】

圖片上傳流程：

```
WordPress 上傳圖片
    ↓
wp-d1-sync.php 觸發
    ↓
Worker /api/sync
    ↓ (Step 1)
Fetch 圖片 from WordPress
    ↓ (Step 2)
Upload to R2
    ↓ (Step 3)
INSERT into D1 media_mapping
```

#### 【實際影響】

**場景 1：R2 成功，D1 失敗**
- Step 2 成功：圖片上傳到 R2
- Step 3 失敗：D1 INSERT 失敗（網絡問題、timeout）
- **結果**：R2 有圖片，但 media_mapping 冇記錄
- **影響**：圖片存在但 WordPress 唔知，無法替換 URL

**場景 2：D1 成功，R2 失敗**
- Step 2 失敗：R2 upload timeout
- Step 3 成功：D1 INSERT 成功（因為 code 冇檢查 R2 結果）
- **結果**：D1 有記錄，但 R2 冇圖片
- **影響**：圖片 URL 指向唔存在嘅 R2 object → 404 error

**場景 3：部分成功**
- 上傳 5 張圖片
- 前 3 張成功，後 2 張失敗
- **結果**：數據唔一致

#### 【根本原因】

Cloudflare 唔支援分佈式事務：
- R2 同 D1 係獨立服務
- 冇 two-phase commit
- 冇 rollback 機制

#### 【現有代碼問題】

```typescript
// cloudflare-wordpress/src/routes/api/sync/+server.ts

// ❌ 冇檢查 R2 upload 係咪成功
const r2Path = await syncImageToR2(imageUrl, brand, platform?.env.MEDIA_BUCKET);

// ❌ 直接 INSERT，唔理 R2 結果
await platform?.env.DB.prepare(`
  INSERT INTO media_mapping (original_url, r2_path)
  VALUES (?, ?)
`).bind(imageUrl, r2Path).run();
```

#### 【建議解決方案】

```typescript
// ✅ 加入錯誤檢查 + 重試
async function syncImageToR2(imageUrl, brand, r2Bucket) {
  try {
    // Step 1: Fetch image
    const response = await fetchWithRetry(imageUrl, 3);
    const imageBuffer = await response.arrayBuffer();

    // Step 2: Upload to R2
    const r2Path = `products/${brand}/${filename}`;
    await r2Bucket.put(r2Path, imageBuffer);

    // Step 3: Verify upload
    const exists = await r2Bucket.head(r2Path);
    if (!exists) {
      throw new Error('R2 upload verification failed');
    }

    return r2Path;
  } catch (error) {
    // Log error
    console.error('R2 sync failed:', error);
    throw error; // 讓 caller 知道失敗
  }
}

// ✅ 只有 R2 成功先 INSERT D1
try {
  const r2Path = await syncImageToR2(...);
  await DB.prepare('INSERT ...').bind(r2Path).run();
} catch (error) {
  // R2 失敗，唔 INSERT D1
  return json({ error: 'Sync failed' }, { status: 500 });
}
```

#### 【來源證據】
- cloudflare-wordpress/src/routes/api/sync/+server.ts（現有同步邏輯）
- IDEAS.md:131-144（Phase 4.7.4 提案：建議加重試機制）

---

## 📊 缺點總結

| # | 缺點 | 影響程度 | 是否有解決方案 | 複雜度 |
|---|------|---------|--------------|--------|
| 1 | Cache Invalidation 慢 | 🔴 高 | ✅ Cache Warming (Task 4.7.6) | 中 |
| 2 | D1 同步失敗風險 | 🟠 中 | ✅ 加重試機制（Phase 4.7.4）| 低 |
| 3 | Cold Start 慢 | 🟠 中 | ✅ Cache Warming | 中 |
| 4 | 無法精準 Invalidate | 🔴 高 | ❌ 需要 Dependency Tracking | 高 |
| 5 | KV 免費額度限制 | 🟡 低 | ✅ 升級付費版（$8.77/mo）| 無 |
| 6 | 動態內容繞過 Cache | 🟠 中 | ❌ 需要 Partial Caching | 高 |
| 7 | Debug 困難 | 🟡 低 | ✅ 集中 Logging | 中 |
| 8 | R2 同步唔保證原子性 | 🟡 低 | ✅ 加重試 + 驗證 | 低 |

**核心問題**：
- 🔴 缺點 1 + 4：Cache invalidation 機制唔完善（影響最大）
- 🟠 缺點 2 + 3 + 6：同步延遲 + 動態內容支援差
- 🟡 缺點 5 + 7 + 8：營運成本 + debug + 數據一致性

---

## 🎯 方案比較

---

### 方案 A：R2 + WordPress Plugin（最簡單）

#### 架構圖

```
WordPress (VPS) ←→ 用戶瀏覽器
    ↓ 上傳圖片
R2 Storage (media.aplus-tech.com.hk) ←→ 用戶瀏覽器
```

#### 流程

1. 用戶訪問 WordPress 頁面
   - 直接連接 VPS (76.13.30.201:8080)
   - TTFB: 0.37s

2. 頁面包含圖片
   - `<img src="https://media.aplus-tech.com.hk/products/apple/iphone.jpg">`
   - 瀏覽器直接請求 R2

3. WordPress 上傳新圖片
   - Plugin 自動上傳到 R2
   - 替換 HTML 中嘅圖片 URL

#### 優點

- ✅ 架構極簡單（只有 2 個組件：WordPress + R2）
- ✅ 零出站流量費（R2 免費出站到 Cloudflare CDN）
- ✅ 冇 cache invalidation 問題（HTML 唔 cache）
- ✅ 冇 D1 同步延遲
- ✅ Debug 容易（只需檢查 WordPress + R2）
- ✅ 冇 KV 免費額度限制
- ✅ 動態內容正常運作（冇 cache 問題）

#### 缺點

- ❌ WordPress HTML 由 VPS 提供（TTFB 0.37s，可接受但唔算最快）
- ❌ 冇 edge caching（HTML 每次都由 VPS 生成）
- ❌ VPS 頻寬壓力（所有 HTML 流量）

#### 成本

- R2: 免費（Free tier: 10 GB storage, unlimited egress to Cloudflare CDN）
- VPS: $6.99/mo（現有）
- **總計**：$6.99/mo

---

### 方案 B：R2 + Cloudflare CDN（推薦 ✅）

#### 架構圖

```
WordPress (VPS) ←→ 用戶瀏覽器
    ↓ 上傳圖片
R2 Storage
    ↓
Cloudflare CDN (自動 cache 圖片)
    ↓
用戶瀏覽器
```

#### 流程

1. 用戶訪問 WordPress 頁面
   - 直接連接 VPS
   - TTFB: 0.37s

2. 頁面包含圖片
   - `<img src="https://media.aplus-tech.com.hk/products/apple/iphone.jpg">`
   - Cloudflare CDN 自動 cache 圖片
   - 第 1 次：由 R2 讀取（慢）
   - 第 2 次：由 CDN edge 返回（快，<50ms）

3. 圖片更新
   - WordPress 上傳新圖片到 R2（覆蓋舊檔案）
   - Cloudflare CDN 自動偵測檔案變更，更新 cache
   - 或者用 Cloudflare API purge cache

#### 設定方法

**Step 1：R2 Bucket 綁定 Custom Domain**
```bash
# Cloudflare Dashboard → R2 → Bucket Settings
Custom Domain: media.aplus-tech.com.hk
```

**Step 2：DNS 設定**
- Cloudflare 自動添加 CNAME record
- `media.aplus-tech.com.hk` → R2 endpoint
- Proxy status: Proxied (橙雲) ← **重要，啟用 CDN**

**Step 3：WordPress Plugin 設定**
```php
// wp-d1-sync.php 或類似 plugin
define('R2_MEDIA_URL', 'https://media.aplus-tech.com.hk/');

// 替換圖片 URL
function replace_image_urls($content) {
  return str_replace(
    'http://76.13.30.201:8080/wp-content/uploads/',
    R2_MEDIA_URL . 'uploads/',
    $content
  );
}
add_filter('the_content', 'replace_image_urls');
```

#### 優點

- ✅ 圖片自動 CDN 加速（Cloudflare 全球邊緣節點）
- ✅ 零出站流量費（R2 → Cloudflare CDN 免費）
- ✅ 架構簡單（冇 Workers/KV/D1 複雜度）
- ✅ 冇 cache invalidation 問題（HTML 唔 cache）
- ✅ 冇 D1 同步延遲
- ✅ Debug 容易
- ✅ VPS 本身已經快（TTFB 0.37s）

#### 缺點

- ❌ WordPress HTML 仍然由 VPS 提供（TTFB 0.37s，但可接受）
- ⚠️ 圖片 cache purge 需要手動（或用 Cloudflare API）

#### 成本

- R2: 免費（Free tier）
- Cloudflare CDN: 免費（included）
- VPS: $6.99/mo
- **總計**：$6.99/mo

#### 效能對比

| 項目 | 現有架構 (Worker+KV) | 方案 B (VPS直連+R2 CDN) | 差異 |
|------|---------------------|----------------------|------|
| HTML TTFB (cache hit) | 0.08s | 0.37s | +0.29s |
| HTML TTFB (cache miss) | 3.59s | 0.37s | **-3.22s** ✅ |
| 圖片 TTFB (CDN hit) | ~50ms | ~50ms | 相同 |
| 圖片 TTFB (CDN miss) | ~200ms | ~200ms | 相同 |
| **Cache invalidation** | 需要 purge-all + warming | 無需處理 ✅ | 簡單 |
| **Debug 難度** | 高（6 個組件） | 低（2 個組件） | 簡單 ✅ |

**結論**：
- ✅ Cache hit 慢 0.29s（可接受，用戶唔會察覺）
- ✅ Cache miss 快 3.22s（大幅改善，唔需要 cache warming）
- ✅ 架構簡單，冇 Workers 複雜問題

---

### 方案 C：保留現有架構，但簡化

#### 保留組件

- ✅ R2（圖片存儲 + CDN）
- ✅ WordPress Plugin（自動上傳到 R2）

#### 移除組件

- ❌ KV Cache（HTML 唔 cache）
- ❌ D1 Database（唔同步產品數據）
- ❌ Workers HTML Proxy（直接訪問 VPS）

#### 優點

- ✅ 保留圖片 CDN 加速（主要效能提升）
- ✅ 移除複雜度（KV/D1/Workers 問題全部消失）
- ✅ 仍然節省流量費（R2 免費出站）
- ✅ VPS 本身快（TTFB 0.37s）

#### 缺點

- ❌ 放棄 HTML cache（但 VPS 本身快，影響唔大）
- ❌ 放棄 D1 數據同步（如果需要用 D1 做其他功能）

#### 成本

- 同方案 B：$6.99/mo

#### 結論

- 方案 C 本質上同方案 B 一樣
- 差異只係：方案 C 強調「保留 R2」，方案 B 強調「R2 + CDN」

---

## ✅ 最終決策

### 決策

**選擇方案 B：R2 + Cloudflare CDN**

### 理由

#### 1. VPS 本身已經夠快

**測試結果**：
- VPS LiteSpeed: TTFB 0.37s
- 對比 KV Cache Hit: 0.08s
- **差距只有 0.29s**（用戶唔會察覺）

**結論**：
- ✅ VPS 速度可接受，唔需要 KV Cache HTML
- ✅ 0.37s 已經係「快」嘅級別（<0.5s）

#### 2. Workers 架構複雜度高於收益

**複雜度**：
- 6 個組件：WordPress, Workers, KV, D1, R2, NPM
- 8 個缺點（上面詳細分析）
- Debug 困難

**收益**：
- Cache hit: 快 0.29s（微小）
- Cache miss: 慢 3.22s（但可以用 warming 解決）

**結論**：
- ❌ 複雜度 >> 收益
- ❌ 唔值得維護複雜架構

#### 3. R2 圖片 CDN 已經提供主要效能提升

**測試結果**（預期）：
- 圖片由 R2 CDN 提供：<50ms（edge cache hit）
- 圖片佔頁面大小：80-90%（typical）
- HTML 只佔：10-20%

**結論**：
- ✅ 圖片 CDN 已經解決 80% 效能問題
- ✅ HTML 快 0.29s 唔係關鍵

#### 4. 零維護成本

**方案 B 優點**：
- ✅ 冇 cache invalidation 問題
- ✅ 冇 D1 同步延遲
- ✅ 冇 KV 免費額度限制
- ✅ Debug 簡單（只有 WordPress + R2）

**結論**：
- ✅ 長期維護成本低
- ✅ 穩定性高

---

### 實施計劃

#### Phase 1：暫停 Workers/KV/D1 相關計劃

**暫停項目**：
- ❌ Phase 4.7：安全與效能優化（Cache Warming 唔需要）
- ❌ Task 4.7.6：Cache Warming API（唔需要）
- ❌ Phase 5.0 Phase C.1-C.3：Workers/KV/D1 驗證測試（唔需要）
- ❌ Phase 5.0 Phase E：Cache Warming + 測試（唔需要）

**保留項目**：
- ✅ R2 圖片存儲（繼續使用）
- ✅ WordPress Plugin（繼續使用）

#### Phase 2：R2 CDN 設定（15 分鐘）

**Step 1：Cloudflare Dashboard 設定**
1. 登入 Cloudflare Dashboard
2. R2 → 選擇 bucket
3. Settings → Custom Domains
4. 添加：`media.aplus-tech.com.hk`
5. 確認 DNS record 自動創建（Proxied 橙雲）

**Step 2：測試 R2 CDN**
```bash
# 上傳測試圖片
curl -X PUT "https://media.aplus-tech.com.hk/test.jpg" \
  --data-binary @test.jpg

# 測試訪問
curl -I "https://media.aplus-tech.com.hk/test.jpg"
# 應該返回：CF-Cache-Status: HIT (第二次訪問)
```

**Step 3：WordPress 設定**
- 確認 WordPress 圖片 URL 指向 `https://media.aplus-tech.com.hk/`
- 測試上傳新圖片

#### Phase 3：移除 Workers/KV/D1 相關代碼（可選）

**建議**：
- ⚠️ 暫時保留代碼（唔刪除）
- ⚠️ 只係暫停使用（未來可能需要）
- ✅ 更新文檔記錄決策

---

### 更新文檔

**需要更新嘅文檔**：
1. ✅ **docs/ARCHITECTURE_ISSUES.md**（本文件）
2. ⚠️ **PROGRESS.md**：記錄暫停決策
3. ⚠️ **task.md**：標記暫停項目
4. ⚠️ **.ai/context.yaml**：更新 `on_hold_tasks`

---

## 📋 下一步行動

### 立即執行

1. ✅ 創建 `docs/ARCHITECTURE_ISSUES.md`（本文件）
2. ⏳ 更新 PROGRESS.md 記錄決策
3. ⏳ 更新 task.md 標記暫停項目
4. ⏳ 測試 R2 CDN 設定
5. ⏳ 驗證 WordPress 圖片 URL

### 長期考慮

**何時需要重新考慮 Workers 架構？**

**場景 1：VPS 變慢**
- 如果 VPS TTFB > 1s
- 流量增加導致 VPS 負載高
- **解決方案**：升級 VPS 或啟用 KV Cache

**場景 2：流量暴增**
- 超過 VPS 處理能力（例如：100k+ concurrent users）
- **解決方案**：啟用 KV Cache + Workers

**場景 3：需要全球加速**
- 用戶分佈全球，需要邊緣節點
- **解決方案**：啟用 Workers + KV Cache

**目前狀況**：
- ✅ VPS 快（TTFB 0.37s）
- ✅ 流量唔高
- ✅ 用戶主要喺香港/亞洲
- **結論**：暫時唔需要 Workers 架構

---

## 📚 參考資料

### 內部文檔

- **PROGRESS.md:191-222** - Phase 4.8 效能測試結果
- **task.md:226-297** - Task 4.7.6 Cache Warming 方案
- **IDEAS.md:17-422** - Phase 4.7 架構優化分析（Opus）
- **IDEAS.md:1412-1675** - Phase E Cache Warming 詳細設計
- **docs/ARCHITECTURE.md** - 現有架構設計
- **cloudflare-wordpress/src/hooks.server.ts** - Workers 主邏輯
- **cloudflare-wordpress/src/routes/api/purge/+server.ts** - Cache purge API
- **cloudflare-wordpress/src/routes/api/sync/+server.ts** - D1/R2 同步 API
- **Wordpress Plugin/wp-d1-sync.php** - WordPress D1 同步 plugin

### 外部資源

- Cloudflare KV Limits: https://developers.cloudflare.com/kv/platform/limits/
- Cloudflare Workers Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare R2 Pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 Custom Domains: https://developers.cloudflare.com/r2/buckets/public-buckets/

---

## 📝 變更歷史

| 日期 | 變更 | 作者 |
|------|------|------|
| 2026-01-24 | 初始版本：分析 8 個缺點 + 決策方案 B | Claude Sonnet 4.5 + 用戶討論 |

---

**文檔結束**
