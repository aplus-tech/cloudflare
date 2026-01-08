<script lang="ts">
    export let data;
    const R2_DOMAIN = 'https://media.aplus-tech.com.hk';
</script>

<div class="container">
    <header>
        <h1>A Plus Tech - Cloudflare D1 Store</h1>
        <p>Powered by Cloudflare Pages, D1, and R2</p>
    </header>

    {#if data.products.length === 0}
        <div class="empty-state">
            <p>No products found in D1 database.</p>
            <p>Please save a product in WordPress to trigger the sync.</p>
        </div>
    {:else}
        <div class="grid">
            {#each data.products as product}
                <div class="card">
                    <div class="image-container">
                        {#if product.image_url}
                            <img 
                                src="{product.image_url.startsWith('http') ? product.image_url : `${R2_DOMAIN}/${product.image_url}`}" 
                                alt={product.title} 
                                loading="lazy"
                            />
                        {:else}
                            <div class="placeholder">No Image</div>
                        {/if}
                    </div>
                    <div class="content">
                        <h2>{product.title}</h2>
                        <div class="meta">
                            <span class="price">{product.price ? `$${product.price}` : 'Call for Price'}</span>
                            <span class="brand">{product.brand || 'Generic'}</span>
                        </div>
                        <div class="tags">
                            {#if product.stock_status === 'instock'}
                                <span class="badge stock">In Stock</span>
                            {:else}
                                <span class="badge out">Out of Stock</span>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    :global(body) { margin: 0; font-family: 'Inter', sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 40px; }
    header h1 { color: #333; margin: 0 0 10px 0; }
    header p { color: #666; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; }
    
    .card { 
        background: white; 
        border-radius: 12px; 
        overflow: hidden; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-5px); }
    
    .image-container { height: 200px; background: #eee; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: cover; }
    .placeholder { color: #999; }
    
    .content { padding: 20px; }
    h2 { margin: 0 0 10px 0; font-size: 1.1rem; line-height: 1.4; color: #1a1a1a; height: 3em; overflow: hidden; }
    
    .meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .price { font-weight: bold; color: #e53935; font-size: 1.1rem; }
    .brand { color: #666; font-size: 0.9rem; }
    
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
    .badge.stock { background: #e8f5e9; color: #2e7d32; }
    .badge.out { background: #ffebee; color: #c62828; }

    .empty-state { text-align: center; padding: 50px; color: #666; }
</style>
