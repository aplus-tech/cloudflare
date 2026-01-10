# Implementation Plan: WordPress + Cloudflare Automation

這份計畫書將執行過程分為五個階段，每個階段都有明確的目標 and 驗證步驟。

## Phase 0: 清理與重置 (Cleanup)
**目標**: 刪除未經授權的檔案，確保環境乾淨。

1.  **刪除檔案**:
    *   刪除 `edge-cache-worker` 資料夾。
    *   刪除 `wp-purge-plugin.php`。
    *   更新 `wrangler.toml` 綁定 KV.
2.  **Edge Cache Worker**:
    *   設定 Worker 路由攔截主站請求.
    *   Logic: Check KV -> Return HTML or Fetch Origin (`aplus-tech.com.hk`).
    *   Bypass: 登入 Cookie / 購物車 Cookie。
3.  **清除機制 (Purge)**:
    *   編寫 PHP Snippet (WP Plugin).
    *   當 `save_post` 時，同時發送請求給 Worker 清除對應 URL 的 KV。

## Phase 2: 基礎設施搭建 (Foundation)
**目標**: 建立 Cloudflare 環境，準備好數據庫和存儲空間。

1.  **初始化專案 (手動模式 - 繞過 UNC Bug)**:
    *   手動建立 `package.json`, `svelte.config.js`, `wrangler.toml` (已完成)。
    *   配置 D1 綁定: `database_name = "wordpress-cloudflare"`, `database_id = "a061682a-515f-4fde-9b80-273632eb0e04"` (已完成)。
    *   **執行安裝**: 本地安裝 `npm install` (已完成)。
    *   **GitHub 連線**: 成功將代碼推送到 GitHub 並連線至 Cloudflare Pages (已完成)。
    *   **成功部署**: 獲得部署網址 `cloudflare-9qe.pages.dev` (已完成)。
2.  **配置 D1 數據庫**:
    *   建立 D1: `npx wrangler d1 create wordpress-cloudflare` (已完成)。
    *   應用 Schema: 使用 `schema.sql` 執行 `npx wrangler d1 execute wordpress-cloudflare --remote --file=./schema.sql` (已完成)。
3.  **配置 R2 存儲**:
    *   建立 Bucket: `npx wrangler r2 bucket create media-bucket`。
    *   配置公開存取 (Public Access) 或綁定自定義域名。

## Phase 3: 極速邊緣緩存 (Edge Cache / KV)
**目標**: 開啟 KV 緩存，讓前台飛快 (Feel the Speed)。

1.  **配置 KV**:
    *   建立 KV: `npx wrangler kv:namespace create HTML_CACHE` (已完成)。
    *   更新 `wrangler.toml` 綁定 KV (已完成)。
2.  **Edge Cache Worker**:
    *   設定 Worker 路由攔截主站請求 (已完成)。
    *   Logic: Check KV -> Return HTML or Fetch Origin (`aplus-tech.com.hk`) (已完成)。
    *   Bypass: 登入 Cookie / 購物車 Cookie (已完成)。
3.  **清除機制 (Purge)**:
    *   編寫 PHP Snippet (WP Plugin) (已完成)。
    *   當 `save_post` 時，同時發送請求給 Worker 清除對應 URL 的 KV (已完成)。

## Phase 4: 數據同步管道 (The Sync Pipeline) - 已完成
**目標**: 讓 WordPress 的數據自動流向 Cloudflare D1。

1.  **WordPress 端 (Sender)**:
    *   編寫 PHP Snippet (已完成)。
    *   Hook: `save_post`, `woocommerce_update_product` (已完成)。
    *   Logic: 收集 Post/Product 資料 -> 轉 JSON -> POST 到 Worker URL (已完成)。
    *   Security: 設定 `Secret Key` 驗證 (已完成)。
2.  **Worker 端 (Receiver)**:
    *   喺 SvelteKit 中建立 API Route: `src/routes/api/sync/+server.ts` (已完成)。
    *   Logic: 驗證 Key -> 解析 JSON -> 執行 `INSERT OR REPLACE INTO sync_products` (已完成)。
