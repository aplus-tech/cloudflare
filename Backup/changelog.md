# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- **Phase 4.5: Semantic Media Migration**: 
    - Implemented brand-based semantic folder structure in R2 (`products/[brand]/[filename]`).
    - Resolved WordPress "Critical Error" by implementing `platform.context.waitUntil` for background syncing and adding safety checks for `WP_Error`.
    - Fixed 400 Bad Request errors for images with Chinese characters using URL encoding.
    - Implemented automatic brand taxonomy detection (`product_brand`, `pa_brand`, etc.) in the WordPress plugin.
    - Fixed `D1_TYPE_ERROR` by ensuring all data sent to D1 is properly sanitized and handles `undefined` values.
    - Optimized sync performance with non-blocking requests in WordPress.

### Added
- **Phase 0: Cleanup**: Added a step to delete unauthorized files (`edge-cache-worker`, `wp-purge-plugin.php`) before proceeding.
- **Phase 2: Foundation Setup**: Restored the SvelteKit initialization step which was accidentally removed.
- **Phase 3: Edge Cache**: Prioritized Edge Cache implementation immediately after Foundation Setup.
- **Architecture Update**: Expanded D1 Schema to 10 tables. Added `sync_terms` for full taxonomy support (Brands, Attributes, Tags, Cats). Updated `sync_products` and `sync_posts` to include JSON fields for attributes and term relationships.
- **Database Config**: Updated D1 database name to `wordpress-cloudflare` and ID to `a061682a-515f-4fde-9b80-273632eb0e04`.
- **Phase 3: Edge Cache**: Implemented KV-based HTML caching in `hooks.server.ts` and created a WordPress purge plugin (`wp-cache-purge.php`).
- **Deployment**: Successfully connected GitHub repo and deployed to Cloudflare Pages.
- **Phase 4: Sync Pipeline**: Completed real-time data synchronization from WordPress to D1 for products, posts, pages, and terms.
- **Phase 4.5 (Planned)**: Defined Semantic Media Migration strategy using R2 and D1 mapping for brand-based image organization.

### Changed
- **Reordered Phases**:
    - Old Phase 2 (Edge Cache) -> New Phase 3.
    - Old Phase 2 (Foundation) -> New Phase 2.
    - Old Phase 3 (Sync) -> New Phase 4.
    - Old Phase 4 (Quote) -> New Phase 5.
    - Old Phase 5 (AI) -> New Phase 6.
- **Updated `task.md`**: Reflected the new phase order and added the Cleanup task.
- **Updated `implementation_plan.md`**: Detailed the new execution order.

### Removed
- Removed the immediate "Edge Cache" task from Phase 2 in `task.md` to ensure Foundation Setup is done first.

## [Current Status - 2026-01-08] - **PRODUCTION LIVE (Hybrid Architecture)**
### Phase 4.6: Hybrid Architecture & R2 Acceleration - Completed
*   **Architecture Decision**: Adopted Hybrid Architecture due to Shared Hosting limitations (DNS loops/SSL issues).
    *   **HTML**: Served by Origin (Shared Hosting) via Cloudflare DNS (Proxied).
    *   **Images**: Served by Cloudflare R2 (`media.aplus-tech.com.hk`) for high performance.
*   **Plugin Updates (`wp-d1-sync.php`)**:
    *   **API Target**: Updated to `https://cloudflare-9qe.pages.dev/api/sync` to ensure reliable connectivity regardless of main domain DNS.
    *   **R2 Feedback Loop**: Implemented logic to parse Worker response and save R2 paths to `_cloudflare_r2_url` post meta.
    *   **Frontend Rewrite**: Added `wp_get_attachment_url` filter to automatically replace local image URLs with R2 URLs on the frontend.
*   **Worker Updates**:
    *   Updated `performSync` to return `image_r2_path` and `gallery_r2_paths` in the API response.

### Phase 4.6: Edge Validation - Task 1 Completed
*   **Worker URL Proxy**: Successfully implemented `hooks.server.ts` to proxy WordPress content through `cloudflare-9qe.pages.dev`.
*   **Static Asset Handling**: Fixed UI rendering issues by adding comprehensive static asset proxying:
    *   Added explicit file extension detection for `.css`, `.js`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.ico`
    *   Implemented CORS headers (`Access-Control-Allow-Origin: *`) for font files
    *   Added proper error handling for 404 assets
*   **Domain Rewriting**: HTML content successfully rewrites all `aplus-tech.com.hk` references to Worker domain
*   **KV Cache**: Verified cache HIT/MISS logic working correctly (2nd page load shows significant speed improvement)

### Phase 4.5: R2 Semantic Media Migration - Completed
*   **Fixed `wp-d1-sync.php`**: Correctly extracts Brand from `product_brand` taxonomy.
*   **Updated Worker (`/api/sync`)**: 
    *   Switched to synchronous execution for reliable image uploads.
    *   Implemented "Lazy Sync" logic: Checks if file exists in R2 using `r2.head()` before skipping upload, fixing issue where old products couldn't be updated.
    *   Verified semantic paths: `products/{brand}/{filename}` working correctly.
*   **Verified**: Successfully synced new and old products, confirming R2 folder creation and image upload.
*   **Action Required**: Update both plugins' URLs and verify secret keys match `wrangler.toml` before Phase 4.6 production cutover.
