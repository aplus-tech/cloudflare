# WordPress + Cloudflare 完整系統架構設計

> 語言：廣東話 | 更新日期：2025-01-10 | 版本：2.0

---

## 📋 目錄

### 第一部分：核心概念
1. [系統需求同目標](#1-系統需求同目標)
2. [完整系統架構](#2-完整系統架構)
3. [技術棧選型](#3-技術棧選型)

### 第二部分：基礎設施
4. [域名同 DNS 配置](#4-域名同-dns-配置)
5. [防止 Worker Loop 方案](#5-防止-worker-loop-方案)
6. [Cloudflare 資源配置](#6-cloudflare-資源配置)

### 第三部分：核心功能
7. [WordPress 圖片遷移到 R2](#7-wordpress-圖片遷移到-r2)
8. [MySQL 到 D1 同步機制](#8-mysql-到-d1-同步機制)
9. [KV 緩存策略](#9-kv-緩存策略)

### 第四部分：進階功能
10. [AI SEO 自動化系統](#10-ai-seo-自動化系統)
11. [Invoice 同 Quotation 系統](#11-invoice-同-quotation-系統)

### 第五部分：部署同維護
12. [完整部署順序](#12-完整部署順序)
13. [監控同告警](#13-監控同告警)
14. [故障排查手冊](#14-故障排查手冊)

---

## 1. 系統需求同目標

### 1.1 核心需求

【問題原因】
現有 WordPress 系統面對以下問題：
- VPS 負載高，訪問速度慢
- 圖片流量大，成本高
- 全球訪問延遲大
- 缺少 Invoice/Quote 系統
- SEO 優化人力成本高

【方案成立】
用 Cloudflare 邊緣計算架構可以：
- 全球 CDN 加速（降低 TTFB 到 <100ms）
- R2 無限容量，無出站流量費
- Workers 邊緣運算，支援自定義邏輯
- D1 全球分佈數據庫，查詢極快
- AI 自動化 SEO，批量處理

【來源證據】
- refresh-idea.md:26-40 (核心需求定義)
- 現有代碼：hooks.server.ts:42-59 (KV Cache 實現)

### 1.2 系統目標

**性能目標：**
- 首次載入 TTFB < 500ms
- 緩存命中時 TTFB < 100ms
- 緩存命中率 > 80%
- 全頁載入時間 < 2s

**成本目標：**
- Cloudflare 免費額度內運行
- 降低 VPS 負載 90%+
- R2 儲存成本 < $1/月
- AI SEO 成本 < $10/月

**業務目標：**
- 自動生成 Invoice/Quote
- AI 自動優化 SEO
- 支援全球訪問
- 數據備份到 D1

【來源證據】
- refresh-idea.md:2281-2305 (系統優勢總結)

---

## 2. 完整系統架構

### 2.1 整體架構圖

```
                    ┌─────────────────────────────────────┐
                    │   用戶訪問 example.com              │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  Cloudflare DNS                     │
                    │  - example.com → Workers (橙雲)     │
                    │  - origin.example.com → VPS (灰雲)  │
                    │  - media.example.com → R2 (橙雲)    │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
┌─────────▼─────────┐   ┌─────────▼─────────┐   ┌─────────▼─────────┐
│  Main Worker      │   │  Media Worker     │   │  Sync Worker      │
│  (Proxy + Cache)  │   │  (R2 Images)      │   │  (WP → D1)        │
└─────────┬─────────┘   └───────────────────┘   └─────────┬─────────┘
          │                                                 │
          │ 檢查 KV Cache                                  │ 定時 / Webhook
          │                                                 │
┌─────────▼─────────┐                           ┌─────────▼─────────┐
│  KV (HTML Cache)  │                           │  WordPress (VPS)  │
│  - html:{path}    │                           │  - MySQL          │
│  - TTL: 1-24h     │                           │  - wp-content/    │
└───────────────────┘                           └─────────┬─────────┘
                                                          │
                    ┌─────────────────────────────────────┤
                    │                                     │
          ┌─────────▼─────────┐             ┌───────────▼───────────┐
          │  D1 Database      │             │  R2 Media Bucket      │
          │  - sync_products  │             │  - products/{brand}/  │
          │  - sync_orders    │             │  - posts/{slug}/      │
          │  - sync_posts     │             │  - invoices/          │
          │  - invoices       │             └───────────────────────┘
          │  - quotations     │
          └───────────────────┘

                    ┌─────────────────────────────────────┐
                    │  AI Workers                         │
                    │  - SEO Worker (Claude API)          │
                    │  - Invoice Worker (PDF Gen)         │
                    └─────────────────────────────────────┘
```

【來源證據】
- refresh-idea.md:71-117 (完整數據流)
- 現有代碼：app.d.ts:9-17 (Platform 接口定義)

### 2.2 各組件職責

| 組件 | 職責 | 技術實現 | 來源證據 |
|------|------|----------|----------|
| **VPS WordPress** | 內容編輯、Payment Gateway、用戶管理 | WordPress + WooCommerce + MySQL | refresh-idea.md:123 |
| **Main Worker** | 接收請求、路由分發、緩存管理、域名改寫 | SvelteKit + hooks.server.ts | hooks.server.ts:3-107 |
| **Media Worker** | R2 圖片讀取、緩存控制 | Cloudflare Worker + R2 Binding | refresh-idea.md:385-395 |
| **Sync Worker** | WordPress → D1 同步、圖片上傳 R2 | SvelteKit API + Cron | api/sync/+server.ts:1-143 |
| **SEO Worker** | AI 自動優化 SEO、批量處理 | Worker + Claude API + Queue | refresh-idea.md:589-765 |
| **Invoice Worker** | 生成 Invoice/Quote PDF | Worker + PDF API + R2 | refresh-idea.md:769-1057 |
| **KV** | HTML 頁面緩存 | Cloudflare KV Namespace | hooks.server.ts:42-59 |
| **D1** | WordPress 數據副本、業務數據 | Cloudflare D1 (SQLite) | schema.sql:1-153 |
| **R2** | 圖片、PDF 存儲 | Cloudflare R2 Bucket | refresh-idea.md:270-456 |

【問題原因】
點解要分咁多 Worker？

【方案成立】
- 職責分離，方便維護
- 獨立擴展（SEO Worker 可以單獨調整頻率）
- 故障隔離（Invoice 出錯唔會影響主站）
- 成本控制（分開計算 CPU Time）

【來源證據】
- refresh-idea.md:119-131 (組件職責表)

### 2.3 數據流向

#### 2.3.1 前端用戶訪問流程

```
用戶訪問 example.com/product/coffee
    ↓
Cloudflare DNS 解析 → Workers
    ↓
Main Worker 檢查 KV
    ├─ 有緩存 → 直接返回（<100ms）✅
    └─ 沒緩存 ↓
        fetch("https://origin.example.com/product/coffee")
            ↓
        VPS WordPress 生成 HTML（500ms-2s）
            ↓
        改寫域名：aplus-tech.com.hk → Worker Host
            ↓
        替換圖片：從 D1 media_mapping 讀取，改寫成 R2 URL
            ↓
        存入 KV（TTL: 1 hour）
            ↓
        返回給用戶
```

【來源證據】
- hooks.server.ts:42-101 (完整實現)
- refresh-idea.md:73-79

#### 2.3.2 後台同步流程

```
WordPress 儲存產品
    ↓
wp-d1-sync.php Hook 觸發
    ↓
POST https://worker.example.com/api/sync
{
  "type": "product",
  "secret": "***",
  "payload": {
    "id": 123,
    "title": "Coffee Beans",
    "image_url": "https://wp.com/uploads/coffee.jpg",
    "gallery_images": ["url1", "url2"]
  }
}
    ↓
Sync Worker 接收
    ↓
    ├─ 驗證 Secret ✅
    │
    ├─ 同步圖片到 R2
    │   ├─ 檢查 D1 media_mapping 是否存在
    │   ├─ 若存在：檢查 R2 檔案是否真實存在（r2.head）
    │   ├─ 若不存在：下載 + 上傳 R2
    │   └─ 記錄到 media_mapping
    │
    └─ 寫入 D1
        INSERT OR REPLACE INTO sync_products (...)
        VALUES (...)
    ↓
返回成功 { success: true, r2_data: {...} }
```

【來源證據】
- api/sync/+server.ts:6-68 (圖片同步邏輯)
- api/sync/+server.ts:111-121 (D1 寫入)
- refresh-idea.md:82-91

#### 2.3.3 AI SEO 處理流程

```
文章發布到 WordPress
    ↓
同步到 D1 (posts 表)
    ↓
標記 needs_seo_update = TRUE
    ↓
加入 seo_queue 表（待處理佇列）
    ↓
SEO Worker 定時檢查（Cron: 每小時）
    ↓
取出 10 篇優先級最高的文章
    ↓
逐篇調用 Claude API
    ├─ Prompt: "分析以下文章並生成 SEO 優化內容..."
    ├─ Input: 文章標題 + 前 2000 字元
    └─ Output: JSON { seo_title, meta_description, keywords, seo_score }
    ↓
解析 AI 返回的 JSON
    ↓
更新 D1 的 posts 表
    ├─ seo_title = AI 生成的標題
    ├─ seo_description = AI 生成的描述
    ├─ seo_keywords = AI 關鍵字
    └─ seo_score = AI 評分
    ↓
（可選）寫回 WordPress (Yoast SEO 欄位)
    ↓
標記 needs_seo_update = FALSE
```

【來源證據】
- refresh-idea.md:605-628 (完整流程)
- refresh-idea.md:669-688 (Prompt 設計)

#### 2.3.4 Invoice 生成流程

```
客戶請求 Invoice（或後台手動生成）
    ↓
POST /api/invoice/generate
{ "order_id": 123 }
    ↓
Invoice Worker 接收
    ↓
從 D1 查詢訂單資料 (orders 表)
    ↓
從 D1 查詢訂單項目 (order_items 表)
    ↓
生成唯一 Invoice 號碼
    ├─ 查詢本月最後一個號碼
    ├─ 序號 +1
    └─ 格式：INV-202501-0001
    ↓
創建 Invoice HTML
    ├─ Header: 公司 Logo + 資訊
    ├─ Invoice Info: 號碼、日期、訂單號
    ├─ Bill To: 客戶資訊
    ├─ Items Table: 產品列表
    └─ Summary: 小計、稅、總額
    ↓
轉換成 PDF
    ├─ 方案 A: 第三方 PDF API (html2pdf.app)
    ├─ 方案 B: Cloudflare Browser Rendering
    └─ 方案 C: 只生成 HTML（客戶自行打印）
    ↓
上傳 PDF 到 R2
    └─ 路徑: invoices/INV-202501-0001.pdf
    ↓
記錄到 D1 invoices 表
    ↓
返回下載連結
{
  "invoice_number": "INV-202501-0001",
  "pdf_url": "https://documents.example.com/invoices/INV-202501-0001.pdf"
}
```

【來源證據】
- refresh-idea.md:802-829 (完整流程)
- refresh-idea.md:989-1000 (D1 表結構)

---

## 3. 技術棧選型

### 3.1 前端框架

**選擇：SvelteKit 4**

【問題原因】
點解唔用純 Workers？

【方案成立】
- SvelteKit 提供完整的 SSR 框架
- 內建 Routing（/api/sync, /admin 等）
- TypeScript 支援
- 可以快速開發 Admin 後台
- adapter-cloudflare 無縫部署到 Pages

【來源證據】
- package.json:14 (@sveltejs/kit)
- svelte.config.js:1-18 (adapter-cloudflare 配置)

### 3.2 數據庫

**選擇：Cloudflare D1 (SQLite)**

【問題原因】
點解唔直接用 WordPress MySQL？

【方案成立】
- D1 在邊緣節點，全球分佈，查詢極快（<10ms）
- 免費額度大（每天 500 萬次讀取）
- 支援 SQL，查詢靈活
- 可以加自定義欄位（seo_score, needs_seo_update）
- 唔依賴 VPS，Workers 獨立運作

【來源證據】
- refresh-idea.md:467-473 (D1 優勢)
- schema.sql:1-153 (完整表結構)

### 3.3 媒體儲存

**選擇：Cloudflare R2**

【問題原因】
點解唔用 VPS 存圖片？

【方案成立】
- 無限容量
- **無出站流量費**（最關鍵）
- 全球 CDN 加速
- S3 兼容 API（工具生態豐富）
- 成本極低（存儲 $0.015/GB/月）

【來源證據】
- refresh-idea.md:270-273 (圖片遷移需求)
- wrangler.toml:13-15 (R2 配置)

### 3.4 AI 服務

**選擇：Anthropic Claude API**

【問題原因】
點解唔用 OpenAI？

【方案成立】
- Claude 對中文理解更好
- 支援更長 context（200K tokens）
- JSON 格式輸出穩定
- 價格合理（$3/百萬 tokens）
- 可以分析完整文章內容

【來源證據】
- refresh-idea.md:696-703 (成本分析)
- refresh-idea.md:669-688 (Prompt 設計)

---

## 4. 域名同 DNS 配置

### 4.1 點解需要兩個域名？

【問題原因】
如果只用一個域名 `example.com`，會發生 Worker Loop：

```
用戶訪問 example.com
    ↓
進入 Workers
    ↓
Workers 去 fetch("https://example.com")  ← 又會進入 Workers
    ↓
無限循環！💥
```

【方案成立】
用兩個域名分離：
1. **example.com** - 對外主域名（橙雲 Proxied → Workers）
2. **origin.example.com** - 內部子域名（灰雲 DNS Only → 直達 VPS）

流程變成：
```
用戶訪問 example.com
    ↓
進入 Workers
    ↓
Workers 去 fetch("https://origin.example.com")  ← 灰雲，直達 VPS
    ↓
成功！✅
```

【來源證據】
- refresh-idea.md:136-172 (完整說明)
- hooks.server.ts:6 (ORIGIN 變數)

### 4.2 DNS 記錄配置

在 Cloudflare Dashboard → DNS 設置：

| 類型 | 名稱 | 內容 | 代理狀態 | 說明 |
|------|------|------|----------|------|
| A | **origin** | `15.235.199.194` | **🔘 灰雲 (DNS Only)** | **關鍵**：必須灰雲，直連 VPS |
| CNAME | @ (根域名) | example.com | 🟠 橙雲 (Proxied) | 主域名走 Workers |
| CNAME | www | example.com | 🟠 橙雲 (Proxied) | www 也走 Workers |
| CNAME | media | media.example.com | 🟠 橙雲 (Proxied) | R2 圖片域名 |

**關鍵概念：**
- **🟠 橙雲 (Proxied)** = 流量經過 Cloudflare，可以用 Workers
- **🔘 灰雲 (DNS Only)** = 直接解析到 IP，不經過 Cloudflare

【來源證據】
- refresh-idea.md:174-183 (DNS 表格)
- 你嘅 VPS IP: 15.235.199.194

### 4.3 WordPress 配置

在 VPS 的 `wp-config.php` 加入：

```php
// WP_HOME = 用戶看到的域名
define('WP_HOME', 'https://example.com');

// WP_SITEURL = WordPress 實際所在位置
define('WP_SITEURL', 'https://origin.example.com');
```

**效果：**
- WordPress 後台在 `origin.example.com/wp-admin` 訪問
- 但生成的連結都是 `example.com`
- 用戶永遠只看到 `example.com`

【來源證據】
- refresh-idea.md:192-199

### 4.4 測試 DNS 設置

```bash
# 測試 origin 是否直達 VPS
curl -I http://origin.example.com
# 應該直接返回 WordPress，冇 Worker 處理標記

# 測試主域名
curl -I https://example.com
# 應該有 X-Cache: HIT 或 MISS header

# 如果主域名返回 Error 1001 或無限重定向 = 有 Loop
```

【來源證據】
- refresh-idea.md:244-256

---

## 5. 防止 Worker Loop 方案

### 5.1 Loop 發生原因

【問題原因】
Worker 本質係攔截 HTTP 請求。如果 Worker 自己發出嘅請求都被自己攔截，就會無限循環。

**錯誤範例：**
```javascript
// ❌ 錯誤：會造成 Loop
const response = await fetch(request.url);
// request.url = "https://example.com/page"
// 但 example.com 又會進入 Workers → 無限循環
```

【來源證據】
- refresh-idea.md:210-216

### 5.2 完整解決方案

**方案 A：使用子域名（推薦，你用呢個）**

步驟：
1. 創建 `origin.example.com` 指向 VPS（灰雲）
2. Worker 裡所有 fetch 請求都改寫 URL 到 `origin.example.com`
3. 因為 `origin.example.com` 是灰雲，不會觸發 Worker

**Worker 關鍵代碼：**
```typescript
// hooks.server.ts
const ORIGIN = 'https://origin.example.com';  // ← 關鍵

// 接收請求：https://example.com/some-page
// 改寫成：  https://origin.example.com/some-page
const targetUrl = `${ORIGIN}${path}${url.search}`;

const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
        ...Object.fromEntries(request.headers),
        'Host': 'origin.example.com'  // ← 重要
    }
});
// 不會觸發 Worker ✅
```

【來源證據】
- refresh-idea.md:217-233
- hooks.server.ts:6,63-71 (現有實現)

**方案 B：用 Custom Header（備選）**

如果不想用子域名：
1. Worker 發出請求時加特殊 header
2. Worker 檢查請求，如果有這個 header 就直接放行

```typescript
// ❌ 較複雜，不推薦
if (request.headers.get('X-Skip-Worker') === 'true') {
    return fetch(request);
}

// 自己發請求時加 header
const response = await fetch(url, {
    headers: { 'X-Skip-Worker': 'true' }
});
```

【來源證據】
- refresh-idea.md:234-240

### 5.3 Loop 診斷方法

```bash
# 測試主域名（應該有 Worker 處理的標記）
curl -I https://example.com
# 預期：X-Cache: HIT 或 MISS

# 測試 origin（應該沒有 Worker 標記）
curl -I https://origin.example.com
# 預期：直接返回 WordPress 的 header，沒有 X-Cache

# 如果主域名返回 Error 1001 或無限重定向 = 有 Loop
```

【來源證據】
- refresh-idea.md:244-256

### 5.4 安全加固：只允許 Cloudflare 訪問 origin

【問題原因】
因為 `origin.example.com` 是公開的 DNS 記錄，理論上任何人都可以訪問。

【方案成立】
在 Nginx 配置只允許 Cloudflare IP：

```nginx
# /etc/nginx/sites-available/origin.example.com

server {
    server_name origin.example.com;

    # 只允許 Cloudflare IP 訪問
    allow 173.245.48.0/20;
    allow 103.21.244.0/22;
    allow 103.22.200.0/22;
    # ... (更多 Cloudflare IP 範圍)
    deny all;

    location / {
        proxy_pass http://localhost:80;
    }
}
```

**效果：**
- 即使別人知道 `origin.example.com`，也無法直接訪問
- 只有 Cloudflare Workers 可以訪問

【來源證據】
- refresh-idea.md:258-266

---

## 6. Cloudflare 資源配置

### 6.1 D1 數據庫

**創建：**
```bash
wrangler d1 create wordpress-data
# 記下返回的 database_id
```

**初始化：**
```bash
wrangler d1 execute wordpress-data --file=schema.sql
```

**驗證：**
```bash
wrangler d1 execute wordpress-data \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**綁定到 Worker：**
```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "wordpress-data"
database_id = "a061682a-515f-4fde-9b80-273632eb0e04"
```

【來源證據】
- wrangler.toml:4-7
- refresh-idea.md:1262-1287

### 6.2 KV Namespace

**創建：**
```bash
wrangler kv:namespace create "HTML_CACHE"
wrangler kv:namespace create "HTML_CACHE" --preview
# 記下 namespace_id
```

**綁定到 Worker：**
```toml
# wrangler.toml
[[kv_namespaces]]
binding = "HTML_CACHE"
id = "695adac89df4448e81b9ffc05f639491"
```

【來源證據】
- wrangler.toml:9-11
- refresh-idea.md:1267-1270

### 6.3 R2 Bucket

**創建（在 Dashboard 操作）：**
1. R2 → Create Bucket
2. 名稱：`media-bucket`
3. 位置：自動（全球分佈）

**綁定到 Worker：**
```toml
# wrangler.toml
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "media-bucket"
```

**額外 Bucket（業務文件）：**
- `business-documents` - 存 Invoice/Quote PDF

【來源證據】
- wrangler.toml:13-15
- refresh-idea.md:1272-1276

### 6.4 Secrets 管理

【問題原因】
wrangler.toml 會提交到 Git，不能存明文 Secret。

【方案成立】
用 `wrangler secret` 指令存入環境變數：

```bash
# 同步密鑰
wrangler secret put SYNC_SECRET_KEY
# 輸入：Lui@63006021

# Purge 密鑰
wrangler secret put PURGE_SECRET
# 輸入：你的 secure key

# AI API Key
wrangler secret put ANTHROPIC_API_KEY
# 輸入：sk-ant-xxx
```

**wrangler.toml 只保留 binding：**
```toml
[vars]
# ❌ 不要這樣寫明文
# SYNC_SECRET_KEY = "Lui@63006021"

# ✅ 改用 wrangler secret put
# 這裡只寫非敏感變數
ENVIRONMENT = "production"
```

【來源證據】
- 現有問題分析：wrangler.toml:17-19 (安全漏洞)
- refresh-idea.md:1323-1334 (正確做法)

---

## 7. WordPress 圖片遷移到 R2

### 7.1 現有圖片狀況

【問題原因】
WordPress 預設把圖片存在：
```
/wp-content/uploads/
    ├── 2024/
    │   ├── 01/
    │   │   ├── image1.jpg
    │   │   └── image2.png
    │   ├── 02/
    │   └── 03/
    ├── 2025/
    └── woocommerce_uploads/
```

數據庫裡的圖片 URL：
```
https://example.com/wp-content/uploads/2024/01/image1.jpg
```

【方案成立】
遷移到 R2 後：
- VPS 空間釋放
- 流量費降低（R2 無出站費）
- 全球 CDN 加速
- 無限容量

【來源證據】
- refresh-idea.md:274-293

### 7.2 完整遷移方案（無痛，不影響網站）

#### 階段一：準備 R2 和 Worker

**1. 創建 R2 Bucket**
- 名稱：`media-bucket`
- 位置：自動（全球分佈）

**2. 創建 Media Worker**
- 負責從 R2 讀取圖片並返回
- 綁定到 `media.example.com`

**3. 測試上傳**
```bash
# 手動上傳測試圖到 R2
wrangler r2 object put media-bucket/test.jpg --file=test.jpg

# 確認可以訪問
curl -I https://media.example.com/test.jpg
```

【來源證據】
- refresh-idea.md:296-309

#### 階段二：保持 WordPress 目錄結構遷移

【關鍵】R2 裡的目錄結構要和 WordPress 一模一樣

**使用 Rclone（推薦）：**

```bash
# 1. 在 VPS 安裝 Rclone
curl https://rclone.org/install.sh | sudo bash

# 2. 配置 R2
rclone config
# 選擇 S3 compatible
# Endpoint: https://[account-id].r2.cloudflarestorage.com
# 輸入 Access Key 和 Secret

# 3. 測試同步（dry-run）
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:media-bucket/ \
  --dry-run \
  --progress

# 4. 正式同步
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:media-bucket/ \
  --progress
```

**結果：**
```
media-bucket/  (R2 Bucket 根目錄)
├── 2024/
│   ├── 01/
│   │   ├── image1.jpg
│   │   ├── image1-150x150.jpg  (WordPress 縮圖)
│   │   └── image1-300x200.jpg
│   ├── 02/
│   └── 03/
├── 2025/
└── woocommerce_uploads/
```

【來源證據】
- refresh-idea.md:311-331
- refresh-idea.md:1440-1465

#### 階段三：更新圖片 URL

【問題原因】
數據庫裡的 URL 還是指向舊的：
```
https://example.com/wp-content/uploads/2024/01/image.jpg
```

需要改成：
```
https://media.example.com/2024/01/image.jpg
```

【方案成立】
用 WordPress 插件批量替換，安全可靠。

**方法 1：Better Search Replace 插件（推薦）**

1. 安裝插件：Better Search Replace
2. 配置：
   - Search for: `https://example.com/wp-content/uploads/`
   - Replace with: `https://media.example.com/`
   - 選擇表：wp_posts, wp_postmeta
3. **先 Dry Run 預覽**
4. 確認無誤後執行

【來源證據】
- refresh-idea.md:340-358
- refresh-idea.md:1467-1475

**方法 2：WordPress 過濾器（動態替換）**

```php
// functions.php
add_filter('the_content', function($content) {
    return str_replace(
        'https://example.com/wp-content/uploads/',
        'https://media.example.com/',
        $content
    );
});
```

**優缺點：**
- 優點：不改數據庫，安全
- 缺點：每次都要處理，性能略差

【建議】方法 1（數據庫替換）+ 備份

【來源證據】
- refresh-idea.md:359-367

#### 階段四：配置新上傳自動到 R2

**安裝 WP Offload Media 插件：**

配置：
- Provider: S3 Compatible
- Endpoint: `https://[account_id].r2.cloudflarestorage.com`
- Bucket: `media-bucket`
- Access Key: （在 R2 Dashboard 生成）
- Secret: （在 R2 Dashboard 生成）
- ✅ Remove Files From Server（節省 VPS 空間）

**效果：**
- 所有新上傳的圖片自動到 R2
- URL 自動變成 `https://media.example.com/...`
- 可選擇是否刪除本地副本

【來源證據】
- refresh-idea.md:369-383
- refresh-idea.md:1476-1483

### 7.3 R2 目錄結構設計

**推薦結構（保持和 WordPress 一致）：**

```
media-bucket/  (R2 Bucket 根目錄)
├── 2024/
│   ├── 01/
│   │   ├── image1.jpg
│   │   ├── image1-150x150.jpg  (WordPress 縮圖)
│   │   ├── image1-300x200.jpg
│   │   └── image1-1024x768.jpg
│   ├── 02/
│   └── 03/
├── 2025/
│   └── 01/
└── woocommerce_uploads/
```

**為什麼保持一樣？**
- WordPress 生成的 URL 路徑可以直接對應
- 方便批量遷移
- 未來如果要搬回 VPS 也容易

**❌ 不要這樣做：**
- 所有圖片丟在根目錄（難管理）
- 改變目錄結構（會導致 URL 對不上）

【來源證據】
- refresh-idea.md:396-425

### 7.4 Media Worker 配置

**作用：**
1. 接收圖片請求：`https://media.example.com/2024/01/image.jpg`
2. 從 R2 讀取：`media-bucket/2024/01/image.jpg`
3. 返回圖片給用戶

**關鍵功能：**
```typescript
// Media Worker 核心邏輯
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const key = url.pathname.slice(1); // 移除開頭的 /

        // 從 R2 讀取
        const object = await env.MEDIA_BUCKET.get(key);

        if (!object) {
            return new Response('Not Found', { status: 404 });
        }

        return new Response(object.body, {
            headers: {
                'Content-Type': object.httpMetadata.contentType,
                'Cache-Control': 'public, max-age=31536000', // 1 年
                'ETag': object.etag
            }
        });
    }
};
```

【來源證據】
- refresh-idea.md:385-395

### 7.5 漸進式遷移策略（最安全）

【方案成立】
如果網站圖片很多，可以分批遷移：

**Week 1：測試階段**
- 只遷移最近一個月的圖片
- 測試 Media Worker 是否正常
- 檢查網站前端圖片顯示

**Week 2：批量遷移舊圖**
- 遷移過去一年的圖片
- 更新數據庫 URL

**Week 3：清理**
- 確認所有圖片都正常顯示
- 刪除 VPS 上的 uploads 目錄（節省空間）
- 配置新上傳自動到 R2

**Week 4：監控**
- 檢查 R2 流量和費用
- 確認沒有 404 圖片

【來源證據】
- refresh-idea.md:427-448

### 7.6 回退方案（萬一出問題）

1. **保留 VPS 上的圖片備份**（至少一個月）
2. **數據庫 URL 改回去**（用 Better Search Replace 反向操作）
3. **暫時禁用 WP Offload Media 插件**

【來源證據】
- refresh-idea.md:450-456

---

## 8. MySQL 到 D1 同步機制

### 8.1 點解需要同步？

【問題原因】
- Invoice/Quote 系統需要讀取訂單、產品、客戶資料
- AI SEO 系統需要批量處理文章
- 每次打 WordPress API 會慢（500ms-2s）
- VPS 負載高

【方案成立】
用 D1 做數據副本：
- 在 Cloudflare 邊緣節點，全球分佈
- 查詢速度極快（<10ms）
- 免費額度大（每天 500 萬次讀取）
- 支持 SQL，查詢靈活
- Workers 獨立運作，不依賴 WordPress

【來源證據】
- refresh-idea.md:461-473

### 8.2 同步咩數據？

| WordPress 表 | D1 表 | 同步內容 | 更新頻率 |
|--------------|-------|----------|----------|
| wp_posts | sync_posts | 文章、頁面 | 每次發布/更新 |
| wp_postmeta | - | SEO 資訊（整合到 posts 表） | 同上 |
| wc_products | sync_products | 產品資訊 | 產品更新時 |
| wc_orders | sync_orders | 訂單主表 | 每 5 分鐘 |
| wc_order_items | sync_order_items | 訂單項目 | 同上 |
| wp_users | sync_customers | 客戶資訊 | 每小時 |

**不需要同步的：**
- wp_options（配置）
- wp_comments（留言，用 WordPress 處理）
- wp_termmeta, wp_terms（分類標籤，視需求）

【來源證據】
- refresh-idea.md:475-490
- schema.sql:1-153 (完整表結構)

### 8.3 同步觸發方式

#### 方式 1：定時同步（Cron）

**優點：**
- 簡單可靠
- 不依賴 WordPress
- 可以批量處理

**缺點：**
- 有延遲（5 分鐘）

**設置：**
```toml
# wrangler.toml
[triggers]
crons = ["*/5 * * * *"]  # 每 5 分鐘
```

```typescript
// Sync Worker
export default {
    async scheduled(event, env) {
        // 只同步有更新的記錄
        const lastSync = await getLastSyncTime(env.DB);
        const updates = await fetchWordPressUpdates(lastSync);
        await syncToD1(updates, env.DB);
    }
};
```

【來源證據】
- refresh-idea.md:493-507

#### 方式 2：Webhook 即時同步

**優點：**
- 延遲最小（幾秒內）
- 只同步有變化的數據

**缺點：**
- 需要 WordPress 插件配合
- 如果 Webhook 失敗需要重試機制

**設置：**
```php
// WordPress 插件
add_action('woocommerce_update_product', function($product_id) {
    $product = wc_get_product($product_id);

    wp_remote_post('https://worker.example.com/api/sync', [
        'body' => json_encode([
            'type' => 'product',
            'secret' => SYNC_SECRET_KEY,
            'payload' => extract_product_data($product)
        ])
    ]);
});
```

【來源證據】
- refresh-idea.md:509-521
- 現有代碼：wp-d1-sync.php (未包含在讀取檔案中)

#### 推薦：兩者結合

- 重要數據（訂單）用 Webhook 即時同步
- 其他數據用 Cron 定時同步
- Cron 作為兜底，防止 Webhook 失敗

【來源證據】
- refresh-idea.md:523-526

### 8.4 同步邏輯

#### 增量同步（推薦）

只同步有變化的數據：

```typescript
// Sync Worker
async function incrementalSync(env) {
    // 1. D1 記錄上次同步時間
    const lastSync = await env.DB.prepare(
        'SELECT MAX(synced_at) as last FROM sync_log'
    ).first();

    // 2. 查詢 WordPress API：只拿 modified_after 該時間的記錄
    const updates = await fetch(
        `https://origin.example.com/wp-json/wp/v2/posts?modified_after=${lastSync.last}`
    );

    // 3. 更新到 D1
    for (const post of updates) {
        await env.DB.prepare(`
            INSERT OR REPLACE INTO sync_posts (id, title, content, updated_at)
            VALUES (?, ?, ?, ?)
        `).bind(post.id, post.title, post.content, Date.now()).run();
    }

    // 4. 記錄本次同步時間
    await env.DB.prepare(
        'INSERT INTO sync_log (synced_at) VALUES (?)'
    ).bind(Date.now()).run();
}
```

【來源證據】
- refresh-idea.md:528-544

#### 全量同步（初次或修復用）

一次性同步所有數據：
- 適合第一次設置
- 或者數據不一致時修復用

```bash
# 手動觸發全量同步
curl -X POST https://sync-worker.example.com/sync/full \
  -H "Authorization: Bearer YOUR_TOKEN"
```

【來源證據】
- refresh-idea.md:540-544

### 8.5 數據一致性處理

**衝突處理：**
- MySQL 是 **Source of Truth**（唯一真實來源）
- D1 只是副本，有衝突以 MySQL 為準
- 同步方向永遠是 MySQL → D1（單向）

**異常處理：**
```typescript
// 同步失敗記錄到 D1
try {
    await syncProduct(product, env.DB);
} catch (error) {
    await env.DB.prepare(`
        INSERT INTO sync_log (type, status, error_message, created_at)
        VALUES (?, 'failed', ?, ?)
    `).bind('product', error.message, Date.now()).run();

    // 下次同步時重試
}
```

**數據驗證：**
- 定期檢查 D1 和 MySQL 的記錄數量是否一致
- 關鍵字段（如訂單總額）抽查比對

【來源證據】
- refresh-idea.md:546-556

### 8.6 D1 數據結構設計

#### 關鍵原則

**1. 扁平化**
- WordPress 的複雜關聯簡化成扁平結構
- 減少 JOIN 查詢
- 例如：訂單的客戶資訊直接存在 orders 表

**2. 冗餘可接受**
- 為了查詢速度，適當冗餘數據
- 例如：order_items 表同時存 product_name 和 product_id

**3. 添加業務欄位**
- D1 可以加 WordPress 沒有的欄位
- 例如：`seo_score`, `needs_seo_update`, `synced_at`

**4. 索引優化**
- 常用查詢欄位加索引
- 例如：`status`, `created_at`, `customer_email`

【來源證據】
- refresh-idea.md:563-581
- schema.sql:24,35 (索引定義)

#### sync_products 表設計

```sql
CREATE TABLE sync_products (
    id INTEGER PRIMARY KEY,          -- 對應 WordPress Post ID
    sku TEXT,                        -- 產品型號
    title TEXT,                      -- 產品名稱
    content TEXT,                    -- 純文字描述 (供 AI 讀取)
    price REAL,                      -- 售價
    currency TEXT DEFAULT 'HKD',
    stock_status TEXT,               -- 'instock' / 'outofstock'
    categories TEXT,                 -- 分類名稱字串 (e.g., "Network, Camera")
    tags TEXT,                       -- 產品標籤字串
    brand TEXT,                      -- 品牌名稱 (e.g., "Hikvision")
    attributes TEXT,                 -- JSON: 產品屬性
    term_ids TEXT,                   -- JSON: 所有關聯的 Term IDs
    image_url TEXT,                  -- R2 圖片連結
    gallery_images TEXT,             -- JSON: 產品相簿圖片 URLs
    seo_title TEXT,                  -- Rank Math SEO Title
    seo_description TEXT,            -- Rank Math SEO Description
    seo_keywords TEXT,               -- Rank Math Focus Keywords
    ai_optimized BOOLEAN DEFAULT 0,  -- AI 是否已優化
    updated_at INTEGER               -- UNIX Timestamp
);
CREATE INDEX idx_products_search ON sync_products(title, sku, brand);
```

【來源證據】
- schema.sql:2-24

---

## 9. KV 緩存策略

### 9.1 KV 嘅作用

【問題原因】
每次請求都去 WordPress 生成 HTML 會很慢（500ms-2s）。

【方案成立】
把渲染好的 HTML 存入 KV，下次直接返回：
- 首次訪問：Worker → origin.example.com（慢，500ms-2s）
- 再次訪問：Worker → KV（極快，<50ms）
- 降低 VPS 負載 90%+

【來源證據】
- refresh-idea.md:1063-1071
- hooks.server.ts:42-59 (KV 讀取邏輯)

### 9.2 咩應該緩存？

**✅ 應該緩存：**
- 首頁（流量最大）
- 文章頁面（內容不常改變）
- 產品頁面（價格、庫存稍微延遲可接受）
- 分類/標籤頁面
- 靜態頁面（關於我們、聯絡方式）

**❌ 不應該緩存：**
- 購物車頁面（每個用戶不同）
- 結帳頁面（動態內容）
- 我的帳戶頁面（用戶專屬）
- WordPress 後台（/wp-admin）
- 搜索結果頁面（每次搜索不同）

【來源證據】
- refresh-idea.md:1073-1087

### 9.3 緩存 Key 設計

**簡單方案：用 URL 路徑當 Key**

```typescript
// hooks.server.ts:42
const cacheKey = `html:${path}`;

// URL: https://example.com/blog/my-article
// Key: html:/blog/my-article

// URL: https://example.com/product/coffee-beans
// Key: html:/product/coffee-beans
```

【問題原因】
現有代碼有 Bug：
- 存入 KV：`html:${path}` (hooks.server.ts:42)
- Purge 時：`html:${path}${search}` (purge/+server.ts:20)
- 如果有 query params 會 purge 唔到

【方案成立】
統一格式：
```typescript
// 統一加入 search params
const cacheKey = `html:${path}${url.search}`;
```

【來源證據】
- 現有問題分析：Cache Key 不一致
- refresh-idea.md:1089-1108

**進階方案：移動端分離緩存（可選）**

如果桌面版和移動版 HTML 不同：
```typescript
const device = request.headers.get('User-Agent').includes('Mobile')
    ? 'mobile'
    : 'desktop';
const cacheKey = `html:${path}:${device}`;
```

【來源證據】
- refresh-idea.md:1110-1117

### 9.4 TTL（過期時間）策略

**不同類型頁面設定不同 TTL：**

| 頁面類型 | TTL | 理由 |
|---------|-----|------|
| 首頁 | 30 分鐘 | 更新頻繁，展示最新內容 |
| 文章頁 | 2 小時 | 內容穩定，少改動 |
| 產品頁 | 1 小時 | 價格可能調整 |
| 分類頁 | 30 分鐘 | 新產品上架時要快速顯示 |
| 靜態頁 | 24 小時 | 很少變動 |

**現有代碼：**
```typescript
// hooks.server.ts:95
await kv.put(cacheKey, html, { expirationTtl: 3600 * 24 }); // 24 小時
```

【改進方案】根據路徑動態設定：
```typescript
function getTTL(path: string): number {
    if (path === '/') return 1800;              // 首頁 30 分鐘
    if (path.startsWith('/blog/')) return 7200; // 文章 2 小時
    if (path.startsWith('/product/')) return 3600; // 產品 1 小時
    return 86400; // 預設 24 小時
}

await kv.put(cacheKey, html, { expirationTtl: getTTL(path) });
```

【來源證據】
- refresh-idea.md:1119-1136

### 9.5 緩存更新策略

#### 被動過期（簡單）

- 設定 TTL，時間到自動過期
- 下次訪問重新生成並緩存

**優點：**簡單
**缺點：**第一個訪問過期頁面的用戶會等比較久

【來源證據】
- refresh-idea.md:1139-1145

#### 主動清除（推薦）

WordPress 內容更新時立即清除相關緩存：

**1. 文章發布/更新**
- 清除該文章頁面的緩存
- 清除首頁緩存（可能展示最新文章）
- 清除分類頁緩存

**2. 產品更新**
- 清除該產品頁緩存
- 清除商品分類頁緩存

**3. 全站緩存清除**
- 提供管理介面按鈕「清除所有緩存」
- 重大更新（換主題、改設計）時使用

**實現方式：**
```php
// WordPress 插件
add_action('save_post', function($post_id) {
    $permalink = get_permalink($post_id);
    $path = parse_url($permalink, PHP_URL_PATH);

    // 調用 Worker API
    wp_remote_post('https://example.com/api/purge', [
        'body' => json_encode([
            'url' => $permalink,
            'secret' => PURGE_SECRET
        ])
    ]);
});
```

```typescript
// Worker: api/purge/+server.ts
export const POST = async ({ request, platform }) => {
    const { url, secret } = await request.json();

    // 驗證 secret
    if (secret !== platform.env.PURGE_SECRET) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetUrl = new URL(url);
    const cacheKey = `html:${targetUrl.pathname}${targetUrl.search}`;

    // 從 KV 中刪除
    await platform.env.HTML_CACHE.delete(cacheKey);

    return json({ success: true, purged: cacheKey });
};
```

【來源證據】
- refresh-idea.md:1147-1167
- api/purge/+server.ts:1-31 (現有實現)

### 9.6 緩存預熱（可選）

【問題原因】
新文章發布後，第一個訪問者等待時間長（要等 WordPress 生成）。

【方案成立】
不等用戶訪問，提前生成熱門頁面的緩存。

**實現：**
```php
// WordPress 文章發布後
add_action('publish_post', function($post_id) {
    $permalink = get_permalink($post_id);

    // 調用 Worker 預熱
    wp_remote_get($permalink, [
        'headers' => ['X-Warmup' => 'true']
    ]);
});
```

```typescript
// Worker 檢測預熱請求
if (request.headers.get('X-Warmup') === 'true') {
    // 訪問 origin，存入 KV
    const html = await fetchFromOrigin(path);
    await kv.put(cacheKey, html, { expirationTtl: getTTL(path) });
    return new Response('Warmed up', { status: 200 });
}
```

【來源證據】
- refresh-idea.md:1169-1184

### 9.7 緩存監控

**關鍵指標：**

1. **命中率（Hit Rate）**
   - 公式：HIT 次數 / 總請求次數
   - 目標：>80%

2. **MISS 原因分析**
   - 新頁面（正常）
   - TTL 過期（調整 TTL）
   - 緩存被清除（檢查清除邏輯）

3. **熱門頁面**
   - 哪些頁面訪問最多
   - 確保這些頁面緩存效果好

**在 Worker 中添加監控：**
```typescript
// hooks.server.ts
const cacheStatus = cachedHtml ? 'HIT' : 'MISS';

// 記錄到 D1 或 Cloudflare Analytics
await logCacheMetrics(env.DB, {
    path,
    status: cacheStatus,
    timestamp: Date.now()
});

return new Response(html, {
    headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'X-Cache': cacheStatus  // ← 方便診斷
    }
});
```

【來源證據】
- refresh-idea.md:1187-1206
- hooks.server.ts:56,100 (X-Cache header)

### 9.8 KV 成本

**Cloudflare KV 定價（2024）：**

免費額度：
- 每天 100,000 次讀取
- 每天 1,000 次寫入
- 1 GB 存儲

超過免費額度：
- 讀取：$0.50 / 百萬次
- 寫入：$5.00 / 百萬次
- 存儲：$0.50 / GB/月

**成本估算範例：**

假設網站：
- 每天 10,000 次頁面訪問
- 80% 命中率（8,000 次 KV 讀取）
- 每天發布 10 篇文章（10 次寫入）

費用：
- 讀取：8,000 < 100,000（免費）
- 寫入：10 < 1,000（免費）
- 存儲：假設 500 個頁面，每頁 50KB = 25MB（免費）

**結論：一般網站完全在免費額度內。**

【來源證據】
- refresh-idea.md:1208-1233

---

## 10. AI SEO 自動化系統

### 10.1 SEO 自動化需求

【問題原因】
- 手動優化 SEO 人力成本高
- 大量文章需要批量處理
- SEO 標題、描述需要一致的質量
- 關鍵字提取耗時

【方案成立】
用 AI 自動為文章和產品頁面生成：
- SEO 優化標題（50-60 字元，包含關鍵字）
- Meta Description（150-160 字元，吸引點擊）
- 關鍵字列表（5-10 個）
- SEO 分數評估
- 改進建議

【來源證據】
- refresh-idea.md:587-601

### 10.2 完整工作流程

```
文章發布到 WordPress
    ↓
同步到 D1（posts 表）
    ↓
標記 needs_seo_update = TRUE
    ↓
加入 seo_queue 表（待處理佇列）
    ↓
SEO Worker 定時檢查（Cron: 每小時）
    ↓
取出 10 篇優先級最高的文章
    ↓
逐篇調用 Claude API
    ├─ Prompt: "你是專業的 SEO 專家。分析以下文章..."
    ├─ Input: 文章標題 + 前 2000 字元
    └─ Output: JSON { seo_title, meta_description, keywords, seo_score }
    ↓
解析 AI 返回的 JSON
    ↓
更新 D1 的 posts 表
    ├─ seo_title = AI 生成的標題
    ├─ seo_description = AI 生成的描述
    ├─ seo_keywords = AI 關鍵字
    └─ seo_score = AI 評分
    ↓
（可選）寫回 WordPress (Yoast SEO 欄位)
    ↓
標記 needs_seo_update = FALSE
```

【來源證據】
- refresh-idea.md:604-628

### 10.3 SEO Queue（佇列）設計

【問題原因】
點解需要佇列？
- AI API 有速率限制
- 避免一次處理太多，超出預算
- 可以設定優先級
- 失敗可以重試

【方案成立】
**seo_queue 表結構：**
```sql
CREATE TABLE seo_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    priority INTEGER,           -- 1-10（10 最高）
    status TEXT,                -- pending/processing/completed/failed
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at INTEGER,
    processed_at INTEGER
);
```

**處理邏輯：**
```typescript
// SEO Worker (Cron: 每小時)
export default {
    async scheduled(event, env) {
        // 1. 取出 10 筆 pending 且 priority 最高的
        const queue = await env.DB.prepare(`
            SELECT * FROM seo_queue
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT 10
        `).all();

        // 2. 逐筆處理
        for (const item of queue.results) {
            try {
                // 標記為 processing
                await updateStatus(item.id, 'processing');

                // 調用 Claude API
                const result = await optimizeSEO(item.post_id, env);

                // 更新 posts 表
                await updatePostSEO(item.post_id, result, env.DB);

                // 標記為 completed
                await updateStatus(item.id, 'completed');
            } catch (error) {
                // 失敗處理
                const newRetryCount = item.retry_count + 1;
                if (newRetryCount < 3) {
                    // 重試
                    await updateStatus(item.id, 'pending', newRetryCount);
                } else {
                    // 超過 3 次，標記為 failed
                    await updateStatus(item.id, 'failed', newRetryCount, error.message);
                }
            }
        }
    }
};
```

【來源證據】
- refresh-idea.md:644-665

### 10.4 AI Prompt 設計

```typescript
const prompt = `你是專業的 SEO 專家。分析以下文章並生成 SEO 優化內容。

文章標題：${post.title}
文章內容：${post.content.substring(0, 2000)}

請返回 JSON 格式（不要其他文字）：
{
  "seo_title": "優化後的標題（50-60字元，包含關鍵字）",
  "meta_description": "吸引點擊的描述（150-160字元）",
  "keywords": "關鍵字1, 關鍵字2, 關鍵字3, 關鍵字4, 關鍵字5",
  "focus_keyword": "主要關鍵字",
  "seo_score": 85,
  "improvements": [
    "建議1",
    "建議2"
  ]
}`;

// 調用 Claude API
const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
            role: 'user',
            content: prompt
        }]
    })
});

const data = await response.json();
const result = JSON.parse(data.content[0].text);
```

【來源證據】
- refresh-idea.md:667-695

### 10.5 成本控制

**Claude API 費用：**
- 按 token 計費
- 輸入 token：文章內容（取前 2000 字元）≈ 500 tokens
- 輸出 token：SEO 內容 ≈ 200 tokens
- 預估：每篇文章 $0.01-0.03 USD

**控制策略：**

1. **限制處理量**
   - 每小時最多處理 10 篇
   - 每天最多 200 篇
   - 設定月度預算上限（$10）

2. **優先級管理**
   - 高價值頁面優先（產品頁、熱門文章）
   - 低流量頁面可以不處理
   - 避免重複處理已優化的文章

3. **內容長度限制**
   - 只發送文章前 2000 字元給 AI
   - 足夠分析主題和關鍵字
   - 大幅降低 token 消耗

4. **緩存 AI 結果**
   - AI 生成的結果存在 D1
   - 除非文章大幅修改，否則不重新生成
   - 可以設定「6 個月後重新評估」

【來源證據】
- refresh-idea.md:697-725

### 10.6 觸發 SEO 處理的時機

**自動觸發：**
1. **新文章發布** - 優先級 8（高）
2. **文章內容更新** - 優先級 5（中）
3. **SEO 分數低於 50** - 優先級 8（高）
4. **文章發布超過 6 個月未優化** - 優先級 3（低）

**手動觸發：**
1. WordPress 後台按鈕「AI 優化此文章」
2. 批量選擇文章優化
3. 通過 API 觸發

```typescript
// API: POST /api/seo/optimize
export const POST = async ({ request, platform }) => {
    const { post_id, priority = 5 } = await request.json();

    // 加入佇列
    await platform.env.DB.prepare(`
        INSERT INTO seo_queue (post_id, priority, status, created_at)
        VALUES (?, ?, 'pending', ?)
    `).bind(post_id, priority, Date.now()).run();

    return json({ success: true, message: 'Added to SEO queue' });
};
```

【來源證據】
- refresh-idea.md:630-642

### 10.7 SEO 結果應用

**方案 A：寫回 WordPress（推薦）**

將 AI 生成的 SEO 內容更新回 WordPress：
- 更新 Yoast SEO 或 Rank Math 插件的欄位
- 在 WordPress 後台能看到
- 可以手動調整 AI 的建議

```typescript
// 寫回 WordPress
await fetch(`https://origin.example.com/wp-json/wp/v2/posts/${post_id}`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${WP_API_TOKEN}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        meta: {
            '_yoast_wpseo_title': result.seo_title,
            '_yoast_wpseo_metadesc': result.meta_description,
            '_yoast_wpseo_focuskw': result.focus_keyword
        }
    })
});
```

**方案 B：只存在 D1（簡化版）**

不寫回 WordPress，只在 D1 保存：
- 減少對 WordPress 的寫入操作
- 通過 Workers 直接讀取 D1 渲染頁面時使用
- 缺點：WordPress 後台看不到

【來源證據】
- refresh-idea.md:727-741

---

## 11. Invoice 同 Quotation 系統

### 11.1 系統需求

【問題原因】
- WordPress/WooCommerce 缺少專業的 Invoice/Quote 功能
- 需要快速生成報價單俾客戶
- 訂單完成後自動生成 Invoice
- PDF 格式專業、可下載

【方案成立】
用 D1 + Workers 實現：
- 從 D1 讀取訂單數據（極快）
- 生成 Invoice/Quote PDF
- 上傳到 R2 存儲
- 返回下載連結

**優勢：**
- 不依賴 WordPress，獨立系統
- 可以自定義格式和邏輯
- PDF 生成在 Cloudflare 邊緣
- 費用低

【來源證據】
- refresh-idea.md:769-799

### 11.2 Invoice 生成流程

```
客戶請求 Invoice（或後台手動生成）
    ↓
POST /api/invoice/generate
{ "order_id": 123 }
    ↓
Invoice Worker 接收
    ↓
從 D1 查詢訂單資料 (orders 表)
    ↓
從 D1 查詢訂單項目 (order_items 表)
    ↓
生成唯一 Invoice 號碼
    ├─ 查詢本月最後一個號碼
    ├─ 序號 +1
    └─ 格式：INV-202501-0001
    ↓
創建 Invoice HTML
    ├─ Header: 公司 Logo + 資訊
    ├─ Invoice Info: 號碼、日期、訂單號
    ├─ Bill To: 客戶資訊
    ├─ Items Table: 產品列表
    └─ Summary: 小計、稅、總額
    ↓
轉換成 PDF
    ├─ 方案 A: 第三方 PDF API (html2pdf.app)
    ├─ 方案 B: Cloudflare Browser Rendering
    └─ 方案 C: 只生成 HTML（客戶自行打印）
    ↓
上傳 PDF 到 R2
    └─ 路徑: invoices/INV-202501-0001.pdf
    ↓
記錄到 D1 invoices 表
    ↓
返回下載連結
{
  "invoice_number": "INV-202501-0001",
  "pdf_url": "https://documents.example.com/invoices/INV-202501-0001.pdf"
}
```

【來源證據】
- refresh-idea.md:800-829

### 11.3 Invoice 號碼生成規則

**格式設計：**
```
INV-YYYYMM-NNNN

例如：
INV-202501-0001  (2025年1月第1號)
INV-202501-0002  (2025年1月第2號)
INV-202502-0001  (2025年2月第1號，重新開始)
```

**為什麼這樣設計：**
- 容易識別月份（方便對帳）
- 每月重新編號（避免號碼過大）
- 有固定前綴（INV-）便於區分文件類型

**生成邏輯：**
```typescript
async function generateInvoiceNumber(env) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 查詢本月最後一個號碼
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
```

【來源證據】
- refresh-idea.md:833-853

### 11.4 PDF 生成方案

#### 方案 A：第三方 PDF API（推薦新手）

**服務選項：**
- **html2pdf.app** - 簡單易用
- **PDFShift** - 功能強大
- **API2PDF** - 支持多種引擎

**優點：**
- 開箱即用
- 支持複雜 CSS 和字體
- 按需付費（$0.001-0.01/次）

**使用方式：**
```typescript
const htmlContent = generateInvoiceHTML(invoiceData);

const pdfResponse = await fetch('https://api.html2pdf.app/v1/generate', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.HTML2PDF_API_KEY
    },
    body: JSON.stringify({
        html: htmlContent,
        options: {
            format: 'A4',
            printBackground: true
        }
    })
});

