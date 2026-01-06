import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
    const secret = url.searchParams.get('secret');
    const SYNC_SECRET = 'Lui@63006021';

    if (secret !== SYNC_SECRET) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-ignore
    const kv = platform?.env.HTML_CACHE;
    if (!kv) {
        return json({ error: 'KV Namespace not found' }, { status: 500 });
    }

    try {
        // 列出所有 Key
        const list = await kv.list();
        const keys = list.keys.map((k: { name: string }) => k.name);

        // 批量刪除
        const deletePromises = keys.map((key: string) => kv.delete(key));
        await Promise.all(deletePromises);

        return json({
            success: true,
            message: `Successfully deleted ${keys.length} items.`,
            deleted_keys: keys
        });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};
