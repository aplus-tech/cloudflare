# WordPress + Cloudflare 完整實施計劃

> 語言：廣東話 | 更新日期：2025-01-10 | 版本：2.0

---

## 📋 目錄

### 第一部分：環境準備
1. [準備工作](#1-準備工作)
2. [VPS WordPress 配置](#2-vps-wordpress-配置)
3. [Cloudflare 基礎設施](#3-cloudflare-基礎設施)

### 第二部分：已完成階段（Phase 0-4.6）
4. [已完成階段總結](#4-已完成階段總結)
5. [當前系統狀態](#5-當前系統狀態)


---

## 1. 準備工作

### 1.1 環境需求

【問題原因】
部署 Cloudflare Workers + WordPress 系統需要以下環境：
- 本機開發環境（Node.js, Wrangler CLI）
- VPS 運行 WordPress（已有：15.235.199.194）
- Cloudflare 帳號
- 域名已轉移到 Cloudflare DNS

【方案成立】
所有工具都係免費或已擁有：
- Node.js 18+ 本機安裝
- Wrangler CLI 免費
- VPS 已配置
- Cloudflare Free Plan 已足夠

【來源證據】
- architecture_design.md#12.1 (準備工作)

### 1.2 必要工具安裝

**本機環境：**
```bash
# 安裝 Node.js 18+
# 下載：https://nodejs.org/

# 安裝 Wrangler CLI
npm install -g wrangler

# 登入 Cloudflare
wrangler login

# 驗證安裝
wrangler --version
```

**VPS 環境：**
```bash
# SSH 連接 VPS
ssh root@15.235.199.194

# 確認 Nginx 已安裝
nginx -v

# 確認 PHP 已安裝
php -v

# 確認 MySQL 已安裝
mysql --version

# 安裝 Rclone（後續圖片遷移用）
curl https://rclone.org/install.sh | sudo bash
```

【來源證據】
- architecture_design.md#12.1 (準備工作)
- refresh-idea.md:1440-1449 (Rclone 安裝)

---

## 2. VPS WordPress 配置

### 2.1 配置 origin 子域名

【問題原因】
需要將 WordPress 配置為 `origin.example.com`：
- 防止 Worker Loop（只有 origin 可以直達 VPS）
- 限制只允許 Cloudflare IP 訪問
- 主域名 `example.com` 走 Worker

【方案成立】
用 Nginx 配置 `origin.example.com`，加 IP 白名單：
- 只接受 Cloudflare IP 範圍
- 拒絕其他來源訪問
- 配合 Cloudflare DNS 灰雲模式

【來源證據】
- architecture_design.md#5 (防止 Worker Loop)
- architecture_design.md#12.3 (VPS WordPress 配置)

#### 步驟 1：創建 Nginx 配置

```bash
# SSH 到 VPS
ssh root@15.235.199.194

# 創建新配置
sudo nano /etc/nginx/sites-available/origin.example.com
```

**Nginx 配置內容：**
```nginx
# [Source: architecture_design.md#12.3]
server {
    server_name origin.example.com;

    # 只允許 Cloudflare IP 訪問
    # 完整列表：https://www.cloudflare.com/ips/
    allow 173.245.48.0/20;
    allow 103.21.244.0/22;
    allow 103.22.200.0/22;
    allow 103.31.4.0/22;
    allow 141.101.64.0/18;
    allow 108.162.192.0/18;
    allow 190.93.240.0/20;
    allow 188.114.96.0/20;
    allow 197.234.240.0/22;
    allow 198.41.128.0/17;
    allow 162.158.0.0/15;
    allow 104.16.0.0/13;
    allow 104.24.0.0/14;
    allow 172.64.0.0/13;
    allow 131.0.72.0/22;
    deny all;

    root /var/www/wordpress;
    index index.php index.html;

    access_log /var/log/nginx/origin.example.com.access.log;
    error_log /var/log/nginx/origin.example.com.error.log;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # 禁止訪問隱藏文件
    location ~ /\. {
        deny all;
    }
}
```

```bash
# 啟用配置
sudo ln -s /etc/nginx/sites-available/origin.example.com /etc/nginx/sites-enabled/

# 測試配置
sudo nginx -t

# 重新載入 Nginx
sudo systemctl reload nginx
```

【來源證據】
- architecture_design.md#12.3 (VPS WordPress 配置)

#### 步驟 2：配置 wp-config.php

```bash
sudo nano /var/www/wordpress/wp-config.php
```

**添加以下配置：**
```php
// [Source: architecture_design.md#12.3]

// 設定網站 URL
define('WP_HOME', 'https://example.com');
define('WP_SITEURL', 'https://origin.example.com');

// 信任 Cloudflare IP
if (isset($_SERVER['HTTP_CF_CONNECTING_IP'])) {
    $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_CF_CONNECTING_IP'];
}

// 強制 HTTPS
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}
```

【來源證據】
- architecture_design.md#12.3 (VPS WordPress 配置)

#### 步驟 3：測試 origin 域名

```bash
# 測試 DNS 解析
dig origin.example.com

# 測試 HTTP 訪問（應該返回 403 Forbidden，因為你 IP 不在白名單）
curl -I http://origin.example.com

# 從 Cloudflare IP 測試（應該成功）
# 可以暫時註解 deny all 來測試
```

【來源證據】
- architecture_design.md#12.6 (測試和驗證)

---

## 3. Cloudflare 基礎設施

### 3.1 DNS 配置

【問題原因】
需要配置 3 個子域名：
- `origin.example.com` - 指向 VPS（灰雲，DNS Only）
- `example.com` - 主站（橙雲，Proxied，走 Worker）
- `media.example.com` - R2 媒體域名（橙雲）

【方案成立】
在 Cloudflare Dashboard 配置 DNS 記錄：
- origin 用灰雲避免走 Worker（防 Loop）
- 主站用橙雲啟用 Worker 和緩存
- media 用 CNAME 指向 R2 Public Bucket

【來源證據】
- architecture_design.md#4 (域名同 DNS 配置)
- architecture_design.md#12.2 (基礎設施建置)

#### DNS 記錄配置

在 Cloudflare Dashboard → DNS 添加記錄：

| 類型 | 名稱 | 內容 | 代理狀態 | TTL |
|------|------|------|----------|-----|
| A | origin | 15.235.199.194 | 🔘 灰雲 (DNS Only) | Auto |
| CNAME | @ | example.com | 🟠 橙雲 (Proxied) | Auto |
| CNAME | www | example.com | 🟠 橙雲 (Proxied) | Auto |
| CNAME | media | media-bucket.r2-storage-account-id.r2.cloudflarestorage.com | 🟠 橙雲 (Proxied) | Auto |

**驗證 DNS：**
```bash
# 檢查 origin（應該返回真實 VPS IP）
dig +short origin.example.com

# 檢查主站（應該返回 Cloudflare IP）
dig +short example.com

# 檢查 media（應該返回 Cloudflare IP）
dig +short media.example.com
```

【來源證據】
- architecture_design.md#4 (域名同 DNS 配置)

### 3.2 創建 Cloudflare 資源

【問題原因】
需要創建以下 Cloudflare 資源：
- D1 Database - 存儲 WordPress 數據副本
- KV Namespace - 存儲 HTML 緩存
- R2 Buckets - 存儲媒體文件和文檔

【方案成立】
用 Wrangler CLI 創建（自動化，可記錄 ID）：
- 命令執行後會返回 ID
- ID 要記錄到 wrangler.toml
- 可重複執行驗證

【來源證據】
- architecture_design.md#6 (Cloudflare 資源配置)
- architecture_design.md#12.2 (基礎設施建置)

#### 步驟 1：創建 D1 Database

```bash
# 創建 D1 數據庫
wrangler d1 create wordpress-data

# 輸出示例：
# ✅ Successfully created DB 'wordpress-data' in region APAC
#
# [[d1_databases]]
# binding = "DB"
# database_name = "wordpress-data"
# database_id = "a061682a-515f-4fde-9b80-273632eb0e04"

# 記下 database_id
```

#### 步驟 2：創建 KV Namespace

```bash
# 創建生產環境 KV
wrangler kv:namespace create "HTML_CACHE"

# 輸出示例：
# ✅ Success! Add the following to your wrangler.toml:
# [[kv_namespaces]]
# binding = "HTML_CACHE"
# id = "695adac89df4448e81b9ffc05f639491"

# 創建預覽環境 KV
wrangler kv:namespace create "HTML_CACHE" --preview

# 記下 id
```

#### 步驟 3：創建 R2 Buckets

```bash
# 創建媒體 Bucket
wrangler r2 bucket create media-bucket

# 創建商業文檔 Bucket（Invoice/Quote）
wrangler r2 bucket create business-documents

# 列出所有 Bucket 驗證
wrangler r2 bucket list
```

【來源證據】
- architecture_design.md#6 (Cloudflare 資源配置)
- architecture_design.md#12.2 (基礎設施建置)

#### 步驟 4：配置 R2 Public Access

```bash
# 在 Cloudflare Dashboard → R2 → media-bucket → Settings
# 啟用 Public Access
# 記下 Public Bucket URL
```

【來源證據】
- architecture_design.md#7 (WordPress 圖片遷移到 R2)

### 3.3 初始化 D1 數據庫

【問題原因】
需要執行 `schema.sql` 建立所有表結構：
- sync_products, sync_posts, sync_orders
- media_mapping
- invoices, quotations
- ai_seo_queue

【方案成立】
用 Wrangler 執行 SQL 文件：
- 一次性建立所有表
- 可重複執行（IF NOT EXISTS）
- 驗證表是否創建成功

【來源證據】
- architecture_design.md#6 (Cloudflare 資源配置)
- architecture_design.md#12.2 (基礎設施建置)

```bash
# 執行建表 SQL
wrangler d1 execute wordpress-data --file=schema.sql

# 驗證表已創建
wrangler d1 execute wordpress-data \
  --command="SELECT name FROM sqlite_master WHERE type='table'"

# 應該看到以下表：
# sync_products
# sync_posts
# sync_orders
# media_mapping
# invoices
# quotations
# ai_seo_queue
```

【來源證據】
- architecture_design.md#12.2 (基礎設施建置)

---

## 4. 已完成階段總結

### Phase 0: 清理與重置 ✅

**狀態：已完成**

- [x] 刪除未授權 `edge-cache-worker` 資料夾
- [x] 刪除未授權 `wp-purge-plugin.php`
- [x] 更新 `wrangler.toml` 綁定 KV

【來源證據】
- implementation_plan.md:5-19 (原有記錄)

### Phase 2: 基礎設施搭建 ✅

**狀態：已完成**

- [x] 初始化 SvelteKit 專案
- [x] 配置 D1 綁定
- [x] 本地安裝 `npm install`
- [x] 連接 GitHub
- [x] 成功部署到 Cloudflare Pages
- [x] 取得部署網址：`cloudflare-9qe.pages.dev`
- [x] 應用 `schema.sql` 建表

【來源證據】
- implementation_plan.md:20-35 (原有記錄)

### Phase 3: 極速邊緣緩存 (KV) ✅

**狀態：已完成**

- [x] 創建 KV Namespace (`HTML_CACHE`)
- [x] 更新 `wrangler.toml` 綁定 KV
- [x] 實現 KV 邊緣緩存邏輯 (`hooks.server.ts`)
- [x] 實現緩存繞過（登入 Cookie、購物車 Cookie）
- [x] 編寫 PHP Snippet (`wp-cache-purge.php`)
- [x] 實現 `save_post` 自動清除 KV

【來源證據】
- implementation_plan.md:36-49 (原有記錄)
- hooks.server.ts:42-59 (KV Cache 實現)

### Phase 4: 數據同步管道 ✅

**狀態：已完成**

- [x] 建立 API Route: `src/routes/api/sync/+server.ts`
- [x] 實現 Secret Key 驗證
- [x] 實現 `INSERT OR REPLACE INTO sync_products`
- [x] 編寫 WordPress Webhook (`wp-d1-sync.php`)
- [x] Hook: `save_post`, `woocommerce_update_product`
- [x] 驗證實時同步（WordPress → D1 < 1 秒）

【來源證據】
- implementation_plan.md:50-64 (原有記錄)
- api/sync/+server.ts (完整實現)

### Phase 4.5: R2 語義化媒體遷移 ✅

**狀態：已完成**

- [x] 配置 R2 Bucket & Media Domain (`media.aplus-tech.com.hk`)
- [x] 建立 D1 `media_mapping` 表
- [x] 實現語義化路徑邏輯（`products/{brand}/{filename}`）
- [x] 開發自動遷移 Worker（WP → R2 with Mapping）

【來源證據】
- implementation_plan.md:65-78 (原有記錄)
- architecture_design.md#7 (WordPress 圖片遷移到 R2)

### Phase 4.6: 混合架構與 R2 圖片加速 ✅

**狀態：已完成**

- [x] Worker 連結測試（Edge Validation）
- [x] R2 圖片加速整合（R2 Image Acceleration）
- [x] 修改 WordPress 插件接收 R2 路徑
- [x] 將 R2 URL 寫入 `post_meta` (`_cloudflare_r2_url`)
- [x] 實現 `wp_get_attachment_url` filter
- [x] 驗證圖片加載速度提升

【來源證據】
- implementation_plan.md:94-113 (原有記錄)

---

## 5. 當前系統狀態

### 5.1 已實現功能

✅ **邊緣緩存系統**
- KV 存儲 HTML 頁面
- 緩存命中時 TTFB < 100ms
- 自動繞過登入用戶和購物車
- WordPress 更新後自動清除緩存

✅ **數據同步系統**
- WordPress → D1 實時同步
- 同步延遲 < 1 秒
- 支援 Products, Posts, Orders

✅ **R2 圖片存儲**
- WordPress 圖片自動上傳 R2
- 語義化路徑：`products/{brand}/{filename}`
- D1 mapping 記錄對應關係
- 圖片加載速度提升

✅ **Worker Loop 預防**
- origin.example.com (灰雲) 直達 VPS
- example.com (橙雲) 走 Worker
- Nginx IP 白名單防止非 Cloudflare 訪問

【來源證據】
- architecture_design.md#2 (完整系統架構)

### 5.2 已知問題（待修復）

❌ **安全漏洞：wrangler.toml 硬編碼密碼**
- 文件：`wrangler.toml:17-19`
- 問題：`SYNC_SECRET_KEY = "Lui@63006021"` 明文暴露
- 影響：如果代碼洩漏，攻擊者可偽造同步請求
- 修復：使用 `wrangler secret put`

❌ **性能問題：全表查詢 media_mapping**
- 文件：`hooks.server.ts:84`
- 問題：`SELECT * FROM media_mapping` 無 LIMIT
- 影響：mapping 數量增加後，內存和延遲暴增
- 修復：使用 KV 緩存或 HTMLRewriter

❌ **性能問題：圖片順序上傳**
- 文件：`api/sync/+server.ts:102-107`
- 問題：用 for loop 順序上傳圖片到 R2
- 影響：多圖片產品同步慢
- 修復：使用 `Promise.all()` 並行上傳

❌ **缺失機制：錯誤重試**
- 文件：`api/sync/+server.ts`
- 問題：R2 上傳失敗後無重試機制
- 影響：偶發性失敗導致圖片遺失
- 修復：加入 retry with exponential backoff

❌ **缺失機制：緩存 Key 不一致**
- 文件：`hooks.server.ts` vs `wp-cache-purge.php`
- 問題：存儲和清除使用不同 Key 格式
- 影響：清除緩存失敗
- 修復：統一 Key 格式

【來源證據】
- Summary: Problem Solving (已知問題分析)

### 5.3 缺失功能（待開發）

⚪ **Invoice/Quotation 系統**
- 從 D1 讀取訂單數據
- 生成 Invoice/Quote PDF
- 上傳到 R2 存儲
- 自動編號：INV-202501-0001

⚪ **AI SEO 自動化系統**
- 從 D1 讀取 Posts/Products
- 調用 Anthropic Claude API 生成 SEO
- 寫回 WordPress 或存 D1
- Cron 定時處理隊列

⚪ **監控和告警系統**
- Workers Analytics 監控
- 錯誤日誌收集
- 性能指標追蹤
- Email/Webhook 告警

【來源證據】
- architecture_design.md#10 (AI SEO 自動化系統)
- architecture_design.md#11 (Invoice 同 Quotation 系統)
- architecture_design.md#13 (監控同告警)

---

## 6. 修復安全漏洞

### 6.1 移除 wrangler.toml 明文密碼

【問題原因】
`wrangler.toml` Line 17-19 包含明文密碼：
```toml
SYNC_SECRET_KEY = "Lui@63006021"
```
如果 Git 代碼洩漏，攻擊者可以偽造同步請求寫入惡意數據到 D1。

【方案成立】
用 `wrangler secret put` 設定加密密鑰：
- 密鑰存在 Cloudflare 加密存儲
- 代碼中只引用名稱，無明文
- 只有部署者可設定

【來源證據】
- architecture_design.md#12.4 (部署 Workers)
- Summary: Errors and Fixes #1

#### 步驟 1：刪除 wrangler.toml 明文密碼

```bash
# 編輯 wrangler.toml
nano wrangler.toml
```

刪除以下行：
```toml
# ❌ 刪除這些行
# SYNC_SECRET_KEY = "Lui@63006021"
# PURGE_SECRET = "xxx"
# ANTHROPIC_API_KEY = "sk-ant-xxx"
```

添加註解：
```toml
# ✅ Secrets 用 wrangler secret put 設定
# 不要在此文件存明文密碼
```

#### 步驟 2：設定 Secrets

```bash
cd cloudflare-wordpress

# 設定同步密鑰
wrangler secret put SYNC_SECRET_KEY
# 提示輸入：Lui@63006021

# 設定緩存清除密鑰
wrangler secret put PURGE_SECRET
# 提示輸入：你的 secure key

# 設定 Anthropic API Key
wrangler secret put ANTHROPIC_API_KEY
# 提示輸入：sk-ant-xxx
```

#### 步驟 3：更新 WordPress 插件

編輯 `wp-d1-sync.php` 和 `wp-cache-purge.php`，確保 `$secret_key` 與 Wrangler 設定一致。

#### 步驟 4：驗證

```bash
# 重新部署
wrangler pages deploy .svelte-kit/cloudflare --project-name=example-com

# 測試同步 API（應該成功）
curl -X POST https://example.com/api/sync \
  -H "Content-Type: application/json" \
  -H "X-Secret-Key: Lui@63006021" \
  -d '{"type":"product","id":123,"title":"Test"}'

# 測試錯誤密鑰（應該返回 403）
curl -X POST https://example.com/api/sync \
  -H "Content-Type: application/json" \
  -H "X-Secret-Key: wrong_key" \
  -d '{"type":"product","id":123,"title":"Test"}'
```

【來源證據】
- architecture_design.md#12.4 (部署 Workers)

---

## 7. 修復性能問題

### 7.1 優化 media_mapping 查詢

【問題原因】
`hooks.server.ts:84` 執行全表查詢：
```typescript
const mappings = await env.DB.prepare('SELECT * FROM media_mapping').all();
```
當 mapping 數量達到 1000+ 時：
- 每次請求都查詢全表
- 內存占用大
- 響應延遲增加

【方案成立】
使用 KV 緩存 mapping 數據：
- 啟動時載入到 KV
- TTL 設為 1 小時
- 新增 mapping 時自動更新 KV
- 回退到 D1 查詢（如果 KV 過期）

【來源證據】
- Summary: Problem Solving #2

#### 步驟 1：創建 KV Namespace

```bash
# 創建 MEDIA_MAPPING_CACHE
wrangler kv:namespace create "MEDIA_MAPPING_CACHE"

# 記下 ID，添加到 wrangler.toml
```

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "MEDIA_MAPPING_CACHE"
id = "你的 KV ID"
```

#### 步驟 2：修改 hooks.server.ts

```typescript
// [Source: architecture_design.md#9]
async function getMediaMappings(env) {
    // 嘗試從 KV 讀取
    const cachedMappings = await env.MEDIA_MAPPING_CACHE.get('all_mappings', 'json');

    if (cachedMappings) {
        console.log('[Media Mapping] Cache HIT');
        return cachedMappings;
    }

    // KV 未命中，從 D1 查詢
    console.log('[Media Mapping] Cache MISS, loading from D1');
    const result = await env.DB.prepare('SELECT original_url, r2_path FROM media_mapping').all();
    const mappings = result.results || [];

    // 寫入 KV，TTL 1 小時
    await env.MEDIA_MAPPING_CACHE.put('all_mappings', JSON.stringify(mappings), {
        expirationTtl: 3600
    });

    return mappings;
}

// 在 handle() 函數中調用
export async function handle({ event, resolve }) {
    const mappings = await getMediaMappings(event.platform.env);

    // 替換 HTML 中的圖片 URL
    let html = await originalResponse.text();
    mappings.forEach(mapping => {
        html = html.replaceAll(mapping.original_url, `https://media.example.com/${mapping.r2_path}`);
    });

    return new Response(html, originalResponse);
}
```

#### 步驟 3：修改 api/sync/+server.ts

同步時自動更新 KV：
```typescript
// [Source: architecture_design.md#8]
// 在 syncImageToR2() 完成後
await env.DB.prepare(`
    INSERT OR REPLACE INTO media_mapping (original_url, r2_path, created_at)
    VALUES (?, ?, ?)
`).bind(originalUrl, r2Path, Date.now()).run();

// 清除 KV 緩存，強制下次重新載入
await env.MEDIA_MAPPING_CACHE.delete('all_mappings');
```

【來源證據】
- architecture_design.md#9 (KV 緩存策略)

### 7.2 並行上傳圖片到 R2

【問題原因】
`api/sync/+server.ts:102-107` 使用 for loop 順序上傳：
```typescript
for (const img of gallery_images_raw) {
    const r2Path = await syncImageToR2(img.url, ...);
}
```
如果產品有 10 張圖片，每張上傳 200ms，總共 2 秒。

【方案成立】
使用 `Promise.all()` 並行上傳：
- 所有圖片同時上傳
- 總時間 = 最慢的那張（約 200ms）
- 速度提升 10 倍

【來源證據】
- Summary: Problem Solving #3

#### 修改 api/sync/+server.ts

```typescript
// [Source: architecture_design.md#8]

// ❌ 原來的順序上傳
// for (const img of gallery_images_raw) {
//     const r2Path = await syncImageToR2(img.url, productSlug, brand, env);
//     gallery_images.push(`https://media.example.com/${r2Path}`);
// }

// ✅ 改為並行上傳
const uploadPromises = gallery_images_raw.map(async (img) => {
    const r2Path = await syncImageToR2(img.url, productSlug, brand, env);
    return `https://media.example.com/${r2Path}`;
});

const gallery_images = await Promise.all(uploadPromises);
```

【來源證據】
- architecture_design.md#7 (WordPress 圖片遷移到 R2)

### 7.3 加入圖片上傳重試機制

【問題原因】
R2 上傳可能偶發性失敗：
- 網絡超時
- R2 服務暫時不可用
- 原圖 URL 無法訪問

目前無重試機制，失敗後就遺失。

【方案成立】
實現 Exponential Backoff 重試：
- 失敗後等待 1s、2s、4s 重試
- 最多重試 3 次
- 記錄失敗日誌

【來源證據】
- Summary: Problem Solving #4

#### 修改 syncImageToR2() 函數

```typescript
// [Source: architecture_design.md#7]
async function syncImageToR2(imageUrl, productSlug, brand, env, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // 檢查 D1 是否已有 mapping
            const existing = await env.DB.prepare(`
                SELECT r2_path FROM media_mapping WHERE original_url = ?
            `).bind(imageUrl).first();

            if (existing) {
                // 檢查 R2 是否真的有文件
                const r2Object = await env.MEDIA_BUCKET.head(existing.r2_path);
                if (r2Object) {
                    console.log(`[R2 Upload] Skip: ${imageUrl} (Already exists)`);
                    return existing.r2_path;
                }
            }

            // 下載圖片
            const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

            // 生成 R2 路徑
            const filename = imageUrl.split('/').pop();
            const r2Path = `products/${brand}/${productSlug}-${filename}`;

            // 上傳到 R2
            await env.MEDIA_BUCKET.put(r2Path, response.body, {
                httpMetadata: { contentType: response.headers.get('content-type') }
            });

            // 記錄到 D1
            await env.DB.prepare(`
                INSERT OR REPLACE INTO media_mapping (original_url, r2_path, created_at)
                VALUES (?, ?, ?)
            `).bind(imageUrl, r2Path, Date.now()).run();

            console.log(`[R2 Upload] Success: ${r2Path}`);
            return r2Path;

        } catch (error) {
            console.error(`[R2 Upload] Attempt ${attempt} failed: ${error.message}`);

            if (attempt === retries) {
                console.error(`[R2 Upload] FAILED after ${retries} attempts: ${imageUrl}`);
                throw error;
            }

            // Exponential backoff
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
```

【來源證據】
- architecture_design.md#7 (WordPress 圖片遷移到 R2)

---

## 8. 修復缺失機制

### 8.1 統一緩存 Key 格式

【問題原因】
`hooks.server.ts` 存儲緩存：
```typescript
const cacheKey = `html:${path}`;
await env.HTML_CACHE.put(cacheKey, html);
```

`wp-cache-purge.php` 清除緩存：
```php
$url = 'https://example.com/api/purge';
$data = ['path' => '/sample-post/'];
```

如果 Worker 端解析 path 不一致，會導致清除失敗。

【方案成立】
統一 Key 格式規則：
- 移除開頭和結尾的 `/`
- 轉為小寫
- 記錄清除日誌

【來源證據】
- Summary: Problem Solving #5

#### 步驟 1：修改 hooks.server.ts

```typescript
// [Source: architecture_design.md#9]
function normalizePath(path) {
    // 移除開頭和結尾的 /
    path = path.replace(/^\/|\/$/g, '');
    // 空路徑 = 首頁
    if (path === '') path = 'home';
    return path.toLowerCase();
}

export async function handle({ event, resolve }) {
    const path = new URL(event.request.url).pathname;
    const normalizedPath = normalizePath(path);
    const cacheKey = `html:${normalizedPath}`;

    // 檢查 KV 緩存
    const cachedHtml = await event.platform.env.HTML_CACHE.get(cacheKey, 'text');

    if (cachedHtml) {
        console.log(`[KV Cache] HIT: ${cacheKey}`);
        return new Response(cachedHtml, {
            headers: { 'Content-Type': 'text/html', 'X-Cache': 'HIT' }
        });
    }

    // ... 獲取原始 HTML
    // ... 替換圖片 URL

    // 存入 KV
    await event.platform.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 3600 });
    console.log(`[KV Cache] MISS: ${cacheKey}`);

    return new Response(html, {
        headers: { 'Content-Type': 'text/html', 'X-Cache': 'MISS' }
    });
}
```

#### 步驟 2：修改清除 API

```typescript
// src/routes/api/purge/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { PURGE_SECRET } = platform.env;

    // 驗證密鑰
    const secretKey = request.headers.get('X-Secret-Key');
    if (secretKey !== PURGE_SECRET) {
        return new Response('Unauthorized', { status: 403 });
    }

    const { path } = await request.json();

    // 使用相同的 normalizePath 函數
    const normalizedPath = normalizePath(path);
    const cacheKey = `html:${normalizedPath}`;

    // 清除 KV
    await platform.env.HTML_CACHE.delete(cacheKey);

    console.log(`[Cache Purge] Deleted: ${cacheKey}`);

    return new Response(JSON.stringify({ success: true, key: cacheKey }), {
        headers: { 'Content-Type': 'application/json' }
    });
};

// 共用函數
function normalizePath(path: string): string {
    path = path.replace(/^\/|\/$/g, '');
    if (path === '') path = 'home';
    return path.toLowerCase();
}
```

【來源證據】
- architecture_design.md#9 (KV 緩存策略)

---

## 9. Invoice 同 Quotation 系統

### 9.1 系統架構

【問題原因】
WordPress/WooCommerce 缺少專業 Invoice/Quote 功能：
- 訂單完成後無自動 Invoice 生成
- 業務人員需要手動報價
- PDF 格式不專業
- 無集中管理系統

【方案成立】
用 SvelteKit + D1 + R2 實現獨立系統：
- 從 D1 讀取訂單數據（極快）
- 後端生成 Invoice/Quote PDF
- 上傳到 R2 存儲
- 前端 UI 管理所有文檔

【來源證據】
- architecture_design.md#11 (Invoice 同 Quotation 系統)

### 9.2 D1 表結構

```sql
-- [Source: architecture_design.md#11.7]

-- invoices 表
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,     -- INV-202501-0001
    order_id INTEGER,               -- 關聯 sync_orders 表
    customer_email TEXT,
    customer_name TEXT,
    items TEXT,                     -- JSON: 產品列表
    subtotal REAL,
    tax REAL,
    shipping REAL,
    total REAL,
    status TEXT DEFAULT 'pending',  -- pending/paid/cancelled
    issued_at INTEGER,
    due_at INTEGER,
    paid_at INTEGER,
    pdf_path TEXT,                  -- R2: invoices/INV-202501-0001.pdf
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- quotations 表
CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_number TEXT UNIQUE,       -- QT-202501-0001
    customer_email TEXT,
    customer_name TEXT,
    customer_company TEXT,
    items TEXT,                     -- JSON: 產品列表
    subtotal REAL,
    tax REAL,
    discount REAL,
    total REAL,
    status TEXT DEFAULT 'draft',    -- draft/sent/accepted/rejected/expired
    valid_until INTEGER,            -- 有效期限
    notes TEXT,
    pdf_path TEXT,                  -- R2: quotations/QT-202501-0001.pdf
    created_by TEXT,                -- 創建人員
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_valid ON quotations(valid_until);
```

添加到 `schema.sql` 文件，然後執行：
```bash
wrangler d1 execute wordpress-data --file=schema.sql
```

【來源證據】
- architecture_design.md#11.7 (D1 表結構)

### 9.3 Invoice API 實現

#### 步驟 1：創建 Invoice 生成 API

```typescript
// src/routes/api/invoice/generate/+server.ts
// [Source: architecture_design.md#11.2]

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { order_id } = await request.json();

    // 1. 從 D1 查詢訂單
    const order = await platform.env.DB.prepare(`
        SELECT * FROM sync_orders WHERE id = ?
    `).bind(order_id).first();

    if (!order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 2. 生成 Invoice 號碼
    const invoiceNumber = await generateInvoiceNumber(platform.env);

    // 3. 解析訂單項目
    const items = JSON.parse(order.items || '[]');

    // 4. 生成 Invoice HTML
    const invoiceHTML = generateInvoiceHTML({
        invoiceNumber,
        order,
        items,
        issuedAt: Date.now(),
        dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 天後
    });

    // 5. 生成 PDF（方案 A：第三方 API）
    const pdfBlob = await generatePDF(invoiceHTML, platform.env);

    // 6. 上傳 PDF 到 R2
    const pdfPath = `invoices/${invoiceNumber}.pdf`;
    await platform.env.BUSINESS_DOCUMENTS.put(pdfPath, pdfBlob, {
        httpMetadata: { contentType: 'application/pdf' }
    });

    // 7. 記錄到 D1
    await platform.env.DB.prepare(`
        INSERT INTO invoices (
            invoice_number, order_id, customer_email, customer_name,
            items, subtotal, tax, shipping, total,
            issued_at, due_at, pdf_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        invoiceNumber,
        order_id,
        order.billing_email,
        order.billing_name,
        JSON.stringify(items),
        order.subtotal,
        order.total_tax,
        order.shipping_total,
        order.total,
        Date.now(),
        Date.now() + 30 * 24 * 60 * 60 * 1000,
        pdfPath
    ).run();

    // 8. 返回下載連結
    return new Response(JSON.stringify({
        success: true,
        invoice_number: invoiceNumber,
        pdf_url: `https://documents.example.com/${pdfPath}`
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
};

// 生成 Invoice 號碼
async function generateInvoiceNumber(env) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const last = await env.DB.prepare(`
        SELECT invoice_number FROM invoices
        WHERE invoice_number LIKE ?
        ORDER BY invoice_number DESC
        LIMIT 1
    `).bind(`INV-${yearMonth}-%`).first();

    let sequence = 1;
    if (last) {
        const parts = last.invoice_number.split('-');
        sequence = parseInt(parts[2]) + 1;
    }

    return `INV-${yearMonth}-${String(sequence).padStart(4, '0')}`;
}

// 生成 PDF（方案 A：html2pdf.app）
async function generatePDF(html: string, env) {
    const response = await fetch('https://api.html2pdf.app/v1/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': env.HTML2PDF_API_KEY
        },
        body: JSON.stringify({
            html,
            options: {
                format: 'A4',
                printBackground: true,
                margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`PDF generation failed: ${response.status}`);
    }

    return await response.blob();
}
```

【來源證據】
- architecture_design.md#11.2 (Invoice 生成流程)
- architecture_design.md#11.4 (PDF 生成方案)

#### 步驟 2：Invoice HTML 模板

```typescript
// src/lib/invoice-template.ts
// [Source: architecture_design.md#11.5]

export function generateInvoiceHTML(data) {
    const { invoiceNumber, order, items, issuedAt, dueAt } = data;

    return `
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 40px;
            color: #333;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
        }
        .company-logo { font-size: 28px; font-weight: bold; color: #0066cc; }
        .invoice-title { font-size: 32px; font-weight: bold; color: #0066cc; }

        .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .info-box { width: 48%; }
        .info-box h3 { font-size: 14px; color: #666; margin-bottom: 10px; }
        .info-box p { margin: 5px 0; font-size: 14px; }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
        }
        thead {
            background-color: #f5f5f5;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            color: #666;
        }
        td {
            font-size: 14px;
        }
        .text-right { text-align: right; }

        .summary {
            margin-top: 30px;
            float: right;
            width: 300px;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
        }
        .summary-row.total {
            border-top: 2px solid #333;
            padding-top: 12px;
            margin-top: 8px;
            font-size: 18px;
            font-weight: bold;
        }

        .footer {
            clear: both;
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="company-logo">A Plus Technology</div>
        <div class="invoice-title">INVOICE</div>
    </div>

    <!-- Invoice Info -->
    <div class="info-section">
        <div class="info-box">
            <h3>INVOICE DETAILS</h3>
            <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
            <p><strong>Invoice Date:</strong> ${new Date(issuedAt).toLocaleDateString('zh-HK')}</p>
            <p><strong>Due Date:</strong> ${new Date(dueAt).toLocaleDateString('zh-HK')}</p>
            <p><strong>Order Number:</strong> #${order.id}</p>
        </div>
        <div class="info-box">
            <h3>BILL TO</h3>
            <p><strong>${order.billing_name}</strong></p>
            <p>${order.billing_email}</p>
            <p>${order.billing_address_1 || ''}</p>
            <p>${order.billing_city || ''}, ${order.billing_country || ''}</p>
            <p>${order.billing_phone || ''}</p>
        </div>
    </div>

    <!-- Items Table -->
    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>SKU</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
            </tr>
        </thead>
        <tbody>
            ${items.map(item => `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.sku || '-'}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">$${parseFloat(item.price).toFixed(2)}</td>
                    <td class="text-right">$${(item.quantity * parseFloat(item.price)).toFixed(2)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <!-- Summary -->
    <div class="summary">
        <div class="summary-row">
            <span>Subtotal:</span>
            <span>$${parseFloat(order.subtotal).toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <span>Tax:</span>
            <span>$${parseFloat(order.total_tax).toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <span>Shipping:</span>
            <span>$${parseFloat(order.shipping_total).toFixed(2)}</span>
        </div>
        <div class="summary-row total">
            <span>TOTAL:</span>
            <span>$${parseFloat(order.total).toFixed(2)}</span>
        </div>
    </div>

    <!-- Footer -->
    <div class="footer">
        <p><strong>Payment Terms:</strong> Net 30 days</p>
        <p><strong>Bank Account:</strong> HSBC Hong Kong - 123-456789-001</p>
        <p><strong>Company Address:</strong> 香港新界葵涌葵昌路 26-38 號豪華工業大廈 23 樓 07 室</p>
        <p style="margin-top: 20px;">Thank you for your business!</p>
    </div>
</body>
</html>
    `;
}
```

【來源證據】
- architecture_design.md#11.5 (Invoice HTML 模板設計)

### 9.4 Quotation API 實現

```typescript
// src/routes/api/quote/generate/+server.ts
// [Source: architecture_design.md#11.6]

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { customer_email, customer_name, items, notes, valid_days = 30 } = await request.json();

    // 1. 計算總額
    let subtotal = 0;
    items.forEach(item => {
        subtotal += item.quantity * item.price;
    });

    const tax = subtotal * 0.1; // 假設 10% 稅率
    const total = subtotal + tax;

    // 2. 生成 Quote 號碼
    const quoteNumber = await generateQuoteNumber(platform.env);

    // 3. 計算有效期
    const validUntil = Date.now() + valid_days * 24 * 60 * 60 * 1000;

    // 4. 生成 Quote HTML
    const quoteHTML = generateQuoteHTML({
        quoteNumber,
        customer_email,
        customer_name,
        items,
        subtotal,
        tax,
        total,
        validUntil,
        notes
    });

    // 5. 生成 PDF
    const pdfBlob = await generatePDF(quoteHTML, platform.env);

    // 6. 上傳到 R2
    const pdfPath = `quotations/${quoteNumber}.pdf`;
    await platform.env.BUSINESS_DOCUMENTS.put(pdfPath, pdfBlob, {
        httpMetadata: { contentType: 'application/pdf' }
    });

    // 7. 記錄到 D1
    await platform.env.DB.prepare(`
        INSERT INTO quotations (
            quote_number, customer_email, customer_name,
            items, subtotal, tax, total,
            valid_until, notes, pdf_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        quoteNumber,
        customer_email,
        customer_name,
        JSON.stringify(items),
        subtotal,
        tax,
        total,
        validUntil,
        notes,
        pdfPath
    ).run();

    // 8. 返回
    return new Response(JSON.stringify({
        success: true,
        quote_number: quoteNumber,
        pdf_url: `https://documents.example.com/${pdfPath}`,
        view_url: `https://example.com/quote/${quoteNumber}`
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
};

async function generateQuoteNumber(env) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const last = await env.DB.prepare(`
        SELECT quote_number FROM quotations
        WHERE quote_number LIKE ?
        ORDER BY quote_number DESC
        LIMIT 1
    `).bind(`QT-${yearMonth}-%`).first();

    let sequence = 1;
    if (last) {
        const parts = last.quote_number.split('-');
        sequence = parseInt(parts[2]) + 1;
    }

    return `QT-${yearMonth}-${String(sequence).padStart(4, '0')}`;
}
```

【來源證據】
- architecture_design.md#11.6 (Quotation 系統差異)

### 9.5 前端 UI 頁面

```typescript
// src/routes/invoices/+page.svelte
// [Source: architecture_design.md#11]

<script lang="ts">
    import { onMount } from 'svelte';

    let invoices = [];

    onMount(async () => {
        const response = await fetch('/api/invoices');
        invoices = await response.json();
    });
</script>

<div class="container">
    <h1>Invoice 管理</h1>

    <table>
        <thead>
            <tr>
                <th>Invoice Number</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Issued Date</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each invoices as invoice}
                <tr>
                    <td>{invoice.invoice_number}</td>
                    <td>{invoice.customer_name}</td>
                    <td>${invoice.total.toFixed(2)}</td>
                    <td>
                        <span class="badge badge-{invoice.status}">
                            {invoice.status}
                        </span>
                    </td>
                    <td>{new Date(invoice.issued_at).toLocaleDateString()}</td>
                    <td>
                        <a href={invoice.pdf_url} target="_blank">View PDF</a>
                        {#if invoice.status === 'pending'}
                            <button on:click={() => markAsPaid(invoice.id)}>Mark Paid</button>
                        {/if}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .badge-pending { background: #ffc107; color: #000; }
    .badge-paid { background: #28a745; color: #fff; }
- 需要 SEO 專業知識
- 時間成本高

【方案成立】
用 Claude API + D1 + Cron 實現自動化：
- Cron 定時觸發 Worker
- 從 D1 讀取待處理文章/產品
- 調用 Claude API 生成 SEO 內容
- 寫回 WordPress 或存到 D1
- 隊列管理（避免超額）

【來源證據】
- architecture_design.md#10 (AI SEO 自動化系統)

### 10.2 D1 表結構

```sql
-- [Source: architecture_design.md#10.4]
CREATE TABLE IF NOT EXISTS ai_seo_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    post_type TEXT,                 -- post/product
    title TEXT,
    excerpt TEXT,
    content TEXT,
    status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
    seo_title TEXT,
    meta_description TEXT,
    focus_keyword TEXT,
    generated_at INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_seo_queue_status ON ai_seo_queue(status);
CREATE INDEX IF NOT EXISTS idx_seo_queue_post ON ai_seo_queue(post_id, post_type);
```

添加到 `schema.sql` 並執行：
```bash
wrangler d1 execute wordpress-data --file=schema.sql
```

【來源證據】
- architecture_design.md#10.4 (D1 隊列表)

### 10.3 API 實現：添加到隊列

```typescript
// src/routes/api/seo/enqueue/+server.ts
// [Source: architecture_design.md#10.5]

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    const { post_id, post_type, title, excerpt, content } = await request.json();

    // 檢查是否已在隊列
    const existing = await platform.env.DB.prepare(`
        SELECT id FROM ai_seo_queue
        WHERE post_id = ? AND post_type = ?
    `).bind(post_id, post_type).first();

    if (existing) {
        return new Response(JSON.stringify({ message: 'Already in queue' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 添加到隊列
    await platform.env.DB.prepare(`
        INSERT INTO ai_seo_queue (post_id, post_type, title, excerpt, content)
        VALUES (?, ?, ?, ?, ?)
    `).bind(post_id, post_type, title, excerpt, content).run();

    return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
};
```

【來源證據】
- architecture_design.md#10.5 (觸發流程)

### 10.4 Cron Worker：處理隊列

```typescript
// src/cron/seo-processor.ts
// [Source: architecture_design.md#10.6]

export default {
    async scheduled(event, env, ctx) {
        console.log('[SEO Cron] Starting...');

        // 1. 獲取待處理項目（一次處理 5 個）
        const queue = await env.DB.prepare(`
            SELECT * FROM ai_seo_queue
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 5
        `).all();

        if (!queue.results || queue.results.length === 0) {
            console.log('[SEO Cron] No pending items');
            return;
        }

        // 2. 逐個處理
        for (const item of queue.results) {
            try {
                // 標記為 processing
                await env.DB.prepare(`
                    UPDATE ai_seo_queue SET status = 'processing' WHERE id = ?
                `).bind(item.id).run();

                // 調用 Claude API
                const seoData = await generateSEO(item, env);

                // 更新隊列狀態
                await env.DB.prepare(`
                    UPDATE ai_seo_queue
                    SET status = 'completed',
                        seo_title = ?,
                        meta_description = ?,
                        focus_keyword = ?,
                        generated_at = ?
                    WHERE id = ?
                `).bind(
                    seoData.seo_title,
                    seoData.meta_description,
                    seoData.focus_keyword,
                    Date.now(),
                    item.id
                ).run();

                // 寫回 WordPress（可選）
                await updateWordPressSEO(item.post_id, item.post_type, seoData, env);

                console.log(`[SEO Cron] Completed: ${item.post_type} #${item.post_id}`);

            } catch (error) {
                console.error(`[SEO Cron] Failed: ${error.message}`);

                // 標記為失敗
                await env.DB.prepare(`
                    UPDATE ai_seo_queue
                    SET status = ?,
                        error_message = ?,
                        retry_count = retry_count + 1
                    WHERE id = ?
                `).bind(
                    item.retry_count >= 2 ? 'failed' : 'pending',
                    error.message,
                    item.id
                ).run();
            }
        }

        console.log('[SEO Cron] Finished');
    }
};

// 調用 Claude API 生成 SEO
async function generateSEO(item, env) {
    const prompt = `
你係一個 SEO 專家。根據以下產品/文章資訊，生成專業的 SEO 內容。

標題：${item.title}
摘要：${item.excerpt}
內容：${item.content.substring(0, 500)}...

請生成：
1. SEO Title（60 字元內，包含關鍵字）
2. Meta Description（150 字元內，吸引點擊）
3. Focus Keyword（1-2 個主要關鍵字）

返回 JSON 格式：
{
    "seo_title": "...",
    "meta_description": "...",
    "focus_keyword": "..."
}
`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Anthropic API failed: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content[0].text;

    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
}

// 寫回 WordPress
async function updateWordPressSEO(postId, postType, seoData, env) {
    const endpoint = postType === 'product'
        ? `https://origin.example.com/wp-json/wc/v3/products/${postId}`
        : `https://origin.example.com/wp-json/wp/v2/posts/${postId}`;

    await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.WP_API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            meta: {
                '_yoast_wpseo_title': seoData.seo_title,
                '_yoast_wpseo_metadesc': seoData.meta_description,
                '_yoast_wpseo_focuskw': seoData.focus_keyword
            }
        })
    });
}
```

【來源證據】
- architecture_design.md#10.6 (Claude API 調用)
- architecture_design.md#10.7 (Cron 定時觸發)

### 10.5 配置 Cron Trigger

```toml
# wrangler.toml
# [Source: architecture_design.md#10.7]

[triggers]
crons = ["0 */6 * * *"]  # 每 6 小時執行一次
```

部署後在 Cloudflare Dashboard 驗證：
- Workers & Pages → 你的 Worker → Triggers → Cron Triggers

【來源證據】
- architecture_design.md#10.7 (Cron 定時觸發)

### 10.6 WordPress 自動添加到隊列

編輯 `wp-d1-sync.php`，在同步完成後自動添加到 SEO 隊列：

```php
// [Source: architecture_design.md#10.5]

function aplus_d1_sync($post_id) {
    // ... 原有同步邏輯

    // 添加到 SEO 隊列
    $seo_data = [
        'post_id' => $post_id,
        'post_type' => get_post_type($post_id),
        'title' => get_the_title($post_id),
        'excerpt' => get_the_excerpt($post_id),
        'content' => get_post_field('post_content', $post_id)
    ];

    wp_remote_post('https://example.com/api/seo/enqueue', [
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Secret-Key' => 'your-secret-key'
        ],
        'body' => json_encode($seo_data)
    ]);
}
```

【來源證據】
- architecture_design.md#10.5 (觸發流程)

---

## 11. 測試清單

### 11.1 DNS 測試

```bash
# [Source: architecture_design.md#12.6]

# 測試 origin 域名（應返回真實 IP）
dig +short origin.example.com

# 測試主站（應返回 Cloudflare IP）
dig +short example.com

# 測試 media 域名（應返回 Cloudflare IP）
dig +short media.example.com

# 測試 HTTP 訪問
curl -I https://origin.example.com
curl -I https://example.com
curl -I https://media.example.com/test-image.jpg
```

### 11.2 Worker 功能測試

```bash
# [Source: architecture_design.md#12.6]

# 測試 KV 緩存
curl -I https://example.com/
# 第一次應該返回 X-Cache: MISS

curl -I https://example.com/
# 第二次應該返回 X-Cache: HIT

# 測試繞過緩存（登入頁面）
curl -I https://example.com/wp-admin/
# 應該無 X-Cache header，直接到 origin
```

### 11.3 數據同步測試

```bash
# [Source: architecture_design.md#12.6]

# 查詢 D1 數據
wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) as count FROM sync_products"

wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) as count FROM sync_posts"