const pdfBlob = await pdfResponse.blob();

// 上傳到 R2
await env.BUSINESS_DOCUMENTS.put(
    `invoices/${invoiceNumber}.pdf`,
    pdfBlob,
    { httpMetadata: { contentType: 'application/pdf' } }
);
```

【來源證據】
- refresh-idea.md:855-877

#### 方案 B：Cloudflare Browser Rendering（進階）

Cloudflare 官方的瀏覽器渲染服務：
- 在邊緣運行 Chromium
- 可以將網頁轉成 PDF
- 需要付費計劃（Workers Paid Plan）

**優點：**
- 完全在 Cloudflare 生態內
- 速度快，全球分佈

【來源證據】
- refresh-idea.md:878-893

#### 方案 C：只生成 HTML（免費）

如果不想處理 PDF：
- 生成 HTML Invoice
- 存到 R2
- 客戶在瀏覽器打印成 PDF

**優點：**免費、實現簡單
**缺點：**不夠正式

【來源證據】
- refresh-idea.md:894-909

### 11.5 Invoice HTML 模板設計

**關鍵元素：**

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 40px; }
        .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .total { font-size: 1.2em; font-weight: bold; text-align: right; }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <img src="logo.png" alt="Company Logo" width="200">
        <h1>INVOICE</h1>
    </div>

    <!-- Invoice Info -->
    <div class="invoice-info">
        <div>
            <strong>Invoice Number:</strong> INV-202501-0001<br>
            <strong>Invoice Date:</strong> 2025-01-10<br>
            <strong>Due Date:</strong> 2025-02-10
        </div>
        <div>
            <strong>Order Number:</strong> #12345<br>
            <strong>Order Date:</strong> 2025-01-08
        </div>
    </div>

    <!-- Bill To -->
    <div>
        <strong>Bill To:</strong><br>
        Customer Name<br>
        customer@email.com<br>
        Address Line 1<br>
        City, Country
    </div>

    <!-- Items Table -->
    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Product A</td>
                <td>SKU-001</td>
                <td>2</td>
                <td>$50.00</td>
                <td>$100.00</td>
            </tr>
        </tbody>
    </table>

    <!-- Summary -->
    <div class="total">
        <p>Subtotal: $100.00</p>
        <p>Tax (10%): $10.00</p>
        <p>Shipping: $5.00</p>
        <p><strong>Total: $115.00</strong></p>
    </div>

    <!-- Footer -->
    <div style="margin-top: 40px; font-size: 0.9em; color: #666;">
        <p>Payment Terms: Net 30</p>
        <p>Bank Account: XXXX-XXXX-XXXX</p>
        <p>Thank you for your business!</p>
    </div>
</body>
</html>
```

