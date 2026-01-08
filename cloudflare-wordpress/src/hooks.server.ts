import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';

    // 使用 DNS Only 的 origin 域名
    const ORIGIN_URL = 'http://origin.aplus-tech.com.hk';

    if (url.pathname.startsWith('/api')) return resolve(event);

    // 1. 強制跳轉 pages.dev 到正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 2. Bypass Cache 檢查
    const cookies = event.request.headers.get('cookie') || '';
    const isBypass = cookies.includes('wordpress_logged_in_') ||
        cookies.includes('woocommerce_items_in_cart') ||
        url.pathname.startsWith('/wp-admin') ||
        url.pathname.startsWith('/wp-login.php');

    // 3. KV Cache 讀取
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    const cacheKey = `html:${url.pathname}${url.search}`;

    if (kv && event.request.method === 'GET' && !isBypass && !url.searchParams.has('purge')) {
        try {
            const cachedHTML = await kv.get(cacheKey);
            if (cachedHTML) return new Response(cachedHTML, {
                headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Edge-Cache': 'Hit' }
            });
        } catch (e) { }
    }

    // 4. Proxy 核心邏輯
    async function fetchFromOrigin(targetPath: string, targetSearch: string, depth = 0): Promise<Response> {
        if (depth > 5) return new Response('Too many internal redirects', { status: 500 });

        const proxyHeaders = new Headers();
        ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
            const val = event.request.headers.get(h);
            if (val) proxyHeaders.set(h, val);
        });

        // 【關鍵修正】Host 設為 origin 域名，確保 cPanel 認得並導向到正確資料夾
        // 配合 wp-config.php 的 WP_HOME，WordPress 會自動處理身份問題
        proxyHeaders.set('Host', 'origin.aplus-tech.com.hk');
        proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Proto', 'https');
        proxyHeaders.set('HTTPS', 'on');

        const originResponse = await fetch(`${ORIGIN_URL}${targetPath}${targetSearch}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual'
        });

        // 5. 攔截 cPanel 的惡意跳轉
        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                // 如果跳去預設頁面，代表 cPanel 仲係唔認得，我哋直接報錯唔好跳
                if (location.includes('defaultwebpage.cgi') || location.includes('cgi-sys')) {
                    return new Response('Origin Server Error: cPanel redirected to default page. Please check Alias propagation.', { status: 502 });
                }

                const locUrl = new URL(location);
                if (locUrl.hostname === CUSTOM_DOMAIN || locUrl.hostname === 'origin.aplus-tech.com.hk') {
                    return fetchFromOrigin(locUrl.pathname, locUrl.search, depth + 1);
                }

                const newLocation = location.replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`).replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN);
                return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
            }
        }

        return originResponse;
    }

    try {
        const originResponse = await fetchFromOrigin(url.pathname, url.search);
        const contentType = originResponse.headers.get('content-type') || '';

        // 6. 內容替換 (確保所有連結都係正式域名)
        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript') || contentType.includes('json')) {
            let body = await originResponse.text();
            const replacements = [
                [ORIGIN_URL, `https://${CUSTOM_DOMAIN}`],
                ['http://origin.aplus-tech.com.hk', `https://${CUSTOM_DOMAIN}`],
                ['https://origin.aplus-tech.com.hk', `https://${CUSTOM_DOMAIN}`],
                [`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                ['origin.aplus-tech.com.hk', CUSTOM_DOMAIN],
                [PAGES_DEV, CUSTOM_DOMAIN]
            ];
            for (const [from, to] of replacements) {
                body = body.split(from).join(to);
            }

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('X-Edge-Cache', 'Miss');

            const finalResponse = new Response(body, { status: originResponse.status, headers: newHeaders });

            // 寫入快取
            if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isBypass && body.length > 2000) {
                event.platform.context.waitUntil(kv.put(cacheKey, body, { expirationTtl: 604800 }));
            }
            return finalResponse;
        }

        return new Response(originResponse.body, { status: originResponse.status, headers: originResponse.headers });
    } catch (err: any) {
        return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
    }
};
