<?php
/**
 * Plugin Name: A Plus Cloudflare Cache Purge
 * Description: Automatically purge Cloudflare KV cache when WordPress content is updated.
 */

if (!defined('ABSPATH'))
    exit;

class APlus_CF_Purge
{
    // 配置資訊 (建議之後移至 WP Options 頁面)
    private $purge_url = 'https://your-sveltekit-app.pages.dev/api/purge';
    private $secret_key = 'YOUR_PURGE_SECRET';

    public function __construct()
    {
        // 當文章、頁面、產品更新時觸發
        add_action('save_post', array($this, 'trigger_purge'), 10, 3);
        // 當 WooCommerce 產品更新時 (額外保險)
        add_action('woocommerce_update_product', array($this, 'trigger_purge_wc'), 10, 1);
    }

    public function trigger_purge($post_id, $post, $update)
    {
        // 排除草稿、自動儲存或修訂版本
        if (!$update || wp_is_post_revision($post_id) || $post->post_status !== 'publish') {
            return;
        }

        $url = get_permalink($post_id);
        $this->send_purge_request($url);
    }

    public function trigger_purge_wc($product_id)
    {
        $url = get_permalink($product_id);
        $this->send_purge_request($url);
    }

    private function send_purge_request($url)
    {
        $body = array(
            'url' => $url,
            'secret' => $this->secret_key
        );

        wp_remote_post($this->purge_url, array(
            'method' => 'POST',
            'timeout' => 15,
            'redirection' => 5,
            'httpversion' => '1.0',
            'blocking' => false, // 非阻塞式，不影響後台儲存速度
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode($body),
            'cookies' => array()
        ));
    }
}

new APlus_CF_Purge();