【來源證據】
- refresh-idea.md:911-952

### 11.6 Quotation 系統差異

**與 Invoice 的主要差異：**

| 項目 | Invoice | Quotation |
|------|---------|-----------|
| 基於 | 已完成訂單 | 客戶詢價 |
| 狀態 | pending/paid/cancelled | draft/sent/accepted/rejected |
| 必須欄位 | Order ID | 客戶 Email |
| 有效期 | 無（已完成交易） | 有（例如 30 天） |
| 轉換 | 不可轉換 | 可以轉成訂單 |

**Quotation 特殊功能：**

1. **手動創建產品列表**
   - 不基於現有訂單
   - 客戶選擇產品和數量
   - 後端自動從 D1 products 表獲取最新價格

2. **有效期管理**
   - 設定 `valid_until` 欄位
   - 過期後顯示「此報價已過期」
   - 可以延長有效期

3. **接受/拒絕流程**
   - 生成唯一連結：`https://example.com/quote/QT-202501-0001`
   - 客戶點擊「接受」→ 狀態改為 accepted
   - 可以自動創建 WooCommerce 訂單

【來源證據】
- refresh-idea.md:954-986

### 11.7 D1 表結構

```sql
-- invoices 表
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,     -- INV-202501-0001
    order_id INTEGER,               -- 關聯 orders 表
    customer_email TEXT,
    total REAL,
    status TEXT,                    -- pending/paid/cancelled
    issued_at INTEGER,
    due_at INTEGER,
    paid_at INTEGER,
    pdf_path TEXT,                  -- R2: invoices/INV-202501-0001.pdf
    created_at INTEGER
);

-- quotations 表
CREATE TABLE quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_number TEXT UNIQUE,       -- QT-202501-0001
    customer_email TEXT,
    customer_name TEXT,
    items TEXT,                     -- JSON: 產品列表
    subtotal REAL,
    tax REAL,
    total REAL,
    status TEXT,                    -- draft/sent/accepted/rejected
    valid_until INTEGER,
    notes TEXT,
    pdf_path TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
```

