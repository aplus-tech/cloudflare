import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = url.hostname; // 動態獲取域名，防止 www 衝突
    const ORIGIN_URL = 'https://origin.aplus-tech.com.hk';

    if (url.pathname.startsWith('/api')) return resolve(event);

    // 1. 準備最基本的 Headers
    const proxyHeaders = new Headers(event.request.headers);
    proxyHeaders.set('Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
    proxyHeaders.set('X-Forwarded-Proto', 'https');
    proxyHeaders.set('HTTPS', 'on');

    // 2. 內部跳轉跟隨邏輯 (斷路器)
    async function fetchFromOrigin(targetPath: string, targetSearch: string, depth = 0): Promise<Response> {
        // 如果內部跳轉超過 5 次，代表 Origin 真係有問題
        if (depth > 5) return new Response(`Too many internal redirects at path: ${targetPath}`, { status: 500 });

        const response = await fetch(`${ORIGIN_URL}${targetPath}${targetSearch}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual' // 手動處理跳轉，防止 Worker 呼叫自己
        });

        // 如果 Origin 叫我哋跳轉，我哋喺 Worker 內部「自己跳」，唔好話俾瀏覽器聽
        if (response.status === 301 || response.status === 302) {
            const location = response.headers.get('location');
            if (location) {
                const locUrl = new URL(location, `https://${CUSTOM_DOMAIN}`);
                // 只要係跳去同一個站，就內部跟隨
                if (locUrl.hostname === CUSTOM_DOMAIN || locUrl.hostname === 'origin.aplus-tech.com.hk') {
                    return fetchFromOrigin(locUrl.pathname, locUrl.search, depth + 1);
                }
            }
        }
        return response;
    }

    try {
        const response = await fetchFromOrigin(url.pathname, url.search);
        const contentType = response.headers.get('content-type') || '';

        // 3. 內容替換 (HTML/CSS/JS)
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
