import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const ORIGIN_URL = 'https://origin.aplus-tech.com.hk';

    // 1. API 唔好郁佢
    if (url.pathname.startsWith('/api')) return resolve(event);

    // 2. 準備 Headers (最基本轉發)
    const proxyHeaders = new Headers();
    ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
        const val = event.request.headers.get(h);
        if (val) proxyHeaders.set(h, val);
    });

    // 話俾 WordPress 聽我哋係 HTTPS
    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    try {
        // 3. 直接 Fetch (redirect: manual，唔好自己跳)
        const response = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual'
        });

        // 4. 處理跳轉 (淨係換個網址)
        if (response.status >= 300 && response.status < 400) {
            let location = response.headers.get('location') || '';
            location = location.replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`).replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN);
            return new Response(null, {
                status: response.status,
                headers: { 'Location': location }
            });
        }

        // 5. 處理內容替換 (HTML/CSS/JS)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript')) {
            let body = await response.text();
            body = body.split(ORIGIN_URL).join(`https://${CUSTOM_DOMAIN}`);
            body = body.split('origin.aplus-tech.com.hk').join(CUSTOM_DOMAIN);

            const newHeaders = new Headers(response.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            return new Response(body, { status: response.status, headers: newHeaders });
        }

        return response;
    } catch (err: any) {
        return new Response(`Proxy Error: ${err.message}`, { status: 502 });
    }
};
