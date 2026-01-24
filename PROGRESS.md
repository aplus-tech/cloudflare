# 專案進度追蹤

> 最後更新：**2026-01-18** | 用戶確認：✅ Phase 4.8 優先 | 專案：Cloudflare WordPress Accelerator

---

## 🎯 當前焦點（用戶確認：2026-01-12）

### 🔴 Phase 4.8：VPS 全面測試（準備生產遷移）

**優先級**：P0（用戶確認為當前焦點）
**狀態**：✅ 已完成
**開始日期**：2026-01-11
**完成日期**：2026-01-18
**進度**：8/8 (100%)

**用戶備註**：優先完成 VPS 測試，確保生產環境穩定。Phase 4.7 延後至 4.8 完成。
**最新進展**：✅ 2026-01-18 - Phase 4.8 全面測試完成（效能測試 96% 加速）

---

#### 測試環境
**VPS 環境**：
- VPS IP：15.235.199.194
- 測試域名：test.aplus-tech.com.hk

**域名配置**：
- 主域名：aplus-tech.com.hk（Shared Hosting，生產環境）
- Media 域名：media.aplus-tech.com.hk（R2 圖片）
- Cloudflare Pages：cloudflare-9qe.pages.dev（Worker URL 代理）

**測試目標**：
- 確認 VPS WordPress 所有功能正常運作
- 完成所有功能喺 VPS WordPress 測試後：將主域名 aplus-tech.com.hk 遷移到 VPS

#### 前置步驟（已完成 ✅）
- [x] Cloudflare DNS 加入 test.aplus-tech.com.hk → 15.235.199.194
- [x] 更新 VPS WordPress Site URL 為 https://test.aplus-tech.com.hk
- [x] 驗證 DNS 解析同 SSL 證書
- [x] 上傳 WordPress Plugin v2.0 到 VPS
- [x] Activate Plugin

#### ⚠️ 重要說明（2026-01-12 用戶確認）
**之前測試狀態釐清**：
- ✅ Shared Hosting (aplus-tech.com.hk)：R2 功能正常運作
- ❌ VPS (test.aplus-tech.com.hk)：新環境，R2 功能未測試
- 🎯 當前焦點：確保 VPS WordPress 可以正常同 R2 整合

#### 測試清單（8/8 完成 ✅）
- [x] 4.8.1：VPS WordPress R2 圖片上傳測試 ✅
- [x] 4.8.1：VPS WordPress R2 圖片預覽測試 ✅
- [x] 4.8.1：VPS WordPress 前台圖片顯示測試 ✅
- [x] 4.8.3：KV 緩存測試 ✅（2026-01-17 完成 - 解決 redirect loop）
- [x] 4.8.2：WordPress 產品同步測試（D1）✅（2026-01-18 完成）
- [x] 4.8.2：WordPress 文章同步測試（D1）✅（2026-01-18 完成）
- [x] 4.8.4：Purge API 測試 ✅（2026-01-18 完成）
- [x] 4.8.5：整體效能測試 ✅（2026-01-18 完成 - KV Cache 加速 96%）

#### 4.8.3 KV 緩存測試詳情（2026-01-17 完成）

**問題發現**：
- 初始測試時發現 redirect loop 問題
- `test.aplus-tech.com.hk` 內頁 redirect 去 `cloudflare-9qe.pages.dev`
- `cloudflare-9qe.pages.dev` 部分頁面 redirect 去 `origin`

**嘗試方案**：
- ❌ 方案 A：條件判斷 + VPS 用 `origin`
- ❌ 方案 B：方案 A + 清理 WordPress 資料庫
- ✅ 方案 C：替換 origin → currentHost + 清空 KV Cache

**根本原因**：
KV Cache 存咗舊嘅錯誤 HTML（包含錯誤 URL），導致 redirect loop

**解決方案**：
1. Worker URL 替換：`origin` → `currentHost`（無條件替換）
2. 清空 KV Cache（193 個項目）
3. 重新訪問頁面，生成正確 cache

