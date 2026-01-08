import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';

    // 【完美修正】使用 HTTP 連線避開 526 錯誤
    // 依賴 wp-config.php 的修正來防止跳轉死循環
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk';

    // 1. API 路由直接交給 SvelteKit
    if (url.pathname.startsWith('/api')) {
        return resolve(event);
    }

    // 2. 強制跳轉 pages.dev
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 3. Bypass Cache 檢查
    const cookies = event.request.headers.get('cookie') || '';
    const isBypass =
        cookies.includes('wordpress_logged_in_') ||
        cookies.includes('woocommerce_items_in_cart') ||
        url.pathname.startsWith('/wp-admin') ||
        url.pathname.startsWith('/wp-login.php');

    // 4. KV Cache
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    const isNoCache = event.request.headers.get('cache-control')?.includes('no-cache') || url.searchParams.has('purge');
    const cacheKey = `html:${url.pathname}${url.search}`;

    if (kv && event.request.method === 'GET' && !isBypass && !isNoCache) {
        try {
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
    ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
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

        // 6. 處理跳轉
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

        // 7. 內容替換
        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript') || contentType.includes('json')) {
            let body = await originResponse.text();

            const replacements = [
                [ORIGIN_URL, `https://${CUSTOM_DOMAIN}`],
                ['http://origin.aplus-tech.com.hk', `https://${CUSTOM_DOMAIN}`],
                [`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                [`http://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                [`https://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                ['origin.aplus-tech.com.hk', CUSTOM_DOMAIN],
                [PAGES_DEV, CUSTOM_DOMAIN],
                ['http:\\/\\/origin.aplus-tech.com.hk', `https:\\/\\/${CUSTOM_DOMAIN}`],
                [`http:\\/\\/${CUSTOM_DOMAIN}`, `https:\\/\\/${CUSTOM_DOMAIN}`]
            ];

            for (const [from, to] of replacements) {
                body = body.split(from).join(to);
            }

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('X-Edge-Cache', 'Miss');

            const finalResponse = new Response(body, { status: originResponse.status, headers: newHeaders });

            if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isBypass && body.length > 2000) {
                event.platform.context.waitUntil(kv.put(cacheKey, body, { expirationTtl: 604800 }));
            }

            return finalResponse;
        }

        return new Response(originResponse.body, {
            status: originResponse.status,
            headers: originResponse.headers
        });

    } catch (err: any) {
        return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
    }
};
