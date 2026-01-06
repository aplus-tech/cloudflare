-- 1. 產品同步表 (Sync Products)
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

-- 2. 全站分類與標籤表 (Sync Terms)
CREATE TABLE sync_terms (
    term_id INTEGER PRIMARY KEY,     -- WP Term ID
    name TEXT,                       -- 名稱 (e.g., "Security Cameras")
    slug TEXT,                       -- 網址代稱 (e.g., "security-cameras")
    taxonomy TEXT,                   -- 分類法 (product_cat, product_tag, pa_brand, category, post_tag)
    parent INTEGER DEFAULT 0,        -- 父分類 ID
    count INTEGER DEFAULT 0          -- 關聯文章/產品數量
);
CREATE INDEX idx_terms_tax ON sync_terms(taxonomy, slug);

-- 3. 文章同步表 (Sync Posts)
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

-- 4. 頁面同步表 (Sync Pages)
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

-- 5. 客戶同步表 (Sync Customers)
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

-- 6. 訂單同步表 (Sync Orders)
CREATE TABLE sync_orders (
    order_id INTEGER PRIMARY KEY,    -- WP Order ID
    customer_id INTEGER,             -- 關聯 sync_customers
    status TEXT,                     -- 'processing', 'completed'
    total_amount REAL,
    currency TEXT,
    line_items TEXT,                 -- JSON 格式: 購買的產品與數量
    created_at INTEGER
);

-- 7. 報價單主表 (App Quotes)
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

-- 8. 發票主表 (App Invoices)
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

-- 9. 報價單明細表 (App Quote Items)
CREATE TABLE app_quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id TEXT,                   -- 關聯 app_quotes
    product_id INTEGER,              -- 關聯 sync_products
    custom_title TEXT,               -- 允許修改名稱
    quantity INTEGER,
    unit_price REAL,
    total REAL
);

-- 10. 爬蟲原始數據表 (Raw Scrapes)
CREATE TABLE raw_scrapes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url TEXT,
    brand TEXT,
    model TEXT,
    raw_html TEXT,
    parsed_data TEXT,                -- JSON
    scraped_at INTEGER
);
