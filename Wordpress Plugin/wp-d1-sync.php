<?php
/*
Plugin Name: A Plus D1 Data Sync
Description: Syncs WordPress data to Cloudflare D1 and images to R2.
Version: 2.0
Author: Antigravity
*/

if (!defined('ABSPATH'))
    exit;

// [Verified: Phase 4: 數據同步管道]
define('D1_API_URL', 'https://cloudflare-9qe.pages.dev/api/sync');
define('SYNC_SECRET_KEY', 'Lui@63006021');

// [Verified: Phase 4.5: R2 語義化媒體遷移]
// 當產品儲存時觸發同步
add_action('woocommerce_update_product', 'aplus_sync_product', 10, 1);
add_action('woocommerce_new_product', 'aplus_sync_product', 10, 1);

function aplus_sync_product($product_id)
{
    $product = wc_get_product($product_id);
    if (!$product || $product->get_status() !== 'publish')
        return;

    // 提取品牌 (支援多種品牌分類法)
    $brand = '';
    $brand_taxonomies = ['product_brand', 'pa_brand', 'brand'];
    foreach ($brand_taxonomies as $taxonomy) {
        if (!taxonomy_exists($taxonomy))
            continue;
        $terms = wp_get_object_terms($product_id, $taxonomy);
        if ($terms && !is_wp_error($terms) && !empty($terms)) {
            $brand = $terms[0]->name;
            break;
        }
    }

    // 提取分類和標籤
    $category_terms = get_the_terms($product_id, 'product_cat');
    $categories = [];
    if ($category_terms && !is_wp_error($category_terms)) {
        $categories = array_map(function ($term) {
            return $term->name;
        }, $category_terms);
    }

    $tag_terms = get_the_terms($product_id, 'product_tag');
    $tags = [];
    if ($tag_terms && !is_wp_error($tag_terms)) {
        $tags = array_map(function ($term) {
            return $term->name;
        }, $tag_terms);
    }

    // 提取圖片
    $image_url = wp_get_attachment_url($product->get_image_id());
    $gallery_ids = $product->get_gallery_image_ids();
    $gallery_images = array_map('wp_get_attachment_url', $gallery_ids);

    // [Guess: 除錯日誌 - 追蹤圖片 URL]
    error_log('=== D1 Sync Debug ===');
    error_log('Product ID: ' . $product_id);
    error_log('Product Title: ' . $product->get_name());
    error_log('Brand: ' . ($brand ?: 'EMPTY'));
    error_log('Image URL: ' . ($image_url ?: 'EMPTY'));
    error_log('Gallery Count: ' . count($gallery_images));

    // 提取 SEO 資料 (Yoast/RankMath)
    $seo_title = get_post_meta($product_id, '_yoast_wpseo_title', true) ?: get_post_meta($product_id, 'rank_math_title', true);
    $seo_description = get_post_meta($product_id, '_yoast_wpseo_metadesc', true) ?: get_post_meta($product_id, 'rank_math_description', true);
    $seo_keywords = get_post_meta($product_id, '_yoast_wpseo_focuskw', true) ?: get_post_meta($product_id, 'rank_math_focus_keyword', true);

    // 組裝資料
    $data = [
        'type' => 'product',
        'secret' => SYNC_SECRET_KEY,
        'payload' => [
            'id' => $product_id,
            'sku' => $product->get_sku(),
            'title' => $product->get_name(),
            'content' => $product->get_description(),
            'price' => $product->get_price(),
            'stock_status' => $product->get_stock_status(),
            'categories' => $categories,
            'tags' => $tags,
            'brand' => $brand,
            'image_url' => $image_url,
            'gallery_images' => $gallery_images,
            'seo_title' => $seo_title,
            'seo_description' => $seo_description,
            'seo_keywords' => $seo_keywords,
            'attributes' => $product->get_attributes(),
            'term_ids' => []
        ]
    ];

    // 發送到 Worker
    $response = wp_remote_post(D1_API_URL, [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode($data),
        'blocking' => true,
        'timeout' => 15,
        'sslverify' => false
    ]);

    // [Guess: 除錯日誌]
    if (is_wp_error($response)) {
        error_log('D1 Sync Error: ' . $response->get_error_message());
    } else {
        $body = wp_remote_retrieve_body($response);
        error_log('D1 Sync Response: ' . $body);
        error_log('Image URL sent: ' . ($image_url ?: 'EMPTY'));
        error_log('Gallery Images sent: ' . json_encode($gallery_images));
    }
}

// [Verified: Phase 4: 數據同步管道]
// 當文章或頁面儲存時觸發同步
add_action('save_post', 'aplus_sync_post', 10, 3);
function aplus_sync_post($post_id, $post, $update)
{
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)
        return;
    if ($post->post_status !== 'publish')
        return;
    if ($post->post_type === 'product')
        return; // 產品由上面的 Hook 處理

    $image_url = get_the_post_thumbnail_url($post_id, 'full');

    $data = [
        'type' => $post->post_type,
        'secret' => SYNC_SECRET_KEY,
        'payload' => [
            'id' => $post_id,
            'title' => $post->post_title,
            'content' => $post->post_content,
            'slug' => $post->post_name,
            'image_url' => $image_url
        ]
    ];

    wp_remote_post(D1_API_URL, [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode($data),
        'blocking' => false,
        'timeout' => 5,
        'sslverify' => false
    ]);
}
