import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
    const db = platform?.env.DB;
    if (!db) {
        return { products: [] };
    }

    try {
        const { results } = await db.prepare('SELECT * FROM sync_products ORDER BY updated_at DESC LIMIT 50').all();
        return { products: results };
    } catch (e) {
        console.error('Error fetching products:', e);
        return { products: [] };
    }
};
