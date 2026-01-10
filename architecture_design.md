# Architecture Design: WordPress + Cloudflare Hybrid

## 1. Overview
This project implements a high-performance hybrid architecture using WordPress as the content source and Cloudflare (Pages, D1, KV) as the edge delivery and application layer.

## 2. Infrastructure Components

### 1. Cloudflare D1 (Relational Database)
*   **Purpose**: Stores synchronized WordPress data (products, posts, pages, terms) for edge-fast access.
*   **Tables**: `sync_products`, `sync_posts`, `sync_pages`, `sync_terms`, `sync_post_meta`, `sync_term_relationships`, etc.

### 2. Cloudflare R2 (Media Storage)
*   **Purpose**: Stores all website media using a semantic, brand-based folder structure.
*   **Bucket Name**: `media-bucket`
*   **Domain**: `media.aplus-tech.com.hk`
*   **Folder Logic**:
    *   `products/{brand}/{slug}.jpg`
    *   `posts/{slug}/{file}.jpg`
    *   `pages/{slug}/{file}.jpg`
    *   **Critical**: Set `redirect: 'follow'` to handle internal WP redirects.
*   **HTML Processing**:
    *   Replace all origin domain strings with the current Worker domain.
    *   Replace media URLs with `media.aplus-tech.com.hk` based on D1 mapping.
*   **Response**: Save processed HTML to KV and return to visitor.

### 3. Cache Purge (WP -> KV)
*   WordPress Update -> WP Webhook -> SvelteKit API (`/api/purge`) -> KV Delete.

### 3. Performance Optimization (Future Scale)
*   **HTMLRewriter**: As the `media_mapping` table grows, replace the string-based `split/join` logic with Cloudflare's native `HTMLRewriter`.
    *   **Benefit**: Streams the HTML response and performs replacements on-the-fly without loading the entire page into memory.
    *   **Logic**: Intercept `<img>`, `<a>`, and `<source>` tags to rewrite `src` and `href` attributes dynamically.

## 5. WordPress Plugins (Bridge Layer)

### 5.1 wp-cache-purge.php
*   **Purpose**: Automatically purge KV cache when WordPress content is updated.
*   **Hooks**: `save_post`, `woocommerce_update_product`
*   **API Endpoint**: `POST /api/purge`
*   **Current Config**:
    *   `$purge_url = 'https://cloudflare-9qe.pages.dev/api/purge'` (需更新)
    *   `$secret_key = 'REPLACE_WITH_A_SECURE_KEY'` (需與 `wrangler.toml` 的 `PURGE_SECRET` 對齊)
*   **Logic**: 
    1. Detect post/product save event
    2. Get permalink of updated content
    3. Send non-blocking POST request to Worker with URL and secret
    4. Worker deletes corresponding KV entry

### 5.2 wp-d1-sync.php
*   **Purpose**: Sync WordPress content to Cloudflare D1 database and trigger R2 image upload.
*   **Hooks**: 
    *   `woocommerce_update_product` / `woocommerce_new_product` (Products)
    *   `save_post` (Posts/Pages)
*   **API Endpoint**: `POST /api/sync`
*   **Current Config**:
    *   `D1_API_URL`: Points to Worker URL (e.g., `https://cloudflare-9qe.pages.dev/api/sync`)
    *   `SYNC_SECRET_KEY`: Matches `wrangler.toml`
*   **Logic**:
    1. **Data Extraction**:
        *   **Products**: Extracts SKU, Price, Stock, SEO fields, and **Brand** (checks `product_brand`, `pa_brand`, `brand` taxonomies).
        *   **Images**: Extracts Featured Image and Gallery Images.
    2. **Payload**: Sends JSON payload with `type`, `secret`, and `payload` (product/post data).
    3. **Worker Processing (`/api/sync`)**:
        *   Receives data and validates secret.
        *   **Image Sync**:
            *   Checks `media_mapping` table in D1.
            *   **Crucial Step**: If mapping exists, **verifies if file actually exists in R2** using `r2.head()`.
            *   If missing in R2 (even if mapping exists), re-downloads from WP and uploads to R2.
            *   Path Strategy: `products/{brand}/{filename}` (Semantic Path).
        *   **Database Update**: Upserts record into `sync_products` or `sync_posts`.

## 6. Security
*   All API endpoints (`/api/sync`, `/api/purge`) are protected by a `SYNC_SECRET_KEY` or `PURGE_SECRET`.
