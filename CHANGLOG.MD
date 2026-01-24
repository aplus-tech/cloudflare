# 改動記錄 CHANGELOG

> 格式：[日期] [類型] [描述] [來源]

---

## 2026-01-24

### 進行中 In Progress
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 23:00 UTC | Phase 5.0 Phase C：新 VPS 狀態檢查 ✅ | 檢查結果記錄於下方 |

#### Phase 5.0 Phase C 新 VPS 狀態檢查

**【問題原因】**
- Phase 5.0 Phase B（Docker + Redis）已完成
- Phase C 功能保留驗證需要確認新 VPS 運行狀態
- 需要檢查 WordPress、Docker 服務、DNS 配置

**【方案成立】**
- SSH 直接連接新 VPS (76.13.30.201)
- 執行 `docker ps` 檢查容器狀態
- 測試 WordPress HTTP 響應
- 檢查 wp-content 數據完整性

**【來源證據】**
- VPS SSH: root@76.13.30.201
- Docker 輸出: 7 個容器運行中（Up 47 hours）
- WordPress 測試: HTTP 200 OK (port 8080)

**【檢查結果】**

**VPS 基本資訊** ✅
- IP: 76.13.30.201
- 運行時間: 47 小時（自 2026-01-23 啟動）

**Docker 服務狀態** ✅ 全部運行中
- wordpress (LiteSpeed): Up 47h, port 8080
- db-wp (MariaDB): Up 47h, port 3306
- n8n: Up 47h, port 5678
- waha: Up 47h, port 3001
- redis: Up 47h, port 6379
- npm (Nginx Proxy Manager): Up 47h, port 80/443
- db-n8n (PostgreSQL): Up 47h, port 5432

**WordPress 狀態** ✅ 已遷移並運行
- Server: LiteSpeed
- HTTP Status: 200 OK
- Domain: aplus-tech.com.hk
- wp-content: 完整（plugins, themes, uploads 全部遷移）

**DNS 狀態** ⚠️ 待確認
- origin.aplus-tech.com.hk → 15.235.199.194（舊 VPS）
- 新 VPS: 76.13.30.201

**下一步**：執行 C.1-C.5 功能驗證測試

---

## 2026-01-21

### 完成 Completed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 15:00 UTC | Phase 5.0 Phase B：Docker 優化 + Redis 部署 ✅ | PROGRESS.md:353-364, VPS /opt/aplus-tech/docker-compose.yml |

#### Phase 5.0 Phase B 完成詳情

**【問題原因】**
- VPS docker-compose.yml 缺乏資源限制（15GB RAM 未充分利用）
- n8n 未啟用 Queue Mode（需要 Redis）
- 明文密碼硬編碼於 docker-compose.yml（安全風險）

**【方案成立】**
- 添加 Redis 服務（redis:7-alpine）用於 n8n Queue Mode
- 優化資源分配：9.5GB Docker 服務 / 5.5GB 系統預留
- 建立 .env 檔案，移除明文密碼
- 備份舊配置（docker-compose.yml.backup）

**【來源證據】**
- VPS /opt/aplus-tech/docker-compose.yml（優化版）
- VPS /opt/aplus-tech/.env（環境變數）
- VPS docker compose ps（7 個容器運行中）
- PROGRESS.md:353-364（完成記錄）

**關鍵改動**：

1. **Redis 服務新增**（n8n Queue Mode）：
   ```yaml
   redis:
     image: redis:7-alpine
     deploy:
       resources:
         limits:
           memory: 512M
         reservations:
           memory: 256M
   ```

2. **資源限制優化**（15GB RAM 環境）：
   - MySQL: 2GB（原無限制 → 2GB）
   - WordPress: 2GB（原無限制 → 2GB）
   - PostgreSQL: 1GB（原無限制 → 1GB）
   - n8n: 2GB（原無限制 → 2GB + Queue Mode）
   - WAHA: 1.5GB（原無限制 → 1.5GB）
   - Redis: 512MB（新增）
   - NPM: 512MB（原無限制 → 512MB）
   - **總計**: 9.5GB / 15GB（預留 5.5GB 系統 + AI 工具）

3. **n8n Queue Mode 啟用**：
   ```yaml
   environment:
     - EXECUTIONS_MODE=queue
     - QUEUE_BULL_REDIS_HOST=redis
     - QUEUE_BULL_REDIS_PORT=6379
   ```

