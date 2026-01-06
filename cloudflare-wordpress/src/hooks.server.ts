import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);

    // 1. 統一 Cache Key (移除追蹤碼，處理結尾斜槓)
    const searchParams = new URLSearchParams(url.search);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign'];
    trackingParams.forEach(p => searchParams.delete(p));
    const cleanSearch = searchParams.toString();

    // 統一將路徑結尾的 / 去掉來做 Key (除非是根目錄)
    let normalizedPath = url.pathname;
    if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
    }
    const cacheKey = `html:${normalizedPath}${cleanSearch ? '?' + cleanSearch : ''}`;

    const ORIGIN = 'https://aplus-tech.com.hk';
    const ORIGIN_HOST = new URL(ORIGIN).host;
    const currentHost = url.host;

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
        proxyHeaders.set('Host', ORIGIN_HOST);
        proxyHeaders.set('Referer', ORIGIN);

        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: proxyHeaders,
            redirect: 'manual' // 手動處理跳轉
        });

        // 處理 WordPress 的 301/302 跳轉
        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                const newLocation = location.replace(ORIGIN_HOST, currentHost).replace('www.' + ORIGIN_HOST, currentHost);
                return new Response(null, {
                    status: originResponse.status,
                    headers: { 'location': newLocation }
                });
            }
        }

        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') && originResponse.status === 200) {
            let body = await originResponse.text();
            // 替換所有域名連結
            body = body.split(ORIGIN_HOST).join(currentHost);
            body = body.split('www.' + ORIGIN_HOST).join(currentHost);

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            newHeaders.set('X-Edge-Cache', 'Miss');

            response = new Response(body, { status: 200, headers: newHeaders });
        } else {
            // 靜態資源加速
            const assetHeaders = new Headers(originResponse.headers);
            assetHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
            response = new Response(originResponse.body, { status: originResponse.status, headers: assetHeaders });
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
