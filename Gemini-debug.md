# Gemini Debug Report
> 日期：2026-01-14 | 狀態：Phase 4.8 診斷報告

---

## 1. 系統檢查結果 (Code Inspection)

我檢查咗系統代碼，發現以下關鍵配置問題：

### 🔴 Critical: Worker Proxy 目標錯誤
- **檔案**：`src/hooks.server.ts`
- **發現**：
  ```typescript
  const ORIGIN = 'http://origin.aplus-tech.com.hk'; // 指向舊 Shared Hosting
  // ...
  newHeaders.set('Host', 'origin.aplus-tech.com.hk');
  ```
- **問題**：Worker 硬編碼指去舊 Server (`origin`)，而唔係新 VPS (`test`)。這解釋咗點解 Worker 依家睇落「正常」，因為佢根本無連去新環境。

### ⚠️ Security: 密鑰管理風險
- **檔案**：`wp-d1-sync.php`
  - **發現**：Hardcoded Secret `Lui@63006021`。
- **檔案**：`wp-cache-purge.php`
  - **發現**：Placeholder Secret `REPLACE_WITH_A_SECURE_KEY`。
- **檔案**：`api/purge-all/+server.ts`
  - **發現**：Hardcoded Fallback Secret。

---

## 2. 用戶測試結果 (User Test Results)

用戶在瀏覽器進行了實際測試，結果如下：

| 測試 URL | 結果 | 狀態 | 解讀 |
|---------|------|------|------|
| `https://cloudflare-9qe.pages.dev/` | ✅ 顯示網頁 | 正常 (假象) | 因為 Worker 連錯咗去舊 Server (Origin)，所以睇到舊網頁。 |
| `http://origin.aplus-tech.com.hk/` | ✅ 顯示網頁 | 正常 | 這是舊 Shared Hosting，一直都運作正常。 |
| `https://test.aplus-tech.com.hk/` | ❌ **Error 522** | **Connection Timed Out** | 這是新 VPS。Error 522 代表 Cloudflare 連唔入 VPS (Port 80/443 無反應)。 |

---

## 3. 問題分析 (Root Cause Analysis)

結合代碼檢查同測試結果，結論如下：

1.  **Worker "正常" 係因為指錯地方**：
    Worker (`hooks.server.ts`) 設定錯咗，佢去 Proxy `origin.aplus-tech.com.hk`。如果佢設定正確 (指去 `test`)，佢依家應該會同你直接訪問 `test` 一樣，出 Error 522。

2.  **VPS 基建有問題 (Error 522)**：
    `test.aplus-tech.com.hk` (15.235.199.194) 無法連接。這不是代碼問題，是 **Server 基建問題**。
    - 可能性 A：防火牆 (Firewall / Security Group) 封鎖咗 Port 80/443。
    - 可能性 B：Web Server (Nginx / Docker) 未啟動。
    - 可能性 C：Fail2Ban 誤封 Cloudflare IP。

---

## 4. 最終解決方案 (Final Solution)

請按順序執行以下步驟：

### ✅ Step 1: 修復 VPS 基建 (優先)
**目標**：解決 Error 522，確保瀏覽器可以直接訪問 `https://test.aplus-tech.com.hk`。

*   **行動**：檢查 VPS 防火牆、Docker 狀態、Nginx 設定。
*   **驗證**：直到瀏覽器開 `test.aplus-tech.com.hk` 見到 WordPress 畫面為止。

### ✅ Step 2: 修正 Worker 代碼
**目標**：將 Worker 指向正確的 VPS 環境。

*   **行動**：修改 `src/hooks.server.ts`：
    ```typescript
    // 1. 改 Origin 為 VPS IP (避開 DNS 問題)
    const ORIGIN = 'http://15.235.199.194';
    
    // 2. 改 Host Header 為測試域名
    newHeaders.set('Host', 'test.aplus-tech.com.hk');
    ```
*   **部署**：`wrangler pages deploy`

### ✅ Step 3: 驗證 Phase 4.8
當 Step 1 & 2 完成後，訪問 `https://cloudflare-9qe.pages.dev/`，你應該會見到新 VPS 的內容，這才算真正完成了 Phase 4.8 的環境設置。
