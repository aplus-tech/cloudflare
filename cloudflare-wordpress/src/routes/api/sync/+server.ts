import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
    try {
        const data = await request.json();
        const { type, action, payload, secret } = data;

        // 1. 驗證 Secret Key
        const expectedSecret = platform?.env.SYNC_SECRET_KEY;
        if (!expectedSecret || secret !== expectedSecret) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = platform?.env.DB;
        if (!db) {
            return json({ error: 'Database binding missing' }, { status: 500 });
        }

        // 2. 根據類型處理同步
        if (type === 'product') {
            const { id, sku, title, content, price, stock_status, categories, tags, brand, attributes, term_ids, image_url, gallery_images, seo_title, seo_description, seo_keywords } = payload;

            await db.prepare(`
				INSERT OR REPLACE INTO sync_products (
					id, sku, title, content, price, stock_status, categories, tags, brand, attributes, term_ids, image_url, gallery_images, seo_title, seo_description, seo_keywords, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
                id, sku, title, content, price, stock_status,
                Array.isArray(categories) ? categories.join(', ') : categories,
                Array.isArray(tags) ? tags.join(', ') : tags,
                brand,
                JSON.stringify(attributes),
                JSON.stringify(term_ids),
                image_url,
                JSON.stringify(gallery_images),
                seo_title, seo_description, seo_keywords,
                Math.floor(Date.now() / 1000)
            ).run();
        }
        else if (type === 'term') {
            const { term_id, name, slug, taxonomy, parent, count } = payload;
            await db.prepare(`
				INSERT OR REPLACE INTO sync_terms (term_id, name, slug, taxonomy, parent, count)
				VALUES (?, ?, ?, ?, ?, ?)
			`).bind(term_id, name, slug, taxonomy, parent, count).run();
        }
        else if (type === 'post') {
            const { id, title, content, excerpt, slug, status, categories, tags, term_ids, image_url, seo_title, seo_description, seo_keywords, created_at, updated_at } = payload;
            await db.prepare(`
				INSERT OR REPLACE INTO sync_posts (
					id, title, content, excerpt, slug, status, categories, tags, term_ids, image_url, seo_title, seo_description, seo_keywords, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
                id, title, content, excerpt, slug, status,
                Array.isArray(categories) ? categories.join(', ') : categories,
                Array.isArray(tags) ? tags.join(', ') : tags,
                JSON.stringify(term_ids),
                image_url, seo_title, seo_description, seo_keywords, created_at, updated_at
            ).run();
        }
        else if (type === 'page') {
            const { id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at } = payload;
            await db.prepare(`
				INSERT OR REPLACE INTO sync_pages (
					id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
                id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at
            ).run();
        }

        return json({ success: true });
    } catch (e) {
        console.error('Sync Error:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
