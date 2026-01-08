import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';
    const ORIGIN_URL = 'https://origin.aplus-tech.com.hk';

    // 1. 強制跳轉 pages.dev 到正式域名
    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    // 2. API 唔好郁佢
    if (url.pathname.startsWith('/api')) return resolve(event);

    // 3. 準備 Headers
    const proxyHeaders = new Headers();
    ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
        const val = event.request.headers.get(h);
        if (val) proxyHeaders.set(h, val);
    });

    // 話俾 WordPress 聽我哋係邊個，同埋係 HTTPS
    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    try {
        // 4. 使用 redirect: 'follow'，讓 Worker 自己處理跳轉，徹底斷開瀏覽器死循環
        const response = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'follow'
        });

        // 5. 處理內容替換 (HTML/CSS/JS)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript')) {
            let body = await response.text();

            // 替換所有 origin 網址
            body = body.split(ORIGIN_URL).join(`https://${CUSTOM_DOMAIN}`);
            body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);
            body = body.split(`http://${CUSTOM_DOMAIN}`).join(`https://${CUSTOM_DOMAIN}`);

            const newHeaders = new Headers(response.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');

            return new Response(body, { status: response.status, headers: newHeaders });
        }

        // 6. 其他資源直接回傳
        return response;

    } catch (err: any) {
        return new Response(`Proxy Error: ${err.message}`, { status: 502 });
    }
};
