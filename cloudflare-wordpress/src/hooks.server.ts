import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);

    // 【優化】過濾掉常見的追蹤參數，確保 Cache Key 唯一性
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

    // 2. 檢查是否有登入 Cookie
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_') || cookies.includes('wp-settings-')) {
        return resolve(event);
    }

    // 3. 嘗試從 KV 讀取 HTML 緩存
    try {
        // @ts-ignore
        const cachedHTML = await event.platform?.env.HTML_CACHE.get(cacheKey);
        if (cachedHTML) {
            console.log(`[Cache Hit] ${url.pathname}`);
            return new Response(cachedHTML, {
                headers: {
                    'Content-Type': 'text/html; charset=UTF-8',
                    'X-Edge-Cache': 'Hit',
                    'Cache-Control': 'public, max-age=3600',
                    ...(currentHost.includes('pages.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
                }
            });
        }
    } catch (e) {
        console.error('KV Cache Read Error:', e);
    }

    // 4. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: event.request.headers
        });

        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html')) {
            let body = await originResponse.text();

            const hostsToReplace = [ORIGIN_HOST, `www.${ORIGIN_HOST}`];
            hostsToReplace.forEach(h => {
                body = body.split(h).join(currentHost);
            });

            if (currentHost.includes('pages.dev')) {
                const canonicalPattern = new RegExp(`<link rel=["']canonical["'] href=["']https://${currentHost}(.*?)["']`, 'g');
                body = body.replace(canonicalPattern, `<link rel="canonical" href="${ORIGIN}$1"`);
            }

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            newHeaders.set('Cache-Control', 'public, max-age=3600');
            if (currentHost.includes('pages.dev')) {
                newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
            }

            response = new Response(body, {
                status: originResponse.status,
                headers: newHeaders
            });
        } else {
            const assetHeaders = new Headers(originResponse.headers);
            assetHeaders.set('Cache-Control', 'public, max-age=2592000, immutable');
            response = new Response(originResponse.body, {
                status: originResponse.status,
                headers: assetHeaders
            });
        }
    }

    // 5. 存入 KV (僅限 HTML)
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();
        try {
            // @ts-ignore
            await event.platform?.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 604800 });
        } catch (e) {
            console.error('KV Cache Write Error:', e);
        }
    }

    return response;
};
