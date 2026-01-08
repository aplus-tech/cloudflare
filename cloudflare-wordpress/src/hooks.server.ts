import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const { url, platform, request, cookies } = event;
    const path = url.pathname;

    // [Verified: Phase 4.6: 邊緣驗證與正式切換]
    // 1. 排除 API 和靜態資源請求，只處理頁面 Proxy
    if (path.startsWith('/api') || path.includes('.')) {
        return resolve(event);
    }

    const ORIGIN = 'https://aplus-tech.com.hk';
    const cacheKey = `html:${path}`;
    const kv = platform?.env.HTML_CACHE;
    const db = platform?.env.DB;

    // [Verified: Phase 4.6: 邊緣驗證與正式切換]
    // 2. 檢查登入狀態，如果是管理員或已登入則 Bypass KV
    const hasLoginCookie = cookies.getAll().some(c => 
        c.name.startsWith('wordpress_logged_in_') || 
        c.name.startsWith('wp-settings-')
    );

    if (!hasLoginCookie && kv) {
        const cachedHtml = await kv.get(cacheKey);
        if (cachedHtml) {
            return new Response(cachedHtml, {
                headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Cache': 'HIT' }
            });
        }
    }

    // [Verified: Phase 4.6: 邊緣驗證與正式切換]
    // 3. Proxy 請求到 WordPress 原站
    try {
        const targetUrl = `${ORIGIN}${path}${url.search}`;
        
        // [Verified: Phase 4.6: 邊緣驗證與正式切換]
        // 關鍵：覆寫 Host Header 並處理重定向
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: {
                ...Object.fromEntries(request.headers),
                'Host': 'aplus-tech.com.hk',
                'X-Forwarded-Host': url.host
            },
            redirect: 'follow'
        });

        if (!response.ok && response.status !== 404) {
            return resolve(event);
        }

        let html = await response.text();

        // [Verified: Phase 4.6: 邊緣驗證與正式切換]
        // 4. HTML 內容替換：將原站域名替換為當前 Worker 域名
        const workerHost = url.host;
        html = html.split('aplus-tech.com.hk').join(workerHost);

        // [Verified: Phase 4.5: R2 語義化媒體遷移]
        // 5. 圖片路徑替換 (R2 Mapping)
        if (db) {
            const { results: mappings } = await db.prepare('SELECT original_url, r2_path FROM media_mapping').all();
            if (mappings) {
                for (const map of mappings) {
                    const r2Url = `https://media.aplus-tech.com.hk/${map.r2_path}`;
                    html = html.split(map.original_url).join(r2Url);
                }
            }
        }

        // [Verified: Phase 4.6: 邊緣驗證與正式切換]
        // 6. 存入 KV 緩存 (如果是 200 OK 且非登入狀態)
        if (response.status === 200 && !hasLoginCookie && kv) {
            await kv.put(cacheKey, html, { expirationTtl: 3600 * 24 }); // 緩存 24 小時
        }

        return new Response(html, {
            status: response.status,
            headers: {
                'Content-Type': 'text/html; charset=UTF-8',
                'X-Cache': 'MISS'
            }
        });

    } catch (e) {
        console.error('Proxy Error:', e);
        return resolve(event);
    }
};
