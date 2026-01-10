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
