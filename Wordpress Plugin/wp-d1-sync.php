<?php
/**
 * Plugin Name: A Plus D1 Data Sync
 * Description: Sync WordPress products to Cloudflare D1 with HTTPS Fix.
 */

if (!defined('ABSPATH'))
    exit;

// 【關鍵修復】解決 Cloudflare Flexible/Proxy 模式下的無限跳轉問題
// 當 WordPress 位於 Cloudflare Worker Proxy 後面時，確保它知道請求是 HTTPS
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}

class APlus_D1_Sync
{
    // 指向 Cloudflare Pages 的 Sync API
    private $sync_url = 'https://cloudflare-9qe.pages.dev/api/sync';
    private $secret_key = 'Lui@63006021';

    public function __construct()
    {
        add_action('save_post_product', array($this, 'sync_product'), 10, 3);
        add_action('save_post', array($this, 'sync_post_or_page'), 10, 3);
    }

    private function get_safe_term_names($post_id, $taxonomy)
    {
        $terms = wp_get_post_terms($post_id, $taxonomy, array('fields' => 'names'));
        return (is_wp_error($terms) || empty($terms)) ? array() : $terms;
    }

    public function sync_product($post_id, $post, $update)
    {
        if ($post->post_status !== 'publish' || !function_exists('wc_get_product'))
            return;

        $product = wc_get_product($post_id);
        if (!$product)
            return;

        $brand_name = '';
        $possible_taxonomies = array('product_brand', 'pa_brand', 'pwb-brand', 'brand');
        foreach ($possible_taxonomies as $tax) {
            $brands = $this->get_safe_term_names($post_id, $tax);
            if (!empty($brands)) {
                $brand_name = $brands[0];
                break;
            }
        }

        $payload = array(
            'id' => $post_id,
            'sku' => $product->get_sku(),
            'title' => $product->get_name(),
            'content' => wp_strip_all_tags($post->post_content),
            'price' => $product->get_price(),
            'stock_status' => $product->get_stock_status(),
            'categories' => $this->get_safe_term_names($post_id, 'product_cat'),
            'tags' => $this->get_safe_term_names($post_id, 'product_tag'),
            'brand' => $brand_name,
            'image_url' => wp_get_attachment_url($product->get_image_id()),
            'gallery_images' => array_map('wp_get_attachment_url', $product->get_gallery_image_ids()),
            'seo_title' => get_post_meta($post_id, 'rank_math_title', true),
            'seo_description' => get_post_meta($post_id, 'rank_math_description', true),
            'seo_keywords' => get_post_meta($post_id, 'rank_math_focus_keyword', true)
        );

        $this->send_request('product', 'update', $payload);
    }

    public function sync_post_or_page($post_id, $post, $update)
    {
        if (wp_is_post_revision($post_id) || $post->post_type === 'product' || $post->post_status !== 'publish')
            return;
        $this->send_request($post->post_type, 'update', array('id' => $post_id, 'title' => $post->post_title));
    }

    private function send_request($type, $action, $payload)
    {
        $body = array('type' => $type, 'action' => $action, 'payload' => $payload, 'secret' => $this->secret_key);
        wp_remote_post($this->sync_url, array(
            'method' => 'POST',
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($body),
            'blocking' => false,
            'timeout' => 5,
            'sslverify' => false
        ));
    }
}

new APlus_D1_Sync();
