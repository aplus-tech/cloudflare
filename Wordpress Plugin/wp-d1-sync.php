<?php
/**
 * Plugin Name: A Plus D1 Data Sync
 * Description: Sync WordPress products, posts, pages, and terms to Cloudflare D1.
 */

if (!defined('ABSPATH'))
    exit;

class APlus_D1_Sync
{
    private $sync_url = 'https://cloudflare-9qe.pages.dev/api/sync';
    private $secret_key = 'Lui@63006021';

    public function __construct()
    {
        // 產品同步
        add_action('save_post_product', array($this, 'sync_product'), 10, 3);
        // 文章與頁面同步
        add_action('save_post', array($this, 'sync_post_or_page'), 10, 3);
        // 分類/標籤同步
        add_action('created_term', array($this, 'sync_term'), 10, 3);
        add_action('edited_term', array($this, 'sync_term'), 10, 3);
    }

    /**
     * 防死機保護：安全獲取 Term 名稱
     */
    private function get_safe_term_names($post_id, $taxonomy)
    {
        $terms = wp_get_post_terms($post_id, $taxonomy, array('fields' => 'names'));
        if (is_wp_error($terms) || empty($terms)) {
            return array();
        }
        return $terms;
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

        // 獲取 SEO 數據 (Rank Math 範例)
        $seo_title = get_post_meta($post_id, 'rank_math_title', true);
        $seo_desc = get_post_meta($post_id, 'rank_math_description', true);

        // 防死機保護：安全獲取品牌名稱
        $brands = $this->get_safe_term_names($post_id, 'pa_brand');
        $brand_name = !empty($brands) ? $brands[0] : '';

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
            'attributes' => $product->get_attributes(),
            'term_ids' => wp_get_post_terms($post_id, array('product_cat', 'product_tag', 'pa_brand'), array('fields' => 'ids')),
            'image_url' => wp_get_attachment_url($product->get_image_id()),
            'gallery_images' => array_map('wp_get_attachment_url', $product->get_gallery_image_ids()),
            'seo_title' => $seo_title,
            'seo_description' => $seo_desc,
            'seo_keywords' => get_post_meta($post_id, 'rank_math_focus_keyword', true)
        );

        $this->send_request('product', 'update', $payload);
    }

    public function sync_post_or_page($post_id, $post, $update)
    {
        // 排除自動儲存、修訂版本、以及產品 (產品有專屬 Hook)
        if (wp_is_post_revision($post_id) || $post->post_type === 'product' || $post->post_status !== 'publish') {
            return;
        }

        if ($post->post_type === 'post') {
            $payload = array(
                'id' => $post_id,
                'title' => $post->post_title,
                'content' => wp_strip_all_tags($post->post_content),
                'excerpt' => $post->post_excerpt,
                'slug' => $post->post_name,
                'status' => $post->post_status,
                'categories' => $this->get_safe_term_names($post_id, 'category'),
                'tags' => $this->get_safe_term_names($post_id, 'post_tag'),
                'term_ids' => wp_get_post_terms($post_id, array('category', 'post_tag'), array('fields' => 'ids')),
                'image_url' => get_the_post_thumbnail_url($post_id, 'full'),
                'seo_title' => get_post_meta($post_id, 'rank_math_title', true),
                'seo_description' => get_post_meta($post_id, 'rank_math_description', true),
                'seo_keywords' => get_post_meta($post_id, 'rank_math_focus_keyword', true),
                'created_at' => strtotime($post->post_date),
                'updated_at' => strtotime($post->post_modified)
            );
            $this->send_request('post', 'update', $payload);
        } elseif ($post->post_type === 'page') {
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
            $this->send_request('page', 'update', $payload);
        }
    }

    public function sync_term($term_id, $tt_id, $taxonomy)
    {
        $term = get_term($term_id, $taxonomy);
        if (!$term || is_wp_error($term))
            return;

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

        wp_remote_post($this->sync_url, array(
            'method' => 'POST',
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($body),
            'blocking' => false,
            'timeout' => 5,
            'sslverify' => false // 防連線失敗保護
        ));
    }
}

new APlus_D1_Sync();
