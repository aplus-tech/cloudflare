import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const { url, platform, request, cookies } = event;
    const path = url.pathname;
    const ORIGIN = 'https://test.aplus-tech.com.hk'; // 使用域名而唔係 IP，避免 Cloudflare 限制

    // [Verified: Phase 4.6: 邊緣驗證與正式切換]
    // 1. 允許 SvelteKit 內部的 API 正常運作
    if (path.startsWith('/api')) {
        return resolve(event);
    }

    // 2. 處理靜態資源 (CSS, JS, Images, Fonts) 的代理
    const staticExtensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico'];
    const isStaticAsset = staticExtensions.some(ext => path.toLowerCase().endsWith(ext));

    if (isStaticAsset) {
        const assetUrl = `${ORIGIN}${path}${url.search}`;
        try {
            const assetResponse = await fetch(assetUrl, {
                headers: { 'Host': 'test.aplus-tech.com.hk' }
            });

            if (!assetResponse.ok) {
                return new Response('Not Found', { status: 404 });
            }

            return new Response(assetResponse.body, {
                headers: {
                    'Content-Type': assetResponse.headers.get('Content-Type') || 'application/octet-stream',
                    'Cache-Control': 'public, max-age=31536000',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } catch (e) {
            console.error('Asset fetch error:', e);
            return new Response('Error fetching asset', { status: 500 });
        }
    }

    const cacheKey = `html:${path}`;
    const kv = platform?.env.HTML_CACHE;
    const db = platform?.env.DB;

    // 3. 檢查登入狀態 (Bypass KV)
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

    // 4. Proxy 頁面請求
    try {
        const targetUrl = `${ORIGIN}${path}${url.search}`;
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: {
                ...Object.fromEntries(request.headers),
                'Host': 'test.aplus-tech.com.hk'
            },
            redirect: 'follow'
        });

        // 直接使用 WordPress 嘅 response，包括 404 頁面
        let html = await response.text();

        // 5. 內容替換 (域名與 R2 媒體)
        // 將 WordPress 返回嘅 HTML 入面嘅 origin URL 替換成當前訪問嘅域名
        const currentHost = url.host;
        const targetHost = 'test.aplus-tech.com.hk'; // VPS WordPress 設定嘅域名

        // 替換 WordPress 內部 URL 為當前訪問嘅域名
        // 例如：將 http://15.235.199.194/xxx 替換成 https://test.aplus-tech.com.hk/xxx
        html = html.split(`http://15.235.199.194`).join(`https://${currentHost}`);
        html = html.split(`https://test.aplus-tech.com.hk`).join(`https://${currentHost}`);
        html = html.split(`http://test.aplus-tech.com.hk`).join(`https://${currentHost}`);

        if (db) {
            const { results: mappings } = await db.prepare('SELECT original_url, r2_path FROM media_mapping').all();
            if (mappings) {
                for (const map of mappings) {
                    const r2Url = `https://media.aplus-tech.com.hk/${map.r2_path}`;
                    html = html.split(map.original_url).join(r2Url);
                }
            }
        }

        // 6. 存入 KV
        if (response.status === 200 && !hasLoginCookie && kv) {
            await kv.put(cacheKey, html, { expirationTtl: 3600 * 24 });
        }

        return new Response(html, {
            status: response.status,
            headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Cache': 'MISS' }
        });

    } catch (e) {
        console.error('Proxy Error:', e);
        return new Response('Error proxying to WordPress origin', {
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
};
