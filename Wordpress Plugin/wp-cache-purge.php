<?php
/**
 * Plugin Name: A Plus Cloudflare Cache Purge
 * Description: Automatically purge Cloudflare KV cache when WordPress content is updated.
 * Version: 2.0
 * Author: Antigravity
 */

if (!defined('ABSPATH'))
    exit;

class APlus_CF_Purge
{
    // [Verified: Phase 4.6: 邊緣驗證與正式切換]
    private $purge_url = 'https://cloudflare-9qe.pages.dev/api/purge';
    private $secret_key = 'REPLACE_WITH_A_SECURE_KEY'; // 請確保與 wrangler.toml 的 PURGE_SECRET 一致

    public function __construct()
    {
        add_action('save_post', array($this, 'trigger_purge'), 10, 3);
        add_action('woocommerce_update_product', array($this, 'trigger_purge_wc'), 10, 1);
        add_action('woocommerce_new_product', array($this, 'trigger_purge_wc'), 10, 1);
    }

    public function trigger_purge($post_id, $post, $update)
    {
        if (!$update || wp_is_post_revision($post_id) || $post->post_status !== 'publish')
            return;

        // 跳過產品類型（由 WooCommerce Hook 處理）
        if ($post->post_type === 'product')
            return;

        $this->send_purge_request(get_permalink($post_id));
    }

    public function trigger_purge_wc($product_id)
    {
        $this->send_purge_request(get_permalink($product_id));
    }

    private function send_purge_request($url)
    {
        wp_remote_post($this->purge_url, array(
            'method' => 'POST',
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode(array(
                'url' => $url,
                'secret' => $this->secret_key
            )),
            'blocking' => false,
            'timeout' => 5,
            'sslverify' => false
        ));
    }
}

new APlus_CF_Purge();
