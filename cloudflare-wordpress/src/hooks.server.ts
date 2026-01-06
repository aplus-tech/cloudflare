import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const cacheKey = `html:${url.pathname}${url.search}`;

    // 1. 排除非 GET 請求或特定路徑 (如 API, Admin)
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
        // @ts-ignore - DB and HTML_CACHE are injected by Cloudflare
        const cachedHTML = await event.platform?.env.HTML_CACHE.get(cacheKey);
        if (cachedHTML) {
            console.log(`[Cache Hit] ${url.pathname}`);
            return new Response(cachedHTML, {
                headers: {
                    'Content-Type': 'text/html',
                    'X-Edge-Cache': 'Hit'
                }
            });
        }
    } catch (e) {
        console.error('KV Cache Read Error:', e);
    }

    // 4. Cache Miss: 執行正常請求
    const response = await resolve(event);

    // 5. 如果是成功的 HTML 回應，存入 KV
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();

        try {
            // 存入 KV，設定 TTL 為 7 天 (604800 秒)
            // @ts-ignore
            await event.platform?.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 604800 });
            console.log(`[Cache Miss -> Saved] ${url.pathname}`);
        } catch (e) {
            console.error('KV Cache Write Error:', e);
        }
    }

    return response;
};
