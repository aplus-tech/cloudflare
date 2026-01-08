import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const url = new URL(event.url);
    const CUSTOM_DOMAIN = 'aplus-tech.com.hk';
    const PAGES_DEV = 'cloudflare-9qe.pages.dev';

    // 【終極穩定版】直接使用 IP 連線，避開所有 DNS 同 SSL 526 問題
    const ORIGIN_IP = 'http://74.117.152.12';

    if (url.pathname.startsWith('/api')) return resolve(event);

    if (url.hostname.includes(PAGES_DEV)) {
        return new Response(null, {
            status: 301,
            headers: { 'Location': `https://${CUSTOM_DOMAIN}${url.pathname}${url.search}` }
        });
    }

    const cookies = event.request.headers.get('cookie') || '';
    const isBypass = cookies.includes('wordpress_logged_in_') || cookies.includes('woocommerce_items_in_cart') || url.pathname.startsWith('/wp-admin') || url.pathname.startsWith('/wp-login.php');

    // @ts-ignore
    const kv = event.platform?.env?.HTML_CACHE;
    const cacheKey = `html:${url.pathname}${url.search}`;

    if (kv && event.request.method === 'GET' && !isBypass && !url.searchParams.has('purge')) {
        try {
            const cachedHTML = await kv.get(cacheKey);
            if (cachedHTML) return new Response(cachedHTML, { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'X-Edge-Cache': 'Hit' } });
        } catch (e) { }
    }

    async function fetchFromOrigin(targetPath: string, targetSearch: string, depth = 0): Promise<Response> {
        if (depth > 5) return new Response('Too many internal redirects. Please ensure "Force HTTPS Redirect" is OFF in cPanel.', { status: 500 });

        const proxyHeaders = new Headers();
        ['accept', 'accept-language', 'cookie', 'user-agent', 'content-type', 'referer'].forEach(h => {
            const val = event.request.headers.get(h);
            if (val) proxyHeaders.set(h, val);
        });

        // 必須傳送主域名作為 Host，cPanel 先至認得
        proxyHeaders.set('Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Host', CUSTOM_DOMAIN);
        proxyHeaders.set('X-Forwarded-Proto', 'https');
        proxyHeaders.set('HTTPS', 'on');

        const originResponse = await fetch(`${ORIGIN_IP}${targetPath}${targetSearch}`, {
            method: event.request.method,
            headers: proxyHeaders,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.arrayBuffer() : null,
            redirect: 'manual'
        });

        if (originResponse.status === 301 || originResponse.status === 302) {
            const location = originResponse.headers.get('location');
            if (location) {
                // 如果 Origin 仲係想跳去 defaultwebpage，代表 Host Header 仲係有問題或者 Server 仲係想強制 HTTPS
                if (location.includes('defaultwebpage.cgi')) {
                    return new Response('Origin redirected to default page. Please ensure cPanel Alias and Force HTTPS settings are correct.', { status: 500 });
                }

                const locUrl = new URL(location);
                if (locUrl.hostname === CUSTOM_DOMAIN || locUrl.hostname === 'origin.aplus-tech.com.hk' || locUrl.hostname === '74.117.152.12') {
                    return fetchFromOrigin(locUrl.pathname, locUrl.search, depth + 1);
                }

                const newLocation = location.replace(ORIGIN_IP, `https://${CUSTOM_DOMAIN}`).replace('origin.aplus-tech.com.hk', CUSTOM_DOMAIN);
                return new Response(null, { status: originResponse.status, headers: { 'Location': newLocation } });
            }
        }

        return originResponse;
    }

    try {
        const originResponse = await fetchFromOrigin(url.pathname, url.search);
        const contentType = originResponse.headers.get('content-type') || '';

        if (contentType.includes('text/html') || contentType.includes('css') || contentType.includes('javascript') || contentType.includes('json')) {
            let body = await originResponse.text();

            // 替換所有可能的 Origin 網址
            const replacements = [
                [ORIGIN_IP, `https://${CUSTOM_DOMAIN}`],
                ['http://origin.aplus-tech.com.hk', `https://${CUSTOM_DOMAIN}`],
                ['https://origin.aplus-tech.com.hk', `https://${CUSTOM_DOMAIN}`],
                [`http://${CUSTOM_DOMAIN}`, `https://${CUSTOM_DOMAIN}`],
                ['origin.aplus-tech.com.hk', CUSTOM_DOMAIN],
                [PAGES_DEV, CUSTOM_DOMAIN]
            ];
            for (const [from, to] of replacements) {
                body = body.split(from).join(to);
            }

            const newHeaders = new Headers(originResponse.headers);
            newHeaders.delete('content-encoding');
            newHeaders.delete('content-length');
            newHeaders.set('X-Edge-Cache', 'Miss');

            const finalResponse = new Response(body, { status: originResponse.status, headers: newHeaders });

            if (kv && contentType.includes('text/html') && originResponse.status === 200 && !isBypass && body.length > 2000) {
                event.platform.context.waitUntil(kv.put(cacheKey, body, { expirationTtl: 604800 }));
            }
            return finalResponse;
        }

        return new Response(originResponse.body, { status: originResponse.status, headers: originResponse.headers });
    } catch (err: any) {
        return new Response(`Origin Connection Error: ${err.message}`, { status: 502 });
    }
};
