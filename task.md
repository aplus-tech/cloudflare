# 任務清單：WordPress + Cloudflare 系統

> 語言：廣東話 | 更新日期：2025-01-10 | 版本：2.0

---

## 📊 進度總覽

- ✅ **已完成**：Phase 0-4.6（基礎設施、緩存、同步、R2 遷移）
- ✅ **已完成**：Phase 4.8（已完成 2026-01-18）
- ✅ **已完成**：Phase 5.0 Phase A-B（VPS 診斷 + Docker 優化，已完成 2026-01-21）
- 🚧 **待開始**：Phase 4.7（修復安全和性能問題）、Phase 5.0 Phase C-E（功能保留、新功能整合、測試）、Phase 5-6（Invoice/Quote 系統、AI SEO 系統）

---

## ✅ Phase 0-4.6：已完成階段

### Phase 0: 清理與重置
- [x] 刪除未授權 `edge-cache-worker` 資料夾
- [x] 刪除未授權 `wp-purge-plugin.php`
- [x] 更新 `wrangler.toml` 綁定 KV

### Phase 2: 基礎設施搭建
- [x] 初始化 SvelteKit 專案
- [x] 配置 D1 綁定 (`wordpress-cloudflare`)
- [x] 執行 `npm install`
- [x] 連接 GitHub 並部署到 Cloudflare Pages
- [x] 取得部署網址：`cloudflare-9qe.pages.dev`
- [x] 執行 `schema.sql` 建表

### Phase 3: KV 邊緣緩存
- [x] 創建 KV Namespace (`HTML_CACHE`)
- [x] 實現 KV 緩存邏輯 (`hooks.server.ts`)
- [x] 實現緩存繞過（登入用戶、購物車）
- [x] 編寫 WordPress 插件 (`wp-cache-purge.php`)
- [x] 實現 `save_post` 自動清除緩存

### Phase 4: 數據同步管道
- [x] 建立 API Route (`src/routes/api/sync/+server.ts`)
- [x] 實現 Secret Key 驗證
- [x] 實現 `INSERT OR REPLACE INTO sync_products`
- [x] 編寫 WordPress Webhook (`wp-d1-sync.php`)
- [x] Hook: `save_post`, `woocommerce_update_product`
- [x] 驗證實時同步（< 1 秒）

### Phase 4.5: R2 語義化媒體遷移
- [x] 配置 R2 Bucket (`media-bucket`)
- [x] 設定 Media Domain (`media.aplus-tech.com.hk`)
- [x] 建立 D1 `media_mapping` 表
- [x] 實現語義化路徑（`products/{brand}/{filename}`）
- [x] 開發自動遷移 Worker

### Phase 4.6: R2 圖片加速
- [x] Worker 連結測試
- [x] R2 圖片加速整合
- [x] WordPress 插件接收 R2 路徑
- [x] 實現 `wp_get_attachment_url` filter
- [x] 驗證圖片加載速度提升
- [x] **Bug Fix (2026-01-11)**：修復 R2 圖片損壞（blob → arrayBuffer）
- [x] **Bug Fix (2026-01-11)**：加入 URL Validation 防止錯誤 URL

---

## ✅ Phase 4.8：VPS 全面測試（已完成 2026-01-18）

