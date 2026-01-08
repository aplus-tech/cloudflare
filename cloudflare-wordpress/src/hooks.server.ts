import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk';

    // 1. 強制跳轉返正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 2. 排除特定路徑 (API, Admin)
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 3. 檢查登入 (登入咗就唔行 Cache)
    const cookies = event.request.headers.get('cookie') || '';
    const isLoggedIn = cookies.includes('wordpress_logged_in_');

    // 4. 嘗試從 KV 讀取 (只限 GET 且未登入嘅 HTML)
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    if (kv && event.request.method === 'GET' && !isLoggedIn) {
        try {
            const normalizedPath = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
            const cacheKey = `html:${normalizedPath}${url.search}`;
            const cachedHTML = await kv.get(cacheKey);
            if (cachedHTML) {
                return new Response(cachedHTML, {
                    headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Edge-Cache': 'Hit' }
                });
            }
        } catch (e) { }
    }

    // 5. Proxy 邏輯
    const proxyHeaders = new Headers();
    const headersToCopy = ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type'];
    headersToCopy.forEach(h => {
        const val = event.request.headers.get(h);
        if (val) proxyHeaders.set(h, val);
    });

    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    try {
        const originResponse = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual'
        });

        // 處理跳轉
        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                const newLocation = location
                    .replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`)
                    .replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN)
                    .replace(PAGES_DEV, CUSTOM_DOMAIN);
                return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
            }
        }

        const contentType = originResponse.headers.get('content-type') || '';

        // 針對 HTML, CSS, JS 進行網址替換
        if (contentType.includes('text/html') || contentType.includes('text/css') || contentType.includes('application/javascript')) {
            let body = await originResponse.text();

            // 全域替換所有可能出錯嘅域名
            body = body.split(ORIGIN_URL).join(`https://${CUSTOM_DOMAIN}`);
            body = body.split('http://origin.aplus-tech.com.hk').join(`https://${CUSTOM_DOMAIN}`);
            body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);
            body = body.split(PAGES_DEV).join(CUSTOM_DOMAIN);

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('X-Edge-Cache', 'Miss');

            const finalResponse = new Response(body, { status: originResponse.status, headers: newHeaders });

            // 存入 KV (只限 HTML)
            if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isLoggedIn) {
                const normalizedPath = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
                const cacheKey = `html:${normalizedPath}${url.search}`;
                event.platform.context.waitUntil(kv.put(cacheKey, body, { expirationTtl: 604800 }));
            }

            return finalResponse;
        }

        // 圖片或其他資源直接回傳
        return new Response(originResponse.body, {
            status: originResponse.status,
            headers: originResponse.headers
        });

    } catch (err: any) {
        return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
    }
};
