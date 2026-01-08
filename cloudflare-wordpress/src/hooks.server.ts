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

    // 使用你設定好的 DNS Only 域名，並用 HTTP 避免 SSL 526 錯誤
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk';
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';

    // 2. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 3. 檢查登入
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
        proxyHeaders.set('Host', CUSTOM_DOMAIN); // 告訴 WordPress 它是 aplus-tech.com.hk
        proxyHeaders.set('Referer', `https://${CUSTOM_DOMAIN}`);

        try {
            const originResponse = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
                headers: proxyHeaders,
                redirect: 'manual'
            });

            // 處理跳轉：確保所有跳轉都強制換回正式域名
            if (originResponse.status === 301 || originResponse.status === 302) {
                const location = originResponse.headers.get('location');
                if (location) {
                    const newLocation = location
                        .replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`)
                        .replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN)
                        .replace(PAGES_DEV, CUSTOM_DOMAIN);

                    return new Response(null, {
                        status: originResponse.status,
                        headers: { 'location': newLocation }
                    });
                }
            }

            const contentType = originResponse.headers.get('content-type') || '';

            if (contentType.includes('text/html') && originResponse.status === 200) {
                let body = await originResponse.text();

                // 【強力替換】將所有可能的錯誤網址全部換回 aplus-tech.com.hk
                body = body.split(ORIGIN_URL).join(`https://${CUSTOM_DOMAIN}`);
                body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);
                body = body.split(PAGES_DEV).join(CUSTOM_DOMAIN);

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
        } catch (err: any) {
            return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
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