# 修改 WordPress 產品，檢查 D1 是否 1 秒內更新
wrangler d1 execute wordpress-data \
  --command="SELECT title, updated_at FROM sync_products ORDER BY updated_at DESC LIMIT 1"
```

### 11.4 圖片遷移測試

```bash
# [Source: architecture_design.md#12.6]

# 測試圖片訪問
curl -I https://media.example.com/products/brand-name/test-product.jpg

# 檢查瀏覽器 Network Tab
# 所有圖片 URL 應該指向 media.example.com
# 無 404 錯誤
```

### 11.5 Invoice/Quote 測試

```bash
# 測試生成 Invoice
curl -X POST https://example.com/api/invoice/generate \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}'

# 應該返回 PDF URL

# 測試生成 Quotation
curl -X POST https://example.com/api/quote/generate \
  -H "Content-Type: application/json" \
  -d '{
    "customer_email": "test@example.com",
    "customer_name": "Test User",
    "items": [
      {"name": "Product A", "quantity": 2, "price": 50.00}
    ],
    "notes": "Special discount applied"
  }'
```

### 11.6 AI SEO 測試

```bash
# 手動添加到隊列
curl -X POST https://example.com/api/seo/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "post_id": 456,
    "post_type": "post",
    "title": "Test Post",
    "excerpt": "This is a test",
    "content": "Full content here..."
  }'