3.  **配置 D1 數據庫**:
    *   建立 D1: `npx wrangler d1 create wordpress-cloudflare` (已完成)。
    *   應用 Schema (已完成)。

## Phase 4.5: R2 語義化媒體遷移 (Semantic Media Migration) - 已完成
**目標**: 將 WordPress 圖片遷移至 R2，並重組為按品牌與類型分類的專業目錄結構。

### 1. 語義化目錄架構 (Semantic Structure):
*   **產品**: `products/[brand]/[product-slug].jpg`
*   **文章**: `posts/[post-slug]/[image-name].jpg`
*   **頁面**: `pages/[page-slug]/[image-name].jpg`
*   **公共資源**: `assets/common/[filename].png`

### 2. 技術實作:
*   **D1 Mapping**: 建立 `media_mapping` 表，記錄 `original_url` 與 `r2_path` 的對應關係。
*   **自動替換**: 修改 SvelteKit Proxy，在回傳 HTML 前根據 D1 Mapping 自動將 WP 圖片網址替換為 R2 媒體域名網址。
*   **Lazy Migration**: 當圖片被訪問且 R2 未命中時，自動從 WP 抓取、重命名並存入 R2。

---

## ⚠️ CRITICAL CHECKPOINT: Phase 4.5 Stable (Commit: `51f33d4`)
**Current State is the STABLE BASE for Production.**
*   **Status**: R2 Sync, D1 Sync, and Cache Purge are fully functional.
*   **Rollback Plan**: If Phase 4.6 (DNS Cutover) fails, revert to this state immediately.
    *   **DNS**: Point `aplus-tech.com.hk` back to origin IP.
    *   **Worker**: Revert `cloudflare-wordpress` code to commit `51f33d4`.
    *   **Plugins**: Restore `wp-d1-sync.php` and `wp-cache-purge.php` to the versions confirmed working in Phase 4.5.
    *   **Manual Backup Files** (See `backup_phase_4_5_stable` folder):
        1.  `Wordpress Plugin/wp-d1-sync.php`
        2.  `Wordpress Plugin/wp-cache-purge.php`
        3.  `cloudflare-wordpress/src/hooks.server.ts`
        4.  `cloudflare-wordpress/src/routes/api/sync/+server.ts`

## Phase 4.6: 混合架構與 R2 圖片加速 (Hybrid Architecture & R2 Acceleration)
**Status**: [Completed]
**Goal**: 在共享主機限制下，實現圖片極速加載 (R2) 與網站穩定運行 (Shared Hosting) 的最佳平衡。

- [x] **Task 1: Worker 連結測試 (Edge Validation)**
    - [x] 驗證 Worker 基本功能 (已完成，但在共享主機上僅用於 API 和後台邏輯)。

- [x] **Task 2: R2 圖片加速整合 (R2 Image Acceleration)**
    - [x] **修改 WordPress 插件 (`wp-d1-sync.php`)**:
        - [x] 接收 Worker 同步回傳的 R2 路徑。
        - [x] 將 R2 URL 寫入 WordPress 媒體庫的 `post_meta` (`_cloudflare_r2_url`)。
        - [x] 實作 `wp_get_attachment_url` filter，將本地圖片網址替換為 R2 網址。
    - [x] **驗證圖片加載**:
        - [x] 儲存產品，確認前台圖片網址變為 `https://media.aplus-tech.com.hk/...`。
        - [x] 確認圖片加載速度提升。

- [x] **Task 3: 網站穩定性確認**
    - [x] 確保 DNS 保持為 `DNS Only` (或 Proxied 但不走 Worker Route)，避免迴圈。
    - [x] 確認 SSL 證書有效。

## Phase 5: 報價與發票系統開發 (SvelteKit App)
**目標**: 建立一個極速的後台供內部使用。

1.  **UI 框架搭建**:
    *   安裝 TailwindCSS.
    *   建立 Layout.
2.  **產品與客戶管理**:
    *   頁面: `src/routes/products/+page.svelte` -> Load data from D1.
3.  **報價單編輯器**:
    *   功能: 搜尋產品、計算總額、儲存。