【來源證據】
- refresh-idea.md:988-1014
- schema.sql:94-130 (完整表結構)

### 11.8 API 設計

```typescript
// Invoice API
POST /api/invoice/generate
Request: { order_id: 123 }
Response: { invoice_number, pdf_url }

GET /api/invoice/{invoice_number}
Response: { invoice 資料, items[] }

GET /api/invoices?customer_email=xxx&status=pending
Response: { invoices: [...] }

PATCH /api/invoice/{invoice_number}/status
Request: { status: "paid", paid_at: timestamp }
Response: { success: true }

// Quotation API
POST /api/quotation/generate
Request: {
  customer_email,
  customer_name,
  items: [
    { product_id: 1, quantity: 2 },
    { product_id: 5, quantity: 1 }
  ],
  valid_days: 30,
  notes: "特殊折扣 10%"
}
Response: { quote_number, pdf_url, total }

GET /api/quotation/{quote_number}
Response: { quote 資料 }

PATCH /api/quotation/{quote_number}/accept
Response: { success, order_id (如果自動創建訂單) }
```

【來源證據】
- refresh-idea.md:1016-1057

---

## 12. 完整部署順序

### 12.1 前期準備（第 1 天）

#### 1. 備份現有網站

【問題原因】
部署過程可能出錯，需要隨時回退。

