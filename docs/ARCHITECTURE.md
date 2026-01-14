# 系統架構

> 更新日期：2025-01-10 | 專案：Cloudflare WordPress Accelerator

---

## 概覽

呢個系統用 **Cloudflare 邊緣計算** 加速 WordPress 網站，包括：
- 全球 CDN 邊緣緩存（KV）
- R2 無限圖片存儲（無出站流量費）
- D1 全球分佈數據庫（WordPress 數據副本）
- 實時數據同步（WordPress → D1 < 1秒）

**核心目標：**
- TTFB < 100ms（緩存命中）
- 降低 VPS 負載 90%+

```
用戶訪問 aplus-tech.com.hk/product/coffee
    ↓
Cloudflare DNS → Main Worker
    ↓
檢查 KV Cache (html:product-coffee)
    ├─ HIT → 返回緩存 HTML (<100ms) ✅
    └─ MISS ↓
        fetch("https://origin.aplus-tech.com.hk/product/coffee")
            ↓
        VPS WordPress 生成 HTML (500ms)
            ↓
        替換圖片 URL (從 D1 media_mapping 讀取)
            ↓
        存入 KV (TTL: 1h)
            ↓
        返回給用戶
```

**關鍵檔案：** [hooks.server.ts:42-101](../cloudflare-wordpress/src/hooks.server.ts#L42-L101)

---

### 2. 數據同步流程

```
WordPress 儲存產品
    ↓
wp-d1-sync.php Hook 觸發
    ↓
POST https://cloudflare-9qe.pages.dev/api/sync
    ↓
Sync Worker 接收
    ├─ 驗證 Secret Key ✅
    ├─ 上傳圖片到 R2 (語義化路徑: products/{brand}/{filename})
    ├─ 記錄到 D1 media_mapping
    └─ 寫入 D1 sync_products
    ↓
返回成功 { success: true, r2_data: {...} }
    ↓
WordPress 更新 post_meta (_cloudflare_r2_url)
```

**關鍵檔案：**
- [api/sync/+server.ts](../cloudflare-wordpress/src/routes/api/sync/+server.ts)
- [wp-d1-sync.php](../Wordpress%20Plugin/wp-d1-sync.php)

---

### 3. R2 圖片遷移流程

```
產品圖片 URL: https://origin.aplus-tech.com.hk/wp-content/uploads/2024/coffee.jpg
    ↓
同步時下載圖片
    ↓
上傳到 R2: products/brand-name/coffee.jpg
    ↓
記錄到 D1 media_mapping:
  original_url → r2_path
    ↓
Main Worker 替換 HTML 圖片 URL:
  https://media.aplus-tech.com.hk/products/brand-name/coffee.jpg
```

**關鍵檔案：** [api/sync/+server.ts:6-68](../cloudflare-wordpress/src/routes/api/sync/+server.ts#L6-L68)

---

## 資料夾結構

```
Cloudflare/
├── .ai/                          # AI 開發規範
│   ├── CLAUDE.md                 # Sonnet 規則
│   ├── CLAUDE_OPUS.md            # Opus 規則（架構師）
│   ├── context.yaml              # 專案設定
│   └── IDEAS.md                  # 設計方案記錄
│
├── cloudflare-wordpress/         # SvelteKit 專案
│   ├── src/
│   │   ├── hooks.server.ts       # Main Worker 邏輯
│   │   └── routes/
│   │       └── api/
│   │           └── sync/+server.ts   # 同步 API
│   ├── wrangler.toml             # Cloudflare 配置
│   └── svelte.config.js
│
├── Wordpress Plugin/             # WordPress 插件
│   ├── wp-d1-sync.php            # D1 同步插件
│   └── wp-cache-purge.php        # 緩存清除插件
│
├── docs/                         # 文檔
│   ├── ARCHITECTURE.md           # 本文件（架構概覽）
│   └── API_SPEC.md               # API 規範
│
├── task.md                       # 詳細任務清單（680 行）
├── implementation_plan.md        # 實施計劃（2216 行）
├── architecture_design.md        # 完整架構設計（技術細節）
├── CHANGELOG.md                  # 改動記錄
└── PROGRESS.md                   # 進度追蹤
```

---

## 域名配置

| 域名 | DNS 狀態 | 指向 | 用途 |
|------|---------|------|------|
| `aplus-tech.com.hk` | 🟠 橙雲 (Proxied) | Workers | 主站（走 Worker） |
| `origin.aplus-tech.com.hk` | 🔘 灰雲 (DNS Only) | 15.235.199.194 | 內部子域名（直達 VPS） |
| `media.aplus-tech.com.hk` | 🟠 橙雲 (Proxied) | R2 Bucket | 媒體文件域名 |
| `cloudflare-9qe.pages.dev` | - | Cloudflare Pages | Worker 部署網址 |

**關鍵概念：**
- 🟠 橙雲：流量經過 Cloudflare，可用 Workers
- 🔘 灰雲：直接解析到 IP，防止 Worker Loop

---

## D1 表結構

| 表名 | 用途 | 關鍵欄位 |
|------|------|---------|
| `sync_products` | WordPress 產品數據 | id, title, slug, price, brand |
| `sync_posts` | WordPress 文章數據 | id, title, content, seo_title |
| `sync_orders` | WooCommerce 訂單 | id, customer_email, total |
| `media_mapping` | 圖片 URL 對應表 | original_url, r2_path |
| `invoices` | Invoice 記錄（Phase 5） | invoice_number, pdf_path |
| `quotations` | Quotation 記錄（Phase 5） | quote_number, pdf_path |
| `ai_seo_queue` | AI SEO 隊列（Phase 6） | post_id, seo_title, status |

**完整 Schema：** [schema.sql](../cloudflare-wordpress/schema.sql)

---

## 效能指標

### 當前狀態
| 指標 | 目標 | 實際 | 狀態 |
|------|------|------|------|
| KV 緩存命中率 | >80% | ~80% | ✅ |
| TTFB（緩存命中） | <100ms | <100ms | ✅ |
| TTFB（首次載入） | <500ms | ~500ms | ✅ |
| D1 同步延遲 | <1s | <1s | ✅ |
| R2 圖片遷移 | 100% | 100% | ✅ |

---

## 詳細文檔

### 技術文檔
- **[完整架構設計](../architecture_design.md)** - 所有技術細節、決策理由、流程圖
- **[實施計劃](../implementation_plan.md)** - 分階段實施步驟、代碼範例
- **[API 規範](./API_SPEC.md)** - 所有 API 端點規格

### 進度追蹤
- **[任務清單](../task.md)** - Phase 0-8 詳細任務清單（680 行）
- **[進度追蹤](../PROGRESS.md)** - 當前進度、待辦事項
- **[改動記錄](../CHANGELOG.md)** - 所有改動歷史記錄

### AI 規範
- **[.ai/CLAUDE.md](../.ai/CLAUDE.md)** - Sonnet 開發規則
- **[.ai/CLAUDE_OPUS.md](../.ai/CLAUDE_OPUS.md)** - Opus 架構設計規則
- **[.ai/context.yaml](../.ai/context.yaml)** - 專案設定檔

---

## 下一步開發

### Phase 4.7：修復安全和性能問題（進行中）
- 🔴 移除 `wrangler.toml` 明文密碼
- 🟠 優化 `media_mapping` 查詢（加 KV Cache）
- 🟠 並行上傳圖片（`Promise.all()`）
- 🟠 加入錯誤重試機制

### Phase 5：Invoice/Quotation 系統（待開始）
- PDF 生成（HTML → PDF）
- R2 存儲商業文檔
- 自動編號系統

### Phase 6：AI SEO 自動化系統（待開始）
- Claude API 生成 SEO 內容
- Cron Worker 定時處理
- 自動寫回 WordPress

---

**最後更新：2025-01-10**