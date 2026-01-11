import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    try {
        const { url, secret } = await request.json();

        // 1. 驗證 Secret Key (防止惡意清除)
        const expectedSecret = platform?.env.PURGE_SECRET;
        if (!expectedSecret || secret !== expectedSecret) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!url) {
            return json({ error: 'URL is required' }, { status: 400 });
        }

        // 2. 構造 KV Key (需與 hooks.server.ts 中的格式一致)
        const targetUrl = new URL(url);
        const cacheKey = `html:${targetUrl.pathname}${targetUrl.search}`;

        // 3. 從 KV 中刪除
        await platform?.env.HTML_CACHE.delete(cacheKey);

        console.log(`[Cache Purged] ${cacheKey}`);
        return json({ success: true, purged: cacheKey });
    } catch (e) {
        console.error('Purge Error:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
