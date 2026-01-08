import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);

    // 1. 統一 Cache Key
    const searchParams = new URLSearchParams(url.search);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign'];
    trackingParams.forEach(p => searchParams.delete(p));
    const cleanSearch = searchParams.toString();

    let normalizedPath = url.pathname;
    if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
    }
    const cacheKey = `html:${normalizedPath}${cleanSearch ? '?' + cleanSearch : ''}`;

    // 【關鍵修復】ORIGIN 必須係一個「唔同名」嘅網址，否則會 1019 無限迴圈
    // 請喺 DNS 加一條 origin.aplus-tech.com.hk 指向你原本個 WordPress Server IP
    const ORIGIN = 'https://origin.aplus-tech.com.hk';
    const ORIGIN_HOST = 'aplus-tech.com.hk'; // 原始 Host 名稱
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk'; // 你想客見到嘅域名

    // 2. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 3. 檢查登入 (登入咗就直接 resolve，唔行 Cache)
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_')) return resolve(event);

    // 4. 嘗試從 KV 讀取
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    if (kv) {
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
        } catch (e) { }
    }

    // 5. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        const proxyHeaders = new Headers(event.request.headers);
        proxyHeaders.set('Host', ORIGIN_HOST); // 話俾 WordPress 聽我係 aplus-tech.com.hk
        proxyHeaders.set('Referer', `https://${ORIGIN_HOST}`);

        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: proxyHeaders,
            redirect: 'manual'
        });

        // 處理跳轉：確保唔會跳去 pages.dev
        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                // 將所有 origin 網址換返做正式域名
                const newLocation = location.replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN).replace(ORIGIN_HOST, CUSTOM_DOMAIN);
                return new Response(null, {
                    status: originResponse.status,
                    headers: { 'location': newLocation }
                });
            }
        }

        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') && originResponse.status === 200) {
            let body = await originResponse.text();

            // 【關鍵修復】將所有網址換返做正式域名，唔准出現 pages.dev
            body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);
            body = body.split('cloudflare-9qe.pages.dev').join(CUSTOM_DOMAIN);
            body = body.split(ORIGIN_HOST).join(CUSTOM_DOMAIN);

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            newHeaders.set('X-Edge-Cache', 'Miss');

            response = new Response(body, { status: 200, headers: newHeaders });
        } else {
            response = new Response(originResponse.body, {
                status: originResponse.status,
                headers: originResponse.headers
            });
        }
    }

    // 6. 存入 KV
    if (kv && response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();
        if (html.length > 1000) {
            try {
                await kv.put(cacheKey, html, { expirationTtl: 604800 });
            } catch (e) { }
        }
    }

    return response;
};
