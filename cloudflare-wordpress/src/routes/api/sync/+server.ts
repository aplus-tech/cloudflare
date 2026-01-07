import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 輔助函數：將圖片同步到 R2 並記錄到 D1
async function syncImageToR2(url: string, type: string, brand: string, slug: string, platform: any, object_id?: number, alt_text?: string) {
    if (!url || !url.startsWith('http')) return url;

    const db = platform.env.DB;
    const r2 = platform.env.MEDIA_BUCKET;

    if (!db) throw new Error('D1 Database (DB) binding is missing');
    if (!r2) throw new Error('R2 Bucket (MEDIA_BUCKET) binding is missing');

    try {
        const encodedUrl = new URL(url).href;

        // 【Debug 模式】暫時註解掉 D1 檢查，強制重新上傳 R2
        /*
        const existing = await db.prepare('SELECT r2_path FROM media_mapping WHERE original_url = ?').bind(url).first();
        if (existing) return existing.r2_path;
        */

        const rawFilename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
        const filename = decodeURIComponent(rawFilename);

        let r2Path = '';
        const cleanBrand = brand ? brand.toLowerCase().replace(/\s+/g, '-') : 'unknown';
        const cleanSlug = slug ? slug.toLowerCase().replace(/\s+/g, '-') : 'unknown';

        if (type === 'product') {
            r2Path = `products/${cleanBrand}/${filename}`;
        } else if (type === 'post') {
            r2Path = `posts/${cleanSlug}/${filename}`;
        } else if (type === 'page') {
            r2Path = `pages/${cleanSlug}/${filename}`;
        } else {
            r2Path = `assets/common/${filename}`;
        }

        const response = await fetch(encodedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        if (!response.ok) {
            throw new Error(`Fetch from WP failed: ${response.status} for ${encodedUrl}`);
        }

        const blob = await response.blob();

        // 執行 R2 上傳
        await r2.put(r2Path, blob, {
            httpMetadata: { contentType: response.headers.get('content-type') || 'image/jpeg' }
        });

        // 記錄到 D1
        await db.prepare(`
            INSERT OR REPLACE INTO media_mapping (original_url, r2_path, media_type, brand, object_id, alt_text)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(url, r2Path, type, brand || null, object_id || null, alt_text || null).run();

        return r2Path;
    } catch (e: any) {
        // 【關鍵】唔好 catch 佢，等錯誤拋返出去俾 WordPress 睇
        throw new Error(`R2 Sync Failed: ${e.message}`);
    }
}

async function performSync(data: any, platform: any) {
    const { type, payload } = data;
    const db = platform.env.DB;

    if (type === 'product') {
        const id = payload.id;
        const sku = payload.sku ?? null;
        const title = payload.title ?? null;
        const content = payload.content ?? null;
        const price = payload.price ?? 0;
        const stock_status = payload.stock_status ?? null;
        const categories = Array.isArray(payload.categories) ? payload.categories.join(', ') : null;
        const tags = Array.isArray(payload.tags) ? payload.tags.join(', ') : null;
        const brand = payload.brand ?? null;
        const seo_title = payload.seo_title ?? null;
        const seo_description = payload.seo_description ?? null;
        const seo_keywords = payload.seo_keywords ?? null;

        const attributes = JSON.stringify(payload.attributes || {});
        const term_ids = JSON.stringify(payload.term_ids || []);
        const gallery_images_raw = payload.gallery_images || [];

        let image_url = payload.image_url ?? null;
        if (image_url) {
            image_url = await syncImageToR2(image_url, 'product', brand || 'unknown', title || 'unknown', platform);
        }

        let gallery_images = [];
        if (Array.isArray(gallery_images_raw)) {
            for (const img of gallery_images_raw) {
                gallery_images.push(await syncImageToR2(img, 'product', brand || 'unknown', title || 'unknown', platform));
            }
        }
        const gallery_json = JSON.stringify(gallery_images);

        await db.prepare(`
            INSERT OR REPLACE INTO sync_products (
                id, sku, title, content, price, stock_status, categories, tags, brand, attributes, term_ids, image_url, gallery_images, seo_title, seo_description, seo_keywords, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            id, sku, title, content, price, stock_status, categories, tags, brand,
            attributes, term_ids, image_url, gallery_json,
            seo_title, seo_description, seo_keywords,
            Math.floor(Date.now() / 1000)
        ).run();
    }
}

export const POST: RequestHandler = async ({ request, platform }) => {
    try {
        const data = await request.json();
        const { secret } = data;

        if (!platform?.env.SYNC_SECRET_KEY || secret !== platform.env.SYNC_SECRET_KEY) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!platform?.env.DB) return json({ error: 'DB binding missing' }, { status: 500 });

        await performSync(data, platform);
        return json({ success: true, message: 'Sync completed successfully' });
    } catch (e: any) {
        console.error('Sync Error:', e.message);
        return json({ error: e.message }, { status: 500 });
    }
};
