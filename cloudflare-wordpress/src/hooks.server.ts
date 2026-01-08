import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk'; // 使用你設定好的 DNS Only 域名

    // 1. 【強力修復】如果網址包含 pages.dev，即刻 301 跳轉返去正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 2. 統一 Cache Key
    const searchParams = new URLSearchParams(url.search);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign'];
    trackingParams.forEach(p => searchParams.delete(p));
    const cleanSearch = searchParams.toString();

    let normalizedPath = url.pathname;
    if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
    }
    const cacheKey = `html:${normalizedPath}${cleanSearch ? '?' + cleanSearch : ''}`;

    // 3. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 4. 檢查登入
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_')) return resolve(event);

    // 5. 嘗試從 KV 讀取
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

    // 6. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        const proxyHeaders = new Headers();
        // 複製必要的 Header
        const headersToCopy = ['accept', 'accept-language', 'cookie', 'user-agent'];
        headersToCopy.forEach(h => {
            const val = event.request.headers.get(h);
            if (val) proxyHeaders.set(h, val);
        });

        proxyHeaders.set('Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Proto', 'https'); // 關鍵：話俾 WordPress 聽我係 HTTPS
        proxyHeaders.set('Referer', `https://${CUSTOM_DOMAIN}`);

        try {
            const originResponse = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
                headers: proxyHeaders,
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

                    return new Response(null, {
                        status: originResponse.status,
                        headers: { 'Location': newLocation }
                    });
                }
            }

            const contentType = originResponse.headers.get('content-type') || '';

            if (contentType.includes('text/html') && originResponse.status === 200) {
                let body = await originResponse.text();

                // 【強力替換】確保 HTML 入面所有連結都係正式域名
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

    // 7. 存入 KV
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
