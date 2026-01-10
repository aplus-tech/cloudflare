好！我明白了，你要**詳細的概念和方案說明**，但唔要大堆代碼。

---

# WordPress + Cloudflare 完整系統 - 詳細架構方案

## 📋 目錄
1. [你的需求和想法](#1-你的需求和想法)
2. [完整系統架構](#2-完整系統架構)
3. [域名和 DNS 配置詳解](#3-域名和-dns-配置詳解)
4. [防止 Worker Loop 的完整方案](#4-防止-worker-loop-的完整方案)
5. [WordPress 圖片無痛遷移到 R2](#5-wordpress-圖片無痛遷移到-r2)
6. [MySQL → D1 同步機制](#6-mysql--d1-同步機制)
7. [AI SEO 自動化流程](#7-ai-seo-自動化流程)
8. [Invoice/Quotation 系統](#8-invoicequotation-系統)
9. [KV 緩存策略](#9-kv-緩存策略)
10. [完整部署順序](#10-完整部署順序)
11. [常見問題和解決方案](#11-常見問題和解決方案)

---

## 1. 你的需求和想法

### 你想要達到什麼？

**核心需求：**
- WordPress 繼續用來編輯內容和處理 Payment Gateway（因為有成熟的 WooCommerce）
- 用 Cloudflare Workers + D1 + R2 + KV 來提升性能和降低成本
- 用 AI 自動處理 SEO 優化（標題、關鍵字、描述）
- 建立 Invoice 和 Quotation 系統（用 D1 數據）
- 圖片全部放 R2，節省 VPS 空間和流量

**你的系統架構理念：**
1. **WordPress** 只負責內容編輯和支付處理
2. **Workers** 作為中間層，處理所有對外請求
3. **KV** 緩存渲染好的 HTML 頁面
4. **D1** 存放 WordPress 數據的副本，給其他 Workers 使用
5. **R2** 存放所有圖片和 PDF 文件
6. **AI Workers** 自動優化 SEO

### 為什麼需要 D1 存 WordPress 數據？

你提到的兩個關鍵原因：

1. **Invoice/Quotation 系統需要讀取訂單、產品、客戶資料**
   - 如果每次都去 WordPress API 讀取會很慢
   - D1 在邊緣節點，速度極快
   - 可以讓 Invoice Worker 獨立運作，不依賴 WordPress

2. **AI SEO 系統需要分析文章內容**
   - 需要批量處理大量文章
   - 從 D1 讀取比打 WordPress API 更快更省資源
   - 可以記錄 SEO 分數、處理狀態等額外資訊

### 為什麼容忍 1-2 秒的數據延遲？

**你的考量很合理：**
- 訂單數據不需要即時（客戶下單後 1-2 秒才同步到 D1 完全可以接受）
- 產品資料更新頻率低（產品價格、庫存不會每秒都變）
- SEO 優化本身就是異步處理，不需要即時
- Invoice/Quote 生成時讀取的數據稍微舊一點也沒問題

這種**最終一致性**的設計可以大幅簡化系統，提升性能。

---

## 2. 完整系統架構

### 2.1 整體數據流

```
【前端用戶流程】
用戶訪問 example.com
    ↓
Cloudflare DNS 解析到 Workers
    ↓
Workers 檢查 KV 有沒有緩存
    ├─ 有緩存 → 直接返回（極快）
    └─ 沒緩存 → 去 origin.example.com（你的 VPS）拿內容 → 存入 KV → 返回給用戶

【後台同步流程】
WordPress 有新內容/訂單
    ↓
觸發同步（方式 1：Cron 定時 / 方式 2：Webhook 即時）
    ↓
Sync Worker 讀取 WordPress REST API
    ↓
寫入 D1 數據庫
    ↓
其他 Workers 可以讀取 D1 數據

【AI SEO 流程】
文章存入 D1 後
    ↓
標記為「needs_seo_update = true」
    ↓
SEO Worker 定時檢查（每小時）
    ↓
找出需要處理的文章
    ↓
調用 Claude API 生成 SEO 標題、描述、關鍵字
    ↓
更新回 D1（可選：也更新回 WordPress）

【Invoice 生成流程】
客戶請求生成 Invoice
    ↓
Invoice Worker 從 D1 讀取訂單資料
    ↓
生成 PDF
    ↓
上傳到 R2
    ↓
記錄到 D1 的 invoices 表
    ↓
返回下載連結給客戶
```

### 2.2 各組件職責

| 組件 | 作用 | 為什麼需要 |
|------|------|------------|
| **VPS WordPress** | 內容編輯、Payment Gateway、用戶管理 | 成熟的 CMS 和電商生態 |
| **Workers (主代理)** | 接收所有請求、路由分發、緩存管理 | 全球邊緣加速，降低 VPS 負載 |
| **KV** | 存儲渲染好的 HTML 頁面 | 極速讀取，減少重複渲染 |
| **D1** | WordPress 數據副本 | 給其他 Workers 快速查詢用 |
| **R2** | 圖片、PDF 文件存儲 | 無限容量，無出站流量費 |
| **Sync Worker** | 定時同步 MySQL → D1 | 保持數據更新 |
| **SEO Worker** | AI 自動優化 SEO | 省人力，批量處理 |
| **Invoice Worker** | 生成 Invoice/Quote | 業務需求 |

---

## 3. 域名和 DNS 配置詳解

### 3.1 為什麼需要兩個域名？

這是**避免 Worker Loop 的關鍵**。

**問題場景：**
如果只用一個域名 `example.com`：
```
用戶訪問 example.com
    ↓
進入 Workers
    ↓
Workers 去 fetch("https://example.com")  ← 又會進入 Workers
    ↓
無限循環！💥
```

**解決方案：用兩個域名**

1. **example.com** - 對外的主域名
   - 指向 Cloudflare Workers（橙雲 Proxied）
   - 用戶看到的域名
   
2. **origin.example.com** - 內部用的子域名
   - 直接指向你的 VPS IP（灰雲 DNS Only）
   - 只有 Workers 會訪問
   - 外部用戶看不到

**流程變成：**
```
用戶訪問 example.com
    ↓
進入 Workers
    ↓
Workers 去 fetch("https://origin.example.com")  ← 直接到 VPS，不經過 Workers
    ↓
成功！✅
```

### 3.2 DNS 記錄詳細說明

在 Cloudflare Dashboard → DNS 設置：

| 類型 | 名稱 | 內容 | 代理狀態 | 說明 |
|------|------|------|----------|------|
| A | origin | 你的VPS_IP | 灰雲 (DNS Only) | **關鍵**：必須灰雲，直連 VPS |
| CNAME | @ (根域名) | example.com | 橙雲 (Proxied) | 主域名走 Workers |
| CNAME | www | example.com | 橙雲 (Proxied) | www 也走 Workers |
| CNAME | media | media.example.com | 橙雲 (Proxied) | R2 圖片域名 |

**關鍵概念：**
- **橙雲 (Proxied)** = 流量經過 Cloudflare，可以用 Workers
- **灰雲 (DNS Only)** = 直接解析到 IP，不經過 Cloudflare

### 3.3 WordPress 配置

在 `wp-config.php` 加入：

```php
// WP_HOME = 用戶看到的域名
define('WP_HOME', 'https://example.com');

// WP_SITEURL = WordPress 實際所在位置
define('WP_SITEURL', 'https://origin.example.com');
```

**這樣做的效果：**
- WordPress 後台會在 `origin.example.com` 訪問
- 但生成的連結都是 `example.com`
- 用戶永遠只看到 `example.com`

---

## 4. 防止 Worker Loop 的完整方案

### 4.1 Loop 發生的原因

Worker 的本質是攔截 HTTP 請求。如果 Worker 自己發出的請求也被自己攔截，就會無限循環。

### 4.2 完整防止方案

**方案 A：使用子域名（推薦，你用這個）**

步驟：
1. 創建 `origin.example.com` 指向 VPS（灰雲）
2. Worker 裡所有 fetch 請求都改寫 URL 到 `origin.example.com`
3. 因為 `origin.example.com` 是灰雲，不會觸發 Worker

**在 Worker 裡的關鍵邏輯：**
```javascript
// 接收請求：https://example.com/some-page
// 改寫成：  https://origin.example.com/some-page

const url = new URL(request.url);
url.hostname = 'origin.example.com';  // 改寫域名

const response = await fetch(url.toString());  // 不會觸發 Worker
```

**方案 B：用 Custom Header（備選）**

如果不想用子域名：
1. Worker 發出請求時加一個特殊 header
2. Worker 檢查請求，如果有這個 header 就直接放行

這個方案比較複雜，不推薦。

### 4.3 測試是否有 Loop

部署後測試：

```bash
# 測試主域名（應該有 Worker 處理的標記）
curl -I https://example.com
# 應該看到：X-Cache: HIT 或 MISS

# 測試 origin（應該沒有 Worker 標記）
curl -I https://origin.example.com
# 應該直接返回 WordPress 的 header，沒有 X-Cache

# 如果主域名返回 Error 1001 或無限重定向 = 有 Loop
```

### 4.4 安全加固：只允許 Cloudflare 訪問 origin

因為 `origin.example.com` 是公開的 DNS 記錄，理論上任何人都可以訪問。

**在 Nginx 配置只允許 Cloudflare IP：**

這樣即使別人知道 `origin.example.com`，也無法直接訪問你的 VPS。

你可以在 Cloudflare Dashboard 找到官方的 IP 範圍列表，定期更新 Nginx 配置。

---

## 5. WordPress 圖片無痛遷移到 R2

這是你問的關鍵問題！

### 5.1 你現有的圖片狀況

WordPress 預設把圖片存在：
```
/wp-content/uploads/
    ├── 2024/
    │   ├── 01/
    │   │   ├── image1.jpg
    │   │   └── image2.png
    │   ├── 02/
    │   └── 03/
    ├── 2025/
    └── woocommerce_uploads/
```

數據庫裡的圖片 URL：
```
https://example.com/wp-content/uploads/2024/01/image1.jpg
```

### 5.2 完整遷移方案（無痛，不影響現有網站）

#### 階段一：準備 R2 和 Worker

1. **創建 R2 Bucket**
   - 名稱：`wordpress-media`
   - 位置：自動（全球分佈）

2. **創建 Media Worker**
   - 負責從 R2 讀取圖片並返回
   - 綁定到 `media.example.com`

3. **測試上傳**
   - 手動上傳一張測試圖到 R2
   - 確認可以通過 `https://media.example.com/test.jpg` 訪問

#### 階段二：保持 WordPress 目錄結構遷移

**關鍵：R2 裡的目錄結構要和 WordPress 一模一樣**

使用工具批量上傳（選一個）：

**選項 A：用 Rclone（推薦）**

1. 在 VPS 安裝 Rclone
2. 配置 Cloudflare R2 作為遠端
3. 同步整個 uploads 目錄到 R2

執行同步命令，會保持完整的目錄結構：
```
wordpress-media/
    ├── 2024/
    │   ├── 01/
    │   │   ├── image1.jpg
    │   │   └── image2.png
    ...
```

**選項 B：用 WordPress 插件**

安裝 **WP Offload Media Lite**：
- 配置 S3 兼容 API（R2 支持 S3 API）
- 插件會自動上傳新圖片到 R2
- 也可以批量遷移舊圖片

#### 階段三：更新圖片 URL（關鍵步驟）

**方法 1：數據庫批量替換（最快）**

在 WordPress 數據庫執行：

這會把所有文章內容和 meta 資料裡的圖片 URL 從：
```
https://example.com/wp-content/uploads/
```
改成：
```
https://media.example.com/
```

**推薦用插件：Better Search Replace**
- 可以預覽會改什麼
- 可以選擇只改特定的表
- 更安全

**方法 2：用 WordPress 過濾器（動態替換，不改數據庫）**

在 WordPress functions.php 加入過濾器，動態把 URL 改掉：

這樣不用改數據庫，但每次都要處理一次。

**我推薦：方法 1（數據庫替換）+ 備份**

先備份數據庫，然後用 Better Search Replace 插件批量替換。

#### 階段四：配置新上傳自動到 R2

安裝 **WP Offload Media** 插件：

配置：
- Provider: S3 Compatible
- Endpoint: `https://[你的帳號ID].r2.cloudflarestorage.com`
- Bucket: `wordpress-media`
- Access Key 和 Secret: 在 R2 Dashboard 生成

配置完成後：
- 所有新上傳的圖片自動到 R2
- URL 自動變成 `https://media.example.com/...`
- 可以選擇是否刪除本地副本

### 5.3 Media Worker 配置

Media Worker 的作用：
1. 接收圖片請求：`https://media.example.com/2024/01/image.jpg`
2. 從 R2 讀取：`wordpress-media/2024/01/image.jpg`
3. 返回圖片給用戶

關鍵功能：
- 設置長期緩存 header（圖片很少改變）
- 支持 WebP 轉換（可選，節省流量）
- 支持圖片尺寸調整（可選）

### 5.4 R2 目錄結構最佳實踐

**推薦結構（保持和 WordPress 一致）：**

```
wordpress-media/  (R2 Bucket 根目錄)
├── 2024/
│   ├── 01/
│   │   ├── image1.jpg
│   │   ├── image1-150x150.jpg  (WordPress 縮圖)
│   │   ├── image1-300x200.jpg
│   │   └── image1-1024x768.jpg
│   ├── 02/
│   └── 03/
├── 2025/
│   └── 01/
└── woocommerce_uploads/
    └── ...
```

**為什麼保持一樣的結構？**
- WordPress 生成的 URL 路徑可以直接對應
- 方便批量遷移
- 未來如果要搬回 VPS 也容易

**不要這樣做：**
```
❌ 所有圖片丟在根目錄
❌ 改變目錄結構（會導致 URL 對不上）
```

### 5.5 漸進式遷移策略（最安全）

如果你的網站圖片很多，可以分批遷移：

**Week 1：測試階段**
- 只遷移最近一個月的圖片
- 測試 Media Worker 是否正常
- 檢查網站前端圖片顯示

**Week 2：批量遷移舊圖**
- 遷移過去一年的圖片
- 更新數據庫 URL

**Week 3：清理**
- 確認所有圖片都正常顯示
- 刪除 VPS 上的 uploads 目錄（節省空間）
- 配置新上傳自動到 R2

**Week 4：監控**
- 檢查 R2 流量和費用
- 確認沒有 404 圖片

### 5.6 回退方案（如果出問題）

萬一遷移後有問題，可以快速回退：

1. **保留 VPS 上的圖片備份**（至少一個月）
2. **數據庫 URL 改回去**（用 Better Search Replace 反向操作）
3. **暫時禁用 WP Offload Media 插件**

---

## 6. MySQL → D1 同步機制

### 6.1 為什麼需要同步？

**你的需求：**
- Invoice/Quote 系統需要讀取訂單、產品、客戶資料
- AI SEO 系統需要批量處理文章
- 這些操作從 D1 讀取比打 WordPress API 快得多

**D1 的優勢：**
- 在 Cloudflare 邊緣節點，全球分佈
- 查詢速度極快（毫秒級）
- 免費額度很大方
- 支持 SQL，查詢靈活

### 6.2 同步什麼數據？

**需要同步的表：**

| WordPress 表 | D1 表 | 同步內容 | 更新頻率 |
|--------------|-------|----------|----------|
| wp_posts | posts | 文章、頁面 | 每次發布/更新 |
| wp_postmeta | - | SEO 資訊（整合到 posts 表） | 同上 |
| wc_products | products | 產品資訊 | 產品更新時 |
| wc_orders | orders | 訂單主表 | 每 5 分鐘 |
| wc_order_items | order_items | 訂單項目 | 同上 |
| wp_users | customers | 客戶資訊 | 每小時 |

**不需要同步的：**
- wp_options（配置）
- wp_comments（留言，可以用 WordPress 處理）
- wp_termmeta, wp_terms（分類標籤，視需求）

### 6.3 同步觸發方式

**方式 1：定時同步（Cron）**

優點：
- 簡單可靠
- 不依賴 WordPress
- 可以批量處理

缺點：
- 有延遲（你說可以接受 1-2 秒，實際可能是 5 分鐘）

設置：
- Sync Worker 設定 Cron Trigger
- 每 5 分鐘執行一次
- 只同步有更新的記錄（通過 `modified_date` 判斷）

**方式 2：Webhook 即時同步**

優點：
- 延遲最小（幾秒內）
- 只同步有變化的數據

缺點：
- 需要 WordPress 插件配合
- 如果 Webhook 失敗需要重試機制

設置：
- WordPress 插件在文章發布/訂單創建時發 HTTP 請求到 Sync Worker
- Sync Worker 接收後立即同步該筆數據

**推薦：兩者結合**
- 重要數據（訂單）用 Webhook 即時同步
- 其他數據用 Cron 定時同步
- Cron 作為兜底，防止 Webhook 失敗

### 6.4 同步邏輯

**增量同步（推薦）**

只同步有變化的數據：

1. D1 記錄上次同步時間
2. 查詢 WordPress API：只拿 `modified_after` 該時間的記錄
3. 更新到 D1
4. 記錄本次同步時間

**全量同步（初次或修復用）**

一次性同步所有數據：
- 適合第一次設置
- 或者數據不一致時修復用

### 6.5 數據一致性處理

**衝突處理：**
- MySQL 是 **Source of Truth**（唯一真實來源）
- D1 只是副本，有衝突以 MySQL 為準
- 同步方向永遠是 MySQL → D1（單向）

**異常處理：**
- 同步失敗記錄到 D1 的 `sync_log` 表
- 下次同步時重試
- 超過 3 次失敗發送告警

**數據驗證：**
- 定期檢查 D1 和 MySQL 的記錄數量是否一致
- 關鍵字段（如訂單總額）抽查比對

### 6.6 D1 數據結構設計

**關鍵原則：**

1. **扁平化**
   - WordPress 的複雜關聯簡化成扁平結構
   - 減少 JOIN 查詢
   - 例如：訂單的客戶資訊直接存在 orders 表，不用 JOIN customers

2. **冗餘可接受**
   - 為了查詢速度，適當冗餘數據
   - 例如：order_items 表同時存 product_name 和 product_id

3. **添加業務欄位**
   - D1 可以加 WordPress 沒有的欄位
   - 例如：`seo_score`, `needs_seo_update`, `synced_at`

4. **索引優化**
   - 常用查詢欄位加索引
   - 例如：`status`, `created_at`, `customer_email`

---

## 7. AI SEO 自動化流程

### 7.1 你的 SEO 自動化需求

**目標：**
用 AI 自動為文章和產品頁面生成：
- SEO 優化標題（50-60 字元，包含關鍵字）
- Meta Description（150-160 字元，吸引點擊）
- 關鍵字列表（5-10 個）
- SEO 分數評估
- 改進建議

**為什麼用 AI？**
- 批量處理大量文章（手動做太慢）
- 一致的質量
- 可以分析內容提取關鍵字
- 24/7 自動運行

### 7.2 完整工作流程

**流程圖：**

```
文章發布到 WordPress
    ↓
同步到 D1（posts 表）
    ↓
標記 needs_seo_update = TRUE
    ↓
加入 seo_queue 表（待處理佇列）
    ↓
SEO Worker 定時檢查（每小時）
    ↓
取出 10 篇優先級最高的文章
    ↓
逐篇調用 Claude API
    ↓
解析 AI 返回的 JSON（標題、描述、關鍵字、分數）
    ↓
更新 D1 的 posts 表
    ↓
（可選）寫回 WordPress（更新 Yoast SEO 欄位）
    ↓
標記 needs_seo_update = FALSE
```

### 7.3 觸發 SEO 處理的時機

**自動觸發：**
1. **新文章發布** - 優先級 8（高）
2. **文章內容更新** - 優先級 5（中）
3. **SEO 分數低於 50** - 優先級 8（高）
4. **文章發布超過 6 個月未優化** - 優先級 3（低）

**手動觸發：**
1. WordPress 後台按鈕「AI 優化此文章」
2. 批量選擇文章優化
3. 通過 API 觸發

### 7.4 SEO Queue（佇列）設計

**為什麼需要佇列？**
- AI API 有速率限制
- 避免一次處理太多，超出預算
- 可以設定優先級
- 失敗可以重試

**seo_queue 表結構：**
- `post_id` - 文章 ID
- `priority` - 優先級（1-10）
- `status` - pending（待處理）/ processing（處理中）/ completed（完成）/ failed（失敗）
- `retry_count` - 重試次數（最多 3 次）
- `created_at` - 加入佇列時間
- `processed_at` - 處理完成時間

**處理邏輯：**
1. 每小時檢查佇列
2. 取出 10 筆 status=pending 且 priority 最高的
3. 逐筆處理（避免並發）
4. 成功 → status=completed
5. 失敗 → retry_count+1，如果<3 次改回 pending，否則 status=failed

### 7.5 AI Prompt 設計

**給 Claude 的 Prompt 範例：**

```
你是專業的 SEO 專家。分析以下文章並生成 SEO 優化內容。

文章標題：如何選擇最適合的咖啡豆
文章內容：（前 2000 字元）...

請返回 JSON 格式：
{
  "seo_title": "2024 咖啡豆選購指南：新手必看的 5 個關鍵要點",
  "meta_description": "不知道如何挑選咖啡豆？本文教你從產地、烘焙度、新鮮度等角度，選出最適合你的咖啡豆。立即閱讀！",
  "keywords": "咖啡豆選購, 咖啡豆推薦, 如何選咖啡豆, 咖啡豆種類",
  "focus_keyword": "咖啡豆選購",
  "seo_score": 85,
  "improvements": [
    "建議在第一段加入焦點關鍵字",
    "Meta description 可以更突出獨特賣點"
  ]
}
```

**Prompt 優化技巧：**
- 明確指定返回 JSON 格式
- 給出字數限制
- 提供範例格式
- 說明評分標準

### 7.6 成本控制

**Claude API 費用：**
- 按 token 計費
- 輸入 token：文章內容（取前 2000 字元控制成本）
- 輸出 token：SEO 內容（通常 200-500 tokens）
- 預估：每篇文章 $0.01-0.03 USD

**控制策略：**

1. **限制處理量**
   - 每小時最多處理 10 篇
   - 每天最多 200 篇
   - 設定月度預算上限

2. **優先級管理**
   - 高價值頁面優先（產品頁、熱門文章）
   - 低流量頁面可以不處理
   - 避免重複處理已優化的文章

3. **內容長度限制**
   - 只發送文章前 2000 字元給 AI
   - 足夠分析主題和關鍵字
   - 大幅降低 token 消耗

4. **緩存 AI 結果**
   - AI 生成的結果存在 D1
   - 除非文章大幅修改，否則不重新生成
   - 可以設定「6 個月後重新評估」

### 7.7 SEO 結果應用

**寫回 WordPress（推薦）**

將 AI 生成的 SEO 內容更新回 WordPress：
- 更新 Yoast SEO 或 Rank Math 插件的欄位
- 這樣在 WordPress 後台也能看到
- 可以手動調整 AI 的建議

**只存在 D1（簡化版）**

不寫回 WordPress，只在 D1 保存：
- 減少對 WordPress 的寫入操作
- 通過 Workers 直接讀取 D1 渲染頁面時使用
- 缺點：WordPress 後台看不到

**混合方案**
- 重要頁面（產品、熱門文章）寫回 WordPress
- 一般文章只存 D1

### 7.8 SEO 監控和報告

**定期生成報告：**

1. **每週報告**
   - 本週優化了多少篇文章
   - 平均 SEO 分數提升
   - AI 費用消耗

2. **月度報告**
   - 哪些文章 SEO 分數最高/最低
   - 需要人工檢查的文章列表
   - 關鍵字分佈分析

3. **異常告警**
   - SEO 處理失敗率 > 10%
   - AI API 費用異常增高
   - 佇列堆積過多（超過 100 篇）

---

## 8. Invoice/Quotation 系統

### 8.1 系統需求分析

**Invoice（發票）功能：**
- 基於已完成的訂單生成正式發票
- 包含訂單所有項目、金額、稅費
- 生成 PDF 可下載
- 記錄發票狀態（pending/paid/cancelled）
- 支持補發、作廢

**Quotation（報價單）功能：**
- 客戶詢價時快速生成報價
- 可以選擇產品和數量
- 自動計算總價、稅費
- 設定有效期限
- 報價被接受後可轉為訂單

### 8.2 為什麼用 D1 + Workers？

**傳統方案（WordPress 插件）的問題：**
- 每次生成都要查詢 WordPress 數據庫（慢）
- 依賴 WordPress 環境
- 難以定制化
- 生成大量 PDF 會拖慢 VPS

**用 D1 + Workers 的優勢：**
- 從 D1 讀取數據極快（邊緣節點）
- 不依賴 WordPress，獨立系統
- 可以自定義格式和邏輯
- PDF 生成在 Cloudflare 邊緣
- 費用低（Workers 免費額度大）

### 8.3 Invoice 生成流程

```
客戶請求 Invoice（或後台手動生成）
    ↓
POST /api/invoice/generate
body: { order_id: 123 }
    ↓
Invoice Worker 接收請求
    ↓
從 D1 查詢訂單資料（orders 表）
    ↓
從 D1 查詢訂單項目（order_items 表）
    ↓
生成唯一的 Invoice 號碼（例：INV-202501-0001）
    ↓
創建 Invoice HTML（公司資訊、客戶資訊、項目列表、金額）
    ↓
轉換成 PDF（使用第三方 API 或 Cloudflare Browser Rendering）
    ↓
上傳 PDF 到 R2（路徑：invoices/INV-202501-0001.pdf）
    ↓
記錄到 D1 invoices 表
    ↓
返回下載連結給客戶
{
  "invoice_number": "INV-202501-0001",
  "pdf_url": "https://documents.example.com/invoices/INV-202501-0001.pdf"
}
```

### 8.4 Invoice 號碼生成規則

**格式設計：**
```
INV-YYYYMM-NNNN

例如：
INV-202501-0001  (2025年1月第1號)
INV-202501-0002  (2025年1月第2號)
INV-202502-0001  (2025年2月第1號，重新開始)
```

**為什麼這樣設計：**
- 容易識別月份（方便對帳）
- 每月重新編號（避免號碼過大）
- 有固定前綴（INV-）便於區分文件類型

**生成邏輯：**
1. 查詢 D1：找出本月最後一個 Invoice 號碼
2. 序號 +1
3. 如果是新月份，從 0001 開始
4. 格式化成 INV-YYYYMM-NNNN

### 8.5 PDF 生成方案

**方案 A：使用第三方 PDF API（推薦新手）**

服務選項：
- **html2pdf.app** - 簡單易用，按次計費
- **PDFShift** - 功能強大
- **API2PDF** - 支持多種引擎

優點：
- 開箱即用，不需要複雜配置
- 支持複雜 CSS 和字體
- 按需付費

缺點：
- 需要額外費用（通常 $0.001-0.01/次）
- 依賴外部服務

流程：
1. 準備 Invoice HTML
2. POST 到 PDF API
3. 接收返回的 PDF 二進制數據
4. 上傳到 R2

**方案 B：Cloudflare Browser Rendering（推薦進階）**

Cloudflare 官方的瀏覽器渲染服務：
- 在邊緣運行 Chromium
- 可以將網頁轉成 PDF
- 需要付費計劃（Workers Paid Plan）

優點：
- 完全在 Cloudflare 生態內
- 速度快，全球分佈
- 支持完整的網頁渲染

缺點：
- 需要付費計劃
- 配置稍複雜

**方案 C：簡化版 - 只生成 HTML 預覽**

如果不想處理 PDF：
- 生成 HTML Invoice
- 存到 R2
- 客戶可以在瀏覽器打印成 PDF

優點：
- 完全免費
- 實現簡單
- 客戶可以自行打印

缺點：
- 不夠正式（某些客戶可能要求 PDF）
- 格式可能因瀏覽器不同有差異

### 8.6 Invoice HTML 模板設計

**關鍵元素：**

1. **Header（頁眉）**
   - 公司 Logo
   - 公司名稱和地址
   - "INVOICE" 大標題

2. **Invoice 資訊**
   - Invoice Number
   - Invoice Date
   - Due Date
   - Order Number（對應的訂單號）

3. **Bill To（客戶資訊）**
   - 客戶名稱
   - Email
   - 地址（從訂單的 billing_address 讀取）

4. **Items Table（項目表）**
   | Item | SKU | Quantity | Unit Price | Total |
   |------|-----|----------|------------|-------|
   | 產品A | SKU-001 | 2 | $50.00 | $100.00 |
   | 產品B | SKU-002 | 1 | $30.00 | $30.00 |

5. **Summary（總計）**
   - Subtotal: $130.00
   - Tax (10%): $13.00
   - Shipping: $5.00
   - **Total: $148.00**

6. **Footer（頁腳）**
   - Payment Terms（付款條款）
   - Bank Account（銀行帳戶資訊）
   - Thank You 訊息

**模板樣式建議：**
- 使用簡潔專業的設計
- 黑白為主（打印友好）
- 清晰的字體（Arial, Helvetica）
- 適當的留白

### 8.7 Quotation 系統差異

**與 Invoice 的主要差異：**

| 項目 | Invoice | Quotation |
|------|---------|-----------|
| 基於 | 已完成訂單 | 客戶詢價 |
| 狀態 | pending/paid/cancelled | draft/sent/accepted/rejected |
| 必須欄位 | Order ID | 客戶 Email |
| 有效期 | 無（已完成交易） | 有（例如 30 天） |
| 轉換 | 不可轉換 | 可以轉成訂單 |

**Quotation 特殊功能：**

1. **手動創建產品列表**
   - 不基於現有訂單
   - 客戶選擇產品和數量
   - 後端自動從 D1 products 表獲取最新價格

2. **有效期管理**
   - 設定 `valid_until` 欄位
   - 過期後顯示「此報價已過期」
   - 可以延長有效期

3. **接受/拒絕流程**
   - 生成唯一連結：`https://example.com/quote/QT-202501-0001`
   - 客戶點擊「接受」→ 狀態改為 accepted
   - 可以自動創建 WooCommerce 訂單

4. **備註欄位**
   - 特殊條款
   - 折扣說明
   - 交期承諾

### 8.8 D1 表結構

**invoices 表：**
- `id` - 主鍵
- `invoice_number` - 唯一，例 INV-202501-0001
- `order_id` - 關聯 orders 表
- `customer_email`
- `total` - 總金額
- `status` - pending/paid/cancelled
- `issued_at` - 開立時間
- `due_at` - 到期時間
- `paid_at` - 付款時間（如果已付）
- `pdf_path` - R2 路徑，例 invoices/INV-202501-0001.pdf
- `created_at`

**quotations 表：**
- `id` - 主鍵
- `quote_number` - 唯一，例 QT-202501-0001
- `customer_email`
- `customer_name`
- `items` - JSON 字串，存產品列表
- `subtotal`, `tax`, `total`
- `status` - draft/sent/accepted/rejected
- `valid_until` - 有效期限
- `notes` - 備註
- `pdf_path` - R2 路徑
- `created_at`, `updated_at`

### 8.9 API 設計

**Invoice API：**

```
POST /api/invoice/generate
Request: { order_id: 123 }
Response: { invoice_number, pdf_url }

GET /api/invoice/{invoice_number}
Response: { invoice 資料, items[] }

GET /api/invoices?customer_email=xxx&status=pending
Response: { invoices: [...] }

PATCH /api/invoice/{invoice_number}/status
Request: { status: "paid", paid_at: timestamp }
Response: { success: true }
```

**Quotation API：**

```
POST /api/quotation/generate
Request: {
  customer_email,
  customer_name,
  items: [
    { product_id: 1, quantity: 2 },
    { product_id: 5, quantity: 1 }
  ],
  valid_days: 30,
  notes: "特殊折扣 10%"
}
Response: { quote_number, pdf_url, total }

GET /api/quotation/{quote_number}
Response: { quote 資料 }

PATCH /api/quotation/{quote_number}/accept
Response: { success, order_id (如果自動創建訂單) }
```

---

## 9. KV 緩存策略

### 9.1 KV 的作用

**你的需求：**
把渲染好的 WordPress HTML 頁面存入 KV，下次直接返回，不用再去 WordPress 生成。

**效果：**
- 首次訪問：Worker → origin.example.com（慢，可能 500ms-2s）
- 再次訪問：Worker → KV（極快，<50ms）
- 降低 VPS 負載 90%+

### 9.2 什麼應該緩存？

**應該緩存：**
- ✅ 首頁（流量最大）
- ✅ 文章頁面（內容不常改變）
- ✅ 產品頁面（價格、庫存不是即時的可以接受短暫延遲）
- ✅ 分類/標籤頁面
- ✅ 靜態頁面（關於我們、聯絡方式）

**不應該緩存：**
- ❌ 購物車頁面（每個用戶不同）
- ❌ 結帳頁面（動態內容）
- ❌ 我的帳戶頁面（用戶專屬）
- ❌ WordPress 後台（/wp-admin）
- ❌ 搜索結果頁面（每次搜索不同）

### 9.3 緩存 Key 設計

**簡單方案：用 URL 路徑當 Key**

```
URL: https://example.com/blog/my-article
Key: /blog/my-article

URL: https://example.com/product/coffee-beans
Key: /product/coffee-beans
```

**進階方案：考慮查詢參數**

```
URL: https://example.com/shop?category=coffee&page=2
Key: /shop?category=coffee&page=2

或標準化：
Key: /shop:category=coffee:page=2
```

**移動端分離緩存（可選）：**

如果桌面版和移動版 HTML 不同：
```
桌面：/blog/my-article:desktop
移動：/blog/my-article:mobile
```

### 9.4 TTL（過期時間）策略

**不同類型頁面設定不同 TTL：**

| 頁面類型 | TTL | 理由 |
|---------|-----|------|
| 首頁 | 30 分鐘 | 更新頻繁，展示最新內容 |
| 文章頁 | 2 小時 | 內容穩定，少改動 |
| 產品頁 | 1 小時 | 價格可能調整 |
| 分類頁 | 30 分鐘 | 新產品上架時要快速顯示 |
| 靜態頁 | 24 小時 | 很少變動 |

**動態 TTL（進階）：**

根據更新頻率自動調整：
- 最近 24 小時有更新 → TTL 10 分鐘
- 7 天內有更新 → TTL 1 小時
- 超過 30 天沒更新 → TTL 24 小時

### 9.5 緩存更新策略

**被動過期（簡單）：**
- 設定 TTL，時間到自動過期
- 下次訪問重新生成並緩存

優點：簡單
缺點：第一個訪問過期頁面的用戶會等比較久

**主動清除（推薦）：**

WordPress 內容更新時立即清除相關緩存：

1. **文章發布/更新**
   - 清除該文章頁面的緩存
   - 清除首頁緩存（因為可能展示最新文章）
   - 清除分類頁緩存

2. **產品更新**
   - 清除該產品頁緩存
   - 清除商品分類頁緩存

3. **全站緩存清除**
   - 提供管理介面按鈕「清除所有緩存」
   - 重大更新（換主題、改設計）時使用

**實現方式：**
- WordPress 插件監聽 `save_post` 等 hook
- 調用 Worker API：`POST /api/cache/purge`
- Worker 刪除 KV 中的對應 key

### 9.6 緩存預熱（可選）

**概念：**
不等用戶訪問，提前生成熱門頁面的緩存。

**適用場景：**
- 新文章發布後，立即預熱緩存
- 每日凌晨預熱首頁和熱門產品頁
- 避免「第一個訪問者」等待的問題

**實現：**
WordPress 文章發布後：
1. 調用 Worker API 預熱
2. Worker 訪問該頁面：`fetch("https://origin.example.com/新文章")`
3. 拿到 HTML 存入 KV
4. 用戶訪問時已經有緩存了

### 9.7 緩存監控

**關鍵指標：**

1. **命中率（Hit Rate）**
   - 公式：HIT 次數 / 總請求次數
   - 目標：>80%

2. **MISS 原因分析**
   - 新頁面（正常）
   - TTL 過期（調整 TTL）
   - 緩存被清除（檢查清除邏輯）

3. **熱門頁面**
   - 哪些頁面訪問最多
   - 確保這些頁面緩存效果好

**在 Worker 中添加監控：**
- 每次請求記錄：HIT/MISS
- 記錄到 D1 或 Cloudflare Analytics
- 生成報告：每小時/每天的緩存表現

### 9.8 KV 成本

**Cloudflare KV 定價（2024）：**
- 免費額度：
  - 每天 100,000 次讀取
  - 每天 1,000 次寫入
  - 1 GB 存儲

- 超過免費額度：
  - 讀取：$0.50 / 百萬次
  - 寫入：$5.00 / 百萬次
  - 存儲：$0.50 / GB/月

**成本估算：**

假設你的網站：
- 每天 10,000 次頁面訪問
- 80% 命中率（8,000 次 KV 讀取）
- 每天發布 10 篇文章（10 次寫入）

費用：
- 讀取：8,000 < 100,000（免費）
- 寫入：10 < 1,000（免費）
- 存儲：假設 500 個頁面，每頁 50KB = 25MB（免費）

**結論：一般網站完全在免費額度內。**

---

## 10. 完整部署順序

這是最重要的部分：**正確的部署順序**，避免出錯。

### 10.1 前期準備（第 1 天）

**1. 備份現有網站**
- 備份 WordPress 數據庫（mysqldump）
- 備份 wp-content 目錄（特別是 uploads）
- 導出 WooCommerce 訂單數據
- 測試恢復備份（確保備份可用）

**2. 準備 Cloudflare 帳號**
- 註冊 Cloudflare 帳號（如果沒有）
- 添加你的域名到 Cloudflare
- 將 DNS Name Server 改到 Cloudflare（等待生效，可能需要 24 小時）

**3. 安裝必要工具**
- 在本機安裝 Node.js 和 npm
- 安裝 Wrangler CLI：`npm install -g wrangler`
- 登入 Wrangler：`wrangler login`

### 10.2 基礎設施建置（第 2-3 天）

**步驟 1：創建 Cloudflare 資源**

```bash
# 創建 D1 數據庫
wrangler d1 create wordpress-data
# 記下返回的 database_id

# 創建 KV Namespace
wrangler kv:namespace create "HTML_CACHE"
wrangler kv:namespace create "HTML_CACHE" --preview
# 記下 namespace_id

# 創建 R2 Bucket
# 在 Dashboard 操作：R2 → Create Bucket
# 名稱：wordpress-media
# 名稱：business-documents (存 Invoice/Quote PDF)
```

**步驟 2：初始化 D1 數據庫**

```bash
# 執行建表 SQL
wrangler d1 execute wordpress-data --file=schema.sql

# 驗證表已創建
wrangler d1 execute wordpress-data --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**步驟 3：配置 DNS**

在 Cloudflare Dashboard → DNS：

| 類型 | 名稱 | 內容 | 代理 |
|------|------|------|------|
| A | origin | VPS_IP | 灰雲 |
| CNAME | @ | example.com | 橙雲 |
| CNAME | www | example.com | 橙雲 |

等待 DNS 生效（用 `dig origin.example.com` 檢查）

### 10.3 VPS WordPress 配置（第 4 天）

**步驟 1：配置 origin 子域名**

創建 Nginx 配置：`/etc/nginx/sites-available/origin.example.com`

重點：
- 加入 Cloudflare IP 白名單
- 只允許 Cloudflare 訪問

**步驟 2：配置 WordPress**

編輯 `wp-config.php`：
- 設定 `WP_HOME` 和 `WP_SITEURL`
- 加入 Cloudflare IP 信任代碼

**步驟 3：安裝必要插件**

- **JWT Authentication for WP REST API** - 提供 API Token
- **WP Offload Media** - 圖片上傳到 R2（稍後配置）
- **Yoast SEO** 或 **Rank Math** - SEO 管理

**步驟 4：生成 API Tokens**

```bash
# WordPress JWT Token
curl -X POST https://origin.example.com/wp-json/jwt-auth/v1/token \
  -d "username=admin&password=你的密碼"
# 記下返回的 token

# WooCommerce API Keys
# 在 WordPress 後台：WooCommerce → Settings → Advanced → REST API
# 創建新 Key，權限：Read/Write
# 記下 Consumer Key 和 Consumer Secret
```

### 10.4 部署 Workers（第 5-6 天）

按照這個順序部署：

**1. 部署 Media Worker（R2 圖片）**

```bash
cd workers/r2-media-worker
# 編輯 wrangler.toml，綁定 R2 bucket
wrangler deploy
```

綁定域名：`media.example.com`

測試：上傳測試圖片到 R2，訪問 `https://media.example.com/test.jpg`

**2. 部署主 Proxy Worker**

```bash
cd workers/main-proxy
# 編輯 wrangler.toml
# - 綁定 KV namespace
# - 設定環境變數
wrangler deploy
```

綁定域名：`example.com`

測試：
```bash
curl -I https://example.com
# 應該看到 X-Cache: MISS (第一次)
curl -I https://example.com
# 應該看到 X-Cache: HIT (第二次)
```

**重要：測試是否有 Loop**
```bash
# 如果返回 Error 1001 或無限重定向 = 有 Loop
# 檢查 Worker 代碼是否正確改寫 hostname 到 origin
```

**3. 部署 Sync Worker**

```bash
cd workers/sync-worker
# 設定 Secrets
wrangler secret put WP_API_TOKEN
wrangler secret put WC_KEY
wrangler secret put WC_SECRET

wrangler deploy
```

設定 Cron：在 wrangler.toml 加入 `crons = ["*/5 * * * *"]`

測試手動同步：
```bash
curl -X POST https://sync-worker.你的subdomain.workers.dev/sync/manual \
  -H "Authorization: Bearer YOUR_SYNC_TOKEN"
```

檢查 D1 是否有數據：
```bash
wrangler d1 execute wordpress-data --command="SELECT COUNT(*) FROM posts"
```

**4. 部署 SEO Worker**

```bash
cd workers/seo-worker
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

測試：
```bash
# 加入一篇文章到 SEO 佇列
curl -X POST https://seo-worker.你的subdomain.workers.dev/optimize/post \
  -H "Content-Type: application/json" \
  -d '{"post_id": 1, "priority": 10}'

# 檢查狀態
curl https://seo-worker.你的subdomain.workers.dev/status
```

**5. 部署 Invoice Worker**

```bash
cd workers/invoice-worker
# 綁定 R2 bucket: business-documents
wrangler deploy
```

測試：
```bash
curl -X POST https://invoice-worker.你的subdomain.workers.dev/api/invoice/generate \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}'
```

### 10.5 WordPress 圖片遷移到 R2（第 7-8 天）

**步驟 1：安裝 Rclone（在 VPS）**

```bash
# 安裝 Rclone
curl https://rclone.org/install.sh | sudo bash

# 配置 R2
rclone config
# 選擇 S3 compatible
# Endpoint: https://[account-id].r2.cloudflarestorage.com
# 輸入 Access Key 和 Secret
```

**步驟 2：同步圖片到 R2**

```bash
# 先測試（dry-run）
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:wordpress-media/ \
  --dry-run \
  --progress

# 確認無誤後正式同步
rclone sync /var/www/wordpress/wp-content/uploads/ \
  cloudflare-r2:wordpress-media/ \
  --progress
```

**步驟 3：更新數據庫 URL**

安裝 **Better Search Replace** 插件：
- Search for: `https://example.com/wp-content/uploads/`
- Replace with: `https://media.example.com/`
- 選擇所有表（至少包括 wp_posts, wp_postmeta）
- **先 Dry Run 預覽**
- 確認無誤後執行

**步驟 4：配置 WP Offload Media**

在 WordPress 安裝 WP Offload Media 插件：
- Provider: S3 Compatible
- Endpoint, Bucket, Keys
- 選項：「Remove Files From Server」（節省 VPS 空間）

測試：上傳新圖片，檢查是否自動到 R2

### 10.6 WordPress 整合插件（第 9 天）

創建自定義插件：`cloudflare-integration`

功能：
1. 文章發布時清除 KV 緩存
2. 文章發布時觸發 SEO 優化
O 優化
3. 提供後台管理界面

**安裝步驟：**

1. 創建插件目錄：`/wp-content/plugins/cloudflare-integration/`
2. 創建主文件：`cloudflare-integration.php`
3. 在 WordPress 後台啟用插件

**插件功能清單：**

- ✅ 自動清除緩存（文章更新時）
- ✅ 觸發 AI SEO 優化
- ✅ 手動觸發同步按鈕
- ✅ 顯示 SEO 佇列狀態
- ✅ 批量優化文章功能

**測試：**
1. 發布新文章
2. 檢查是否觸發了緩存清除
3. 檢查 SEO 佇列是否加入該文章

### 10.7 測試和驗證（第 10 天）

**完整測試清單：**

**1. DNS 和域名測試**
```bash
# 測試 DNS 解析
dig example.com
dig origin.example.com
dig media.example.com

# 測試 SSL 證書
curl -I https://example.com
curl -I https://origin.example.com
curl -I https://media.example.com
```

**2. Worker 功能測試**

```bash
# 測試主 Worker（無 Loop）
curl -I https://example.com
# 檢查 Response Headers：X-Cache

# 測試緩存命中
curl -I https://example.com/sample-post/
curl -I https://example.com/sample-post/
# 第二次應該是 HIT

# 測試繞過緩存的路徑
curl -I https://example.com/wp-admin/
# 應該直接到 origin，沒有 X-Cache
```

**3. 圖片訪問測試**

```bash
# 測試 R2 圖片
curl -I https://media.example.com/2024/01/test-image.jpg

# 在瀏覽器打開網站，檢查：
# - 所有圖片是否正常顯示
# - Network tab 檢查圖片 URL 是否指向 media.example.com
# - 沒有 404 錯誤
```

**4. 數據同步測試**

```bash
# 檢查 D1 數據
wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) FROM posts"

wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) FROM products"

wrangler d1 execute wordpress-data \
  --command="SELECT COUNT(*) FROM orders"

# 數量應該和 WordPress 數據庫一致
```

**5. AI SEO 測試**

```bash
# 檢查 SEO 佇列
curl https://seo-worker.your-subdomain.workers.dev/status

# 手動觸發一篇文章優化
curl -X POST https://seo-worker.your-subdomain.workers.dev/optimize/post \
  -H "Content-Type: application/json" \
  -d '{"post_id": 1}'

# 等待幾分鐘後檢查結果
wrangler d1 execute wordpress-data \
  --command="SELECT seo_title, seo_score FROM posts WHERE id = 1"
```

**6. Invoice 系統測試**

```bash
# 生成測試 Invoice
curl -X POST https://invoice-worker.your-subdomain.workers.dev/api/invoice/generate \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}'

# 應該返回 invoice_number 和 pdf_url
# 訪問 pdf_url 檢查 PDF 是否正常
```

**7. 性能測試**

使用工具測試：
- **GTmetrix** - https://gtmetrix.com
- **PageSpeed Insights** - https://pagespeed.web.dev
- **WebPageTest** - https://www.webpagetest.org

**目標指標：**
- 首次載入時間（TTFB）：< 500ms
- 完全載入時間：< 2s
- Lighthouse Performance 分數：> 90

**8. 壓力測試（可選）**

使用 Apache Bench 或類似工具：
```bash
# 測試 100 個並發請求
ab -n 1000 -c 100 https://example.com/

# 檢查：
# - 沒有錯誤
# - KV 緩存大幅降低了響應時間
# - VPS 負載沒有明顯增加
```

### 10.8 監控設置（第 11 天）

**1. Cloudflare Analytics**

在 Cloudflare Dashboard 查看：
- 流量統計
- 緩存命中率
- Worker 執行次數
- 錯誤率

**2. 創建監控 Dashboard**

部署監控頁面（HTML + JavaScript）：
- 顯示同步狀態
- 顯示 SEO 佇列
- 顯示緩存統計
- 顯示最近的 Invoice/Quote

部署到 Cloudflare Pages 或 R2 Static Website

**3. 告警設置**

關鍵告警：
- 同步失敗率 > 10%
- SEO 處理失敗 > 5 次
- Worker 錯誤率 > 1%
- D1 查詢超時

可以用：
- Cloudflare Notifications
- 或整合 Slack/Discord Webhook

### 10.9 上線切換（第 12 天）

**最終檢查清單：**

- [ ] 所有 Workers 部署完成並測試通過
- [ ] DNS 設置正確（origin 是灰雲，其他是橙雲）
- [ ] 圖片全部遷移到 R2 並正常顯示
- [ ] 數據同步正常運行
- [ ] 備份已完成並測試可恢復
- [ ] 監控和告警已設置

**切換步驟：**

1. **通知用戶**（可選）
   - 如果是大型網站，提前通知維護時間
   - 預計停機時間：< 5 分鐘

2. **最後一次完整備份**
   ```bash
   # 備份數據庫
   mysqldump -u root -p wordpress_db > backup_final.sql
   
   # 備份文件
   tar -czf wp-content-backup.tar.gz /var/www/wordpress/wp-content
   ```

3. **停用舊的 Cloudflare 設置（如果有）**
   - 關閉舊的 Page Rules
   - 關閉 APO（Automatic Platform Optimization）

4. **啟用新系統**
   - Workers 已經在運行，只需確認 Custom Domain 綁定
   - 測試主域名：`https://example.com`

5. **監控第一小時**
   - 檢查錯誤日誌
   - 檢查用戶回報
   - 準備好隨時回退

**回退計劃（萬一出問題）：**

1. 解除 Workers 的 Custom Domain 綁定
2. DNS 改回直接指向 VPS
3. 恢復 WordPress 配置（改回單一域名）
4. 調查問題，修復後再次嘗試

---

## 11. 常見問題和解決方案

### 11.1 Worker Loop 問題

**症狀：**
- 訪問網站出現 Error 1001
- 無限重定向
- Worker 執行次數異常高
- CPU Time 超限

**診斷：**
```bash
# 檢查是否 Loop
curl -I https://example.com

# 如果返回 Error 1001 = Loop
# 如果看到多個 Set-Cookie 重複 = 可能 Loop
```

**解決方案：**

1. **檢查 DNS 設置**
   ```
   origin.example.com 必須是灰雲（DNS Only）
   如果是橙雲 → 改成灰雲
   ```

2. **檢查 Worker 代碼**
   ```javascript
   // 確保有這段代碼
   const url = new URL(request.url);
   url.hostname = 'origin.example.com';  // 改寫域名
   ```

3. **檢查路由配置**
   - Workers Routes 不應該包含 `origin.example.com/*`
   - 只應該是 `example.com/*` 和 `www.example.com/*`

4. **測試 origin 是否可直接訪問**
   ```bash
   curl -I https://origin.example.com
   # 應該直接返回 WordPress，沒有 Worker 處理的標記
   ```

### 11.2 圖片遷移後出現 404

**症狀：**
- 部分圖片顯示不出來
- Browser Console 顯示 404 錯誤
- 圖片 URL 指向 media.example.com 但找不到

**診斷：**
```bash
# 檢查圖片是否在 R2
wrangler r2 object get wordpress-media/2024/01/missing-image.jpg

# 檢查數據庫 URL 是否正確替換
# 在 WordPress 數據庫執行：
SELECT post_content FROM wp_posts 
WHERE post_content LIKE '%wp-content/uploads%' 
LIMIT 10;
# 如果還有舊 URL = 沒替換乾淨
```

**解決方案：**

1. **找出遺漏的圖片**
   ```bash
   # 用 Rclone 再次同步（只上傳新的）
   rclone sync /var/www/wordpress/wp-content/uploads/ \
     cloudflare-r2:wordpress-media/ \
     --progress
   ```

2. **重新替換數據庫 URL**
   - 用 Better Search Replace 再次檢查
   - 確保包括所有表（wp_postmeta 也要檢查）

3. **檢查目錄結構**
   ```
   WordPress: /wp-content/uploads/2024/01/image.jpg
   R2: wordpress-media/2024/01/image.jpg
   URL: https://media.example.com/2024/01/image.jpg
   
   路徑必須完全一致
   ```

4. **檢查 Media Worker**
   - 確認 R2 Bucket 綁定正確
   - 測試 Worker 是否正常返回圖片

### 11.3 數據同步延遲或失敗

**症狀：**
- WordPress 新增內容但 D1 沒有
- Sync Log 顯示 status = 'failed'
- Invoice 系統找不到訂單數據

**診斷：**
```bash
# 檢查同步狀態
curl https://sync-worker.your-subdomain.workers.dev/sync/status

# 檢查 D1 sync_log 表
wrangler d1 execute wordpress-data \
  --command="SELECT * FROM sync_log ORDER BY sync_started_at DESC LIMIT 10"
```

**常見原因和解決：**

**1. API Token 過期或錯誤**
```bash
# 重新生成 WordPress JWT Token
curl -X POST https://origin.example.com/wp-json/jwt-auth/v1/token \
  -d "username=admin&password=密碼"

# 更新 Worker Secret
wrangler secret put WP_API_TOKEN
```

**2. WooCommerce API Keys 錯誤**
```bash
# 在 WordPress 後台重新生成 WC Keys
# WooCommerce → Settings → Advanced → REST API

wrangler secret put WC_KEY
wrangler secret put WC_SECRET
```

**3. WordPress REST API 被禁用**
```bash
# 測試 REST API 是否可訪問
curl https://origin.example.com/wp-json/wp/v2/posts

# 如果返回 403 或 404
# 檢查 WordPress 插件是否禁用了 REST API
# 或 .htaccess 是否有限制
```

**4. Cloudflare IP 被 VPS 防火牆擋住**
```bash
# 在 VPS 檢查 Nginx 錯誤日誌
tail -f /var/log/nginx/error.log

# 如果看到 403 Forbidden from Cloudflare IP
# 確認 Nginx 的 Cloudflare IP 白名單是否完整
```

**5. D1 寫入限制**
```
D1 有寫入速率限制
如果短時間大量寫入可能被限流
```

解決：
- 批量插入改用 `DB.batch()` 
- 控制每次同步的數量（例如一次最多 100 筆）

**手動修復不一致的數據：**
```bash
# 手動觸發全量同步
curl -X POST https://sync-worker.your-subdomain.workers.dev/sync/manual \
  -H "Authorization: Bearer YOUR_SYNC_TOKEN"

# 或直接用 Wrangler 清空 D1 重新同步
wrangler d1 execute wordpress-data --command="DELETE FROM posts"
# 然後觸發同步
```

### 11.4 SEO Worker AI API 失敗

**症狀：**
- SEO 佇列一直卡在 processing
- seo_queue 表很多 status = 'failed'
- 文章沒有生成 seo_title

**診斷：**
```bash
# 檢查 SEO 佇列
curl https://seo-worker.your-subdomain.workers.dev/status

# 查看失敗的項目和錯誤訊息
wrangler d1 execute wordpress-data \
  --command="SELECT * FROM seo_queue WHERE status = 'failed' LIMIT 10"
```

**常見原因：**

**1. Anthropic API Key 錯誤**
```bash
# 測試 API Key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"test"}]}'

# 如果返回 401 = Key 錯誤
wrangler secret put ANTHROPIC_API_KEY
```

**2. API 速率限制**
```
Anthropic API 有速率限制
如果短時間大量請求會被限流
```

解決：
- 降低 Cron 頻率（從每小時改成每 2 小時）
- 減少每批處理數量（從 10 改成 5）
- 加入重試延遲（exponential backoff）

**3. AI 返回格式錯誤**
```
AI 有時不會返回標準 JSON
可能包含 ```json 標記或其他文字
```

解決：
- 改進 prompt，強調「只返回 JSON，不要其他文字」
- Worker 代碼加入更強大的 JSON 解析（移除 markdown 標記）

**4. 文章內容太長**
```
超過 Claude 的 context window
導致 API 錯誤
```

解決：
- 限制發送給 AI 的內容長度（例如前 2000 字元）
- 在 Worker 代碼中：`post.content.substring(0, 2000)`

### 11.5 Invoice PDF 生成失敗

**症狀：**
- Invoice API 返回錯誤
- PDF 下載連結 404
- R2 中找不到 PDF 文件

**診斷：**
```bash
# 測試 Invoice 生成
curl -X POST https://invoice-worker.your-subdomain.workers.dev/api/invoice/generate \
  -H "Content-Type: application/json" \
  -d '{"order_id": 123}' \
  -v

# 檢查 R2 是否有文件
wrangler r2 object list business-documents --prefix="invoices/"
```

**常見原因：**

**1. D1 沒有訂單數據**
```bash
# 檢查訂單是否同步到 D1
wrangler d1 execute wordpress-data \
  --command="SELECT * FROM orders WHERE id = 123"

# 如果沒有 → 觸發同步
```

**2. PDF API 服務錯誤**
```
使用第三方 PDF API 可能失敗
API Key 錯誤、配額用完、服務故障
```

解決：
- 檢查 PDF API 的錯誤訊息
- 確認 API Key 和配額
- 考慮備用方案（改用 HTML 預覽）

**3. R2 綁定錯誤**
```
Worker 的 R2 Bucket 綁定名稱不對
或 Bucket 不存在
```

解決：
```toml
# 檢查 wrangler.toml
[[r2_buckets]]
binding = "DOCUMENTS"  # 必須和代碼中一致
bucket_name = "business-documents"
```

**4. Invoice 號碼衝突**
```
生成的 Invoice Number 已存在
導致唯一性約束錯誤
```

解決：
- 檢查號碼生成邏輯
- 確保查詢最後一個號碼時正確
- 考慮加入隨機後綴（如 INV-202501-0001-a3f2）

### 11.6 緩存沒有清除

**症狀：**
- WordPress 更新內容但前端還是舊的
- 手動清除緩存後才顯示新內容
- 用戶看到過期的資訊

**診斷：**
```bash
# 檢查 KV 中的內容
wrangler kv:key get --binding=HTML_CACHE "/blog/my-post"

# 檢查 WordPress 插件是否觸發清除
# 查看 WordPress debug.log
```

**常見原因：**

**1. WordPress 插件沒有觸發**
```
save_post hook 沒有執行
或清除 API 請求失敗
```

解決：
- 檢查 WordPress error log
- 手動測試清除 API：
```bash
curl -X POST https://example.com/api/cache/purge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/blog/my-post"]}'
```

**2. Cache Key 不匹配**
```
清除時用的 key 和緩存時用的不一樣
例如：緩存時是 /blog/post/
清除時是 /blog/post （少了斜線）
```

解決：
- 統一 key 格式（統一加或統一不加尾斜線）
- Worker 代碼標準化 pathname

**3. TTL 太長**
```
即使清除了，Cloudflare CDN 還有緩存
```

解決：
- 降低 TTL（從 24 小時改成 1-2 小時）
- 使用 Cloudflare Purge Cache API（清除 CDN 緩存）

**4. 多個 KV key 需要清除**
```
一篇文章更新，可能影響：
- 文章頁本身
- 首頁（顯示最新文章）
- 分類頁
```

解決：
- WordPress 插件清除時，清除所有相關頁面
- 或者用較短的 TTL 讓它們自然過期

### 11.7 性能沒有預期中好

**症狀：**
- TTFB 還是很慢（> 1 秒）
- 緩存命中率低（< 50%）
- PageSpeed 分數沒提升

**診斷：**
```bash
# 檢查緩存命中率
# 在 Cloudflare Analytics 或 Worker 日誌查看

# 測試不同頁面的載入時間
curl -w "@curl-format.txt" -o /dev/null -s https://example.com
# curl-format.txt:
# time_namelookup: %{time_namelookup}\n
# time_connect: %{time_connect}\n
# time_starttransfer: %{time_starttransfer}\n
# time_total: %{time_total}\n
```

**常見原因和優化：**

**1. 緩存命中率低**

原因：
- 很多動態參數（`?utm_source=xxx`）
- 每個 URL 都不同，無法命中緩存

解決：
```javascript
// Worker 中標準化 URL（移除無關參數）
const url = new URL(request.url);
// 移除追蹤參數
url.searchParams.delete('utm_source');
url.searchParams.delete('utm_medium');
url.searchParams.delete('fbclid');

const cacheKey = url.pathname + url.search;
```

**2. WordPress 本身慢**

即使有緩存，MISS 時還是要等 WordPress 生成：
- WordPress 未優化
- 太多插件
- 數據庫查詢慢

解決：
- 優化 WordPress（安裝 Redis Object Cache）
- 禁用不必要的插件
- 優化數據庫查詢
- 提高 VPS 配置

**3. 圖片未優化**

圖片太大拖慢載入：
- 原圖幾 MB
- 沒有壓縮
- 沒有 lazy loading

解決：
- 用 Cloudflare Images（付費）或 Imgix 處理圖片
- WordPress 安裝圖片優化插件
- 啟用 lazy loading

**4. TTL 設置不當**

太短的 TTL 導致頻繁 MISS：
```javascript
// 調整不同頁面的 TTL
首頁: 30分鐘 → 1小時
文章: 1小時 → 2小時
靜態頁: 2小時 → 24小時
```

**5. 沒有預熱緩存**

新文章發布後，第一個訪問者等待時間長：

解決：
- 文章發布後自動預熱
- 定期預熱熱門頁面

### 11.8 成本超出預期

**症狀：**
- Cloudflare 帳單比預期高
- AI API 費用快速增長
- R2 出站流量費用（不應該有）

**診斷：**
```bash
# 檢查各服務用量
# Cloudflare Dashboard → Analytics

# 檢查 AI API 用量
# Anthropic Dashboard → Usage

# 檢查 R2 用量
# R2 Dashboard → Metrics
```

**成本優化：**

**1. AI API 費用控制**

如果 SEO 處理太頻繁：
- 降低 Cron 頻率（每 2 小時 → 每 6 小時）
- 只處理重要文章（流量高的、新發布的）
- 限制每日處理上限（例如每天最多 100 篇）
- 縮短發送給 AI 的內容長度

**2. Workers 費用**

Workers 免費額度：
- 每天 100,000 次請求
- 每次執行最多 10ms CPU Time

如果超出：
- 檢查是否有 Loop（導致請求暴增）
- 優化 Worker 代碼（減少 CPU Time）
- 考慮升級到 Paid Plan（$5/月，1000萬次請求）

**3. D1 費用**

D1 免費額度很大，一般不會超：
- 每天 500 萬次讀取
- 每天 10 萬次寫入

如果超出：
- 檢查同步頻率是否太高
- 是否有重複的查詢（加緩存）

**4. R2 費用**

R2 存儲和讀取免費，但：
- Class A 操作（寫入）：$4.50 / 百萬次
- Class B 操作（讀取）：$0.36 / 百萬次

優化：
- 批量上傳圖片（減少寫入次數）
- 避免頻繁重複讀取同一文件

**5. Cloudflare Images（如果使用）**

付費服務，按圖片數量和轉換次數計費：
- 考慮是否真的需要
- 或改用免費的 R2 + Worker 自行處理

---

## 12. 進階優化和擴展

### 12.1 多語言支持

如果網站需要多語言：

**方案 A：用 WPML 或 Polylang 插件**
- 緩存 key 加上語言代碼：`/blog/post:en`, `/blog/post:zh`
- D1 同步時包含語言欄位

**方案 B：用子域名**
- `en.example.com`, `zh.example.com`
- 每個語言獨立的 WordPress 安裝
- 共用 D1 數據

### 12.2 A/B 測試

用 Workers 實現 A/B 測試：
- 隨機分配用戶到版本 A 或 B
- 從不同的 KV key 讀取內容
- 記錄轉換率到 D1

### 12.3 智能路由

根據用戶位置、設備、時間等動態路由：
```javascript
const country = request.cf.country;
const device = request.headers.get('User-Agent').includes('Mobile') ? 'mobile' : 'desktop';

// 根據國家顯示不同內容
if (country === 'US') {
  // 美國特定優惠
}

// 手機版和桌面版不同緩存
const cacheKey = `${url.pathname}:${device}`;
```

### 12.4 GraphQL API

如果前端需要靈活查詢：
- 創建 GraphQL Worker
- 從 D1 讀取數據
- 提供給前端（React/Vue）使用

### 12.5 Webhook 整合

與其他服務整合：
- 訂單完成 → 發送到 Slack
- 新文章發布 → 觸發社群媒體發文
- Invoice 生成 → 發送 Email（用 Resend 或 SendGrid）

---

## 13. 總結

### 13.1 系統優勢

**你這個架構的核心優勢：**

1. **性能極佳**
   - 全球邊緣節點緩存
   - TTFB < 100ms（緩存命中時）
   - 無限擴展能力

2. **成本低廉**
   - Cloudflare 免費額度很大
   - R2 無出站流量費
   - 降低 VPS 負載，可用更低配置

3. **靈活擴展**
   - 新功能用 Workers 實現
   - 不影響 WordPress 核心
   - 可以逐步遷移功能到邊緣

4. **AI 加持**
   - SEO 自動化省人力
   - 批量處理大量內容
   - 持續優化

5. **業務整合**
   - Invoice/Quote 系統
   - 數據分析
   - 自定義報表

### 13.2 適用場景

**這個架構特別適合：**

✅ 電商網站（WooCommerce）
✅ 內容網站（大量文章）
✅ 全球訪問的網站
✅ 需要高性能的網站
✅ 預算有限但要求高的項目

**不太適合：**

❌ 即時性要求極高的應用（股票交易）
❌ 高度動態的應用（社交網絡）
❌ 需要即時數據一致性的系統

### 13.3 維護要點

**日常維護：**
- 每週檢查同步狀態
- 每月檢查 SEO 處理進度
- 定期備份 D1 和 R2
- 監控 API 費用

**定期更新：**
- Cloudflare Workers 代碼
- WordPress 和插件
- 檢查 Cloudflare IP 範圍更新

**優化迭代：**
- 根據 Analytics 調整緩存策略
- 優化 AI Prompt 提高 SEO 質量
- 根據用戶反饋改進 Invoice 模板

---

希望這份詳細的 README 清楚說明了：
1. ✅ 你的完整 idea 和需求
2. ✅ 每個組件的詳細方案
3. ✅ WordPress 圖片無痛遷移到 R2 的完整