**測試結果**：
- ✅ `test.aplus-tech.com.hk` - 所有頁面正常，速度快
- ✅ `cloudflare-9qe.pages.dev` - 正確 redirect 去 Custom Domain
- ✅ `origin.aplus-tech.com.hk` - VPS 直連正常
- ✅ KV Cache 生效，頁面載入速度明顯提升

**相關 Commit**：
- [4fbf47d](https://github.com/aplus-tech/cloudflare/commit/4fbf47d) - 方案 C：URL 替換邏輯
- [f21f7d8](https://github.com/aplus-tech/cloudflare/commit/f21f7d8) - 記錄成功方案

**KV Cache 清空 API**：
```
https://cloudflare-9qe.pages.dev/api/purge-all?secret=Lui@63006021
```

---

#### 4.8.2 D1 數據同步測試詳情（2026-01-18 完成）

**測試目標**：
- 驗證 VPS WordPress Plugin 可以成功同步產品數據到 Cloudflare D1
- 確認 R2 圖片上傳功能正常運作
- 檢查 API 認證機制正常

**問題發現**：
- 初始測試時發現 API 返回 `{"error":"Unauthorized"}`
- WordPress debug.log 顯示多次 401 錯誤
- D1 數據庫查詢結果為空

**根本原因**：
- `platform.env.SYNC_SECRET_KEY` 環境變數未設定
- 之前 `wrangler.toml` 移除咗明文密碼，但冇設定環境變數

**解決方案**：
1. 修改 `wrangler.toml` 加返 `[vars]` section
2. 暫時用明文 `SYNC_SECRET_KEY = "Lui@63006021"`（測試用）
3. Git commit + push 觸發 Cloudflare Pages 部署
4. 等待部署完成（約 5 分鐘）

**測試結果**：
- ✅ Product ID: 6947 成功同步到 D1
- ✅ SKU: `UACC-PoE+-2.5G` 正確記錄
- ✅ R2 圖片上傳成功：`products/ubiquiti-unifi/%E4%B8%8B%E8%BC%89-3.avif`
- ✅ API 認證成功，返回 `{"success":true}`
- ✅ D1 總產品數：12 條記錄
- ✅ Updated timestamp: 1768759354 (2026-01-18 05:55:54 UTC)

**相關 Commit**：
- [fda2c0b](https://github.com/aplus-tech/cloudflare/commit/fda2c0b) - 修復 SYNC_SECRET_KEY 環境變數問題

**WordPress Debug Log 記錄**：
```
[18-Jan-2026 17:53:43 UTC] D1 Sync Response: {"success":true,"message":"Sync completed","r2_data":{"image_r2_path":"products/ubiquiti-unifi/%E4%B8%8B%E8%BC%89-3.avif","gallery_r2_paths":[]}}
```

**備註**：
- 生產環境應該用 `wrangler secret put SYNC_SECRET_KEY` 代替明文密碼
- 此項將在 Phase 4.7 安全優化時處理

---

#### 4.8.4 Purge API 測試詳情（2026-01-18 完成）

**測試目標**：
- 驗證 WordPress 更新產品時自動觸發 Purge API
- 確認 Purge API 成功清除 KV Cache
- 檢查 Secret key 驗證機制正常

**測試步驟**：
1. VPS WordPress 更新產品（Product ID: 6947, SKU: `UACC-PoE+-2.5G`）
2. WordPress Plugin 自動觸發 Purge API (`woocommerce_update_product` hook)
3. 用 `wrangler kv key list` 檢查 KV Cache 有冇對應 key

**測試結果**：
- ✅ WordPress Plugin 成功觸發 Purge API（`wp-cache-purge.php:21` - `woocommerce_update_product` hook）
- ✅ Purge API Secret key 驗證正常（`PURGE_SECRET = "Lui@63006021"`）
- ✅ KV Cache 成功清除（`wrangler kv key list` 返回空陣列 `[]`）
- ✅ Cache key 格式正確（`html:/ubiquiti-unifi-2-5g-poe-adapter-uacc-poe-plus-2-5g/`）

**相關檔案**：
- `Wordpress Plugin/wp-cache-purge.php:15-16` - Purge API URL + Secret key
- `cloudflare-wordpress/wrangler.toml:24` - PURGE_SECRET 環境變數
- `src/routes/api/purge/+server.ts:19-23` - Purge API 邏輯

**測試頁面**：
```
http://origin.aplus-tech.com.hk/ubiquiti-unifi-2-5g-poe-adapter-uacc-poe-plus-2-5g/
```

**驗證指令**：
```bash
npx wrangler kv key list --namespace-id 695adac89df4448e81b9ffc05f639491 --prefix "html:/ubiquiti-unifi-2-5g-poe-adapter-uacc-poe-plus-2-5g"
# 返回：[] （代表 cache 已清除）
```

**發現問題並解決**：
- ❌ 測試後發現 KV Cache 儲存咗 WooCommerce AJAX JSON response 而唔係 HTML
- 問題現象：訪問首頁 `https://test.aplus-tech.com.hk/` 返回 `{"fragments":{"div.widget_shopping_cart_content":"..."}}`
- ✅ 解決方案：執行 purge-all API 清空所有 KV Cache（刪除 13 個 cache 項目）
- ✅ 結果：首頁恢復正常，返回 HTML 內容
- 📝 詳細記錄：`.ai/ATTEMPTED_SOLUTIONS.md:232-270`

**備註**：
- Plugin 使用 `blocking => false` 非同步執行，唔會阻塞 WordPress 保存動作
- 生產環境應該用 `wrangler secret put PURGE_SECRET` 代替明文密碼
- 此項將在 Phase 4.7 安全優化時處理
- KV Cache AJAX response 問題已修復（統一 cache key 格式：`html:${pathname}${search}`）
- 修復 Commit: 3fcce19

---

#### 4.8.5 整體效能測試詳情（2026-01-18 完成）

**測試目標**：
- 驗證 KV Cache 加速效果
- 測試首頁同產品頁效能
- 確認 HTTP Header 顯示 cache 狀態

**測試結果**：

**首頁效能**：
- 首次訪問（無 cache）：3.59s
- 二次訪問（有 cache）：0.15s
- **加速效果**：23.9x（96% 減少）

**產品頁效能**：
- 首次訪問（無 cache）：2.62s
- 二次訪問（有 cache）：0.11s
- **加速效果**：23.8x（96% 減少）

**Cache 驗證**：
- ✅ HTTP Header 顯示 `X-Cache: HIT`
- ✅ Cloudflare Header 顯示 `cf-cache-status: DYNAMIC`
- ✅ KV Cache 成功運作

**相關檔案**：
- `hooks.server.ts:47` - Cache key 格式（已修復）
- `hooks.server.ts:106-108` - KV Cache 儲存邏輯

**備註**：
- Cache key 格式已統一為 `html:${url.pathname}${url.search}`
- 避免 AJAX request 被錯誤 cache
- 24 小時 TTL（`expirationTtl: 3600 * 24`）

---

## ⏸️ 暫停任務（用戶確認延後）

### Phase 4.7：安全與效能優化

**狀態**：準備開始
**原因**：Phase 4.8 已完成，可以開始執行
**優先級**：P0-P1（移除明文密碼 + KV Cache 優化 + Cache Warming）
**最後更新**：2026-01-18
**計劃開始**：2026-01-18

#### 待辦任務
- [ ] Task 4.7.1（P0）：移除 wrangler.toml 明文密碼
  - [ ] 用 wrangler secret put 設定 SYNC_SECRET_KEY
  - [ ] 用 wrangler secret put 設定 PURGE_SECRET
  - [ ] 驗證 WordPress 插件密鑰一致性
- [ ] Task 4.7.2（P1）：優化 media_mapping 查詢（加 KV Cache）
- [ ] Task 4.7.3（P1）：並行上傳圖片（Promise.all）
- [ ] Task 4.7.4（P1）：加入重試機制（Exponential Backoff）
- [ ] Task 4.7.5（P1）：統一緩存 Key 格式（✅ 已完成於 Phase 4.8.5）
- [ ] Task 4.7.6（P1）：實作 Cache Warming 功能（Sitemap Crawler）
  - [ ] 建立 `/api/warm-cache` endpoint
  - [ ] Fetch WordPress Sitemap XML
  - [ ] Parse XML 提取所有 URL
  - [ ] 批量 fetch URLs 觸發 KV Cache（並發控制：10 concurrent）
  - [ ] 加入 Secret key 驗證機制
  - [ ] 測試功能正常運作

#### Task 4.7.6 詳細方案：Cache Warming（用戶確認：2026-01-18）

**【問題原因】**
- 現時 KV Cache 係被動式：只有用戶訪問先會 cache
- 用戶要求主動式 warm up：一次過將所有頁面預先 cache
- 避免首次訪問慢（3.59s），確保所有用戶都享受到 cache 加速（0.15s）

**【方案成立】**
使用 **方案 1：Sitemap Crawler**

**優點**：
- WordPress 自動生成 Sitemap（`/wp-sitemap.xml`），自動包含所有公開頁面
- 唔需要手動維護 URL 清單
- 唔需要額外費用（Cloudflare Pages Free Plan 已足夠）
- 可以手動觸發或用免費 cron service 定期執行

**技術實作**：
1. **API Endpoint**：`/api/warm-cache`
2. **認證機制**：Secret key（同 PURGE_SECRET 一致）
3. **流程**：
   ```typescript
   // Step 1: Fetch Sitemap
   const sitemapUrl = 'http://origin.aplus-tech.com.hk/wp-sitemap.xml';
   const sitemap = await fetch(sitemapUrl);

   // Step 2: Parse XML 提取 URLs
   const urls = parseSitemapXML(sitemap);

   // Step 3: 批量 fetch（並發控制）
   const results = await Promise.all(
     urls.map(url => fetch(url)) // 限制 10 concurrent
   );

   // Step 4: 返回結果
   return { success: true, cached: urls.length };
   ```

4. **並發控制**：限制每次最多 10 個 concurrent requests，避免打爆 origin server

**【來源證據】**
- WordPress Sitemap：https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/
- Sitemap URL：`http://origin.aplus-tech.com.hk/wp-sitemap.xml`
- Cloudflare Pages Free Plan：無需額外費用
- 參考實作：Netlify Cache Warmer Plugin（https://github.com/netlify/netlify-plugin-cache-warmer）

**相關檔案**：
- 新建：`cloudflare-wordpress/src/routes/api/warm-cache/+server.ts`
- 使用：`hooks.server.ts` 現有 cache 邏輯（自動觸發 KV 儲存）

---

## ✅ 已完成

| Phase | 任務 | 完成日期 |
|-------|------|---------|
| 4.8 | VPS 全面測試（效能測試 96% 加速，Cache Key 修復） | 2026-01-18 |
| 4.6 | 混合架構上線（HTML by Origin + Images by R2） | 2026-01-08 |
| 4.5 | R2 語義化媒體遷移（products/{brand}/filename） | 2026-01-07 |
| 4.0 | 數據同步管道（WordPress → D1 實時同步） | 2026-01-06 |
| 3.0 | KV 邊緣緩存（HTML Cache） | 2026-01-06 |
| 2.0 | 基礎設施搭建（SvelteKit + D1 + KV + R2） | 2026-01-05 |
| 0.0 | 清理與重置 | 2026-01-04 |
| - | AI 規則設定（.ai/CLAUDE.md + CLAUDE_OPUS.md） | 2025-01-10 |
| - | 專案文檔整合（context.yaml + CHANGELOG.md） | 2025-01-10 |

---

## 🚀 計劃中（Phase 5.0 - 當前焦點）

### Phase 5.0：VPS 遷移與 AI 自動化整合（2026-01-19 開始）

**狀態**：🟢 Phase B 完成（Docker 優化 + Redis 部署）
**優先級**：P0（用戶確認）
**預計完成時間**：12-18 小時
**詳細計劃**：參見 [.ai/IDEAS.md](.ai/IDEAS.md#Phase-5-8-Overview) 完整 1738 行實施方案

#### 🔍 VPS 診斷結果（2026-01-20）

**VPS 連接**：✅ 成功（`root@76.13.30.201` via SSH key）

**實際硬件規格**：
- CPU：2 cores
- **RAM：15GB**（❗️注意：文檔誤記為 8GB，實際多 87.5%）
- 存儲：193GB total（18GB used, 10%）
- 記憶體使用：2.0GB / 15GB（13GB 可用）

**已安裝服務**（Docker）：
- ✅ Nginx Proxy Manager（ports 80/81/443）
- ✅ WordPress（port 8080）
- ✅ MariaDB（WordPress 資料庫）
- ✅ n8n（自動化平台）
- ✅ PostgreSQL（n8n 資料庫）
- ✅ WAHA（WhatsApp HTTP API）

**已安裝 AI 工具**：
- ✅ Claude Code CLI（已驗證可運行，顯示 trust dialog）
- ✅ Gemini CLI v0.24.4（已驗證可運行，完整 CLI 介面）
- ✅ Node.js v20.20.0
- ✅ Docker Compose v5.0.1
- ✅ Gemini API Key 已配置（~/.bashrc）

**已完成項目**（2026-01-21）：
- ✅ Redis 服務（redis:7-alpine，512M limit）
- ✅ 資源限制優化（9.5GB / 15GB，預留 5.5GB 系統）
- ✅ .env 文件（移除硬編碼密碼）
- ✅ docker-compose.yml 備份（docker-compose.yml.backup）
- ✅ n8n Queue Mode（EXECUTIONS_MODE=queue + Redis）

**docker-compose.yml 位置**：`/opt/aplus-tech/docker-compose.yml`

**部署狀態**：
- ✅ 7 個容器運行中（npm, wordpress, db-wp, n8n, db-n8n, redis, waha）
- ✅ Redis 已連接 n8n（Queue Mode 啟用）

---

### 🔄 Phase 5.0 Phase C：功能保留驗證（進行中 2026-01-24）

#### C.0 新 VPS 狀態檢查（2026-01-24 23:00 UTC）

**檢查結果**：✅ WordPress + Docker 服務正常運行

**詳細狀態**：

**VPS 基本資訊** ✅
- IP: 76.13.30.201
- 運行時間: 47 小時（自 2026-01-23 啟動）

**Docker 服務狀態** ✅ 全部運行中（Up 47 hours）
- wordpress (LiteSpeed): port 8080
- db-wp (MariaDB): port 3306
- n8n: port 5678
- waha: port 3001
- redis: port 6379
- npm (Nginx Proxy Manager): port 80/443
- db-n8n (PostgreSQL): port 5432

**WordPress 狀態** ✅ 已遷移並運行
- Server: LiteSpeed
- HTTP Status: 200 OK
- Domain: aplus-tech.com.hk
- wp-content: 完整（plugins, themes, uploads 全部遷移）

**DNS 狀態** ⚠️ 待確認
- origin.aplus-tech.com.hk → 15.235.199.194（舊 VPS）
- 新 VPS: 76.13.30.201

**下一步**：~~執行 C.1-C.5 功能驗證測試~~ → **已暫停（架構決策變更）**

---

### 🔴 架構決策：暫停 Workers/KV/D1 計劃（2026-01-24 23:30 UTC）

#### 決策摘要

**選擇方案 B**：R2 + Cloudflare CDN（只保留 R2 圖片 CDN）

**核心理由**：
1. ✅ VPS LiteSpeed 本身已經快（TTFB 0.37s）
2. ✅ Workers 架構複雜度 > 收益（cache hit 只快 0.29s）
3. ✅ R2 CDN 圖片加速已解決 80% 效能問題
4. ✅ 零維護成本（冇 cache invalidation 問題）

#### 暫停項目清單

| 項目 | 原計劃 | 暫停原因 |
|------|--------|---------|
| Phase 4.7 | 安全與效能優化 | VPS 本身快，唔需要 KV Cache |
| Task 4.7.6 | Cache Warming API | 暫停 KV Cache，唔需要 warming |
| Phase C.1-C.3 | Workers/KV/D1 驗證 | 暫停 Workers 架構 |
| Phase E | Cache Warming 測試 | 暫停 KV Cache |

#### 保留項目

- ✅ R2 圖片存儲 + CDN
- ✅ WordPress Plugin（R2 上傳）
- ✅ Phase D：新功能整合（WhatsApp Bot, n8n 自動化）

#### 詳細分析

**完整分析記錄**：docs/ARCHITECTURE_ISSUES.md
- 8 個架構缺點分析
- 3 個方案比較（A/B/C）
- VPS 速度測試結果
- 最終決策理由

---

#### 📋 5-Phase 架構概覽（已更新）

| Phase | 名稱 | 狀態 | 說明 |
|-------|------|------|------|
| **Phase A** | VPS 遷移準備 | ✅ 完成 | VPS 診斷完成（2026-01-20）|
| **Phase B** | 基礎服務部署 | ✅ 完成 | Docker Compose 優化 + Redis 部署（2026-01-21）|
| **Phase C** | 功能保留驗證 | ⏸️ 部分暫停 | C.0 完成，C.1-C.3 暫停（Workers 架構暫停）|
| **Phase D** | 新功能整合 | 待開始 | WhatsApp Bot + CRM + 會計系統 + 內容行銷自動化 |
| **Phase E** | Cache Warming | ⏸️ 暫停 | 已暫停（KV Cache 架構暫停）|

#### 🎯 核心目標

1. **VPS 遷移**：
   - 新 VPS：2 CPU / **15GB RAM** / 193GB Storage / $6.99/month
   - 資源分配：~10GB 可用於 Docker 服務 + 5GB 預留（AI 工具 + 系統）

2. **100% 保留現有功能**：
   - ✅ KV Edge Cache（96% 加速，0.15s TTFB）
   - ✅ D1 數據同步（WordPress → D1 實時）
   - ✅ R2 媒體存儲（`media.aplus-tech.com.hk`）
   - ✅ Purge API（自動清除 cache）
   - ✅ Worker URL 代理（`cloudflare-9qe.pages.dev`）

3. **新增 AI 自動化**：
   - ✅ Claude Code CLI（本地開發工具）**已安裝並驗證**
   - ✅ Gemini CLI v0.24.4（Vision OCR + 內容生成）**已安裝並驗證**
   - ⏳ n8n 自動化平台（Redis Queue Mode）**n8n 已安裝，待添加 Redis**
   - ✅ WAHA WhatsApp Bot（Webhook 整合）**已安裝**

4. **業務功能擴展**：
   - 🆕 WhatsApp 客戶服務自動化（WAHA + n8n + D1 CRM）
   - 🆕 收據/發票掃描會計系統（Gemini Vision OCR + D1 Accounting）
   - 🆕 社交媒體內容行銷（WordPress REST API + Facebook Graph API）

#### 📊 資源分配（15GB RAM Total - 已更正）

| 服務 | 記憶體限制 | 說明 |
|------|-----------|------|
| MySQL | 2GB | WordPress 資料庫（15GB 環境可分配更多）|
| WordPress | 2GB | PHP-FPM + Apache |
| PostgreSQL | 1GB | n8n 資料庫 |
| n8n | 2GB | Queue Mode 自動化平台 |
| WAHA | 1.5GB | WhatsApp HTTP API |
| Redis | 512MB | n8n Queue Backend |
| NPM | 512MB | Nginx Proxy Manager |
| **小計** | **9.5GB** | Docker 服務保留 |
| 系統 + AI 工具 | 5.5GB | OS + Claude Code + Gemini CLI |

#### 🔧 關鍵技術決策

1. **DNS 策略**：
   - `origin.aplus-tech.com.hk` → 灰雲（DNS-Only）直達 VPS
   - `www.aplus-tech.com.hk` → 橙雲（Proxied）經 Worker 代理
   - `media.aplus-tech.com.hk` → R2 Custom Domain

2. **Docker 編排**：
   - 使用 Docker Compose 統一管理 7 個服務
   - Resource limits 防止 OOM
   - Health checks 自動重啟
   - Persistent volumes 數據持久化

3. **安全與認證**：
   - Cloudflare Tunnel 安全外部訪問（n8n + MySQL）
   - Secret key 驗證（SYNC_SECRET_KEY + PURGE_SECRET）
   - D1 Schema 擴展（CRM + Accounting 表結構）

4. **Cache Warming 實作**（Task 4.7.6）：
   - Sitemap Crawler（自動發現所有頁面）
   - 並發控制（10 concurrent requests）
   - `/api/warm-cache` POST endpoint
   - Secret key 防止惡意觸發

#### 📁 新建檔案清單

1. **Docker 配置**：
   - `docker-compose.yml`（673 行）
   - `.env`（環境變數）

2. **API Endpoints**：
   - `src/routes/api/warm-cache/+server.ts`（200+ 行，POST + GET）

3. **D1 SQL Schemas**：
   - `migrations/005_crm_tables.sql`（CRM 聯絡人 + 對話記錄）
   - `migrations/006_accounting_tables.sql`（會計科目 + 分錄 + 報表）

4. **AI 工具配置**：
   - `.claude/config.json`（Claude Code 設定）
   - `.gemini/config.yaml`（Gemini CLI 設定）

#### ⚠️ 風險與緩解

| 風險 | 影響 | 緩解方案 |
|------|------|---------|
| RAM 不足 | 服務 crash | Resource limits + Swap 4GB |
| DNS 切換停機 | 短暫無法訪問 | 分階段切換，保留 origin 備援 |
| Cache 失效 | 首次訪問慢 | Phase E Cache Warming 預熱 |
| 數據遷移失敗 | 數據丟失 | 完整備份 + 測試環境驗證 |

#### 🔗 相關文檔

- **完整實施計劃**：[.ai/IDEAS.md (Line 457-1738)](.ai/IDEAS.md)
- **Docker Compose**：[.ai/IDEAS.md (Line 673-871)](.ai/IDEAS.md)
- **D1 CRM Schema**：[.ai/IDEAS.md (Line 1317-1344)](.ai/IDEAS.md)
- **D1 Accounting Schema**：[.ai/IDEAS.md (Line 1357-1392)](.ai/IDEAS.md)
- **Cache Warming API**：[.ai/IDEAS.md (Line 1447-1635)](.ai/IDEAS.md)
- **Gemini Conversation Insights**：[.ai/IDEAS.md (Line 1703-1715)](.ai/IDEAS.md)

---

## 📋 計劃中（Phase 5.1-8.0）

- [ ] **Phase 5.1**：Invoice/Quotation 系統（PDF 生成 + R2 存儲）
- [ ] **Phase 6.0**：AI SEO 自動化系統（Claude API + Cron Worker）
- [ ] **Phase 7.0**：全面測試（DNS + Worker + 同步 + 性能）
- [ ] **Phase 8.0**：正式上線切換

---

## 里程碑記錄

### 2026-01-18
- ✅ **Phase 4.8.4 完成**：Purge API 測試成功
  - 測試：WordPress 更新產品 → 自動觸發 Purge API → KV Cache 清除成功
  - 驗證：`wrangler kv key list` 返回空陣列，證明 cache 已清除
  - 位置：Wordpress Plugin/wp-cache-purge.php:21, src/routes/api/purge/+server.ts:23

- ✅ **Phase 4.8.2 完成**：D1 數據同步測試成功
  - 問題：VPS WordPress Plugin 同步失敗，返回 `{"error":"Unauthorized"}`
  - 原因：`platform.env.SYNC_SECRET_KEY` 環境變數未設定
  - 修復：修改 `wrangler.toml` 加返 `[vars]` section 設定 SYNC_SECRET_KEY
  - 位置：wrangler.toml:21-23
  - Commit: fda2c0b
  - 測試結果：Product ID 6947 成功同步到 D1，R2 圖片上傳正常

### 2026-01-11
- ✅ **Phase 4.6 Bug Fix**：修復 R2 圖片損壞問題
  - 問題：圖片上傳到 R2 後損壞無法預覽
  - 修復：blob() → arrayBuffer()
  - 位置：api/sync/+server.ts:50
  - Commit: e83c623
- ✅ **Phase 4.6 Bug Fix**：加入 URL Validation
  - 問題：media_mapping 誤存 R2 URL
  - 修復：API 拒絕非 WordPress URL
  - 位置：api/sync/+server.ts:8-12
  - Commit: 30950d1

### 2026-01-08
- ✅ **Phase 4.6 上線**：混合架構成功部署
  - HTML 由 Origin（Shared Hosting）提供
  - 圖片由 R2（`media.aplus-tech.com.hk`）提供
  - Worker URL 代理透過 `cloudflare-9qe.pages.dev`

### 2025-01-10
- ✅ 創建 AI 開發環境
- ✅ 設定 CLAUDE.md + CLAUDE_OPUS.md
- ✅ 更新 `context.yaml` 填入真實專案資訊
- ✅ 整合 `CHANGELOG.md`（廣東話格式 + 表格）

---

## 遇到嘅問題

### 2026-01-08：WordPress "Critical Error"
**問題**：同步時 WordPress 出現 Critical Error
**解決方案**：實現 `platform.context.waitUntil` 背景同步
**來源**：architecture_design.md#Phase 4.5

### 2026-01-08：中文檔名 400 Bad Request
**問題**：圖片檔名有中文字導致 R2 上傳失敗
**解決方案**：URL encoding 處理
**來源**：api/sync/+server.ts

### 2026-01-08：D1_TYPE_ERROR
**問題**：D1 寫入時 `undefined` 導致錯誤
**解決方案**：數據清理，處理所有 `undefined` 值
**來源**：api/sync/+server.ts

---

## 關鍵指標

### 系統狀態
| 項目 | 當前狀態 | 目標 |
|------|---------|------|
| KV 緩存命中率 | ~80% | >80% ✅ |
| TTFB（緩存命中） | <100ms | <100ms ✅ |
| TTFB（首次載入） | ~500ms | <500ms ✅ |
| D1 同步延遲 | <1s | <1s ✅ |
| R2 圖片遷移 | 100% | 100% ✅ |

### 待修復問題
| 問題 | 優先級 | 狀態 |
|------|--------|------|
| wrangler.toml 明文密碼 | 🔴 P0 | 待修復 |
| media_mapping 全表查詢 | 🟠 P1 | 待優化 |
| 圖片順序上傳 | 🟠 P1 | 待優化 |
| 缺少錯誤重試 | 🟠 P1 | 待新增 |
| 緩存 Key 不一致 | 🟠 P1 | 待修復 |

---

## 下次啟動時要做

### 立即執行（Phase 4.7）
1. 🔴 **優先**：移除 `wrangler.toml` 明文密碼（安全漏洞）
2. 🟠 優化 `media_mapping` 查詢（加 KV Cache）
3. 🟠 改為並行上傳圖片（`Promise.all()`）

### 下一階段（Phase 5）
4. 實現 Invoice/Quote 系統
5. 建立 D1 `invoices` 和 `quotations` 表

---

## 相關文檔

- [task.md](task.md) - 詳細任務清單（680 行）
- [implementation_plan.md](implementation_plan.md) - 實施計劃（2216 行）
- [architecture_design.md](architecture_design.md) - 架構設計（完整技術方案）
- [.ai/context.yaml](.ai/context.yaml) - 專案設定
- [.ai/ATTEMPTED_SOLUTIONS.md](.ai/ATTEMPTED_SOLUTIONS.md) - 已嘗試方案記錄（避免重複踩坑）

---

**最後更新：2026-01-18**