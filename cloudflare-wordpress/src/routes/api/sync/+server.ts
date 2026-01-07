import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 輔助函數：將圖片同步到 R2 並記錄到 D1
async function syncImageToR2(url: string, type: string, brand: string, slug: string, platform: any) {
    if (!url || !url.startsWith('http')) return url;

    const db = platform.env.DB;
    const r2 = platform.env.MEDIA_BUCKET;
    if (!db || !r2) return url;

    try {
        // 1. 檢查是否已經同步過
        const existing = await db.prepare('SELECT r2_path FROM media_mapping WHERE original_url = ?').bind(url).first();
        if (existing) return existing.r2_path;

        // 2. 解析檔名
        const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg';

        // 3. 決定 R2 路徑
        let r2Path = '';
        const cleanBrand = brand ? brand.toLowerCase().replace(/\s+/g, '-') : 'unknown';
        const cleanSlug = slug ? slug.toLowerCase().replace(/\s+/g, '-') : 'unknown';

        if (type === 'product') {
            r2Path = `products/${cleanBrand}/${filename}`;
        } else if (type === 'post') {
            r2Path = `posts/${cleanSlug}/${filename}`;
        } else if (type === 'page') {
            r2Path = `pages/${cleanSlug}/${filename}`;
        } else if (type === 'brand') {
            r2Path = `brands/${cleanBrand}/${filename}`;
        } else if (type === 'category') {
            r2Path = `categories/${cleanSlug}/${filename}`;
        } else {
            r2Path = `assets/common/${filename}`;
        }

        // 4. 從 WordPress 下載圖片
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const blob = await response.blob();

        // 5. 上傳到 R2
        await r2.put(r2Path, blob, {
            httpMetadata: { contentType: response.headers.get('content-type') || 'image/jpeg' }
        });

        // 6. 記錄到 D1
        await db.prepare(`
            INSERT INTO media_mapping (original_url, r2_path, media_type, brand)
            VALUES (?, ?, ?, ?)
        `).bind(url, r2Path, type, brand || null).run();

        return r2Path;
    } catch (e) {
        console.error(`Image Sync Error (${url}):`, e);
        return url; // 失敗則回傳原網址
    }
}

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
            let { id, sku, title, content, price, stock_status, categories, tags, brand, attributes, term_ids, image_url, gallery_images, seo_title, seo_description, seo_keywords } = payload;

            // 【R2 同步】處理主圖
            if (image_url) {
                image_url = await syncImageToR2(image_url, 'product', brand, title, platform);
            }

            // 【R2 同步】處理相簿
            if (Array.isArray(gallery_images)) {
                const syncedGallery = [];
                for (const img of gallery_images) {
                    syncedGallery.push(await syncImageToR2(img, 'product', brand, title, platform));
                }
                gallery_images = syncedGallery;
            }

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
            let { id, title, content, excerpt, slug, status, categories, tags, term_ids, image_url, seo_title, seo_description, seo_keywords, created_at, updated_at } = payload;

            // 【R2 同步】處理文章特色圖
            if (image_url) {
                image_url = await syncImageToR2(image_url, 'post', '', slug, platform);
            }

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
            let { id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at } = payload;

            // 【R2 同步】處理頁面特色圖
            if (image_url) {
                image_url = await syncImageToR2(image_url, 'page', '', slug, platform);
            }

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
