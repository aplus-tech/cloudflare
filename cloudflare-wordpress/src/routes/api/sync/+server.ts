import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 輔助函數：將圖片同步到 R2 並記錄到 D1
// 輔助函數：將圖片同步到 R2 並記錄到 D1
async function syncImageToR2(url: string, type: string, brand: string, slug: string, platform: any, object_id?: number, alt_text?: string) {
    if (!url || !url.startsWith('http')) return null; // Return null on invalid URL

    const db = platform.env.DB;
    const r2 = platform.env.MEDIA_BUCKET;
    if (!db || !r2) return null;

    try {
        const encodedUrl = new URL(url).href;

        // 1. 檢查是否已經同步過
        const existing = await db.prepare('SELECT r2_path FROM media_mapping WHERE original_url = ?').bind(url).first();
        if (existing) {
            // [Fix] 回傳編碼後的路徑，確保中文檔名在 URL 中有效
            // @ts-ignore
            return existing.r2_path.split('/').map(encodeURIComponent).join('/');
        }

        const rawFilename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
        const filename = decodeURIComponent(rawFilename); // Decode first to get clean characters

        let r2Key = '';
        const cleanBrand = brand ? brand.toLowerCase().replace(/\s+/g, '-') : 'unknown';
        const cleanSlug = slug ? slug.toLowerCase().replace(/\s+/g, '-') : 'unknown';

        if (type === 'product') {
            r2Key = `products/${cleanBrand}/${filename}`;
        } else if (type === 'post') {
            r2Key = `posts/${cleanSlug}/${filename}`;
        } else if (type === 'page') {
            r2Key = `pages/${cleanSlug}/${filename}`;
        } else {
            r2Key = `assets/common/${filename}`;
        }

        const response = await fetch(encodedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        if (!response.ok) {
            console.error(`Failed to fetch original image: ${encodedUrl} (${response.status})`);
            return null; // Return null on fetch failure
        }

        const imageBuffer = await response.arrayBuffer();

        await r2.put(r2Key, imageBuffer, {
            httpMetadata: { contentType: response.headers.get('content-type') || 'image/jpeg' }
        });

        await db.prepare(`
            INSERT OR IGNORE INTO media_mapping (original_url, r2_path, media_type, brand, object_id, alt_text)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(url, r2Key, type, brand || null, object_id || null, alt_text || null).run();

        // [Fix] 回傳編碼後的路徑
        return r2Key.split('/').map(encodeURIComponent).join('/');

    } catch (e) {
        console.error(`Image Sync Error:`, e);
        return null; // Return null on error
    }
}

async function performSync(data: any, platform: any) {
    const { type, payload } = data;
    const db = platform.env.DB;
    let result = { image_r2_path: null, gallery_r2_paths: [] };

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
            // @ts-ignore
            result.image_r2_path = image_url; // syncImageToR2 returns the path
        }

        let gallery_images = [];
        if (Array.isArray(gallery_images_raw)) {
            for (const img of gallery_images_raw) {
                const r2Path = await syncImageToR2(img, 'product', brand || 'unknown', title || 'unknown', platform);
                gallery_images.push(r2Path);
                // @ts-ignore
                result.gallery_r2_paths.push(r2Path);
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
    return result;
}

export const POST: RequestHandler = async ({ request, platform }) => {
    try {
        const data = await request.json();
        const { secret } = data;

        if (!platform?.env.SYNC_SECRET_KEY || secret !== platform.env.SYNC_SECRET_KEY) {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }

        // [Verified: Phase 4.6: R2 圖片加速整合]
        // 同步執行並獲取 R2 路徑回傳給 WordPress
        const syncResult = await performSync(data, platform);
        return json({ success: true, message: 'Sync completed', r2_data: syncResult });
    } catch (e: any) {
        console.error('Sync Error:', e.message);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
