# Cloudflare WordPress Accelerator

> 用 Cloudflare 邊緣計算加速 WordPress 網站 | 更新日期：2025-01-10

---

## 🎯 專案目標

用 **Cloudflare Workers + R2 + D1 + KV** 打造高性能 WordPress 加速系統：

- ⚡ **TTFB < 100ms**（KV 緩存命中）
- 💰 **R2 成本 < $1/月**（無出站流量費）
- 📉 **降低 VPS 負載 90%+**（邊緣緩存）
- 🔄 **實時同步 < 1 秒**（WordPress → D1）

---

## 📊 當前狀態

### ✅ 已上線（Phase 4.6）
- **混合架構**：HTML by Origin + Images by R2
- **KV 緩存命中率**：~80%
- **R2 語義化路徑**：`products/{brand}/{filename}`
- **實時數據同步**：WordPress → D1 < 1 秒

### 🚧 進行中（Phase 4.7）
- 移除 `wrangler.toml` 明文密碼（P0 安全）
- 優化 `media_mapping` 查詢（加 KV Cache）
- 並行上傳圖片（`Promise.all()`）
- 加入錯誤重試機制

---

## 🛠️ 技術棧

| 層級 | 技術 | 用途 |
|------|------|------|
| **Frontend** | SvelteKit 4 + TypeScript | Cloudflare Pages 部署 |
| **Edge** | Cloudflare Workers | 邊緣計算 + 代理 |
| **緩存** | Cloudflare KV | HTML 頁面緩存 |
| **存儲** | Cloudflare R2 | 媒體文件存儲 |
| **數據庫** | Cloudflare D1 (SQLite) | WordPress 數據副本 |
| **Origin** | WordPress 6.x + WooCommerce | PHP 8.1 + MySQL |

---

## 🚀 快速開始

### 1. 環境需求
- Node.js 18+
- Wrangler CLI（`npm install -g wrangler`）
- Cloudflare 帳號

### 2. 克隆專案
```bash
git clone https://github.com/aplus-tech/cloudflare.git
cd cloudflare/cloudflare-wordpress
```

### 3. 安裝依賴
```bash
npm install
```

### 4. 設定 Secret Key
```bash
wrangler secret put SYNC_SECRET_KEY
wrangler secret put PURGE_SECRET
```

### 5. 部署到 Cloudflare Pages
```bash
npm run deploy
```

---

## 📂 專案結構

```
Cloudflare/
├── .ai/                          # AI 開發規範
│   ├── CLAUDE.md                 # Sonnet 規則
│   ├── CLAUDE_OPUS.md            # Opus 規則
│   └── context.yaml              # 專案設定
│
├── cloudflare-wordpress/         # SvelteKit 專案
│   ├── src/
│   │   ├── hooks.server.ts       # Main Worker
│   │   └── routes/api/sync/      # 同步 API
│   └── wrangler.toml             # Cloudflare 配置
│
├── Wordpress Plugin/             # WordPress 插件
│   ├── wp-d1-sync.php            # D1 同步
│   └── wp-cache-purge.php        # 緩存清除
│
├── docs/                         # 文檔
│   ├── ARCHITECTURE.md           # 架構概覽
│   └── API_SPEC.md               # API 規範
│
├── PROGRESS.md                   # 進度追蹤
├── CHANGELOG.md                  # 改動記錄
└── README.md                     # 本文件
```

---

## 📖 文檔導航

### 新手入門
1. **[系統架構](docs/ARCHITECTURE.md)** - 架構概覽（~400 行）
2. **[API 規範](docs/API_SPEC.md)** - 所有 API 端點說明
3. **[進度追蹤](PROGRESS.md)** - 當前進度 + 待辦事項

### 深入了解
4. **[完整架構設計](architecture_design.md)** - 技術細節 + 決策理由
5. **[實施計劃](implementation_plan.md)** - 分階段實施步驟
6. **[任務清單](task.md)** - Phase 0-8 詳細任務

### AI 開發規範
7. **[.ai/CLAUDE.md](.ai/CLAUDE.md)** - Sonnet 開發規則
8. **[.ai/CLAUDE_OPUS.md](.ai/CLAUDE_OPUS.md)** - Opus 架構設計規則

---

## 🌐 域名配置

| 域名 | DNS 狀態 | 用途 |
|------|---------|------|
| `aplus-tech.com.hk` | 🟠 橙雲 | 主站（走 Worker） |
| `origin.aplus-tech.com.hk` | 🔘 灰雲 | 內部子域名（直達 VPS） |
| `media.aplus-tech.com.hk` | 🟠 橙雲 | R2 媒體域名 |
| `cloudflare-9qe.pages.dev` | - | Worker 部署網址 |

---

## 🎯 核心功能

### 1. 邊緣 HTML 緩存
- KV 緩存 WordPress 生成的 HTML
- TTL: 1 小時
- 自動清除機制

### 2. R2 圖片加速
- 語義化路徑：`products/{brand}/{filename}`
- 零出站流量費
- 自動同步上傳

### 3. 實時數據同步
- WordPress → D1 < 1 秒
- 支援 Products / Posts / Pages
- 包含 SEO 數據

### 4. 自動緩存清除
- WordPress 更新時自動清除對應頁面
- 支援單頁清除 + 全站清除

---

## 📊 性能指標

| 指標 | 目標 | 實際 | 狀態 |
|------|------|------|------|
| KV 緩存命中率 | >80% | ~80% | ✅ |
| TTFB（緩存命中） | <100ms | <100ms | ✅ |
| TTFB（首次載入） | <500ms | ~500ms | ✅ |
| D1 同步延遲 | <1s | <1s | ✅ |
| R2 圖片遷移 | 100% | 100% | ✅ |

---

## 🔧 開發指南

### 本地開發
```bash
cd cloudflare-wordpress
npm run dev
```

### 查看 Worker 日誌
```bash
wrangler pages deployment tail --project-name=cloudflare-9qe
```

### 測試 API
```bash
curl -X POST https://cloudflare-9qe.pages.dev/api/sync \
  -H "Content-Type: application/json" \
  -H "X-Secret-Key: your-secret" \
  -d '{"type":"product","payload":{...}}'
```

---

## 📝 改動記錄

詳見 [CHANGELOG.md](CHANGELOG.md)

---

## 📬 聯絡

- **專案**：A Plus Tech - Cloudflare WordPress Accelerator
- **VPS IP**：15.235.199.194
- **主域名**：aplus-tech.com.hk

---

**最後更新：2025-01-10**
