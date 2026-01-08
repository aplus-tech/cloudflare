import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const ORIGIN_URL = 'https://origin.aplus-tech.com.hk';

    if (url.pathname.startsWith('/api')) return resolve(event);

    // 準備最基本的 Headers
    const proxyHeaders = new Headers(event.request.headers);
    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    try {
        // 直接 Fetch，唔好做內部跳轉跟隨，交返俾瀏覽器
        const response = await fetch(`${ORIGIN_URL}${url.pathname}${url.search}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual'
        });

        // 如果 Origin 叫我哋跳轉，我哋只係改個網址名
        if (response.status >= 300 && response.status < 400) {
            let location = response.headers.get('location') || '';
            location = location.replace(ORIGIN_URL, `https://${CUSTOM_DOMAIN}`).replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN);
            const newHeaders = new Headers(response.headers);
            newHeaders.set('Location', location);
            return new Response(null, { status: response.status, headers: newHeaders });
        }

        // 內容替換 (HTML/CSS/JS)
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
