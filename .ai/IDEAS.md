# 設計方案記錄

> Opus 4 專用 | 語言：廣東話 | 更新日期：2025-01-10

---

## 使用說明

呢個檔案用嚟記錄 **Claude Opus 4** 提供嘅設計方案。

### 工作流程

---

## 方案記錄

### 2025-01-10：Phase 4.7 架構優化分析

**請求來源**：用戶要求「分析現有架構優缺點 提出優化方案」

---

#### 📊 現有架構分析

##### ✅ 優點（值得保留）

1. **邊緣優先設計**
   - 數據源：[ARCHITECTURE.md:42-66](../docs/ARCHITECTURE.md#L42-L66)
   - 證據：KV 緩存命中率 80%，TTFB < 100ms
   - 影響：降低 VPS 負載 90%+

2. **混合架構策略**
   - 數據源：[PROGRESS.md:46-50](../PROGRESS.md#L46-L50)
   - 證據：HTML by Origin（靈活性）+ Images by R2（成本優化）
   - 影響：R2 成本 < $1/月，無出站流量費

3. **語義化媒體路徑**
   - 數據源：[api/sync/+server.ts:28-34](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L28-L34)
   - 證據：`products/{brand}/{filename}` 自動分類
   - 影響：SEO 友好，易於管理

4. **實時同步管道**
   - 數據源：[API_SPEC.md:132-150](../docs/API_SPEC.md#L132-L150)
   - 證據：WordPress → D1 < 1 秒
   - 影響：數據一致性保證

5. **零出站流量費**
   - 數據源：[ARCHITECTURE.md:17](../docs/ARCHITECTURE.md#L17)
   - 證據：R2 替代 VPS 圖片流量
   - 影響：每月節省流量成本

6. **關注點分離**
   - 數據源：[ARCHITECTURE.md:93-101](../docs/ARCHITECTURE.md#L93-L101)
   - 證據：Main Worker / Sync Worker / Purge API 獨立
   - 影響：易於維護和擴展

---

##### ❌ 缺點（Phase 4.7 待修復）

| 問題 | 證據檔案 | 影響 | 優先級 |
|------|---------|------|--------|
| **1. 明文密碼漏洞** | [wrangler.toml:17-19](../cloudflare-wordpress/wrangler.toml#L17-L19) | 安全風險：密碼可能被 Git 推送到公開倉庫 | 🔴 P0 |
| **2. 全表查詢效能** | [hooks.server.ts:84](../cloudflare-wordpress/src/hooks.server.ts#L84) | O(n) 複雜度，隨 `media_mapping` 增長變慢 | 🟠 P1 |
| **3. 順序上傳圖片** | [api/sync/+server.ts:101-108](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L101-L108) | 5 張圖需 5 秒（應該 1 秒內完成） | 🟠 P1 |
| **4. 缺少重試機制** | [api/sync/+server.ts:45-48](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L45-L48) | R2 上傳失敗時無自動恢復 | 🟠 P1 |
| **5. 緩存 Key 不一致** | [hooks.server.ts:42](../cloudflare-wordpress/src/hooks.server.ts#L42) vs [api/purge/+server.ts:20](../cloudflare-wordpress/src/routes/api/purge/+server.ts#L20) | 可能導致清除失敗 | 🟠 P1 |

---

#### 🎯 優化方案（3 個提案）

---

##### 📌 提案 1：安全優化（移除明文密碼）

**問題原因**：
- [wrangler.toml:17-19](../cloudflare-wordpress/wrangler.toml#L17-L19) 包含明文密碼 `SYNC_SECRET_KEY = "Lui@63006021"`
- 可能被推送到公開 Git 倉庫，造成安全漏洞

**方案成立**：
- Cloudflare 提供 `wrangler secret put` 命令安全儲存密鑰
- 密鑰儲存在 Cloudflare 雲端，不會出現在代碼中

**來源證據**：
- [task.md:369-377](../task.md#L369-L377) - Phase 4.7.1 Task
- Cloudflare 官方文檔：[Secrets Management](https://developers.cloudflare.com/workers/configuration/secrets/)

**實施步驟**：

```bash
# Step 1: 設定 Cloudflare Secrets
wrangler secret put SYNC_SECRET_KEY
# 提示時輸入：Lui@63006021

wrangler secret put PURGE_SECRET
# 提示時輸入：your-purge-secret
```

```toml
# Step 2: 編輯 wrangler.toml（移除明文密碼）
[env.production]
# ❌ 移除以下 3 行
# [env.production.vars]
# SYNC_SECRET_KEY = "Lui@63006021"
# PURGE_SECRET = "your-purge-secret"
```

```php
// Step 3: 更新 WordPress 插件（wp-d1-sync.php）
// 從：
$secret = 'Lui@63006021';  // ❌ 硬編碼

// 改為：
$secret = defined('CLOUDFLARE_SYNC_SECRET')
    ? CLOUDFLARE_SYNC_SECRET
    : '';  // ✅ 從 wp-config.php 讀取
```

**影響範圍**：
- 修改檔案：`wrangler.toml`, `wp-d1-sync.php`, `wp-cache-purge.php`
- 測試重點：驗證同步 API 和清除 API 仍正常運作

**工作量估計**：
- 難度：⭐ (1/5)
- 時間：1-2 小時
- 優先級：🔴 P0（必須立即修復）

---

##### 📌 提案 2：效能優化（KV Cache + 並行上傳 + 重試機制）

**問題原因**：
1. **全表查詢**：[hooks.server.ts:84](../cloudflare-wordpress/src/hooks.server.ts#L84) 執行 `SELECT * FROM media_mapping`，隨數據增長變慢
2. **順序上傳**：[api/sync/+server.ts:101-108](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L101-L108) 用 `for loop` 逐個上傳圖片
3. **無重試**：[api/sync/+server.ts:45-48](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L45-L48) 網絡失敗時直接報錯

**方案成立**：
1. **KV Cache 層**：將常用 `media_mapping` 快取到 KV（讀取 < 10ms）
2. **並行上傳**：用 `Promise.all()` 同時上傳所有圖片（5x 速度提升）
3. **Exponential Backoff**：失敗時自動重試 3 次（指數退避）

**來源證據**：
- [task.md:385-410](../task.md#L385-L410) - Phase 4.7.2, 4.7.3, 4.7.4
- Cloudflare 最佳實踐：[KV Performance](https://developers.cloudflare.com/kv/platform/limits/)

**實施步驟**：

**Step 1：優化 media_mapping 查詢（加 KV Cache）**

```typescript
// 修改：cloudflare-wordpress/src/hooks.server.ts

async function replaceImageUrls(html: string, platform: any): Promise<string> {
    const KV_CACHE = platform?.env.MEDIA_MAPPING_CACHE;  // 新增 KV Namespace
    const cacheKey = 'media_mapping:all';

    // 1. 先檢查 KV Cache
    let mappings = await KV_CACHE?.get(cacheKey, { type: 'json' });

    if (!mappings) {
        // 2. Cache Miss：從 D1 讀取
        const result = await platform?.env.DB.prepare(
            'SELECT original_url, r2_path FROM media_mapping'
        ).all();

        mappings = result.results;

        // 3. 寫入 KV Cache（TTL: 1 小時）
        await KV_CACHE?.put(cacheKey, JSON.stringify(mappings), {
            expirationTtl: 3600
        });
    }

    // 4. 替換 URL
    let newHtml = html;
    for (const row of mappings) {
        const r2Url = `https://media.aplus-tech.com.hk/${row.r2_path}`;
        newHtml = newHtml.replaceAll(row.original_url, r2Url);
    }
    return newHtml;
}
```

**Step 2：並行上傳圖片（Promise.all）**

```typescript
// 修改：cloudflare-wordpress/src/routes/api/sync/+server.ts

// ❌ 原本（順序上傳）
const galleryR2Paths = [];
for (const imageUrl of galleryImages) {
    const r2Path = await syncImageToR2(imageUrl, brand, platform?.env.MEDIA_BUCKET);
    galleryR2Paths.push(r2Path);
}

// ✅ 改為（並行上傳）
const galleryR2Paths = await Promise.all(
    galleryImages.map(imageUrl =>
        syncImageToR2(imageUrl, brand, platform?.env.MEDIA_BUCKET)
    )
);
```

**Step 3：加入重試機制（Exponential Backoff）**

```typescript
// 新增：cloudflare-wordpress/src/routes/api/sync/+server.ts

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;

            // HTTP 錯誤也重試
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            // 指數退避
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Failed after ${maxRetries} retries`);
}

// 使用
const response = await fetchWithRetry(imageUrl);
```

**影響範圍**：
- 新增 KV Namespace：`MEDIA_MAPPING_CACHE`
- 修改檔案：`hooks.server.ts`, `api/sync/+server.ts`
- 測試重點：驗證圖片上傳速度提升 + 網絡失敗時自動重試

**工作量估計**：
- 難度：⭐⭐⭐ (3/5)
- 時間：4-6 小時
- 優先級：🟠 P1（重要但不緊急）

---

##### 📌 提案 3：架構優化（統一緩存 Key + R2 存在性檢查）

**問題原因**：
1. **緩存 Key 不一致**：儲存時用 `html:${pathname}${search}`，清除時可能格式不同
2. **重複上傳**：每次同步都重新上傳圖片，即使 R2 已存在

**方案成立**：
1. **統一 Key 格式**：創建 `src/lib/cache-utils.ts` 工具模組
2. **R2 存在性檢查**：用 `r2.head()` 檢查檔案是否存在，避免重複上傳

**來源證據**：
- [task.md:412-428](../task.md#L412-L428) - Phase 4.7.5
- Cloudflare R2 API：[Object Operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

**實施步驟**：

**Step 1：創建統一 Cache Key 工具**

```typescript
// 新增：cloudflare-wordpress/src/lib/cache-utils.ts

export function normalizePath(url: string | URL): string {
    const urlObj = typeof url === 'string' ? new URL(url) : url;

    // 移除尾部斜線
    let pathname = urlObj.pathname.replace(/\/$/, '');

    // 處理 query string（保持一致順序）
    const params = new URLSearchParams(urlObj.search);
    const sortedParams = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b));

    const search = sortedParams.length > 0
        ? '?' + new URLSearchParams(sortedParams).toString()
        : '';

    return `html:${pathname}${search}`;
}
```

```typescript
// 修改：cloudflare-wordpress/src/hooks.server.ts

import { normalizePath } from '$lib/cache-utils';

export const handle: Handle = async ({ event, resolve }) => {
    const cacheKey = normalizePath(event.url);  // ✅ 使用統一函數
    // ...
};
```

```typescript
// 修改：cloudflare-wordpress/src/routes/api/purge/+server.ts

import { normalizePath } from '$lib/cache-utils';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { url } = await request.json();
    const cacheKey = normalizePath(url);  // ✅ 使用統一函數
    await platform?.env.HTML_CACHE.delete(cacheKey);
    // ...
};
```

**Step 2：加入 R2 存在性檢查**

```typescript
// 修改：cloudflare-wordpress/src/routes/api/sync/+server.ts

async function syncImageToR2(
    imageUrl: string,
    brand: string,
    r2Bucket: any
): Promise<string> {
    const filename = imageUrl.split('/').pop() || 'unknown.jpg';
    const r2Path = `products/${brand}/${filename}`;

    // 1. 檢查 R2 是否已存在
    const existing = await r2Bucket.head(r2Path);
    if (existing) {
        console.log(`[R2 Skip] ${r2Path} already exists`);
        return r2Path;  // ✅ 直接返回，不重複上傳
    }

    // 2. 下載圖片
    const response = await fetchWithRetry(imageUrl);
    const imageBuffer = await response.arrayBuffer();

    // 3. 上傳到 R2
    await r2Bucket.put(r2Path, imageBuffer, {
        httpMetadata: {
            contentType: response.headers.get('content-type') || 'image/jpeg'
        }
    });

    return r2Path;
}
```

**影響範圍**：
- 新增檔案：`src/lib/cache-utils.ts`
- 修改檔案：`hooks.server.ts`, `api/purge/+server.ts`, `api/sync/+server.ts`
- 測試重點：驗證緩存清除成功率 + 重複同步時不重傳圖片

**工作量估計**：
- 難度：⭐⭐ (2/5)
- 時間：2-3 小時
- 優先級：🟠 P1（架構改善）

---

#### 📋 方案對比

| 提案 | 主要收益 | 工作量 | 優先級 | 風險 |
|------|---------|--------|--------|------|
| **提案 1：安全優化** | 消除密碼洩漏風險 | 1-2h | 🔴 P0 | 低（僅配置變更） |
| **提案 2：效能優化** | 圖片上傳 5x 加速 + 自動重試 | 4-6h | 🟠 P1 | 中（需測試並行邏輯） |
| **提案 3：架構優化** | 避免重複上傳 + 統一 Key 格式 | 2-3h | 🟠 P1 | 低（向後兼容） |

---

#### 🎯 建議執行順序

```
Day 1：提案 1（安全優化）← 必須立即執行
    ↓
Day 2-3：提案 2（效能優化）← 影響最大
    ↓
Day 4：提案 3（架構優化）← 長期收益
    ↓
Day 5：全面測試（同步 + 清除 + 效能）
```

---

#### 📂 關鍵檔案清單（給 Sonnet 實施時用）

**Phase 4.7.1（安全）**：
- [wrangler.toml](../cloudflare-wordpress/wrangler.toml) - 移除 line 17-19 明文密碼
- [wp-d1-sync.php](../Wordpress%20Plugin/wp-d1-sync.php) - 改用 wp-config.php 常數
- [wp-cache-purge.php](../Wordpress%20Plugin/wp-cache-purge.php) - 改用 wp-config.php 常數

**Phase 4.7.2（KV Cache）**：
- [hooks.server.ts](../cloudflare-wordpress/src/hooks.server.ts) - 加 KV Cache 層（line 84 附近）

**Phase 4.7.3（並行上傳）**：
- [api/sync/+server.ts](../cloudflare-wordpress/src/routes/api/sync/+server.ts) - 改用 Promise.all（line 101-108）

**Phase 4.7.4（重試機制）**：
- [api/sync/+server.ts](../cloudflare-wordpress/src/routes/api/sync/+server.ts) - 加入 fetchWithRetry（line 45-48）

**Phase 4.7.5（統一 Key）**：
- 新增 [src/lib/cache-utils.ts](../cloudflare-wordpress/src/lib/cache-utils.ts) - 創建工具模組
- [hooks.server.ts](../cloudflare-wordpress/src/hooks.server.ts) - 引入 normalizePath
- [api/purge/+server.ts](../cloudflare-wordpress/src/routes/api/purge/+server.ts) - 引入 normalizePath

---

#### 💡 下一步行動

**給 Sonnet（執行者）**：
1. 讀取 [task.md:369-428](../task.md#L369-L428) 了解完整 Phase 4.7 規範
2. 按照「提案 1 → 提案 2 → 提案 3」順序實施
3. 每個提案完成後更新 [PROGRESS.md](../PROGRESS.md) 和 [CHANGELOG.md](../CHANGELOG.md)

**給用戶**：
- 決定是否立即執行「提案 1（安全優化）」？
- 或者想先審查其他提案的技術細節？

---

**分析完成時間**：2025-01-10
**分析模型**：Claude Opus 4
**分析模式**：READ-ONLY（僅分析，不修改代碼）