【方案成立】
完整備份所有數據：

```bash
# 備份 WordPress 數據庫
mysqldump -u root -p wordpress_db > backup_$(date +%Y%m%d).sql

# 備份 wp-content 目錄
tar -czf wp-content-backup_$(date +%Y%m%d).tar.gz /var/www/wordpress/wp-content

# 測試恢復備份
mysql -u root -p wordpress_db_test < backup_$(date +%Y%m%d).sql
```

【來源證據】
- refresh-idea.md:1242-1247

#### 2. 準備 Cloudflare 帳號

- 註冊 Cloudflare 帳號
- 添加域名到 Cloudflare
- 將 DNS Name Server 改到 Cloudflare（等待生效，24 小時內）

【來源證據】
- refresh-idea.md:1249-1252

#### 3. 安裝必要工具

```bash
# 本機安裝 Node.js 和 npm
# https://nodejs.org/

# 安裝 Wrangler CLI
npm install -g wrangler

# 登入 Wrangler
wrangler login
```

【來源證據】
- refresh-idea.md:1254-1257

### 12.2 基礎設施建置（第 2-3 天）

#### 步驟 1：創建 Cloudflare 資源

```bash
# 創建 D1 數據庫
wrangler d1 create wordpress-data
# 記下返回的 database_id

# 創建 KV Namespace
wrangler kv:namespace create "HTML_CACHE"
wrangler kv:namespace create "HTML_CACHE" --preview
# 記下 namespace_id
```

