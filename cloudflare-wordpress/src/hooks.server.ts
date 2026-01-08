import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';

    // 【雙重保險】優先使用 IP，如果報錯就用 origin 域名
    const ORIGIN_IP = 'http://74.117.152.12';
    const ORIGIN_DOMAIN = 'http://origin.aplus-tech.com.hk';

    // 1. 強制跳轉返正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

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

    // 5. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        const proxyHeaders = new Headers();
        ['accept', 'accept-language', 'cookie', 'user-agent'].forEach(h => {
            const val = event.request.headers.get(h);
            if (val) proxyHeaders.set(h, val);
        });

        proxyHeaders.set('Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Proto', 'https');

        try {
            // 嘗試連線
            let originResponse = await fetch(`${ORIGIN_IP}${url.pathname}${url.search}`, {
                headers: proxyHeaders,
                redirect: 'manual'
            });

            // 如果 IP 連線報 1003 或其他錯誤，轉用域名連線
            if (originResponse.status === 1003 || originResponse.status === 403) {
                originResponse = await fetch(`${ORIGIN_DOMAIN}${url.pathname}${url.search}`, {
                    headers: proxyHeaders,
                    redirect: 'manual'
                });
            }

            if (originResponse.status === 301 || originResponse.status === 302) {
                const location = originResponse.headers.get('location');
                if (location) {
                    const newLocation = location
                        .replace(ORIGIN_IP, `https://${CUSTOM_DOMAIN}`)
                        .replace(ORIGIN_DOMAIN, `https://${CUSTOM_DOMAIN}`)
                        .replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN)
                        .replace(PAGES_DEV, CUSTOM_DOMAIN);
                    return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
                }
            }

            const contentType = originResponse.headers.get('content-type') || '';
            if (contentType.includes('text/html') && originResponse.status === 200) {
                let body = await originResponse.text();
                body = body.split(ORIGIN_IP).join(`https://${CUSTOM_DOMAIN}`);
                body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);
                body = body.split(PAGES_DEV).join(CUSTOM_DOMAIN);

                const newHeaders = new Headers(originResponse.headers);
                newHeaders.delete('content-encoding');
                newHeaders.delete('content-length');
                newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
                newHeaders.set('X-Edge-Cache', 'Miss');
                response = new Response(body, { status: 200, headers: newHeaders });
            } else {
                response = new Response(originResponse.body, { status: originResponse.status, headers: originResponse.headers });
            }
        } catch (err: any) {
            return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
        }
    }

    return response;
};