# 檢查隊列狀態
wrangler d1 execute wordpress-data \
  --command="SELECT * FROM ai_seo_queue WHERE post_id = 456"

# 手動觸發 Cron（測試用）
wrangler pages deployment tail --project-name=example-com
# 觀察 Cron 執行日誌
```

### 11.7 性能測試

使用工具：
- **GTmetrix** - https://gtmetrix.com
- **PageSpeed Insights** - https://pagespeed.web.dev
- **WebPageTest** - https://www.webpagetest.org

**目標指標：**
- 首次載入 TTFB < 500ms
- 緩存命中 TTFB < 100ms
- 完全載入時間 < 2s
- Lighthouse Performance > 90

【來源證據】
- architecture_design.md#12.6 (測試和驗證)

---

## 12. 上線切換流程

### 12.1 最終檢查清單

【來源證據】
- architecture_design.md#12.7 (上線切換)

- [ ] 所有 Workers 部署完成並測試通過
- [ ] DNS 設置正確（origin 灰雲，其他橙雲）
- [ ] Secrets 已設定（無明文密碼）
- [ ] D1 數據已同步（與 WordPress 一致）
- [ ] R2 圖片已遷移（所有圖片正常顯示）
- [ ] KV 緩存正常（命中率 > 80%）
- [ ] WordPress 插件已安裝並測試
- [ ] 備份所有重要數據

### 12.2 上線步驟

#### 步驟 1：最終備份

```bash
# 備份 WordPress 數據庫
ssh root@15.235.199.194
mysqldump -u root -p wordpress > backup_$(date +%Y%m%d).sql

