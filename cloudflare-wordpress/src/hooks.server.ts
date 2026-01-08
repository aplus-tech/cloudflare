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

    // 2. 排除特定路徑
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 3. 檢查登入
    const cookies = event.request.headers.get('cookie') || '';
    const isLoggedIn = cookies.includes('wordpress_logged_in_');

    // 4. KV Cache 邏輯
    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    const isNoCache = event.request.headers.get('cache-control')?.includes('no-cache') || url.searchParams.has('purge');

    // 【修正】Cache Key 唔好再 Normalize 斜槓，WordPress 對呢個好敏感
    const cacheKey = `html:${url.pathname}${url.search}`;

    if (kv && event.request.method === 'GET' && !isLoggedIn && !isNoCache) {
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

    // 5. Proxy 邏輯
    let response = await resolve(event);

    if (response.status === 404) {
        const proxyHeaders = new Headers();
        ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type'].forEach(h => {
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
                        .replace(`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`)
                        .replace(`http://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`)
                        .replace(`https://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`)
                        .replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN)
                        .replace(PAGES_DEV, CUSTOM_DOMAIN);
                    return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
                }
            }

            const contentType = originResponse.headers.get('content-type') || '';

            if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript') || contentType.includes('json')) {
                let body = await originResponse.text();

                const replacements = [
                    [ORIGIN_URL, `https://${CUSTOM_DOMAIN}`],
                    [`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                    [`http://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                    [`https://www.${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                    ['origin.aplus-tech.com.hk', CUSTOM_DOMAIN],
                    [PAGES_DEV, CUSTOM_DOMAIN],
                    ['http:\\/\\/origin.aplus-tech.com.hk', `https:\\/\\/${CUSTOM_DOMAIN}`],
                    [`http:\\/\\/${CUSTOM_DOMAIN}`, `https:\\/\\/${CUSTOM_DOMAIN}`],
                    [`http:\\/\\/www.${CUSTOM_DOMAIN}`, `https:\\/\\/${CUSTOM_DOMAIN}`]
                ];

                for (const [from, to] of replacements) {
                    body = body.split(from).join(to);
                }

                const newHeaders = new Headers(originResponse.headers);
                newHeaders.delete('content-encoding');
                newHeaders.delete('content-length');
                newHeaders.set('X-Edge-Cache', 'Miss');

                const finalResponse = new Response(body, { status: 200, headers: newHeaders });

                // 存入 KV (只限 HTML 且長度足夠，避免 Cache 錯誤頁面)
                if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isLoggedIn && body.length > 5000) {
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
    }

    return response;
};
