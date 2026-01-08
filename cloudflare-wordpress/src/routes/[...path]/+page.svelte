<script lang="ts">
    export let data;
    const { post } = data;
</script>

<svelte:head>
    <title>{post.title} - A Plus Tech</title>
    <meta name="description" content={post.excerpt || post.title}>
</svelte:head>

<main class="container">
    <article class="prose">
        <h1>{post.title}</h1>
        
        {#if post.featured_image}
            <img src={post.featured_image} alt={post.title} class="featured-image" />
        {/if}

        <div class="content">
            {@html post.content}
        </div>
    </article>
</main>

<style>
    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        font-family: 'Inter', sans-serif;
    }
    h1 {
        font-size: 2.5rem;
        color: #1a1a1a;
        margin-bottom: 1.5rem;
    }
    .featured-image {
        width: 100%;
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    .content {
        line-height: 1.8;
        color: #333;
    }
    /* 這裡可以加入更多現代化的 CSS */
</style>
