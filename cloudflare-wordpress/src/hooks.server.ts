import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);

    // 1. 過濾追蹤參數
    const searchParams = new URLSearchParams(url.search);
    const trackingParams = ['fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    trackingParams.forEach(param => searchParams.delete(param));
    const cleanSearch = searchParams.toString();
    const cacheKey = `html:${url.pathname}${cleanSearch ? '?' + cleanSearch : ''}`;

    const ORIGIN = 'https://aplus-tech.com.hk';
    const ORIGIN_HOST = new URL(ORIGIN).host;
    const currentHost = url.host;

    // 2. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 3. 檢查登入狀態
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_') || cookies.includes('wp-settings-')) {
        return resolve(event);
    }

    // 4. 嘗試從 KV 讀取 HTML 緩存
    try {
        // @ts-ignore
        const cachedHTML = await event.platform?.env.HTML_CACHE.get(cacheKey);
        if (cachedHTML) {
            return new Response(cachedHTML, {
                headers: {
                    'Content-Type': 'text/html; charset=UTF-8',
                    'X-Edge-Cache': 'Hit',
                    'Cache-Control': 'public, max-age=3600',
                    ...(currentHost.includes('pages.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
                }
            });
        }
    } catch (e) { }

    // 5. Cache Miss: 執行 Proxy
    let response = await resolve(event);

    if (response.status === 404) {
        // 【重要修正】建立新的 Headers，移除 Host 避免原站拒絕請求
        const proxyHeaders = new Headers(event.request.headers);
        proxyHeaders.set('Host', ORIGIN_HOST);
        proxyHeaders.set('Referer', ORIGIN);

        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: proxyHeaders
        });

        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') && originResponse.status === 200) {
            let body = await originResponse.text();

            // 替換域名
            body = body.split(ORIGIN_HOST).join(currentHost);

            // 修正 Canonical
            if (currentHost.includes('pages.dev')) {
                const canonicalPattern = new RegExp(`<link rel=["']canonical["'] href=["']https://${currentHost}(.*?)["']`, 'g');
                body = body.replace(canonicalPattern, `<link rel="canonical" href="${ORIGIN}$1"`);
            }

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            newHeaders.set('X-Edge-Cache', 'Miss');
            if (currentHost.includes('pages.dev')) {
                newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
            }

            response = new Response(body, {
                status: 200,
                headers: newHeaders
            });
        } else {
            // 對於圖片、JS、CSS，直接轉發並設定長效快取
            const assetHeaders = new Headers(originResponse.headers);
            assetHeaders.set('Cache-Control', 'public, max-age=2592000, immutable');
            assetHeaders.set('X-Proxy-Asset', 'True');

            response = new Response(originResponse.body, {
                status: originResponse.status,
                headers: assetHeaders
            });
        }
    }

    // 6. 存入 KV (僅限成功的 HTML)
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();
        // 確保不是存入錯誤頁面
        if (html.length > 1000) {
            try {
                // @ts-ignore
                await event.platform?.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 604800 });
            } catch (e) { }
        }
    }

    return response;
};