4.  **PDF 生成**:
    *   Client 端生成 PDF -> 上傳 R2.

## Phase 6: AI 與 爬蟲自動化 (Automation)
**目標**: 讓系統自動工作。

1.  **爬蟲 Worker**:
    *   建立 Scheduled Worker (Cron).
    *   Logic: Fetch 品牌官網 -> D1.
2.  **AI 內容生成**:
    *   Logic: 讀取 D1 -> Workers AI -> WP Draft.

## WordPress 插件安裝指南 (WordPress Plugin Installation Guide)

為了讓 Cloudflare 與 WordPress 協作，你需要安裝兩個自定義插件：`wp-cache-purge.php` (緩存清除) 和 `wp-d1-sync.php` (數據同步)。

### 方法 A：手動上傳 (推薦)
1.  **建立目錄**: 透過 FTP 或主機檔案管理員，在 `/wp-content/plugins/` 下建立一個資料夾，例如 `aplus-cloudflare-tools`。
2.  **上傳檔案**: 將 `wp-cache-purge.php` 和 `wp-d1-sync.php` 上傳到該目錄。
3.  **啟用插件**: 登入 WordPress 後台 -> 「外掛 (Plugins)」-> 找到「A Plus Cloudflare Cache Purge」和「A Plus D1 Data Sync」並點擊「啟用」。

### 方法 B：使用 Code Snippets 插件
1.  在 WordPress 安裝並啟用 **Code Snippets** 插件。
2.  分別建立兩個新的 Snippet，將兩個 PHP 檔案的內容複製進去。
3.  選擇「僅在後台執行」或「在所有位置執行」。

### 關鍵配置 (Critical Config)
安裝後，請務必修改 PHP 檔案頂部的以下變數：
*   `$purge_url` / `$sync_url`: 改為你的 SvelteKit App 部署後的網址 (例如 `https://xxx.pages.dev/api/purge`)。
*   `$secret_key`: 必須與 `wrangler.toml` 中的 `PURGE_SECRET` 和 `SYNC_SECRET_KEY` 一致。

### 4.5 R2 語義化媒體遷移 (Semantic R2 Migration)
*   **目標**: 將 WordPress 圖片遷移到 R2，並使用語義化路徑 (例如 `products/brand/name.jpg`)。
*   **實作細節**:
    *   **WordPress 端 (`wp-d1-sync.php`)**:
        *   使用 `woocommerce_update_product` Hook 觸發同步。
        *   提取產品品牌 (支援 `product_brand`, `pa_brand`, `brand`)。
        *   發送完整產品數據 (含圖片 URL) 到 Worker API。
    *   **Worker 端 (`/api/sync`)**:
        *   接收數據並驗證 Secret。
        *   **同步執行**: 移除 `waitUntil`，確保圖片上傳完成後才回傳成功。
        *   **存在性檢查**: 在跳過上傳前，使用 `r2.head()` 檢查 R2 中是否真的有檔案。如果 D1 有記錄但 R2 無檔案，強制重新上傳。
        *   **路徑生成**: `products/{brand}/{filename}`。
*   **故障排除**:
    *   **品牌顯示 Unknown**: 檢查 WordPress 產品是否已分配品牌，以及分類法名稱是否為 `product_brand`。
    *   **圖片未上傳**: 確認 Worker API 是同步執行，並檢查 R2 Bucket 權限。
    *   **舊產品無法更新**: 這是因為 D1 已有記錄但 R2 無檔案。已透過 `r2.head()` 檢查邏輯修復。

---

## 驗證清單 (Checklist)
- [ ] WordPress 修改產品，D1 是否 1 秒內更新？
- [ ] SvelteKit 報價系統能否讀取到最新的產品資料？
- [ ] 報價單轉訂單後，WordPress 是否出現新訂單？
- [ ] 未登入訪問產品頁，TTFB 是否低於 100ms (KV Hit)？
- [ ] AI 是否能成功讀取 D1 數據並生成有意義的描述？
- [ ] **效能優化**: 當媒體映射數量增加時，是否已切換至 `HTMLRewriter` 以優化內存使用？
