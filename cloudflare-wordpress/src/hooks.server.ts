import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const cacheKey = `html:${url.pathname}${url.search}`;
    const ORIGIN = 'https://aplus-tech.com.hk';
    const ORIGIN_HOST = new URL(ORIGIN).host;
    const currentHost = url.host;

    // 1. 排除非 GET 請求或特定路徑
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) {
        return resolve(event);
    }

    // 2. 檢查是否有登入 Cookie (繞過緩存)
    const cookies = event.request.headers.get('cookie') || '';
    if (cookies.includes('wordpress_logged_in_') || cookies.includes('wp-settings-')) {
        return resolve(event);
    }

    // 3. 嘗試從 KV 讀取緩存
    try {
        // @ts-ignore
        const cachedHTML = await event.platform?.env.HTML_CACHE.get(cacheKey);
        if (cachedHTML) {
            console.log(`[Cache Hit] ${url.pathname}`);
            return new Response(cachedHTML, {
                headers: {
                    'Content-Type': 'text/html; charset=UTF-8',
                    'X-Edge-Cache': 'Hit',
                    ...(currentHost.includes('pages.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
                }
            });
        }
    } catch (e) {
        console.error('KV Cache Read Error:', e);
    }

    // 4. Cache Miss: 執行 SvelteKit 路由
    let response = await resolve(event);

    // 如果 SvelteKit 404，執行 Proxy
    if (response.status === 404) {
        console.log(`[Proxying to WordPress] ${url.pathname}`);

        // 抓取原站內容
        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: event.request.headers
        });

        // 處理 HTML 內容替換
        if (originResponse.headers.get('content-type')?.includes('text/html')) {
            let body = await originResponse.text();

            // 激進替換：處理有 www 同冇 www 嘅情況
            const hostsToReplace = [ORIGIN_HOST, `www.${ORIGIN_HOST}`];
            hostsToReplace.forEach(h => {
                body = body.split(h).join(currentHost);
            });

            // 修正 Canonical
            if (currentHost.includes('pages.dev')) {
                const canonicalPattern = new RegExp(`<link rel=["']canonical["'] href=["']https://${currentHost}(.*?)["']`, 'g');
                body = body.replace(canonicalPattern, `<link rel="canonical" href="${ORIGIN}$1"`);
            }

            // 建立新 Response，刪除可能導致衝突的 Header (如 Content-Encoding)
            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('Content-Type', 'text/html; charset=UTF-8');
            if (currentHost.includes('pages.dev')) {
                newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
            }

            response = new Response(body, {
                status: originResponse.status,
                headers: newHeaders
            });
        } else {
            // 非 HTML 內容 (如圖片、JS) 直接回傳
            response = originResponse;
        }
    }

    // 5. 存入 KV
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();
        try {
            // @ts-ignore
            await event.platform?.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 604800 });
            console.log(`[Cache Saved] ${url.pathname}`);
        } catch (e) {
            console.error('KV Cache Write Error:', e);
        }
    }

    return response;
};
