# System Architecture Design: WordPress + Cloudflare Hybrid
> **Project**: High-Performance SEO E-commerce Automation
> **Stack**: WordPress (Backend) + Cloudflare (Workers, D1, R2, KV, AI, Pages/SvelteKit)

這份文檔詳細記錄了系統的架構設計、數據流向、資料庫結構以及關鍵模組的邏輯。

## 1. 核心架構概覽 (High-Level Architecture)

系統採用 **「混合雲架構 (Hybrid Cloud Architecture)」**：
*   **WordPress (Origin)**: 作為「數據源頭 (Source of Truth)」和「金流核心」。負責管理產品原始資料、處理複雜的 WooCommerce 結帳流程、以及用戶的最終認證。
*   **Cloudflare (Edge)**: 作為「大腦 (Brain)」和「加速層 (Performance Layer)」。負責 AI 運算、爬蟲自動化、靜態內容緩存 (KV)、以及客製化應用 (報價系統)。
    *   **KV Namespace**: `HTML_CACHE` (`695adac89df4448e81b9ffc05f639491`)

```mermaid
graph TD
    User[用戶/訪客] --> CF[Cloudflare Edge Network]
    
    subgraph "Cloudflare Ecosystem (The Brain)"
        Worker[Workers / SvelteKit App]
        KV[KV Storage (HTML/AI Cache)]
        D1[D1 Database (Sync Data)]
        R2[R2 Storage (Media/PDF)]
        AI[Workers AI (LLM)]
    end
    
    subgraph "Origin Server (The Core)"
        WP[WordPress + WooCommerce]
        MySQL[WP Database]
    end

    %% 流量與緩存
    User -->|1. Request| CF
    CF -->|2. Check Cache| KV
    KV -.->|Hit| User
    KV -.->|Miss| Worker
    Worker -->|3. Fetch Dynamic| WP
    
    %% 數據同步
    WP -->|4. Webhook (Sync)| Worker
    Worker -->|5. Write| D1
    Worker -->|6. Write| R2
    
    %% AI 與 爬蟲
    Worker -->|7. Crawl| External[品牌官網/GSC]
    Worker -->|8. Analyze/Gen| AI
    AI -->|9. Update| D1
    Worker -->|10. Sync Back| WP
```

---

## 2. 數據庫設計 (Database Schema)

我們使用 **Cloudflare D1** 作為邊緣數據庫，存儲 WordPress 的「投影 (Projection)」以及報價系統的專屬數據。
*   **Database Name**: `wordpress-cloudflare`
*   **Database ID**: `a061682a-515f-4fde-9b80-273632eb0e04`