# 備份 WordPress 文件
tar -czf wordpress_backup_$(date +%Y%m%d).tar.gz /var/www/wordpress

# 備份 D1 數據
wrangler d1 backup create wordpress-data
```

#### 步驟 2：切換 DNS

在 Cloudflare Dashboard：
1. 確認 `origin.example.com` 是灰雲
2. 將主站 DNS 切換到橙雲（啟用 Proxy）
3. 等待 DNS 傳播（1-5 分鐘）

#### 步驟 3：驗證上線

```bash
# 測試主站是否走 Worker
curl -I https://example.com
# 應該有 X-Cache header

# 測試圖片是否走 R2
curl -I https://media.example.com/products/test.jpg
# 應該返回 200

# 測試後台是否正常
# 登入 https://example.com/wp-admin/
# 測試發布文章、更新產品

# 觀察 Workers Analytics
# Cloudflare Dashboard → Workers & Pages → example-com → Metrics
```

#### 步驟 4：監控

部署後 24 小時內密切監控：
- Workers 錯誤率（應 < 0.1%）
- KV 命中率（應 > 80%）
- D1 查詢延遲（應 < 50ms）
- 用戶反饋（是否有錯誤報告）

【來源證據】
- architecture_design.md#12.7 (上線切換)
- architecture_design.md#13 (監控同告警)

---

## 13. 回滾計劃

### 13.1 緊急回滾條件

如果出現以下情況，立即回滾：
- Worker 錯誤率 > 5%
- 網站完全無法訪問
- 嚴重數據不一致
- 用戶無法登入或下單

【來源證據】
- implementation_plan.md:81-93 (Rollback Plan)

### 13.2 回滾步驟

#### 步驟 1：切換 DNS

在 Cloudflare Dashboard：
1. 將 `example.com` DNS 改為 A 記錄
2. 指向 VPS IP：15.235.199.194
3. 代理狀態改為灰雲（DNS Only）
4. TTL 設為 1 分鐘（快速生效）

#### 步驟 2：恢復 WordPress 配置

```bash
ssh root@15.235.199.194