4. **安全改進**：
   - 明文密碼 → .env 環境變數
   - 舊配置備份（docker-compose.yml.backup）
   - .env.example 模板建立

**部署結果**：
- ✅ 7 個容器運行中（npm, wordpress, db-wp, n8n, db-n8n, redis, waha）
- ✅ Redis 連接 n8n 成功
- ✅ 資源使用優化（9.5GB / 15GB）
- ✅ Phase 5.0 Phase B 完成

---

## 2026-01-20

### 完成 Completed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 03:15 UTC | 新構思：建立文件更新邏輯系統（屬性判斷） ✅ | .ai/context.yaml:54-166, .ai/CLAUDE.md:184-370 |
| 02:00 UTC | Phase 5.0 Phase A：VPS 診斷完成 ✅ | PROGRESS.md:328-362 |

#### 新構思：文件更新邏輯系統

**【問題原因】**
- 現有 MD 文件更新邏輯存在重大問題：
  - 只處理 PROGRESS.md 和 IDEAS.md
  - 不知如何檢查和處理其他相關 MD 文件
  - 使用關鍵字搜尋而非屬性判斷
  - 經常忘記更新 CHANGLOG.md
  - 忘記檢查技術文檔（architecture_design.md, docs/*.md）

**【方案成立】**
- 建立屬性判斷系統取代關鍵字搜尋
- 拆分數據層（context.yaml）與邏輯層（CLAUDE.md）
- 強制要求用戶指定 8 種操作類型
- 建立文件分類清單與屬性映射表
- 區分現有項目修改 vs 新項目開發

**【來源證據】**
- .ai/context.yaml:54-166（數據層配置）
- .ai/CLAUDE.md:184-370（Rule 13 工作流程）

**核心設計**：

1. **8 種操作類型**（用戶必須指定）：
   - 新功能、新構思、修復、加建、刪除、取代、優化、重構

2. **文件分類清單**（5 大類）：
   - core_tracking: PROGRESS.md, task.md, CHANGLOG.md
   - technical_docs: architecture_design.md, implementation_plan.md
   - api_architecture: docs/ARCHITECTURE.md, docs/API_SPEC.md
   - ai_config: .ai/IDEAS.md, .ai/ATTEMPTED_SOLUTIONS.md, .ai/CLAUDE.md, .ai/CLAUDE_OPUS.md
   - backup_debug: README.md, debug_*.md

3. **屬性映射表**：
   - 每種操作類型 → mandatory/check_if_major/check_if_api/check_context
   - 例：新功能 → mandatory: [CHANGLOG.md, PROGRESS.md, task.md]

4. **工作流程**（5 步驟）：
   - 步驟 1：強制要求用戶指定操作類型（禁止估計）
   - 步驟 2：判斷更新場景（現有項目 vs 新項目）
   - 步驟 3：屬性判斷（非關鍵字搜尋）
   - 步驟 4：強制規則檢查（CHANGLOG.md 永遠強制）
   - 步驟 5：執行更新並確認

5. **重大變更判斷標準**：
   - ✅ 重大：新增/刪除 Phase、架構變更、API 變更、Schema 變更、影響 >3 文件
   - ❌ 小變更：單一文件 bug、文檔錯字、單一參數調整

#### Phase 5.0 Phase A VPS 診斷詳情

**【問題原因】**
- 需要驗證新 VPS 實際硬件規格與已安裝服務
- 確認 AI 工具（Claude Code、Gemini CLI）安裝狀態
- 評估 Docker 服務資源使用情況

**【方案成立】**
- SSH 連接到 VPS (76.13.30.201) 執行診斷命令
- 檢查硬件規格：free -h, df -h, docker ps
- 驗證 AI 工具：直接運行 claude 和 gemini 命令
- 檢查現有 docker-compose.yml 配置

**【來源證據】**
- PROGRESS.md:328-362（完整診斷結果）
- .ai/IDEAS.md:489-499（VPS 規格更新）
- .ai/IDEAS.md:911-989（AI 工具安裝狀態更新）

**關鍵發現**：
1. **硬件規格更正**：
   - 文檔記錄：8GB RAM
   - 實際容量：**15GB RAM**（多 87.5%）
   - 存儲：193GB total (18GB used, 10%)

2. **已安裝 AI 工具**（✅ 已驗證）：
   - Claude Code CLI（顯示 trust dialog）
   - Gemini CLI v0.24.4（完整 CLI 介面）
   - Node.js v20.20.0
   - Docker Compose v5.0.1

3. **運行中 Docker 服務**（6 個）：
   - Nginx Proxy Manager (ports 80/81/443)
   - WordPress (port 8080)
   - MariaDB (WordPress 資料庫)
   - n8n (自動化平台)
   - PostgreSQL (n8n 資料庫)
   - WAHA (WhatsApp HTTP API)

4. **待安裝項目**：
   - pip3 (Python package manager)
   - Redis 服務 (n8n Queue Mode 需要)

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 02:00 UTC | 更新 PROGRESS.md VPS RAM 規格：8GB → 15GB | PROGRESS.md:334, 377, 398-410 |
| 02:00 UTC | 更新 IDEAS.md VPS 規格與資源分配表 | .ai/IDEAS.md:467-481, 489-499, 896-907 |
| 02:00 UTC | 標記 B.2 Claude Code 安裝為已完成 | .ai/IDEAS.md:911-947 |
| 02:00 UTC | 標記 B.3 Gemini CLI 安裝為已完成 | .ai/IDEAS.md:951-989 |

#### 修改 1：VPS RAM 規格更正

**【問題原因】**
- IDEAS.md 和 PROGRESS.md 均記錄 VPS 為 8GB RAM
- 實際診斷顯示 VPS 有 15GB RAM

**【方案成立】**
- 更新所有文檔中的 RAM 規格為 15GB
- 重新計算資源分配：4.9GB → 9.5GB (Docker 服務)
- 系統預留：3.1GB → 5.5GB

**【來源證據】**
- PROGRESS.md:334（診斷結果）
- PROGRESS.md:377（核心目標）
- PROGRESS.md:398-410（資源分配表）
- .ai/IDEAS.md:467-481（計劃概要）
- .ai/IDEAS.md:489-499（VPS 規格表）
- .ai/IDEAS.md:896-907（資源分配總覽）

#### 修改 2：AI 工具安裝狀態更新

**【問題原因】**
- 文檔標記 Claude Code 和 Gemini CLI 為「待安裝」
- 實際診斷證實兩者已安裝並可正常運行

**【方案成立】**
- 更新 Phase B.2 和 B.3 為「✅ 已完成」
- 添加驗證時間戳記：2026-01-20
- 記錄具體版本和測試結果

**【來源證據】**
- .ai/IDEAS.md:911-947（B.2 Claude Code 已完成）
- .ai/IDEAS.md:951-989（B.3 Gemini CLI 已完成）
- PROGRESS.md:346-351（已安裝 AI 工具列表）

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 02:00 UTC | PROGRESS.md 新增「🔍 VPS 診斷結果」章節 | PROGRESS.md:328-362 |

**【問題原因】**
- 需要記錄 VPS 診斷詳細結果
- 追蹤已完成和待完成項目

**【方案成立】**
- 創建獨立診斷結果章節
- 分類記錄：硬件規格、已安裝服務、AI 工具、待安裝項目
- 標記 docker-compose.yml 位置和待優化項目

**【來源證據】**
- PROGRESS.md:328-362（完整診斷結果章節）

---

## 2026-01-18

### 完成 Completed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 19:30 UTC | Phase 4.8.5：整體效能測試 ✅（KV Cache 加速 96%） | PROGRESS.md:191-222 |
| 18:02 UTC | Phase 4.8.2：VPS WordPress D1 數據同步測試 ✅ | PROGRESS.md:97-138 |

#### Phase 4.8.5 效能測試詳情

**【問題原因】**
- 需要驗證 KV Cache 實際加速效果
- 測試首頁同產品頁效能表現
- 確認 HTTP Header 正確顯示 cache 狀態

**【方案成立】**
- 清空 KV Cache（執行 purge-all API）
- 用 `curl -w` 測量 TTFB（Time To First Byte）同總時間
- 首次訪問記錄無 cache 時間，二次訪問記錄有 cache 時間
- 檢查 HTTP Header `X-Cache: HIT/MISS` 驗證 cache 狀態

**【來源證據】**
- PROGRESS.md:191-222（詳細測試結果）
- 首頁加速：3.59s → 0.15s（23.9x，96% 減少）
- 產品頁加速：2.62s → 0.11s（23.8x，96% 減少）
- HTTP Header: `X-Cache: HIT`, `cf-cache-status: DYNAMIC`
- Cache key 格式：`html:${url.pathname}${url.search}`
- TTL: 24 小時（`expirationTtl: 3600 * 24`）

#### Phase 4.8.2 D1 同步測試詳情

**【問題原因】**
- VPS WordPress Plugin 同步失敗，API 返回 `{"error":"Unauthorized"}`
- WordPress debug.log 顯示多次 401 錯誤
- D1 數據庫查詢結果為空
- 根本原因：`platform.env.SYNC_SECRET_KEY` 環境變數未設定

**【方案成立】**
- 修改 `wrangler.toml` 加返 `[vars]` section
- 暫時用明文 `SYNC_SECRET_KEY = "Lui@63006021"`（測試用）
- Git commit + push 觸發 Cloudflare Pages 部署
- 等待部署完成（約 5 分鐘）

**【來源證據】**
- PROGRESS.md:97-138（測試詳情）
- PROGRESS.md:145-152（里程碑記錄）
- .ai/ATTEMPTED_SOLUTIONS.md:189-222（成功方案記錄）
- Git Commit: fda2c0b
- 測試結果：Product ID 6947 成功同步到 D1，SKU: `UACC-PoE+-2.5G`

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 19:15 UTC | 修復 Cache Key 格式不一致問題（避免 AJAX 被 cache） | hooks.server.ts:47 |
| 17:53 UTC | 修復 D1 同步認證問題（SYNC_SECRET_KEY 環境變數） | wrangler.toml:21-23 |

#### Cache Key 格式修復詳情

**【問題原因】**
- hooks.server.ts 使用 `html:${path}` (只有 pathname)
- purge/+server.ts 使用 `html:${pathname}${search}` (包含 query string)
- 格式不一致導致 WooCommerce AJAX request（有 query params）被錯誤 cache 成 HTML
- 首頁返回 JSON 而唔係 HTML：`{"fragments":{"div.widget_shopping_cart_content":"..."}}`

**【方案成立】**
```typescript
// hooks.server.ts Line 47
// 修改前：const cacheKey = `html:${path}`;
// 修改後：
const cacheKey = `html:${url.pathname}${url.search}`;
```

**【來源證據】**
- 修復位置：cloudflare-wordpress/src/hooks.server.ts:47
- Git Commit: 3fcce19
- 對比檔案：src/routes/api/purge/+server.ts:19-20（purge API 本身已用正確格式）
- 詳細記錄：.ai/ATTEMPTED_SOLUTIONS.md:232-270

#### D1 同步認證修復詳情

**【問題原因】**
- 之前 `wrangler.toml` 移除咗明文密碼
- 但冇用 `wrangler secret put` 設定環境變數
- 導致 `platform.env.SYNC_SECRET_KEY` 為 `undefined`
- API 驗證失敗：`secret !== platform.env.SYNC_SECRET_KEY`

**【方案成立】**
```toml
# wrangler.toml Lines 21-23
# [vars] 臨時測試用 - 生產環境應該用 wrangler secret put
[vars]
SYNC_SECRET_KEY = "Lui@63006021"
```

**【來源證據】**
- 修復位置：cloudflare-wordpress/wrangler.toml:21-23
- Git Commit: fda2c0b
- WordPress Debug Log: `[18-Jan-2026 17:53:43 UTC] D1 Sync Response: {"success":true}`

### 測試結果 Test Results
| 項目 | 結果 | 證據 |
|------|------|------|
| Product ID 6947 同步到 D1 | ✅ | D1 Query Result |
| SKU 正確記錄 | ✅ `UACC-PoE+-2.5G` | D1 Query Result |
| R2 圖片上傳 | ✅ `products/ubiquiti-unifi/%E4%B8%8B%E8%BC%89-3.avif` | API Response |
| API 認證 | ✅ `{"success":true}` | WordPress Debug Log |
| D1 總產品數 | ✅ 12 條記錄 | D1 Query: `SELECT COUNT(*) FROM sync_products` |
| Updated timestamp | ✅ 1768759354 (2026-01-18 05:55:54 UTC) | D1 Query Result |

### 規劃 Planning
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 20:00 UTC | Task 4.7.6：規劃 Cache Warming 功能（Sitemap Crawler） | PROGRESS.md:253-300 |

#### Task 4.7.6 規劃詳情

**【問題原因】**
- 現時 KV Cache 係被動式：只有用戶訪問先會 cache
- 用戶要求主動式 warm up：一次過將所有頁面預先 cache
- 避免首次訪問慢（3.59s），確保所有用戶都享受到 cache 加速（0.15s）

**【方案成立】**
使用 **Sitemap Crawler 方案**：
- WordPress 自動生成 Sitemap（`/wp-sitemap.xml`）
- 建立 `/api/warm-cache` endpoint fetch sitemap 並批量訪問 URLs
- 並發控制 10 concurrent requests
- Secret key 認證（同 PURGE_SECRET）
- 無額外費用（Cloudflare Pages Free Plan）

**【來源證據】**
- PROGRESS.md:253-300 - 詳細技術方案
- .ai/context.yaml:32-42 - 記錄為 current_focus
- WordPress Sitemap 官方文檔：https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/
- 參考實作：Netlify Cache Warmer Plugin

**技術細節**：
```typescript
// API Endpoint: /api/warm-cache
// 流程：
// 1. Fetch sitemap XML (http://origin.aplus-tech.com.hk/wp-sitemap.xml)
// 2. Parse XML 提取所有 URLs
// 3. 批量 fetch URLs（並發控制 10 concurrent）
// 4. 返回 cached URL count
```

---

## 2026-01-12

### 完成 Completed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 4.8.1：VPS WordPress R2 圖片功能測試 ✅ | PROGRESS.md:51-53 |

**【問題原因】**
- 需要驗證 VPS WordPress 可以正常同 R2 整合
- 確認圖片上傳、預覽、前台顯示功能

**【方案成立】**
- VPS WordPress 成功上傳產品圖片到 R2
- D1 正確記錄 media_mapping（wordpress_url → r2_url）
- VPS WordPress 前台正常顯示 R2 圖片

**【來源證據】**
- PROGRESS.md:51-53
- task.md:139-142

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | AI 規則新增 Rule 11：回答前自我檢查機制 | .ai/CLAUDE.md:144-154 |
| - | Phase 4.8 任務順序調整（4.8.3 優先於 4.8.2） | PROGRESS.md:54-56, task.md:144-156 |
| - | 恢復 CHANGELOG.md 同步更新機制 | .ai/CLAUDE.md:164 |

#### 修改 1：AI 規則 Rule 11

**【問題原因】**
- AI 經常遺漏【問題原因】【方案成立】【來源證據】格式
- 缺少強制自我檢查機制

**【方案成立】**
- 新增 Rule 11 強制要求每次回答前檢查 3 項必備內容
- 違反規則視為無效回答，必須重新生成

**【來源證據】**
- .ai/CLAUDE.md:144-154（Rule 11 定義）
- .ai/CLAUDE.md:9（規則總數：10 → 11）

#### 修改 2：任務順序調整

**【問題原因】**
- R2 圖片已經可以傳輸，但頁面速度冇變快
- HTML 內容仍由 VPS 直接提供，冇經過 KV 緩存

**【方案成立】**
- 優先測試 KV 緩存（4.8.3），驗證頁面速度提升
- D1 數據同步測試（4.8.2）唔影響速度，可延後

**【來源證據】**
- PROGRESS.md:16, 19（任務調整記錄）
- PROGRESS.md:54-56（測試清單調整）
- task.md:144-156（任務順序同步）

#### 修改 3：恢復 CHANGELOG.md 同步

**【問題原因】**
- 之前移除咗 CHANGELOG.md 同步要求
- 用戶要求恢復同步更新

**【方案成立】**
- 功能 A 恢復 CHANGELOG.md 同步
- 維持 PROGRESS.md + task.md + CHANGELOG.md 三份文檔同步

**【來源證據】**
- .ai/CLAUDE.md:164（功能 A 步驟 3）

---

## 2026-01-11

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 修復 R2 圖片損壞問題（Phase 4.6 Bug Fix） | api/sync/+server.ts:50 |
| - | 加入 URL Validation 防止 R2 URL 誤存 | api/sync/+server.ts:8-12 |

#### 修復 1：R2 圖片損壞

**【問題原因】**
- R2 顯示圖片大小正確（230.12 kB）但無法預覽
- 下載圖片後無法用圖片檢視器開啟
- WordPress 無法顯示產品圖片
- 原因：Line 50 使用 `response.blob()` 導致二進制數據損壞

**【方案成立】**
- 改用 `response.arrayBuffer()` 保持圖片數據完整性
- 基於 Cloudflare R2 文檔建議使用 ArrayBuffer 處理二進制數據

**【來源證據】**
- 修復位置：cloudflare-wordpress/src/routes/api/sync/+server.ts:50
- Git Commit: e83c623
- 測試環境：http://15.235.199.194/ (VPS)

#### 修復 2：URL Validation

**【問題原因】**
- D1 `media_mapping` table 出現錯誤 row
- `original_url` 儲存咗 R2 URL (`media.aplus-tech.com.hk`) 而唔係 WordPress 原始 URL

**【方案成立】**
- 喺 API 加入 validation，拒絕包含 `media.aplus-tech.com.hk` 嘅 URL
- 只接受 WordPress 原始 URL (`/wp-content/uploads/`)
- 防禦性編程：API 唔信任外部輸入

**【來源證據】**
- 修復位置：cloudflare-wordpress/src/routes/api/sync/+server.ts:8-12
- Git Commit: 30950d1

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 更新 WordPress Plugin 到 Version 2.0 | Wordpress Plugin/wp-d1-sync.php |

**【問題原因】**
- 舊版 Plugin (v1.0) 功能唔齊全
- API URL 指向錯誤（aplus-tech.com.hk）
- 冇 R2 圖片同步功能

**【方案成立】**
- 使用 backup_phase_4_5_stable 版本 (v2.0)
- API URL 指向正確（cloudflare-9qe.pages.dev）
- 包含完整功能（R2、Brand、SEO）

**【來源證據】**
- 來源檔案：backup_phase_4_5_stable/wp-d1-sync.php
- 目標檔案：Wordpress Plugin/wp-d1-sync.php
- Git Commit: 03b420d

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Cloudflare DNS 加入 test.aplus-tech.com.hk → 15.235.199.194 | Cloudflare Dashboard |
| - | VPS WordPress Site URL 更新為 https://test.aplus-tech.com.hk | VPS WordPress |

**【問題原因】**
- 需要獨立測試環境
- 測試 DNS、SSL、CDN 功能
- 唔影響生產環境（aplus-tech.com.hk）

**【方案成立】**
- Cloudflare DNS A Record (Proxied)
- 自動提供 SSL 證書
- 完整測試環境就緒

**【來源證據】**
- DNS Record: test.aplus-tech.com.hk
- VPS IP: 15.235.199.194
- 測試 URL: https://test.aplus-tech.com.hk

---

## 2025-01-10

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 創建 `.ai/CLAUDE.md`（Sonnet 開發規則） | .ai/CLAUDE.md |
| - | 創建 `.ai/CLAUDE_OPUS.md`（Opus 架構師規則） | .ai/CLAUDE_OPUS.md |
| - | 創建 `.ai/IDEAS.md`（Opus 4 架構分析 - Phase 4.7 優化提案） | .ai/IDEAS.md |
| - | 創建 `.ai/context.yaml`（專案設定檔） | .ai/context.yaml |
| - | 創建 `docs/ARCHITECTURE.md`（系統架構概覽 - 297 行） | docs/ARCHITECTURE.md |
| - | 創建 `docs/API_SPEC.md`（API 規範 - 364 行） | docs/API_SPEC.md |
| - | 創建 `PROGRESS.md`（進度追蹤 - 混合版） | PROGRESS.md |
| - | 整合 `CHANGLOG.md`（改動記錄 - 表格格式） | CHANGLOG.md |

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 更新 `README.md`（真實專案內容 - 209 行） | README.md |
| - | 更新 `.ai/context.yaml`（填入真實技術棧、域名配置） | .ai/context.yaml |

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 修復 R2 圖片上傳損壞問題（blob() → arrayBuffer()）| api/sync/+server.ts:47 |

**問題描述**：
- R2 顯示圖片大小正確（230.12 kB）但無法預覽
- 下載圖片後無法用任何圖片檢視器開啟
- WordPress 無法顯示產品圖片

**問題原因**：
- Line 47 使用 `response.blob()` 處理二進制圖片數據
- blob() 會導致圖片數據損壞

**解決方案**：
- 改用 `response.arrayBuffer()` 保持二進制數據完整性
- 測試環境：http://15.235.199.194/ (VPS)

### 移動 Moved
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 移動 `changelog.md` → `Backup/changelog.md` | Git Commit 1afe2f1 |
| - | 移動 `refresh-idea.md` → `Backup/refresh-idea.md` | Git Commit 1afe2f1 |

### 架構分析 Architecture Analysis
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Opus 4 分析 Phase 4.7 架構（3 個優化提案） | .ai/IDEAS.md |
| - | 提案 1：移除明文密碼（P0 - 安全漏洞） | .ai/IDEAS.md:75-128 |
| - | 提案 2：效能優化（KV Cache + 並行上傳 + 重試） | .ai/IDEAS.md:131-245 |
| - | 提案 3：架構優化（統一 Key + R2 存在性檢查） | .ai/IDEAS.md:248-356 |

---

## 2026-01-08

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 4.6: Hybrid Architecture & R2 Acceleration | architecture_design.md |
| - | 實現 Worker URL 代理（`hooks.server.ts`） | cloudflare-wordpress/src/hooks.server.ts |
| - | 加入靜態資源處理（CSS/JS/Font） | hooks.server.ts |
| - | 實現 CORS Headers（字型檔案） | hooks.server.ts |
| - | KV Cache HIT/MISS 邏輯 | hooks.server.ts |
| - | R2 路徑回傳機制（`image_r2_path`, `gallery_r2_paths`） | api/sync/+server.ts |
| - | WordPress 前端圖片 URL 重寫（`wp_get_attachment_url` filter） | wp-d1-sync.php |

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | API Target 改為 `https://cloudflare-9qe.pages.dev/api/sync` | wp-d1-sync.php |
| - | R2 Feedback Loop：儲存 R2 路徑到 `_cloudflare_r2_url` | wp-d1-sync.php |
| - | 改用同步執行（移除 `platform.context.waitUntil`） | api/sync/+server.ts |
| - | 實現 Lazy Sync：用 `r2.head()` 檢查檔案存在 | api/sync/+server.ts |
| - | 修正 Brand 提取邏輯（`product_brand` taxonomy） | wp-d1-sync.php |
| - | 域名重寫：所有 `aplus-tech.com.hk` → Worker domain | hooks.server.ts |

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 修復 UI 渲染問題（加入靜態資源代理） | hooks.server.ts |
| - | 修復舊產品無法更新問題（Lazy Sync） | api/sync/+server.ts |
| - | 修復 404 Assets 錯誤處理 | hooks.server.ts |

---

## 2026-01-07

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 4.5: Semantic Media Migration | architecture_design.md |
| - | R2 語義化路徑：`products/{brand}/{filename}` | api/sync/+server.ts |
| - | D1 `media_mapping` 表（original_url → r2_path） | schema.sql |
| - | 圖片 URL 編碼處理（支援中文檔名） | api/sync/+server.ts |
| - | 自動 Brand Taxonomy 偵測（`product_brand`, `pa_brand`） | wp-d1-sync.php |

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 修復 WordPress Critical Error（`platform.context.waitUntil`） | api/sync/+server.ts |
| - | 修復 400 Bad Request（中文檔名用 URL encoding） | api/sync/+server.ts |
| - | 修復 D1_TYPE_ERROR（清理 `undefined` 值） | api/sync/+server.ts |
| - | 修復 WP_Error 處理（加入 safety checks） | wp-d1-sync.php |

### 優化 Optimized
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 同步改用非阻塞請求（WordPress 效能提升） | wp-d1-sync.php |

---

## 2026-01-06

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 4: Real-time Sync Pipeline | task.md#Phase-4 |
| - | WordPress → D1 同步（Products, Posts, Pages, Terms） | api/sync/+server.ts |
| - | Phase 3: Edge Cache 實現 | task.md#Phase-3 |
| - | KV HTML 緩存（`hooks.server.ts`） | cloudflare-wordpress/src/hooks.server.ts |
| - | WordPress 緩存清除插件（`wp-cache-purge.php`） | Wordpress Plugin/wp-cache-purge.php |

### 部署 Deployment
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 成功連接 GitHub Repo | Git Commit |
| - | 部署到 Cloudflare Pages (`cloudflare-9qe.pages.dev`) | Cloudflare Dashboard |

---

## 2026-01-05

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 2: Foundation Setup | task.md#Phase-2 |
| - | 初始化 SvelteKit 專案 | cloudflare-wordpress/ |
| - | 建立 D1 Database (`wordpress-cloudflare`) | wrangler.toml |
| - | 建立 KV Namespace (`HTML_CACHE`) | wrangler.toml |
| - | 建立 R2 Bucket (`media-bucket`) | wrangler.toml |
| - | 擴展 D1 Schema 到 10 個表 | schema.sql |

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | D1 Database 名稱改為 `wordpress-cloudflare` | wrangler.toml |
| - | 加入 JSON 欄位到 `sync_products` 和 `sync_posts` | schema.sql |
| - | 新增 `sync_terms` 表（支援 Brands, Attributes, Tags） | schema.sql |

---

## 2026-01-04

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | Phase 0: Cleanup | task.md#Phase-0 |
| - | 刪除未授權檔案（`edge-cache-worker`, `wp-purge-plugin.php`） | Git Commit |

### 架構更新 Architecture
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| - | 重新排序 Phase 順序（Phase 2 Foundation → Phase 3 Edge Cache） | implementation_plan.md |
| - | 更新 `task.md` 反映新執行順序 | task.md |

---

## 2025-01-10

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 初始化 | 創建 AI 開發環境 | .ai/ |
| 初始化 | 創建 `.ai/CLAUDE.md`（Sonnet 規則） | .ai/CLAUDE.md |
| 初始化 | 創建 `.ai/CLAUDE_OPUS.md`（Opus 規則） | .ai/CLAUDE_OPUS.md |
| 初始化 | 創建 `.ai/IDEAS.md`（Opus 分析記錄） | .ai/IDEAS.md |
| 初始化 | 創建 `.ai/context.yaml`（專案設定） | .ai/context.yaml |
| 初始化 | 創建 `.aiignore` | .ai/.aiignore |
| 初始化 | 創建 `docs/ARCHITECTURE.md`（架構概覽） | docs/ARCHITECTURE.md |
| 初始化 | 創建 `docs/API_SPEC.md`（API 規範） | docs/API_SPEC.md |
| 初始化 | 創建 `PROGRESS.md`（進度追蹤） | PROGRESS.md |
| 初始化 | 整合 `CHANGLOG.md`（改動記錄） | CHANGLOG.md |

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 初始化 | 更新 `README.md`（真實專案內容） | README.md |
| 初始化 | 更新 `.ai/context.yaml`（填入真實資料） | .ai/context.yaml |

### 移動 Moved
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| 初始化 | 移動 `changelog.md` → `Backup/changelog.md` | Git Commit 1afe2f1 |
| 初始化 | 移動 `refresh-idea.md` → `Backup/refresh-idea.md` | Git Commit 1afe2f1 |

---

## 架構決策記錄

### 2026-01-08: 採用混合架構（Hybrid Architecture）
**決策原因**：
- Shared Hosting 限制：無法用灰雲 DNS（會造成 DNS Loop）
- SSL 問題：無法直接存取 Origin IP

**解決方案**：
- HTML：由 Origin（Shared Hosting）透過 Cloudflare DNS（Proxied）提供
- Images：由 Cloudflare R2（`media.aplus-tech.com.hk`）提供
- 維持高效能同時避開 Shared Hosting 限制

**來源證據**：[PROGRESS.md:46-50](PROGRESS.md#L46-L50)

---

### 2026-01-07: R2 語義化路徑結構
**決策原因**：
- SEO 友好
- 易於管理和維護
- 自動分類

**實施方式**：
- `products/{brand}/{filename}`
- 自動從 WordPress Taxonomy 提取 Brand
- 支援多種 Brand Taxonomy（`product_brand`, `pa_brand`, etc.）

**來源證據**：[api/sync/+server.ts:28-34](cloudflare-wordpress/src/routes/api/sync/+server.ts#L28-L34)

---

## 模板 Template

<!--
每次更新時複製呢個格式：

## YYYY-MM-DD

### 新增 Added
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |

### 修改 Changed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |

### 修復 Fixed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |

### 刪除 Removed
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |

### 優化 Optimized
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |

### 部署 Deployment
| 時間 | 改動 | 來源證據 |
|------|------|---------|
| HH:MM | 描述 | [Source: 檔案#章節] |
-->
