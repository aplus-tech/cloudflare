import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk'; // 使用 HTTP 避免 Origin SSL 錯誤

    // 1. API 路由直接交給 SvelteKit 處理 (例如 D1 Sync)
    if (url.pathname.startsWith('/api')) {
        return resolve(event);
    }

    // 2. 強制跳轉 pages.dev 到正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 3. 檢查是否需要 Bypass Cache (登入、購物車、管理後台)
    const cookies = event.request.headers.get('cookie') || '';
    const isBypass =
        cookies.includes('wordpress_logged_in_') ||
        cookies.includes('woocommerce_items_in_cart') ||
        url.pathname.startsWith('/wp-admin') ||
        url.pathname.startsWith('/wp-login.php');

    // 4. KV Cache 讀取 (只針對 GET 請求且非 Bypass)
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    const isNoCache = event.request.headers.get('cache-control')?.includes('no-cache') || url.searchParams.has('purge');
    const cacheKey = `html:${url.pathname}${url.search}`; // 修正 Cache Key 格式

    if (kv && event.request.method === 'GET' && !isBypass && !isNoCache) {
        try {
            const cachedHTML = await kv.get(cacheKey);
            if (cachedHTML) {
                return new Response(cachedHTML, {
                    headers: {
                        'Content-Type': 'text/html; charset=UTF-8',
                        'X-Edge-Cache': 'Hit'
                    }
                });
            }
        } catch (e) { console.error('KV Read Error:', e); }
    }

    // 5. Proxy 到 WordPress Origin
    const proxyHeaders = new Headers();
    // 複製原始請求 Header
    ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
        const val = event.request.headers.get(h);
        if (val) proxyHeaders.set(h, val);
    });

    // 偽裝 Header (關鍵：防止 WordPress 跳轉)
    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    try {
        const originResponse = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual' // 不自動跟隨跳轉，由我們手動處理
        });

        // 6. 處理 Response

        // A. 處理跳轉 (Rewrite Location)
        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                const newLocation = location
                    .replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`)
                    .replace(`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`)
                    .replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN)
                    .replace(PAGES_DEV, CUSTOM_DOMAIN);
                return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
            }
        }

        const contentType = originResponse.headers.get('content-type') || '';

        // B. 處理 HTML/CSS/JS 內容 (Rewrite URLs)
        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript') || contentType.includes('json')) {
            let body = await originResponse.text();

            // 強力替換所有舊域名/HTTP 連結
            const replacements = [
                [ORIGIN_URL, `https://${CUSTOM_DOMAIN}`],
                [`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                [`http://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                [`https://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                ['origin.aplus-tech.com.hk', CUSTOM_DOMAIN],
                [PAGES_DEV, CUSTOM_DOMAIN],
                // JSON Escaped
                ['http:\\/\\/origin.aplus-tech.com.hk', `https:\\/\\/${CUSTOM_DOMAIN}`],
                [`http:\\/\\/${CUSTOM_DOMAIN}`, `https:\\/\\/${CUSTOM_DOMAIN}`]
            ];

            for (const [from, to] of replacements) {
                body = body.split(from).join(to);
            }

            // TODO: Phase 4.5 R2 圖片替換邏輯可在此處加入
            // 例如: body = body.replace(/https:\/\/aplus-tech.com.hk\/wp-content\/uploads\/(.*?)\.jpg/g, 'https://media.aplus-tech.com.hk/assets/$1.jpg');

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('X-Edge-Cache', 'Miss');

            const finalResponse = new Response(body, { status: originResponse.status, headers: newHeaders });

            // 寫入 KV Cache (只針對 HTML, 200 OK, 非 Bypass, 且內容長度合理)
            if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isBypass && body.length > 2000) {
                event.platform.context.waitUntil(kv.put(cacheKey, body, { expirationTtl: 604800 })); // 7天
            }

            return finalResponse;
        }

        // C. 其他資源 (圖片、字型等) 直接回傳
        return new Response(originResponse.body, {
            status: originResponse.status,
            headers: originResponse.headers
        });

    } catch (err: any) {
        return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
    }
};