### A. 產品同步表 (`sync_products`)
用於 AI 分析、爬蟲比對、以及報價系統快速選取產品。
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
    attributes TEXT,                 -- JSON: 產品屬性 (Color, Size, etc.)
    term_ids TEXT,                   -- JSON: 所有關聯的 Term IDs (用於精確篩選)
    image_url TEXT,                  -- R2 圖片連結
    gallery_images TEXT,             -- JSON: 產品相簿圖片 URLs
    seo_title TEXT,                  -- Rank Math SEO Title
    seo_description TEXT,            -- Rank Math SEO Description
    seo_keywords TEXT,               -- Rank Math Focus Keywords
    ai_optimized BOOLEAN DEFAULT 0,  -- AI 是否已優化
    brand_source_url TEXT,           -- 爬蟲來源 URL
    updated_at INTEGER               -- UNIX Timestamp
);
CREATE INDEX idx_products_search ON sync_products(title, sku, brand);
```

### B. 全站分類與標籤表 (`sync_terms`)
**100% 對應 WordPress Taxonomies** (Category, Tag, Brand, Attribute)。
```sql
CREATE TABLE sync_terms (
    term_id INTEGER PRIMARY KEY,     -- WP Term ID
    name TEXT,                       -- 名稱 (e.g., "Security Cameras")
    slug TEXT,                       -- 網址代稱 (e.g., "security-cameras")
    taxonomy TEXT,                   -- 分類法 (product_cat, product_tag, pa_brand, category, post_tag)
    parent INTEGER DEFAULT 0,        -- 父分類 ID
    count INTEGER DEFAULT 0          -- 關聯文章/產品數量
);
CREATE INDEX idx_terms_tax ON sync_terms(taxonomy, slug);
```

### C. 內容同步表 (`sync_posts`, `sync_pages`)
用於 AI 內容生成參考、SEO 分析及靜態化展示。
```sql
CREATE TABLE sync_posts (
    id INTEGER PRIMARY KEY,          -- WP Post ID
    title TEXT,
    content TEXT,                    -- 純文字內容
    excerpt TEXT,
    slug TEXT,
    status TEXT,                     -- 'publish', 'draft'
    categories TEXT,                 -- 分類名稱字串
    tags TEXT,                       -- 標籤名稱字串
    term_ids TEXT,                   -- JSON: 關聯 Term IDs
    image_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE sync_pages (
    id INTEGER PRIMARY KEY,          -- WP Page ID
    title TEXT,
    content TEXT,
    slug TEXT,
    status TEXT,
    image_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    updated_at INTEGER
);
```

### D. 客戶與訂單同步表 (`sync_customers`, `sync_orders`)
用於報價系統參考歷史交易與客戶資料。
```sql
CREATE TABLE sync_customers (
    wp_user_id INTEGER PRIMARY KEY,  -- 對應 WordPress User ID
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    company_name TEXT,
    billing_address TEXT,            -- JSON 格式地址
    shipping_address TEXT,           -- JSON 格式地址
    total_spend REAL,                -- 歷史消費總額 (來自 WP)
    created_at INTEGER
);

CREATE TABLE sync_orders (
    order_id INTEGER PRIMARY KEY,    -- WP Order ID
    customer_id INTEGER,             -- 關聯 sync_customers
    status TEXT,                     -- 'processing', 'completed'
    total_amount REAL,
    currency TEXT,
    line_items TEXT,                 -- JSON 格式: 購買的產品與數量
    created_at INTEGER
);
```

### E. 報價與發票系統 (`app_quotes`, `app_invoices`)
SvelteKit 應用專屬數據。
```sql
CREATE TABLE app_quotes (
    quote_id TEXT PRIMARY KEY,       -- 自定義編號 (e.g., Q20240101-01)
    customer_id INTEGER,             -- 關聯 sync_customers
    status TEXT,                     -- 'draft', 'sent', 'accepted', 'invoiced'
    total_amount REAL,
    currency TEXT DEFAULT 'HKD',
    valid_until INTEGER,             -- 有效期
    pdf_r2_key TEXT,                 -- R2 中的 PDF 檔案路徑
    created_by TEXT,                 -- 經手人 (Worker User)
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE app_invoices (
    invoice_id TEXT PRIMARY KEY,     -- 自定義編號 (e.g., INV20240101-01)
    quote_id TEXT,                   -- 關聯 app_quotes
    customer_id INTEGER,
    status TEXT,                     -- 'unpaid', 'paid', 'overdue'
    total_amount REAL,
    pdf_r2_key TEXT,
    created_at INTEGER,
    due_date INTEGER
);
```

### F. 報價單明細表 (`app_quote_items`)
```sql
CREATE TABLE app_quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id TEXT,                   -- 關聯 app_quotes
    product_id INTEGER,              -- 關聯 sync_products
    custom_title TEXT,               -- 允許修改名稱
    quantity INTEGER,
    unit_price REAL,
    total REAL
);
```

### G. 爬蟲原始數據表 (`raw_scrapes`)
```sql
CREATE TABLE raw_scrapes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url TEXT,
    brand TEXT,
    model TEXT,
    raw_html TEXT,
    parsed_data TEXT,                -- JSON
    scraped_at INTEGER
);
```

---

## 3. 關鍵模組與工作流 (Workflows)

### Module 1: 雙向數據同步 (Sync Engine)
*   **WP -> D1 (即時)**:
    *   **觸發**: `save_post`, `woocommerce_update_product`, `user_register`.
    *   **傳輸**: WordPress 發送 Webhook (JSON) -> Cloudflare Worker.
    *   **動作**: Worker 執行 `INSERT OR REPLACE` 更新 D1。同時清除相關 KV 緩存。
*   **Worker -> WP (逆向)**:
    *   **觸發**: SvelteKit 報價系統建立新客戶或將報價轉為訂單。
    *   **傳輸**: Worker 調用 WP REST API (`/wp-json/wc/v3/orders`).
    *   **動作**: WordPress 創建訂單/用戶，回傳 ID，Worker 更新 D1 關聯。

### Module 2: 極速邊緣緩存 (Edge Cache / KV)
*   **目標**: 讓動態 WordPress 像靜態 HTML 一樣快。
*   **邏輯**:
    1.  用戶請求 `example.com/product/a`。
    2.  Worker 檢查 KV `html_product_a`。
    3.  **Hit**: 直接回傳 HTML (TTFB < 50ms)。
    4.  **Miss**: 回源 WordPress 抓取 -> 存入 KV (TTL 7天) -> 回傳用戶。
*   **排除規則**: 登入用戶、購物車不為空、結帳頁面 (Checkout) -> 直接回源 (Bypass)。

### Module 3: 智能爬蟲與 AI 內容工廠 (Crawler & AI)
*   **爬蟲 (Crawler)**:
    *   **Schedule**: 每日執行 (Cron Trigger)。
    *   **Target**: 代理品牌官網 (News / Product Specs)。
    *   **Process**: 抓取 HTML -> 提取型號/規格 -> 存入 D1 `raw_scrapes` 表。
*   **AI 處理 (The Brain)**:
    *   **Gap Analysis**: 比對 D1 `raw_scrapes` 與 `sync_products`。發現新產品？
    *   **Generation**: 調用 Workers AI (Llama-3) 生成 SEO 標題、描述、文章內容。
    *   **Publish**: 透過 API 將新內容存入 WordPress (Draft 狀態)，通知管理員審核。
    *   **Social Auto-Post**: 當 WordPress 文章發布 (Publish) 後，觸發 Webhook -> Worker -> Facebook/Instagram Graph API 自動發文。

### Module 4: 報價與發票系統 (SvelteKit App)
*   **技術棧**: SvelteKit (SSR/SPA) + Cloudflare Pages。
*   **功能**:
    *   **Dashboard**: 顯示 D1 中的客戶、產品、訂單紀錄。
    *   **Quote Editor**: 拖拉式介面，即時計算金額，參考 `sync_orders` 歷史價格。
    *   **PDF Engine**: 生成 PDF 報價單/發票 -> 上傳 R2 -> 生成下載連結。
    *   **Invoice Sync**: 客戶確認報價 -> 轉為 Invoice -> 同步至 WP 訂單系統 (`sync_to_accounting`)。

---

## 4. API 接口設計 (Internal API)

SvelteKit 應用將透過以下內部 API 與系統互動：

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/products` | 從 D1 搜尋產品 (支援關鍵字、分類過濾) |
| `POST` | `/api/sync/webhook` | 接收 WordPress 的 Webhook 更新 D1 |
| `POST` | `/api/quotes` | 創建新報價單 (寫入 D1) |
| `POST` | `/api/quotes/:id/convert` | 將報價單轉為 WP 訂單 (Call WP API) |
| `POST` | `/api/ai/optimize` | 請求 AI 優化產品描述 (Input: JSON, Output: JSON) |
