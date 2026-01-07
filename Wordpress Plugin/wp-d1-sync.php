<?php
/**
 * Plugin Name: A Plus D1 Data Sync
 * Description: Sync WordPress products, posts, pages, and terms to Cloudflare D1 with Logging.
 */

if (!defined('ABSPATH'))
    exit;

class APlus_D1_Sync
{
    private $sync_url = 'https://cloudflare-9qe.pages.dev/api/sync';
    private $secret_key = 'Lui@63006021';
    private $log_file;

    public function __construct()
    {
        $this->log_file = WP_CONTENT_DIR . '/debug-sync.log';
        add_action('save_post_product', array($this, 'sync_product'), 10, 3);
        add_action('save_post', array($this, 'sync_post_or_page'), 10, 3);
        add_action('created_term', array($this, 'sync_term'), 10, 3);
        add_action('edited_term', array($this, 'sync_term'), 10, 3);
    }

    private function log($message)
    {
        $time = date('Y-m-d H:i:s');
        file_put_contents($this->log_file, "[$time] $message\n", FILE_APPEND);
    }

    private function get_safe_term_names($post_id, $taxonomy)
    {
        $terms = wp_get_post_terms($post_id, $taxonomy, array('fields' => 'names'));
        return (is_wp_error($terms) || empty($terms)) ? array() : $terms;
    }

    public function sync_product($post_id, $post, $update)
    {
        if ($post->post_status !== 'publish')
            return;
        if (!function_exists('wc_get_product'))
            return;

        $product = wc_get_product($post_id);
        if (!$product)
            return;

        $this->log("--- Syncing Product ID: $post_id ---");

        $brands = $this->get_safe_term_names($post_id, 'pa_brand');
        $payload = array(
            'id' => $post_id,
            'sku' => $product->get_sku(),
            'title' => $product->get_name(),
            'content' => wp_strip_all_tags($post->post_content),
            'price' => $product->get_price(),
            'stock_status' => $product->get_stock_status(),
            'categories' => $this->get_safe_term_names($post_id, 'product_cat'),
            'tags' => $this->get_safe_term_names($post_id, 'product_tag'),
            'brand' => !empty($brands) ? $brands[0] : '',
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

        $this->log("--- Syncing {$post->post_type} ID: $post_id ---");

        $payload = array(
            'id' => $post_id,
            'title' => $post->post_title,
            'content' => wp_strip_all_tags($post->post_content),
            'slug' => $post->post_name,
            'status' => $post->post_status,
            'image_url' => get_the_post_thumbnail_url($post_id, 'full'),
            'seo_title' => get_post_meta($post_id, 'rank_math_title', true),
            'seo_description' => get_post_meta($post_id, 'rank_math_description', true),
            'seo_keywords' => get_post_meta($post_id, 'rank_math_focus_keyword', true),
            'updated_at' => strtotime($post->post_modified)
        );

        $this->send_request($post->post_type, 'update', $payload);
    }

    public function sync_term($term_id, $tt_id, $taxonomy)
    {
        $term = get_term($term_id, $taxonomy);
        if (!$term || is_wp_error($term))
            return;

        $this->log("--- Syncing Term ID: $term_id ($taxonomy) ---");

        $payload = array(
            'term_id' => $term_id,
            'name' => $term->name,
            'slug' => $term->slug,
            'taxonomy' => $taxonomy,
            'parent' => $term->parent,
            'count' => $term->count
        );
        $this->send_request('term', 'update', $payload);
    }

    private function send_request($type, $action, $payload)
    {
        $body = array(
            'type' => $type,
            'action' => $action,
            'payload' => $payload,
            'secret' => $this->secret_key
        );

        $this->log("Request URL: " . $this->sync_url);

        // 暫時將 blocking 改為 true，等佢攞到 Response 先至行落去，方便 Debug
        $response = wp_remote_post($this->sync_url, array(
            'method' => 'POST',
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($body),
            'blocking' => true,
            'timeout' => 10,
            'sslverify' => false
        ));

        if (is_wp_error($response)) {
            $this->log("Error: " . $response->get_error_message());
        } else {
            $code = wp_remote_retrieve_response_code($response);
            $res_body = wp_remote_retrieve_body($response);
            $this->log("Response Code: $code");
            $this->log("Response Body: $res_body");
        }
    }
}

new APlus_D1_Sync();
