import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 輔助函數：將圖片同步到 R2 並記錄到 D1
async function syncImageToR2(url: string, type: string, brand: string, slug: string, platform: any, object_id?: number, alt_text?: string) {
    if (!url || !url.startsWith('http')) return url;

    const db = platform.env.DB;
    const r2 = platform.env.MEDIA_BUCKET;
    if (!db || !r2) return url;

    try {
        // 1. 檢查是否已經同步過
        try {
            const existing = await db.prepare('SELECT r2_path FROM media_mapping WHERE original_url = ?').bind(url).first();
            if (existing) return existing.r2_path;
        } catch (e) { }

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
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const blob = await response.blob();

        // 5. 上傳到 R2
        await r2.put(r2Path, blob, {
            httpMetadata: { contentType: response.headers.get('content-type') || 'image/jpeg' }
        });

        // 6. 記錄到 D1 (使用你指定的結構)
        try {
            await db.prepare(`
                INSERT OR IGNORE INTO media_mapping (original_url, r2_path, media_type, brand, object_id, alt_text)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(url, r2Path, type, brand || null, object_id || null, alt_text || null).run();
        } catch (e) {
            console.error('D1 Record Error:', e);
        }

        return r2Path;
    } catch (e) {
        console.error(`Image Sync Error (${url}):`, e);
        return url;
    }
}

async function performSync(data: any, platform: any) {
    const { type, payload } = data;
    const db = platform.env.DB;

    if (type === 'product') {
        let { id, sku, title, content, price, stock_status, categories, tags, brand, attributes, term_ids, image_url, gallery_images, seo_title, seo_description, seo_keywords } = payload;

        const imageTasks = [];
        if (image_url) {
            imageTasks.push((async () => {
                image_url = await syncImageToR2(image_url, 'product', brand, title, platform);
            })());
        }

        if (Array.isArray(gallery_images)) {
            imageTasks.push((async () => {
                const syncedGallery = await Promise.all(
                    gallery_images.map(img => syncImageToR2(img, 'product', brand, title, platform))
                );
                gallery_images = syncedGallery;
            })());
        }

        await Promise.all(imageTasks);

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
    else if (type === 'post') {
        let { id, title, content, excerpt, slug, status, categories, tags, term_ids, image_url, seo_title, seo_description, seo_keywords, created_at, updated_at } = payload;
        if (image_url) image_url = await syncImageToR2(image_url, 'post', '', slug, platform);
        await db.prepare(`
            INSERT OR REPLACE INTO sync_posts (id, title, content, excerpt, slug, status, categories, tags, term_ids, image_url, seo_title, seo_description, seo_keywords, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, title, content, excerpt, slug, status, Array.isArray(categories) ? categories.join(', ') : categories, Array.isArray(tags) ? tags.join(', ') : tags, JSON.stringify(term_ids), image_url, seo_title, seo_description, seo_keywords, created_at, updated_at).run();
    }
    else if (type === 'page') {
        let { id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at } = payload;
        if (image_url) image_url = await syncImageToR2(image_url, 'page', '', slug, platform);
        await db.prepare(`
            INSERT OR REPLACE INTO sync_pages (id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, title, content, slug, status, image_url, seo_title, seo_description, seo_keywords, updated_at).run();
    }
    else if (type === 'term') {
        const { term_id, name, slug, taxonomy, parent, count } = payload;
        await db.prepare(`INSERT OR REPLACE INTO sync_terms (term_id, name, slug, taxonomy, parent, count) VALUES (?, ?, ?, ?, ?, ?)`).bind(term_id, name, slug, taxonomy, parent, count).run();
    }
}

export const POST: RequestHandler = async ({ request, platform }) => {
    try {
        const data = await request.json();
        const { secret } = data;

        if (!platform?.env.SYNC_SECRET_KEY || secret !== platform.env.SYNC_SECRET_KEY) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!platform?.env.DB) {
            return json({ error: 'Database binding missing' }, { status: 500 });
        }

        if (platform.context?.waitUntil) {
            platform.context.waitUntil(performSync(data, platform));
            return json({ success: true, message: 'Sync started in background' });
        } else {
            await performSync(data, platform);
            return json({ success: true });
        }
    } catch (e) {
        console.error('Sync Error:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