**在 Dashboard 創建 R2 Bucket：**
- R2 → Create Bucket
- 名稱：`media-bucket`
- 名稱：`business-documents`

【來源證據】
- refresh-idea.md:1260-1276

#### 步驟 2：初始化 D1 數據庫

```bash
# 執行建表 SQL
wrangler d1 execute wordpress-data --file=schema.sql

# 驗證表已創建
wrangler d1 execute wordpress-data \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

【來源證據】
- refresh-idea.md:1278-1287

#### 步驟 3：配置 DNS

在 Cloudflare Dashboard → DNS：

| 類型 | 名稱 | 內容 | 代理 |
|------|------|------|------|
| A | origin | 15.235.199.194 | 🔘 灰雲 |
| CNAME | @ | example.com | 🟠 橙雲 |
| CNAME | www | example.com | 🟠 橙雲 |
| CNAME | media | media.example.com | 🟠 橙雲 |

等待 DNS 生效：
```bash
dig origin.example.com
```

【來源證據】
- refresh-idea.md:1289-1299

### 12.3 VPS WordPress 配置（第 4 天）

#### 步驟 1：配置 origin 子域名

**創建 Nginx 配置：**
```bash
sudo nano /etc/nginx/sites-available/origin.example.com
```

```nginx
server {
    server_name origin.example.com;

    # 只允許 Cloudflare IP 訪問
    allow 173.245.48.0/20;
    allow 103.21.244.0/22;
    # ... (更多 Cloudflare IP)
    deny all;

    root /var/www/wordpress;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
    }
}
```

```bash
# 啟用配置
sudo ln -s /etc/nginx/sites-available/origin.example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

