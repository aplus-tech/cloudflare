import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const cacheKey = `html:${url.pathname}${url.search}`;
    const ORIGIN = 'https://aplus-tech.com.hk'; // 你的 WordPress 原站

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
        // @ts-ignore
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

    // 4. Cache Miss: 如果 SvelteKit 沒有定義這個路由，就去 WordPress 抓
    let response = await resolve(event);

    // 如果 SvelteKit 回傳 404，表示這是一個 WordPress 頁面，我們去 Proxy 它
    if (response.status === 404) {
        console.log(`[Proxying to WordPress] ${url.pathname}`);
        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: event.request.headers
        });

        // 複製回應，準備存入 KV
        response = new Response(originResponse.body, originResponse);
    }

    // 5. 如果是成功的 HTML 回應，存入 KV
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
        const responseClone = response.clone();
        const html = await responseClone.text();

        try {
            // 存入 KV，設定 TTL 為 7 天
            // @ts-ignore
            await event.platform?.env.HTML_CACHE.put(cacheKey, html, { expirationTtl: 604800 });
            console.log(`[Cache Saved] ${url.pathname}`);
        } catch (e) {
            console.error('KV Cache Write Error:', e);
        }
    }

    return response;
};
