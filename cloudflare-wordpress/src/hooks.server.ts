import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);

    const searchParams = new URLSearchParams(url.search);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    trackingParams.forEach(param => searchParams.delete(param));
    const cleanSearch = searchParams.toString();
    const cacheKey = `html:${url.pathname}${cleanSearch ? '?' + cleanSearch : ''}`;

    const ORIGIN = 'https://aplus-tech.com.hk';
    const ORIGIN_HOST = new URL(ORIGIN).host;
    const currentHost = url.host;

    // 1. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 2. 檢查登入狀態
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_') || cookies.includes('wp-settings-')) {
        return resolve(event);
    }

    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;

    // 3. 嘗試從 KV 讀取
    if (kv) {
        try {
            const cachedHTML = await kv.get(cacheKey);
            if (cachedHTML) {
                return new Response(cachedHTML, {
                    headers: {
                        'Content-Type': 'text/html; charset=UTF-8',
                        'X-Edge-Cache': 'Hit',
                        'X-Debug-KV': 'Connected'
                    }
                });
            }
        } catch (e) { }
    }

    // 4. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        const proxyHeaders = new Headers(event.request.headers);
        proxyHeaders.set('Host', ORIGIN_HOST);
        proxyHeaders.set('Referer', ORIGIN);

        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: proxyHeaders
        });

        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') && originResponse.status === 200) {
            let body = await originResponse.text();
            body = body.split(ORIGIN_HOST).join(currentHost);

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            newHeaders.set('X-Edge-Cache', 'Miss');
            newHeaders.set('X-Debug-KV', kv ? 'Connected' : 'Missing-In-Dashboard');

            response = new Response(body, { status: 200, headers: newHeaders });
        } else {
            response = originResponse;
        }
    }

    // 5. 存入 KV
    if (kv && response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();
        if (html.length > 500) {
            try {
                await kv.put(cacheKey, html, { expirationTtl: 604800 });
            } catch (e) { }
        }
    }

    return response;
};