【來源證據】
- refresh-idea.md:1300-1309

#### 步驟 2：配置 WordPress

編輯 `wp-config.php`：
```php
define('WP_HOME', 'https://example.com');
define('WP_SITEURL', 'https://origin.example.com');

// 信任 Cloudflare IP
if (isset($_SERVER['HTTP_CF_CONNECTING_IP'])) {
    $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_CF_CONNECTING_IP'];
}
```

【來源證據】
- refresh-idea.md:1311-1315

#### 步驟 3：安裝必要插件

- **JWT Authentication for WP REST API** - API Token
- **WP Offload Media** - 圖片上傳到 R2
- **Yoast SEO** 或 **Rank Math** - SEO 管理

【來源證據】
- refresh-idea.md:1317-1321

#### 步驟 4：生成 API Tokens

```bash
# WordPress JWT Token
curl -X POST https://origin.example.com/wp-json/jwt-auth/v1/token \
  -d "username=admin&password=你的密碼"
# 記下返回的 token

# WooCommerce API Keys
# 在 WordPress 後台：WooCommerce → Settings → Advanced → REST API
# 創建新 Key，權限：Read/Write
# 記下 Consumer Key 和 Consumer Secret
```

【來源證據】
- refresh-idea.md:1323-1334

### 12.4 部署 Workers（第 5-6 天）

#### 1. 配置 wrangler.toml

```toml
name = "cloudflare-wordpress"
pages_build_output_dir = ".svelte-kit/cloudflare"

[[d1_databases]]
binding = "DB"
database_name = "wordpress-data"
database_id = "a061682a-515f-4fde-9b80-273632eb0e04"

[[kv_namespaces]]
binding = "HTML_CACHE"
id = "695adac89df4448e81b9ffc05f639491"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "media-bucket"

# ❌ 不要存明文 Secret
# 用 wrangler secret put 設定
```

【來源證據】
- wrangler.toml:1-15

#### 2. 設定 Secrets

```bash
cd cloudflare-wordpress

wrangler secret put SYNC_SECRET_KEY
# 輸入：Lui@63006021

wrangler secret put PURGE_SECRET
# 輸入：你的 secure key

wrangler secret put ANTHROPIC_API_KEY
# 輸入：sk-ant-xxx
```

【來源證據】
- refresh-idea.md:1380-1388

#### 3. 修改 ORIGIN 變數

```typescript
// src/hooks.server.ts:6
const ORIGIN = 'https://origin.example.com';  // ← 改呢行
```

【來源證據】
- 現有問題分析：hooks.server.ts:6

#### 4. 部署到 Cloudflare Pages

```bash
npm install
npm run build

wrangler pages deploy .svelte-kit/cloudflare --project-name=example-com
```

【來源證據】
- refresh-idea.md:1336-1377

#### 5. 測試部署

```bash
# 測試 origin 是否直達 VPS
curl -I https://origin.example.com
# 應該直接返回 WordPress，冇 Worker 處理

# 測試主域名
curl -I https://example.com
# 應該有 X-Cache: MISS (第一次)

curl -I https://example.com
# 應該有 X-Cache: HIT (第二次)

# 測試是否有 Loop
# 如果返回 Error 1001 或無限重定向 = 有 Loop
```

【來源證據】
- refresh-idea.md:1362-1377

### 12.5 WordPress 圖片遷移到 R2（第 7-8 天）

#### 步驟 1：安裝 Rclone

```bash
# 在 VPS 安裝
curl https://rclone.org/install.sh | sudo bash

# 配置 R2
rclone config
# 選擇 S3 compatible
# Endpoint: https://[account-id].r2.cloudflarestorage.com
# 輸入 Access Key 和 Secret
```

【來源證據】
- refresh-idea.md:1440-1449

#### 步驟 2：同步圖片到 R2

```bash
# 先測試（dry-run）
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:media-bucket/ \
  --dry-run \
  --progress

# 確認無誤後正式同步
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:media-bucket/ \
  --progress
```

【來源證據】
- refresh-idea.md:1451-1465

#### 步驟 3：更新數據庫 URL

安裝 **Better Search Replace** 插件：
- Search for: `https://example.com/wp-content/uploads/`
- Replace with: `https://media.example.com/`
- 選擇所有表
- **先 Dry Run 預覽**
- 確認無誤後執行

【來源證據】
- refresh-idea.md:1467-1475

#### 步驟 4：配置 WP Offload Media

在 WordPress 安裝 WP Offload Media 插件：
- Provider: S3 Compatible
- Endpoint, Bucket, Keys
- ✅ Remove Files From Server

測試：上傳新圖片，檢查是否自動到 R2

【來源證據】
- refresh-idea.md:1476-1483

