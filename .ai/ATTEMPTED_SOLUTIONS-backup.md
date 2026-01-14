# 已嘗試方案記錄

> 目的：記錄已試過嘅解決方案，避免 AI 重複建議失敗做法
> 創建日期：2026-01-13
> 最後更新：2026-01-13

---

## 使用指引

### 俾 AI 睇
當遇到相同錯誤時：
1. 先檢查呢個文件有冇記錄
2. 如果有 ❌ 標記，**唔好再建議呢個方案**
3. 參考「待試方案」或者提出新方案
4. **新方案必須有來源證據**（官方文檔、Stack Overflow 等）

### 記錄格式
| 日期 | 方案 | 結果 | Commit | 備註 |
|------|------|------|--------|------|
| YYYY-MM-DD | 做咗咩 | ✅/❌ | hash | 點解成功/失敗 |

---

## Error 521: Web server is down

### 問題描述
- 訪問 `https://cloudflare-9qe.pages.dev/` 時出現 Error 521
- 來源：用戶截圖 (2026-01-13 18:23:39 UTC)

### ❌ 已試方案（失敗）

| 日期 | 方案 | 結果 | Commit | 失敗原因 |
|------|------|------|--------|---------|
| 2026-01-13 | `test` CNAME → `cloudflare-9qe.pages.dev` | ❌ | DNS 設定 | Error 522 Connection timed out（需要喺 Pages 加 Custom Domain）|
| 2026-01-13 | 改用 `origin` 子域名（灰雲 DNS-Only） | ❌ | [88de455](https://github.com/aplus-tech/cloudflare/commit/88de455) | WordPress Site URL 仍設為 `test.aplus-tech.com.hk`，強制 301 redirect |
| 2026-01-13 | 改用 HTTP origin (`http://test.aplus-tech.com.hk`) | ❌ | [3da638b](https://github.com/aplus-tech/cloudflare/commit/3da638b) | Build 失敗 (workerd-linux-64) |
| 2026-01-12 | 設定正確 Host header + 移除 CF headers | ❌ | [f990811](https://github.com/aplus-tech/cloudflare/commit/f990811) | 仍然 521 |
| 2026-01-12 | 用域名代替 IP (`test.aplus-tech.com.hk`) | ❌ | [b133d7a](https://github.com/aplus-tech/cloudflare/commit/b133d7a) | Error 1003 |
| 2026-01-10 | 加 compatibility_date for nodejs_compat | ❌ | [097a04f](https://github.com/aplus-tech/cloudflare/commit/097a04f) | 未解決 521 |
| 2026-01-10 | 加 nodejs_compat flag | ❌ | [ba1f4da](https://github.com/aplus-tech/cloudflare/commit/ba1f4da) | Error 1003 |

### ⏳ 待試方案

| 方案 | 來源/證據 | 狀態 |
|------|----------|------|
| **方案 A**：Worker 跟隨 redirect（fetch `redirect: 'follow'`） | [Cloudflare Workers fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/#redirect) | ⚠️ 可能 loop |
| **方案 B**：改 WordPress Site URL 為 `http://origin.aplus-tech.com.hk` | [WordPress Changing Site URL](https://developer.wordpress.org/advanced-administration/upgrade/migrating/#changing-the-site-url) | 推薦 ✅ |

### 💡 可能根本原因
- [!Uncertain: 以下需要實際檢查確認]
1. VPS 上嘅 WordPress/Nginx 未運行
2. VPS Firewall 封鎖咗連線
3. Docker container 未啟動

---

## Error: Build Failed (workerd-linux-64)

### 問題描述
- Cloudflare Pages Build 失敗
- 錯誤訊息：`The package "@cloudflare/workerd-linux-64" could not be found`
- 來源：Cloudflare Pages Build Log (2026-01-13 12:03:41Z)

### ✅ 已解決（2026-01-13）

| 日期 | 方案 | 結果 | Commit |
|------|------|------|--------|
| 2026-01-13 | 移除 `wrangler` 從 devDependencies | ✅ Build 成功 | [bc565de](https://github.com/aplus-tech/cloudflare/commit/bc565de) |

### 解決方案詳情
- **問題**：`wrangler` 包含 `workerd` 作為 optionalDependency，喺 Cloudflare Pages Build 環境安裝失敗
- **方案**：移除 `wrangler` 從 devDependencies
- **原因**：Cloudflare Pages 唔需要 `wrangler`（Pages 有自己嘅 build 系統）
- **來源**：[GitHub workerd #320](https://github.com/cloudflare/workerd/issues/320), [#4139](https://github.com/cloudflare/workerd/issues/4139)
- **Build 時間**：19:12:22 - 19:13:06 (約 44 秒)

---

## ERR_CONNECTION_REFUSED: test.aplus-tech.com.hk

### 問題描述
- 訪問 `https://test.aplus-tech.com.hk` 出現連線拒絕
- 來源：用戶截圖 (2026-01-13)
- DNS 設定：`test` A Record → `15.235.199.194` (僅 DNS，灰雲)
- 來源：用戶 Cloudflare DNS 截圖 (2026-01-13)

### VPS 環境資訊
- **IP**：15.235.199.194
- **WordPress 安裝方式**：Docker
- **Port 80**：✅ 正常運作（Apache/2.4.65 Debian）
- **Port 443**：❌ 連線失敗

### 診斷結果（2026-01-13）

| 測試 | 結果 | 來源 |
|------|------|------|
| `curl http://15.235.199.194` | ✅ HTTP 301 → https://test.aplus-tech.com.hk/ | curl 測試 |
| `nslookup test.aplus-tech.com.hk` | ✅ 解析到 15.235.199.194 | nslookup 測試 |
| `curl https://15.235.199.194 -k` | ❌ Port 443 連線失敗 | curl 測試 |

### 根本原因
- WordPress 強制 HTTPS redirect（`X-Redirect-By: WordPress`）
- VPS Port 443 未開放或 SSL 未設定
- 來源：curl 輸出 `Location: https://test.aplus-tech.com.hk/`

### ✅ 已解決（2026-01-13）

| 日期 | 方案 | 結果 | 備註 |
|------|------|------|------|
| 2026-01-13 | 將 DNS `test` 改為橙雲 (Proxied) + Flexible SSL | ✅ | Cloudflare 處理 SSL |

### 解決方案詳情
- **DNS 設定**：`test` A Record → 15.235.199.194 (🟠 橙雲 Proxied)
- **SSL 模式**：Flexible（Cloudflare ↔ 訪客用 HTTPS，Cloudflare ↔ VPS 用 HTTP）
- **來源**：[Cloudflare SSL 文檔](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)

### Docker 環境資訊（供日後參考）

| Container | Port Mapping | 狀態 |
|-----------|-------------|------|
| wordpress-app | 0.0.0.0:80->80/tcp | ✅ 運行中 |
| wordpress-redis | 6379/tcp (內部) | ✅ 運行中 |
| wordpress-db | 3306/tcp (內部) | ✅ 運行中 |

---

## ✅ 成功方案記錄

### R2 圖片上傳修復 (2026-01-11)

| 問題 | 方案 | Commit | 來源 |
|------|------|--------|------|
| 圖片上傳到 R2 後損壞 | `blob()` → `arrayBuffer()` | [e83c623](https://github.com/aplus-tech/cloudflare/commit/e83c623) | [PROGRESS.md:111-115](../PROGRESS.md#L111-L115) |
| media_mapping 誤存 R2 URL | API 拒絕非 WordPress URL | [30950d1](https://github.com/aplus-tech/cloudflare/commit/30950d1) | [PROGRESS.md:116-120](../PROGRESS.md#L116-L120) |

---

## 更新記錄

| 日期 | 更新內容 | 更新者 |
|------|---------|--------|
| 2026-01-13 | 創建文件，記錄 Error 521、Build Failed、Connection Refused | AI (Claude Opus 4) |
