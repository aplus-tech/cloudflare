import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const cacheKey = `html:${url.pathname}${url.search}`;
    const ORIGIN = 'https://aplus-tech.com.hk'; // 你的 WordPress 原站
    const ORIGIN_HOST = new URL(ORIGIN).host;

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
                    // 如果是測試域名，加入 noindex 保護 SEO
                    ...(url.host.includes('pages.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
                }
            });
        }
    } catch (e) {
        console.error('KV Cache Read Error:', e);
    }

    // 4. Cache Miss: 如果 SvelteKit 沒有定義這個路由，就去 WordPress 抓
    let response = await resolve(event);

    if (response.status === 404) {
        console.log(`[Proxying to WordPress] ${url.pathname}`);
        const originResponse = await fetch(`${ORIGIN}${url.pathname}${url.search}`, {
            headers: event.request.headers
        });

        let body = await originResponse.text();
        const currentHost = url.host;

        // 替換所有連結，讓用戶留在 Cloudflare 網域
        body = body.split(ORIGIN_HOST).join(currentHost);
        body = body.split('https://' + ORIGIN_HOST).join('https://' + currentHost);

        // 【SEO 保護】如果是在測試網域，確保 Canonical Tag 依然指向原站
        if (currentHost.includes('pages.dev')) {
            const canonicalPattern = new RegExp(`<link rel=["']canonical["'] href=["']https://${currentHost}(.*?)["']`, 'g');
            body = body.replace(canonicalPattern, `<link rel="canonical" href="${ORIGIN}$1"`);
        }

        response = new Response(body, {
            status: originResponse.status,
            headers: {
                ...Object.fromEntries(originResponse.headers.entries()),
                'Content-Type': 'text/html; charset=UTF-8',
                // 如果是測試域名，加入 noindex
                ...(currentHost.includes('pages.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
            }
        });
    }

    // 5. 如果是成功的 HTML 回應，存入 KV
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