# 編輯 wp-config.php
sudo nano /var/www/wordpress/wp-config.php
```

```php
// 恢復原始配置
define('WP_HOME', 'https://example.com');
define('WP_SITEURL', 'https://example.com');

// 註解掉 Cloudflare 配置
// if (isset($_SERVER['HTTP_CF_CONNECTING_IP'])) {
//     $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_CF_CONNECTING_IP'];
// }
```

```bash
# 重新載入 Nginx
sudo systemctl reload nginx
```

#### 步驟 3：停用 WordPress 插件

在 WordPress 後台：
1. 停用 `wp-d1-sync.php`
2. 停用 `wp-cache-purge.php`

#### 步驟 4：驗證

```bash
# 測試網站是否恢復
curl -I https://example.com
# 應該直接返回 VPS，無 X-Cache header

# 測試登入和基本功能
```

#### 步驟 5：通知用戶

如果影響範圍大：
- 在網站頂部顯示維護通知
- 發送 Email 通知（如有訂閱用戶）
- 更新 Status Page（如有）

【來源證據】
- implementation_plan.md:81-93 (Rollback Plan)

---

## 總結

### 當前狀態

✅ **已完成（Phase 0-4.6）**
- 基礎設施搭建
- KV 邊緣緩存
- D1 數據同步
- R2 圖片遷移

| 測試和驗證 | 全面測試 | 1-2 天 |
| 上線切換 | DNS 切換和監控 | 1 天 |
| **總計** | | **8-13 天** |

### 關鍵資源

**文檔：**
- architecture_design.md - 完整架構設計
- implementation_plan.md - 本文件
- task.md - 任務清單
- schema.sql - D1 表結構

**代碼文件：**
- hooks.server.ts - Worker 主邏輯
- api/sync/+server.ts - 數據同步 API
- wrangler.toml - Cloudflare 配置

**WordPress 插件：**
- wp-d1-sync.php - D1 同步
- wp-cache-purge.php - 緩存清除

【來源證據】
- architecture_design.md#15 (總結)
- 整份 implementation_plan.md 整合所有資訊

---

**最後更新：2025-01-10**
**版本：2.0**
**作者：Claude Code**
