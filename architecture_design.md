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
*   **Mapping**: Relationship stored in D1 `media_mapping` table.

### 3. Cloudflare KV (Key-Value Storage)
*   **Purpose**: Stores full HTML snapshots of WordPress pages for sub-50ms TTFB.
*   **Namespace**: `HTML_CACHE`

### 4. SvelteKit (Application Layer)
*   **Purpose**: Acts as a reverse proxy for WordPress and hosts the Quote/Invoice system.
*   **Deployment**: Cloudflare Pages.

## 3. Data Flow

### 1. Real-time Sync (WP -> D1)
*   WordPress Hook (`save_post`) -> WP Webhook -> SvelteKit API (`/api/sync`) -> D1 Database.

### 2. Edge Caching (Visitor -> KV)
*   Visitor Request -> SvelteKit Hook (`hooks.server.ts`) -> Check KV -> Return HTML (Hit) OR Fetch WP (Miss) -> Save to KV.

### 3. Cache Purge (WP -> KV)
*   WordPress Update -> WP Webhook -> SvelteKit API (`/api/purge`) -> KV Delete.

## 4. Security
*   All API endpoints (`/api/sync`, `/api/purge`) are protected by a `SYNC_SECRET_KEY` or `PURGE_SECRET`.