### 12.6 測試和驗證（第 9 天）

#### 1. DNS 和域名測試

```bash
dig example.com
dig origin.example.com
dig media.example.com

curl -I https://example.com
curl -I https://origin.example.com
curl -I https://media.example.com
```

【來源證據】
- refresh-idea.md:1518-1529

#### 2. Worker 功能測試

```bash
# 測試緩存
curl -I https://example.com/sample-post/
curl -I https://example.com/sample-post/
# 第二次應該是 HIT

# 測試繞過緩存的路徑
curl -I https://example.com/wp-admin/
# 應該直接到 origin，沒有 X-Cache
```

【來源證據】
- refresh-idea.md:1532-1546

#### 3. 圖片訪問測試

```bash
curl -I https://media.example.com/2024/01/test-image.jpg

# 在瀏覽器檢查：
# - 所有圖片是否正常顯示
# - Network tab 檢查圖片 URL 是否指向 media.example.com
# - 沒有 404 錯誤
```

【來源證據】
- refresh-idea.md:1549-1558

#### 4. 數據同步測試

```bash
wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) FROM sync_products"

wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) FROM sync_posts"

# 數量應該和 WordPress 數據庫一致
```

【來源證據】
- refresh-idea.md:1561-1574

#### 5. 性能測試

使用工具：
- **GTmetrix** - https://gtmetrix.com
- **PageSpeed Insights** - https://pagespeed.web.dev

**目標指標：**
- 首次載入 TTFB < 500ms
- 完全載入時間 < 2s
- Lighthouse Performance > 90

【來源證據】
- refresh-idea.md:1605-1615

### 12.7 上線切換（第 10 天）

#### 最終檢查清單

- [ ] 所有 Workers 部署完成並測試通過
- [ ] DNS 設置正確（origin 是灰雲，其他是橙雲）
- [ ] 圖片全部遷移到 R2 並正常顯示
- [ ] 數據同步正常運行
- [ ] 備份已完成並測試可恢復
- [ ] Secrets 已設定（不在 wrangler.toml）

【來源證據】
- refresh-idea.md:1663-1671

#### 切換步驟

1. **最後一次完整備份**
2. **Custom Domain 綁定**（在 Cloudflare Pages）
3. **測試主域名**：`https://example.com`
4. **監控第一小時**

【來源證據】
- refresh-idea.md:1673-1699

#### 回退計劃（萬一出問題）

1. 解除 Workers 的 Custom Domain 綁定
2. DNS 改回直接指向 VPS
3. 恢復 WordPress 配置
4. 調查問題，修復後再次嘗試

【來源證據】
- refresh-idea.md:1701-1706

---

## 13. 監控同告警

### 13.1 Cloudflare Analytics

在 Cloudflare Dashboard 查看：
- 流量統計
- 緩存命中率
- Worker 執行次數
- 錯誤率

【來源證據】
- refresh-idea.md:1631-1638

### 13.2 關鍵告警

設定告警：
- 同步失敗率 > 10%
- SEO 處理失敗 > 5 次
- Worker 錯誤率 > 1%
- D1 查詢超時

可以用：
- Cloudflare Notifications
- 或整合 Slack/Discord Webhook

【來源證據】
- refresh-idea.md:1649-1660

---

## 14. 故障排查手冊

### 14.1 Worker Loop 問題

**症狀：**
- Error 1001
- 無限重定向
- Worker 執行次數異常高

**診斷：**
```bash
curl -I https://example.com
# 如果返回 Error 1001 = Loop
```

**解決方案：**

1. 檢查 DNS：`origin.example.com` 必須是灰雲
2. 檢查 Worker 代碼：確保改寫 hostname 到 `origin.example.com`
3. 檢查路由：Workers Routes 不應該包含 `origin.example.com/*`

【來源證據】
- refresh-idea.md:1711-1752

### 14.2 圖片遷移後 404

**症狀：**
- 部分圖片不顯示
- Browser Console 顯示 404

**診斷：**
```bash
# 檢查圖片是否在 R2
wrangler r2 object get media-bucket/2024/01/missing-image.jpg

# 檢查數據庫 URL 是否正確替換
# 在 WordPress 數據庫：
SELECT post_content FROM wp_posts
WHERE post_content LIKE '%wp-content/uploads%'
LIMIT 10;
```

**解決方案：**

1. 用 Rclone 再次同步
2. 重新替換數據庫 URL
3. 檢查目錄結構是否一致

【來源證據】
- refresh-idea.md:1754-1799

### 14.3 數據同步失敗

**症狀：**
- WordPress 新增內容但 D1 沒有
- Sync Log 顯示 failed

**診斷：**
```bash
# 檢查同步狀態
curl https://sync-worker.example.com/sync/status

# 檢查 D1 sync_log 表
wrangler d1 execute wordpress-data \
  --command="SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 10"
```

**常見原因：**

1. **API Token 過期**
   ```bash
   wrangler secret put WP_API_TOKEN
   ```

2. **WooCommerce API Keys 錯誤**
   ```bash
   wrangler secret put WC_KEY
   wrangler secret put WC_SECRET
   ```

3. **REST API 被禁用**
   ```bash
   curl https://origin.example.com/wp-json/wp/v2/posts
   ```

4. **Cloudflare IP 被防火牆擋住**
   - 檢查 Nginx 錯誤日誌
   - 確認 Cloudflare IP 白名單完整

【來源證據】
- refresh-idea.md:1800-1877

### 14.4 SEO Worker AI API 失敗

**症狀：**
- SEO 佇列卡在 processing
- seo_queue 很多 failed

**常見原因：**

1. **API Key 錯誤**
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```

2. **API 速率限制**
   - 降低 Cron 頻率
   - 減少每批處理數量

3. **AI 返回格式錯誤**
   - 改進 prompt
   - 加強 JSON 解析

4. **文章內容太長**
   - 限制發送長度到 2000 字元

【來源證據】
- refresh-idea.md:1878-1940

### 14.5 緩存沒有清除

**症狀：**
- WordPress 更新內容但前端還是舊的

**診斷：**
```bash
# 檢查 KV
wrangler kv:key get --binding=HTML_CACHE "/blog/my-post"
```

**常見原因：**

1. **WordPress 插件沒有觸發**
   - 檢查 error log
   - 手動測試清除 API

2. **Cache Key 不匹配**
   - 統一 key 格式（加或不加尾斜線）

3. **TTL 太長**
   - 降低 TTL

4. **多個 KV key 需要清除**
   - 清除時要清除相關頁面（首頁、分類頁）

【來源證據】
- refresh-idea.md:2007-2072

### 14.6 性能沒有預期好

**症狀：**
- TTFB 還是很慢（> 1s）
- 緩存命中率低（< 50%）

**常見原因：**

1. **緩存命中率低**
   - 移除 URL 追蹤參數（utm_source, fbclid）

2. **WordPress 本身慢**
   - 安裝 Redis Object Cache
   - 禁用不必要插件

3. **圖片未優化**
   - 用圖片優化插件
   - 啟用 lazy loading

4. **TTL 設置不當**
   - 調整不同頁面的 TTL

5. **沒有預熱緩存**
   - 文章發布後自動預熱

【來源證據】
- refresh-idea.md:2074-2156

---

## 15. 總結

### 15.1 系統優勢

**核心優勢：**

1. **性能極佳**
   - 全球邊緣節點緩存
   - TTFB < 100ms（緩存命中時）
   - 無限擴展能力

2. **成本低廉**
   - Cloudflare 免費額度很大
   - R2 無出站流量費
   - 降低 VPS 負載

3. **靈活擴展**
   - 新功能用 Workers 實現
   - 不影響 WordPress 核心

4. **AI 加持**
   - SEO 自動化省人力
   - 批量處理大量內容

5. **業務整合**
   - Invoice/Quote 系統
   - 數據分析

【來源證據】
- refresh-idea.md:2281-2305

### 15.2 適用場景

**✅ 特別適合：**
- 電商網站（WooCommerce）
- 內容網站（大量文章）
- 全球訪問的網站
- 需要高性能的網站
- 預算有限但要求高的項目

**❌ 不太適合：**
- 即時性要求極高的應用（股票交易）
- 高度動態的應用（社交網絡）
- 需要即時數據一致性的系統

【來源證據】
- refresh-idea.md:2310-2325

### 15.3 維護要點

**日常維護：**
- 每週檢查同步狀態
- 每月檢查 SEO 處理進度
- 定期備份 D1 和 R2
- 監控 API 費用

**定期更新：**
- Cloudflare Workers 代碼
- WordPress 和插件
- Cloudflare IP 範圍

**優化迭代：**
- 根據 Analytics 調整緩存策略
- 優化 AI Prompt 提高 SEO 質量
- 根據用戶反饋改進 Invoice 模板

【來源證據】
- refresh-idea.md:2327-2344

---

## 附錄

### A. 重要連結

- Cloudflare Dashboard: https://dash.cloudflare.com
- Cloudflare D1 Docs: https://developers.cloudflare.com/d1/
- Cloudflare R2 Docs: https://developers.cloudflare.com/r2/
- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- SvelteKit Docs: https://kit.svelte.dev/
- Anthropic API Docs: https://docs.anthropic.com/

### B. 文檔更新紀錄

| 日期 | 版本 | 更新內容 |
|------|------|----------|
| 2025-01-10 | 2.0 | 整合 refresh-idea.md 所有內容 |
| 2025-01-09 | 1.0 | 初始版本 |

---

【來源證據】
本文檔整合自以下來源：
- refresh-idea.md (完整系統設計，2350 行)
- 現有代碼分析（hooks.server.ts, api/sync/+server.ts, schema.sql, wrangler.toml）
- 現有問題分析（5 個核心問題）
- CLAUDE.md（開發規範）