### 目標
確認 VPS (http://15.235.199.194/) 所有功能正常，準備將域名遷移

### 前置步驟：DNS 與 WordPress 設定

#### 4.8.0：Cloudflare DNS 與 WordPress 設定（已完成 ✅）

**步驟 1：Cloudflare DNS 設定**
- [x] 登入 Cloudflare Dashboard
- [x] 去 DNS 管理頁面
- [x] 加入新 A Record：
  - Type: `A`
  - Name: `test`
  - Content: `15.235.199.194`
  - Proxy status: **Proxied（Orange Cloud）**
  - TTL: Auto
- [x] 儲存設定

**步驟 2：等待 DNS 生效**
- [x] DNS 已生效
- [x] 測試 DNS 解析：`nslookup test.aplus-tech.com.hk`

**步驟 3：更新 VPS WordPress Site URL**
- [x] 已更新為 https://test.aplus-tech.com.hk

使用 **WP-CLI**（推薦）：
```bash
# SSH 登入 VPS
ssh user@15.235.199.194

# 更新 Site URL 同 Home URL
wp option update siteurl 'https://test.aplus-tech.com.hk' --allow-root
wp option update home 'https://test.aplus-tech.com.hk' --allow-root

# 驗證設定
wp option get siteurl --allow-root
wp option get home --allow-root
```

或使用 **MySQL**：
```sql
-- 登入 MySQL
mysql -u root -p

-- 選擇 WordPress 資料庫
USE wordpress;

-- 更新 URL
UPDATE wp_options SET option_value = 'https://test.aplus-tech.com.hk' WHERE option_name = 'siteurl';
UPDATE wp_options SET option_value = 'https://test.aplus-tech.com.hk' WHERE option_name = 'home';

-- 驗證
SELECT * FROM wp_options WHERE option_name IN ('siteurl', 'home');
```

**步驟 4：驗證設定**
- [x] 訪問 `https://test.aplus-tech.com.hk`
- [x] 確認可以正常顯示
- [x] 檢查 SSL 證書有效（Cloudflare 自動提供）

**步驟 5：WordPress Plugin 設定**
- [x] 上傳 Plugin v2.0 到 VPS
- [x] Activate Plugin

---

### 測試項目

#### 4.8.1：VPS WordPress R2 圖片功能測試
- [x] VPS 產品圖片上傳到 R2 ✅
- [x] R2 圖片可以預覽 ✅
- [x] VPS WordPress 前台圖片正常顯示 ✅
- [x] D1 記錄產品圖片 URL ✅

**測試結果（2026-01-12）**：
- ✅ VPS WordPress 成功上傳產品圖片到 R2
- ✅ D1 正確記錄 media_mapping（wordpress_url → r2_url）
- ✅ VPS WordPress 前台正常顯示 R2 圖片

#### 4.8.3：KV 緩存測試（✅ 2026-01-17 完成）
- [x] HTML 緩存正常運作 ✅
- [x] Cache HIT/MISS 正確 ✅
- [x] 登入用戶繞過緩存 ✅
- [x] 購物車繞過緩存 ✅
- [x] 解決 redirect loop 問題 ✅
- [x] 頁面速度提升驗證 ✅

**測試結果（2026-01-17）**：
- ✅ 成功解決 redirect loop 問題（方案 C + 清空 KV Cache）
- ✅ KV Cache 生效，頁面載入速度明顯提升
- ✅ `test.aplus-tech.com.hk` 所有頁面正常運作
- ✅ `cloudflare-9qe.pages.dev` 正確 redirect 去 Custom Domain

**相關文檔**：
- `.ai/ATTEMPTED_SOLUTIONS.md` - 詳細記錄失敗方案 A/B 同成功方案 C
- `PROGRESS.md` - 完整測試過程記錄
- Commit: [4fbf47d](https://github.com/aplus-tech/cloudflare/commit/4fbf47d), [f21f7d8](https://github.com/aplus-tech/cloudflare/commit/f21f7d8)

#### 4.8.2：D1 數據同步測試
- [ ] 產品同步到 D1 (`sync_products` table)
- [ ] 文章同步到 D1
- [ ] media_mapping 正確記錄
- [ ] 同步速度測試（< 1 秒）

#### 4.8.4：Purge API 測試
- [ ] 更新產品自動清除緩存
- [ ] 更新文章自動清除緩存
- [ ] Purge All API 正常運作

#### 4.8.5：整體效能測試
- [ ] 頁面載入速度
- [ ] 圖片載入速度
- [ ] TTFB (Time To First Byte)
- [ ] 併發測試

---

## ⚠️ Phase 4.7：修復安全和性能問題（待開始）

### 🔴 高優先級：安全漏洞修復

#### 任務 4.7.1：移除 wrangler.toml 明文密碼
- [ ] **步驟 1**：編輯 `wrangler.toml`
  - 刪除 Line 17-19 的明文密碼
  - 添加註解：`# Secrets 用 wrangler secret put 設定`
- [ ] **步驟 2**：設定 Wrangler Secrets
  ```bash
  wrangler secret put SYNC_SECRET_KEY
  wrangler secret put PURGE_SECRET
  wrangler secret put ANTHROPIC_API_KEY
  ```
- [ ] **步驟 3**：驗證 WordPress 插件密鑰一致性
  - 檢查 `wp-d1-sync.php` 中的 `$secret_key`
  - 檢查 `wp-cache-purge.php` 中的 `$secret_key`
- [ ] **步驟 4**：重新部署並測試
  ```bash
  wrangler pages deploy .svelte-kit/cloudflare
  ```
  - 測試正確密鑰（應成功）
  - 測試錯誤密鑰（應返回 403）

**參考文檔**：implementation_plan.md#6.1

---

#### 任務 4.7.6：實作 Cache Warming 功能（用戶確認：2026-01-18）

**【問題原因】**
- 現時 KV Cache 係被動式：只有用戶訪問先會 cache
- 首次訪問需要 3.59s，之後 cache hit 只需 0.15s（96% 減少）
- 用戶要求主動式 warm up：一次過預先 cache 所有頁面

**【方案成立】**
使用 **Sitemap Crawler 方案**：
- WordPress 自動生成 Sitemap（`/wp-sitemap.xml`）
- 建立 `/api/warm-cache` endpoint
- 並發控制 10 concurrent requests
- 無額外費用（Cloudflare Pages Free Plan）

**技術實作步驟**：

- [ ] **步驟 1**：建立 API Endpoint
  - 檔案：`cloudflare-wordpress/src/routes/api/warm-cache/+server.ts`
  - 實作 POST handler
  - 加入 Secret key 驗證（同 PURGE_SECRET）

- [ ] **步驟 2**：實作 Sitemap Fetcher
  ```typescript
  // Fetch WordPress sitemap
  const sitemapUrl = 'http://origin.aplus-tech.com.hk/wp-sitemap.xml';
  const response = await fetch(sitemapUrl);
  const xml = await response.text();
  ```

- [ ] **步驟 3**：實作 XML Parser
  ```typescript
  // Parse XML 提取所有 <loc> URLs
  const urls = parseSitemapXML(xml);
  // 返回：['https://...', 'https://...', ...]
  ```

- [ ] **步驟 4**：實作並發控制批量 Fetch
  ```typescript
  // 限制 10 concurrent requests
  const batchSize = 10;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.all(
      batch.map(url => fetch(url)) // 觸發 KV Cache
    );
  }
  ```

- [ ] **步驟 5**：返回結果
  ```typescript
  return json({
    success: true,
    cached: urls.length,
    urls: urls // 選填：返回已 cache 嘅 URL 清單
  });
  ```

- [ ] **步驟 6**：測試功能
  ```bash
  # 手動觸發 warm cache
  curl -X POST https://cloudflare-9qe.pages.dev/api/warm-cache \
    -H "Content-Type: application/json" \
    -d '{"secret": "Lui@63006021"}'

  # 驗證返回結果
  # 應返回：{"success":true,"cached":XX}

  # 檢查 KV Cache
  npx wrangler kv key list --namespace-id 695adac89df4448e81b9ffc05f639491
  # 應該睇到所有 "html:..." keys
  ```

- [ ] **步驟 7**：效能驗證
  - 執行 warm cache API
  - 用 `curl -w` 測試多個頁面載入速度
  - 確認所有頁面都係 cache hit（0.15s 左右）

**【來源證據】**
- PROGRESS.md:253-300 - 詳細技術方案
- .ai/context.yaml:32-42 - 當前焦點
- WordPress Sitemap：https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/
- 參考實作：Netlify Cache Warmer Plugin（https://github.com/netlify/netlify-plugin-cache-warmer）

**相關檔案**：
- 新建：`cloudflare-wordpress/src/routes/api/warm-cache/+server.ts`
- 使用：`hooks.server.ts` 現有 cache 邏輯（自動觸發 KV 儲存）
- 參考：`src/routes/api/purge/+server.ts` - Secret key 驗證機制

---

## ✅ Phase 5.0 Phase A：VPS 診斷（已完成 2026-01-20）

### 目標
驗證新 VPS (76.13.30.201) 實際硬件規格與已安裝服務，評估資源使用情況。

### 診斷結果

#### VPS 連接
- [x] SSH 連接成功（root@76.13.30.201 via SSH key）✅

#### 實際硬件規格
- [x] CPU：2 cores ✅
- [x] **RAM：15GB**（❗️更正：文檔誤記為 8GB，實際多 87.5%）✅
- [x] 存儲：193GB total（18GB used, 10%）✅
- [x] 記憶體使用：2.0GB / 15GB（13GB 可用）✅

#### 已安裝服務（Docker）
- [x] Nginx Proxy Manager（ports 80/81/443）✅
- [x] WordPress（port 8080）✅
- [x] MariaDB（WordPress 資料庫）✅
- [x] n8n（自動化平台）✅
- [x] PostgreSQL（n8n 資料庫）✅
- [x] WAHA（WhatsApp HTTP API）✅

#### 已安裝 AI 工具
- [x] Claude Code CLI（已驗證可運行，顯示 trust dialog）✅
- [x] Gemini CLI v0.24.4（已驗證可運行，完整 CLI 介面）✅
- [x] Node.js v20.20.0 ✅
- [x] Docker Compose v5.0.1 ✅
- [x] Gemini API Key 已配置（~/.bashrc）✅

#### 關鍵發現
1. **硬件規格更正**：
   - 文檔記錄：8GB RAM
   - 實際容量：**15GB RAM**（多 87.5%）
   - 存儲：193GB total (18GB used, 10%)

2. **運行中 Docker 服務**（6 個）：
   - Nginx Proxy Manager (ports 80/81/443)
   - WordPress (port 8080)
   - MariaDB (WordPress 資料庫)
   - n8n (自動化平台)
   - PostgreSQL (n8n 資料庫)
   - WAHA (WhatsApp HTTP API)

3. **待安裝項目**：
   - pip3 (Python package manager)
   - Redis 服務 (n8n Queue Mode 需要)

**【來源證據】**：
- PROGRESS.md:328-362（完整診斷結果）
- CHANGLOG.md:134-175（Phase A 完成詳情）
- .ai/IDEAS.md:487-561（VPS 規格與診斷步驟）

---

## ✅ Phase 5.0 Phase B：Docker 優化 + Redis 部署（已完成 2026-01-21）

### 目標
優化 VPS Docker 資源分配，部署 Redis 服務，啟用 n8n Queue Mode。

### 完成項目

#### B.1 Redis 服務部署
- [x] Redis 服務（redis:7-alpine，512M limit）✅
- [x] Redis 連接 n8n 成功 ✅
- [x] n8n Queue Mode 啟用（EXECUTIONS_MODE=queue）✅

#### B.2 資源限制優化（15GB RAM 環境）
- [x] MySQL: 2GB（原無限制 → 2GB）✅
- [x] WordPress: 2GB（原無限制 → 2GB）✅
- [x] PostgreSQL: 1GB（原無限制 → 1GB）✅
- [x] n8n: 2GB（原無限制 → 2GB + Queue Mode）✅
- [x] WAHA: 1.5GB（原無限制 → 1.5GB）✅
- [x] Redis: 512MB（新增）✅
- [x] NPM: 512MB（原無限制 → 512MB）✅
- [x] **總計**: 9.5GB / 15GB（預留 5.5GB 系統 + AI 工具）✅

#### B.3 安全改進
- [x] 明文密碼 → .env 環境變數 ✅
- [x] 舊配置備份（docker-compose.yml.backup）✅
- [x] .env.example 模板建立 ✅

#### B.4 部署結果
- [x] 7 個容器運行中（npm, wordpress, db-wp, n8n, db-n8n, redis, waha）✅
- [x] Redis 連接 n8n 成功 ✅
- [x] 資源使用優化（9.5GB / 15GB）✅
- [x] Phase 5.0 Phase B 完成 ✅

**docker-compose.yml 位置**：`/opt/aplus-tech/docker-compose.yml`

**【來源證據】**：
- PROGRESS.md:353-364（完成記錄）
- CHANGLOG.md:14-74（Phase B 完成詳情）
- .ai/IDEAS.md:660-1102（Docker Compose 架構設計）

---

## 🚧 Phase 5.0 Phase C：功能保留驗證（待開始）

### 目標
確保 VPS 遷移後，Cloudflare Workers、KV Cache、D1 同步、R2 媒體等現有功能繼續正常運作。

### C.1 Cloudflare Workers 持續運作驗證
- [ ] 確認 Worker 部署正常（curl -I https://cloudflare-9qe.pages.dev/）
- [ ] 測試 KV Cache HIT（第一次 MISS，第二次 HIT）
- [ ] 測試靜態資源代理（CSS/JS）
- [ ] 測試 R2 圖片（https://media.aplus-tech.com.hk/...）

### C.2 KV Cache 驗證程序
- [ ] 清空現有 Cache（curl purge-all API）
- [ ] 效能測試（首次訪問 2-4s，二次訪問 <0.2s）
- [ ] 驗證 Cache Key 格式（npx wrangler kv key list）

### C.3 D1 Database 同步驗證
- [ ] 測試產品同步（WordPress 更新 → D1 查詢）
- [ ] 驗證 API 認證（POST /api/sync）
- [ ] 清理測試數據

### C.4 R2 媒體存儲連接測試
- [ ] 驗證現有圖片可訪問（從 D1 獲取路徑 → curl R2 URL）
- [ ] 測試新圖片上傳（WordPress 上傳 → D1 media_mapping）

### C.5 完整功能測試清單

| 功能 | 測試方法 | 預期結果 | 實際結果 |
|------|---------|---------|---------|
| KV Cache HIT | `curl -I` 兩次 | 第二次 X-Cache: HIT | [ ] |
| 效能加速 | `curl -w` 測時間 | 從 3s+ 到 0.15s | [ ] |
| D1 產品同步 | WordPress 更新 → D1 查詢 | < 1 秒內同步 | [ ] |
| D1 文章同步 | WordPress 發布 → D1 查詢 | 記錄存在 | [ ] |
| R2 圖片上傳 | 上傳產品圖 | media_mapping 有記錄 | [ ] |
| R2 圖片訪問 | `curl` R2 URL | 200 OK | [ ] |
| Purge 單頁 | 更新產品 → 檢查 KV | 對應 key 被刪除 | [ ] |
| Purge 全部 | 調用 purge-all API | 所有 key 被刪除 | [ ] |
| Admin 繞過 | 訪問 /wp-admin/ | Redirect 到 origin | [ ] |
| 登入繞過 | 帶 cookie 訪問 | 無 KV Cache | [ ] |

**【來源證據】**：
- .ai/IDEAS.md:1105-1269（Phase C 驗證步驟）

---

## 🚧 Phase 5.0 Phase D：新功能整合（待開始）

### 目標
整合 WhatsApp Bot、會計自動化、內容行銷自動化等新功能。

### D.1 WhatsApp Bot 設定（WAHA + n8n + D1 CRM）
- [ ] WAHA 接收訊息 → n8n 處理邏輯 → D1 存儲客戶數據
- [ ] 建立 D1 CRM Schema（crm_contacts, crm_conversations）
- [ ] 設定 n8n Workflow（關鍵詞識別、自動回覆、記錄 D1、通知管理員）

### D.2 會計自動化（Gemini Vision OCR → D1 → iXBRL）
- [ ] Gemini 2.5 Pro Vision OCR 識別發票/收據
- [ ] 建立 D1 Accounting Schema（accounting_chart, accounting_entries, accounting_reports）
- [ ] n8n 自動化流程（上傳圖片 → OCR → D1 記錄 → 生成報表）

### D.3 內容行銷自動化（Crawler → WordPress → Social Media）
- [ ] n8n 定時爬取供應商網站
- [ ] Claude/Gemini AI 改寫內容（SEO 優化）
- [ ] WordPress REST API 發布文章
- [ ] Facebook/Instagram Graph API 發布帖文

**【來源證據】**：
- .ai/IDEAS.md:1273-1409（Phase D 新功能整合）

---

## 🚧 Phase 5.0 Phase E：Cache Warming + 測試（待開始）

### 目標
實作 Cache Warming API，執行完整效能測試，驗證所有功能正常運作。

### E.1 Cache Warming API Endpoint 實作
- [ ] 建立 `/api/warm-cache` endpoint（cloudflare-wordpress/src/routes/api/warm-cache/+server.ts）
- [ ] 實作 Sitemap Fetcher（fetch WordPress sitemap）
- [ ] 實作 XML Parser（提取所有 <loc> URLs）
- [ ] 實作並發控制批量 Fetch（限制 10 concurrent requests）
- [ ] 返回結果（cached URLs, errors, timing）

### E.2 測試 Cache Warming
- [ ] 部署代碼（npm run build + wrangler pages deploy）
- [ ] 測試 GET（查看 sitemap）
- [ ] 執行 Warm Cache（POST /api/warm-cache）
- [ ] 驗證 KV Cache（npx wrangler kv key list）

### E.3 效能 Benchmarking

| 狀態 | TTFB | Total Time | 加速比 |
|------|------|------------|--------|
| 無 Cache | ~2.5s | ~3.5s | 1x |
| 有 Cache | ~0.08s | ~0.15s | 23x |
| **改善** | **96%** | **96%** | - |

**【來源證據】**：
- PROGRESS.md:253-300（Cache Warming 技術方案）
- task.md:226-297（Task 4.7.6 步驟）
- .ai/IDEAS.md:1412-1675（Phase E 完整代碼設計）

---

### 🟠 中優先級：性能優化

#### 任務 4.7.2：優化 media_mapping 查詢
- [ ] **步驟 1**：創建新 KV Namespace
  ```bash
  wrangler kv:namespace create "MEDIA_MAPPING_CACHE"
  ```
- [ ] **步驟 2**：更新 `wrangler.toml` 添加綁定
- [ ] **步驟 3**：修改 `hooks.server.ts`
  - 新增 `getMediaMappings()` 函數
  - 優先從 KV 讀取 mappings
  - KV 未命中時從 D1 查詢並寫入 KV
  - TTL 設為 1 小時
- [ ] **步驟 4**：修改 `api/sync/+server.ts`
  - 在 `syncImageToR2()` 完成後清除 KV 緩存
  - `await env.MEDIA_MAPPING_CACHE.delete('all_mappings');`
- [ ] **步驟 5**：測試並驗證
  - 觀察日誌確認 KV 命中率
  - 測試新增圖片後 KV 自動更新

**參考文檔**：implementation_plan.md#7.1

#### 任務 4.7.3：並行上傳圖片到 R2
- [ ] **步驟 1**：修改 `api/sync/+server.ts`
  - 找到順序上傳的 for loop（約 Line 102-107）
  - 改為 `Promise.all()` 並行上傳
  ```typescript
  const uploadPromises = gallery_images_raw.map(async (img) => {
      const r2Path = await syncImageToR2(img.url, productSlug, brand, env);
      return `https://media.example.com/${r2Path}`;
  });
  const gallery_images = await Promise.all(uploadPromises);
  ```
- [ ] **步驟 2**：測試多圖產品同步
  - 選擇有 5+ 張圖片的產品
  - 記錄修改前後的同步時間
  - 預期速度提升 5-10 倍

**參考文檔**：implementation_plan.md#7.2

#### 任務 4.7.4：加入圖片上傳重試機制
- [ ] **步驟 1**：修改 `syncImageToR2()` 函數
  - 添加 `retries` 參數（默認 3）
  - 用 for loop 包裹上傳邏輯
  - 失敗時 Exponential Backoff（1s → 2s → 4s）
  - 最多重試 3 次
- [ ] **步驟 2**：添加 R2 存在性檢查
  - D1 有記錄但 R2 無文件時強制重新上傳
  - 使用 `r2.head()` 檢查文件是否真實存在
- [ ] **步驟 3**：測試失敗重試
  - 暫時關閉 R2 網絡（模擬失敗）
  - 觀察日誌確認重試行為
  - 恢復網絡後驗證最終成功

**參考文檔**：implementation_plan.md#7.3

#### 任務 4.7.5：統一緩存 Key 格式
- [ ] **步驟 1**：創建 `normalizePath()` 函數
  - 移除開頭和結尾的 `/`
  - 空路徑轉為 `home`
  - 轉為小寫
- [ ] **步驟 2**：修改 `hooks.server.ts`
  - 在存儲緩存前調用 `normalizePath()`
  - 記錄標準化後的 cacheKey
- [ ] **步驟 3**：創建/修改 `api/purge/+server.ts`
  - 使用相同的 `normalizePath()` 函數
  - 記錄清除的 cacheKey
- [ ] **步驟 4**：測試緩存清除
  - 發布文章並觸發清除
  - 檢查日誌確認 Key 格式一致
  - 驗證緩存確實被清除

**參考文檔**：implementation_plan.md#8.1

---

## 🚧 Phase 5：Invoice 同 Quotation 系統（待開始）

### 準備工作

#### 任務 5.0：更新 D1 Schema
- [ ] **步驟 1**：編輯 `schema.sql`
  - 添加 `invoices` 表定義
  - 添加 `quotations` 表定義
  - 添加索引：`idx_invoices_status`, `idx_quotations_status`
- [ ] **步驟 2**：執行 SQL
  ```bash
  wrangler d1 execute wordpress-data --file=schema.sql
  ```
- [ ] **步驟 3**：驗證表已創建
  ```bash
  wrangler d1 execute wordpress-data \
    --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%invoice%'"
  ```

**參考文檔**：implementation_plan.md#9.2

#### 任務 5.0.1：創建 R2 Bucket for Documents
- [ ] **步驟 1**：創建 Bucket
  ```bash
  wrangler r2 bucket create business-documents
  ```
- [ ] **步驟 2**：更新 `wrangler.toml` 添加綁定
  ```toml
  [[r2_buckets]]
  binding = "BUSINESS_DOCUMENTS"
  bucket_name = "business-documents"
  ```
- [ ] **步驟 3**：設定 Subdomain（可選）
  - 在 Cloudflare Dashboard 配置 `documents.example.com`
  - 指向 `business-documents` Bucket

**參考文檔**：implementation_plan.md#9.1

---

### Invoice 系統開發

#### 任務 5.1：實現 Invoice HTML 模板
- [ ] **步驟 1**：創建 `src/lib/invoice-template.ts`
- [ ] **步驟 2**：實現 `generateInvoiceHTML()` 函數
  - Header：公司 Logo + INVOICE 標題
  - Invoice Info：Invoice Number, Date, Due Date
  - Bill To：客戶資訊
  - Items Table：產品列表
  - Summary：小計、稅、運費、總額
  - Footer：付款條款、銀行帳號
- [ ] **步驟 3**：本地測試 HTML 輸出
  - 創建測試數據
  - 生成 HTML 並在瀏覽器預覽
  - 調整樣式（字體、顏色、間距）

**參考文檔**：implementation_plan.md#9.3 (步驟 2)

#### 任務 5.2：實現 Invoice 生成 API
- [ ] **步驟 1**：創建 `src/routes/api/invoice/generate/+server.ts`
- [ ] **步驟 2**：實現 `generateInvoiceNumber()` 函數
  - 格式：`INV-YYYYMM-NNNN`
  - 查詢本月最後一個號碼
  - 序號 +1
- [ ] **步驟 3**：實現 `generatePDF()` 函數（方案 A）
  - 調用 html2pdf.app API
  - 需要註冊帳號並取得 API Key
  - 設定 `wrangler secret put HTML2PDF_API_KEY`
- [ ] **步驟 4**：實現主 POST Handler
  - 從 D1 查詢訂單（`sync_orders`）
  - 生成 Invoice 號碼
  - 生成 HTML
  - 生成 PDF
  - 上傳到 R2
  - 記錄到 D1 `invoices` 表
  - 返回 PDF URL

**參考文檔**：implementation_plan.md#9.3 (步驟 1)

#### 任務 5.3：測試 Invoice 生成
- [ ] **步驟 1**：準備測試數據
  - 在 D1 `sync_orders` 表插入測試訂單
  ```bash
  wrangler d1 execute wordpress-data \
    --command="INSERT INTO sync_orders (...) VALUES (...)"
  ```
- [ ] **步驟 2**：測試 API
  ```bash
  curl -X POST https://example.com/api/invoice/generate \
    -H "Content-Type: application/json" \
    -d '{"order_id": 123}'
  ```
- [ ] **步驟 3**：驗證結果
  - 檢查 D1 `invoices` 表是否有新記錄
  - 訪問返回的 PDF URL
  - 下載並檢查 PDF 格式

**參考文檔**：implementation_plan.md#11.5

---

### Quotation 系統開發

#### 任務 5.4：實現 Quotation HTML 模板
- [ ] **步驟 1**：創建 `src/lib/quotation-template.ts`
- [ ] **步驟 2**：實現 `generateQuoteHTML()` 函數
  - 類似 Invoice 但標題改為 QUOTATION
  - 添加 Valid Until（有效期限）
  - 添加 Notes 欄位
- [ ] **步驟 3**：本地測試 HTML 輸出

**參考文檔**：implementation_plan.md#9.4

#### 任務 5.5：實現 Quotation 生成 API
- [ ] **步驟 1**：創建 `src/routes/api/quote/generate/+server.ts`
- [ ] **步驟 2**：實現 `generateQuoteNumber()` 函數
  - 格式：`QT-YYYYMM-NNNN`
- [ ] **步驟 3**：實現主 POST Handler
  - 接收客戶資訊和產品列表
  - 計算總額（subtotal, tax, total）
  - 生成 Quote 號碼
  - 生成 HTML 和 PDF
  - 上傳到 R2
  - 記錄到 D1 `quotations` 表
  - 返回 PDF URL 和 View URL

**參考文檔**：implementation_plan.md#9.4

#### 任務 5.6：實現 Quotation 前端 UI
- [ ] **步驟 1**：創建 `src/routes/quotes/+page.svelte`
  - 顯示所有報價單列表
  - 過濾器：狀態（draft/sent/accepted/rejected）
  - 搜尋：客戶名稱、Email
- [ ] **步驟 2**：創建 `src/routes/quotes/new/+page.svelte`
  - 表單：客戶資訊（Email, Name, Company）
  - 產品選擇器（從 D1 `sync_products` 讀取）
  - 動態計算總額
  - 提交後調用 `/api/quote/generate`
- [ ] **步驟 3**：創建 `src/routes/quote/[id]/+page.svelte`
  - 顯示報價單詳情
  - PDF 預覽/下載按鈕
  - 操作按鈕：Accept / Reject / Extend Validity

**參考文檔**：implementation_plan.md#9.5

---

### Invoice 前端 UI

#### 任務 5.7：實現 Invoice 管理頁面
- [ ] **步驟 1**：創建 `src/routes/invoices/+page.svelte`
  - 顯示所有 Invoice 列表
  - 過濾器：狀態（pending/paid/cancelled）
  - 搜尋：客戶名稱、Invoice Number
- [ ] **步驟 2**：創建 `src/routes/api/invoices/+server.ts`
  - GET：返回 Invoice 列表（支援過濾和搜尋）
  ```typescript
  export const GET: RequestHandler = async ({ url, platform }) => {
      const status = url.searchParams.get('status');
      const customer_email = url.searchParams.get('customer_email');

      let query = 'SELECT * FROM invoices WHERE 1=1';
      const params = [];

      if (status) {
          query += ' AND status = ?';
          params.push(status);
      }
      if (customer_email) {
          query += ' AND customer_email = ?';
          params.push(customer_email);
      }

      query += ' ORDER BY created_at DESC LIMIT 50';

      const result = await platform.env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json' }
      });
  };
  ```
- [ ] **步驟 3**：實現標記為已付款功能
  - 按鈕：Mark as Paid
  - 調用 `PATCH /api/invoice/{id}/status`
  - 更新 D1 記錄（`status = 'paid'`, `paid_at = timestamp`）

**參考文檔**：implementation_plan.md#9.5

---

## 🚧 Phase 6：AI SEO 自動化系統（待開始）

### 準備工作

#### 任務 6.0：更新 D1 Schema
- [ ] **步驟 1**：編輯 `schema.sql`
  - 添加 `ai_seo_queue` 表定義
  - 添加索引：`idx_seo_queue_status`, `idx_seo_queue_post`
- [ ] **步驟 2**：執行 SQL
  ```bash
  wrangler d1 execute wordpress-data --file=schema.sql
  ```
- [ ] **步驟 3**：驗證表已創建

**參考文檔**：implementation_plan.md#10.2

#### 任務 6.0.1：設定 Anthropic API Key
- [ ] **步驟 1**：註冊 Anthropic 帳號
  - 訪問：https://console.anthropic.com/
  - 取得 API Key
- [ ] **步驟 2**：設定 Secret
  ```bash
  wrangler secret put ANTHROPIC_API_KEY
  # 輸入：sk-ant-xxx
  ```
- [ ] **步驟 3**：測試 API
  ```bash
  curl https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
  ```

**參考文檔**：implementation_plan.md#10.4

---

### API 實現

#### 任務 6.1：實現 SEO 隊列 API
- [ ] **步驟 1**：創建 `src/routes/api/seo/enqueue/+server.ts`
- [ ] **步驟 2**：實現 POST Handler
  - 接收：`post_id`, `post_type`, `title`, `excerpt`, `content`
  - 檢查是否已在隊列（避免重複）
  - 插入到 D1 `ai_seo_queue` 表
  - 返回成功訊息
- [ ] **步驟 3**：測試 API
  ```bash
  curl -X POST https://example.com/api/seo/enqueue \
    -H "Content-Type: application/json" \
    -d '{"post_id":456,"post_type":"post","title":"Test","excerpt":"Test","content":"Content..."}'
  ```

**參考文檔**：implementation_plan.md#10.3

#### 任務 6.2：實現 Cron Worker
- [ ] **步驟 1**：創建 `src/cron/seo-processor.ts`
- [ ] **步驟 2**：實現 `scheduled()` Handler
  - 從 D1 獲取待處理項目（LIMIT 5）
  - 逐個處理：
    1. 標記為 `processing`
    2. 調用 Claude API 生成 SEO
    3. 更新隊列狀態為 `completed`
    4. 寫回 WordPress（可選）
  - 錯誤處理：
    - 記錄錯誤訊息
    - `retry_count + 1`
    - 超過 2 次標記為 `failed`
- [ ] **步驟 3**：實現 `generateSEO()` 函數
  - 構建 Prompt（包含 title, excerpt, content）
  - 調用 Anthropic API
  - 解析返回的 JSON（seo_title, meta_description, focus_keyword）
- [ ] **步驟 4**：實現 `updateWordPressSEO()` 函數（可選）
  - 使用 WordPress REST API
  - 更新 Yoast SEO meta fields

**參考文檔**：implementation_plan.md#10.4

#### 任務 6.3：配置 Cron Trigger
- [ ] **步驟 1**：編輯 `wrangler.toml`
  ```toml
  [triggers]
  crons = ["0 */6 * * *"]  # 每 6 小時執行一次
  ```
- [ ] **步驟 2**：部署 Worker
  ```bash
  wrangler pages deploy .svelte-kit/cloudflare
  ```
- [ ] **步驟 3**：在 Cloudflare Dashboard 驗證
  - Workers & Pages → 你的 Worker → Triggers
  - 確認 Cron Trigger 已設定

**參考文檔**：implementation_plan.md#10.5

---

### WordPress 整合

#### 任務 6.4：修改 WordPress 插件自動添加到 SEO 隊列
- [ ] **步驟 1**：編輯 `wp-d1-sync.php`
- [ ] **步驟 2**：在同步完成後添加代碼
  ```php
  // 添加到 SEO 隊列
  $seo_data = [
      'post_id' => $post_id,
      'post_type' => get_post_type($post_id),
      'title' => get_the_title($post_id),
      'excerpt' => get_the_excerpt($post_id),
      'content' => get_post_field('post_content', $post_id)
  ];

  wp_remote_post('https://example.com/api/seo/enqueue', [
      'headers' => ['Content-Type' => 'application/json'],
      'body' => json_encode($seo_data)
  ]);
  ```
- [ ] **步驟 3**：測試
  - 在 WordPress 發布新文章
  - 檢查 D1 `ai_seo_queue` 是否有新記錄

**參考文檔**：implementation_plan.md#10.6

---

### 前端 UI

#### 任務 6.5：實現 SEO 隊列管理頁面
- [ ] **步驟 1**：創建 `src/routes/seo/+page.svelte`
  - 顯示 SEO 隊列列表
  - 過濾器：狀態（pending/processing/completed/failed）
  - 顯示欄位：Post Title, Type, Status, Generated At
- [ ] **步驟 2**：創建 `src/routes/api/seo/queue/+server.ts`
  - GET：返回隊列列表
  ```typescript
  export const GET: RequestHandler = async ({ url, platform }) => {
      const status = url.searchParams.get('status');

      let query = 'SELECT * FROM ai_seo_queue';
      const params = [];

      if (status) {
          query += ' WHERE status = ?';
          params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const result = await platform.env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify(result.results), {
          headers: { 'Content-Type': 'application/json' }
      });
  };
  ```
- [ ] **步驟 3**：實現手動觸發按鈕
  - 按鈕：Process Now
  - 調用 Cron Worker 立即處理

**參考文檔**：implementation_plan.md#10

---

## 📋 測試和驗證

### 任務 7.1：DNS 測試
- [ ] 測試 `dig origin.example.com`（應返回 15.235.199.194）
- [ ] 測試 `dig example.com`（應返回 Cloudflare IP）
- [ ] 測試 `dig media.example.com`（應返回 Cloudflare IP）
- [ ] 測試 HTTP 訪問（curl -I）

**參考文檔**：implementation_plan.md#11.1

### 任務 7.2：Worker 功能測試
- [ ] 測試 KV 緩存（第一次 MISS，第二次 HIT）
- [ ] 測試繞過緩存（`/wp-admin/` 應無 X-Cache）
- [ ] 測試圖片替換（HTML 中圖片 URL 指向 media 域名）

**參考文檔**：implementation_plan.md#11.2

### 任務 7.3：數據同步測試
- [ ] 在 WordPress 修改產品
- [ ] 檢查 D1 是否 1 秒內更新
- [ ] 驗證數據一致性（WordPress vs D1）

**參考文檔**：implementation_plan.md#11.3

### 任務 7.4：圖片遷移測試
- [ ] 上傳新圖片到 WordPress
- [ ] 確認自動上傳到 R2
- [ ] 檢查 D1 `media_mapping` 記錄
- [ ] 訪問圖片 URL 確認可訪問

**參考文檔**：implementation_plan.md#11.4

### 任務 7.5：Invoice/Quote 測試
- [ ] 測試生成 Invoice API
- [ ] 測試生成 Quotation API
- [ ] 下載並檢查 PDF 格式
- [ ] 測試前端 UI 列表和詳情頁

**參考文檔**：implementation_plan.md#11.5

### 任務 7.6：AI SEO 測試
- [ ] 手動添加項目到隊列
- [ ] 觀察 Cron 執行日誌
- [ ] 檢查生成的 SEO 內容質量
- [ ] 驗證是否寫回 WordPress

**參考文檔**：implementation_plan.md#11.6

### 任務 7.7：性能測試
- [ ] 使用 GTmetrix 測試（https://gtmetrix.com）
- [ ] 使用 PageSpeed Insights 測試（https://pagespeed.web.dev）
- [ ] 檢查指標：
  - 首次載入 TTFB < 500ms
  - 緩存命中 TTFB < 100ms
  - Lighthouse Performance > 90

**參考文檔**：implementation_plan.md#11.7

---

## 🚀 上線切換

### 任務 8.1：最終檢查
- [ ] 所有 Workers 部署完成並測試通過
- [ ] DNS 設置正確（origin 灰雲，其他橙雲）
- [ ] Secrets 已設定（無明文密碼）
- [ ] D1 數據已同步（與 WordPress 一致）
- [ ] R2 圖片已遷移（所有圖片正常顯示）
- [ ] KV 緩存正常（命中率 > 80%）
- [ ] WordPress 插件已安裝並測試
- [ ] 備份所有重要數據

**參考文檔**：implementation_plan.md#12.1

### 任務 8.2：上線步驟
- [ ] **步驟 1**：最終備份
  - 備份 WordPress 數據庫（mysqldump）
  - 備份 WordPress 文件（tar）
  - 備份 D1 數據（wrangler d1 backup create）
- [ ] **步驟 2**：切換 DNS
  - 確認 `origin.example.com` 是灰雲
  - 將主站 DNS 切換到橙雲
  - 等待 DNS 傳播（1-5 分鐘）
- [ ] **步驟 3**：驗證上線
  - 測試主站是否走 Worker（應有 X-Cache header）
  - 測試圖片是否走 R2
  - 測試後台是否正常
  - 觀察 Workers Analytics
- [ ] **步驟 4**：監控 24 小時
  - Workers 錯誤率（應 < 0.1%）
  - KV 命中率（應 > 80%）
  - D1 查詢延遲（應 < 50ms）
  - 用戶反饋

**參考文檔**：implementation_plan.md#12.2

---

## 🔄 回滾計劃

### 任務 9.1：緊急回滾（如有需要）
- [ ] **觸發條件**：
  - Worker 錯誤率 > 5%
  - 網站完全無法訪問
  - 嚴重數據不一致
  - 用戶無法登入或下單
- [ ] **步驟 1**：切換 DNS
  - 將 `example.com` 改為 A 記錄指向 VPS IP
  - 代理狀態改為灰雲（DNS Only）
- [ ] **步驟 2**：恢復 WordPress 配置
  - 編輯 `wp-config.php` 恢復原始 URL
  - 重新載入 Nginx
- [ ] **步驟 3**：停用 WordPress 插件
  - 停用 `wp-d1-sync.php`
  - 停用 `wp-cache-purge.php`
- [ ] **步驟 4**：驗證恢復
  - 測試網站訪問
  - 測試登入和基本功能

**參考文檔**：implementation_plan.md#13

---

## 📊 優先級指引

### 🔴 P0 - 立即執行（安全相關）
1. 任務 4.7.1：移除 wrangler.toml 明文密碼

### 🟠 P1 - 高優先級（性能優化）
2. 任務 4.7.2：優化 media_mapping 查詢
3. 任務 4.7.3：並行上傳圖片到 R2
4. 任務 4.7.4：加入圖片上傳重試機制
5. 任務 4.7.5：統一緩存 Key 格式

### 🟡 P2 - 中優先級（新功能開發）
6. 任務 5.0 - 5.7：Invoice/Quotation 系統
7. 任務 6.0 - 6.5：AI SEO 自動化系統

### 🟢 P3 - 低優先級（測試和驗證）
8. 任務 7.1 - 7.7：全面測試
9. 任務 8.1 - 8.2：上線切換

---

## 📝 備註

### 執行建議
1. **分段執行**：先完成 Phase 4.7 修復所有問題，再開始 Phase 5-6 新功能開發
2. **測試驅動**：每完成一個任務立即測試，不要等到全部完成
3. **記錄進度**：每完成一個任務更新此文件的 checkbox
4. **備份優先**：任何修改前先備份，確保可回滾

### 相關文檔
- **architecture_design.md** - 完整架構設計和技術細節
- **implementation_plan.md** - 詳細實施計劃和代碼示例
- **schema.sql** - D1 數據庫表結構
- **wrangler.toml** - Cloudflare 配置文件

---

**最後更新：2025-01-10**
**版本：2.0**
**作者：Claude Code**
