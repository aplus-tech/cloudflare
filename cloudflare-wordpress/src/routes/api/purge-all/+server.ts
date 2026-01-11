import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
    const secret = url.searchParams.get('secret');
    const expectedSecret = platform?.env.SYNC_SECRET_KEY || 'Lui@63006021';

    if (secret !== expectedSecret) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-ignore
    const kv = platform?.env.HTML_CACHE;
    if (!kv) {
        return json({ error: 'KV Namespace not found' }, { status: 500 });
    }

    try {
        let deletedCount = 0;
        let list = await kv.list();

        while (list.keys.length > 0) {
            const keys = list.keys.map((k: { name: string }) => k.name);
            const deletePromises = keys.map((key: string) => kv.delete(key));
            await Promise.all(deletePromises);
            deletedCount += keys.length;

            if (list.list_complete) break;
            list = await kv.list({ cursor: list.cursor });
        }

        return json({
            success: true,
            message: `Successfully deleted ${deletedCount} items from cache.`,
            status: 'Cache Cleared'
        });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
