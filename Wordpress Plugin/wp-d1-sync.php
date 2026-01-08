<?php
/*
Plugin Name: WP D1 Sync
Description: Syncs WordPress data to Cloudflare D1 and images to R2.
Version: 1.0
Author: Antigravity
*/

if (!defined('ABSPATH'))
    exit;

// 基礎設定
define('D1_API_URL', 'https://aplus-tech.com.hk/api/sync');
define('SYNC_SECRET_KEY', 'Lui@63006021');

// 當文章或產品儲存時觸發 Sync
add_action('save_post', 'd1_sync_handle_post', 10, 3);
function d1_sync_handle_post($post_id, $post, $update)
{
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)
        return;
    if ($post->post_status !== 'publish')
        return;

    $data = [
        'id' => $post_id,
        'title' => $post->post_title,
        'content' => $post->post_content,
        'type' => $post->post_type,
        'slug' => $post->post_name,
        'timestamp' => time()
    ];

    wp_remote_post(D1_API_URL, [
        'headers' => [
            'Authorization' => 'Bearer ' . SYNC_SECRET_KEY,
            'Content-Type' => 'application/json'
        ],
        'body' => json_encode($data),
        'blocking' => false
    ]);
}

// 圖片上傳到 R2 的邏輯 (保持最簡化)
add_filter('wp_handle_upload', 'd1_sync_handle_upload');
function d1_sync_handle_upload($upload)
{
    // 這裡可以加入 R2 上傳邏輯
    return $upload;
}
