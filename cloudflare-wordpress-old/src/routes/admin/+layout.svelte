<script>
	import '../admin.css';
</script>

<div class="admin-container">
	<!-- Sidebar -->
	<nav class="sidebar">
		<div class="logo">
			<span class="logo-text">A PLUS</span>
			<span class="logo-sub">Cloudflare</span>
		</div>
		
		<div class="nav-links">
			<a href="/admin" class="nav-item active">
				<span class="icon">📊</span> Dashboard
			</a>
			<a href="/admin/products" class="nav-item">
				<span class="icon">📦</span> Products
			</a>
			<a href="/admin/quotes" class="nav-item">
				<span class="icon">📄</span> Quotes
			</a>
			<a href="/admin/sync" class="nav-item">
				<span class="icon">🔄</span> Sync Status
			</a>
		</div>

		<div class="nav-footer">
			<div class="user-info">
				<div class="avatar">L</div>
				<div class="details">
					<p class="name">Luiting</p>
					<p class="role">Administrator</p>
				</div>
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="content">
		<header class="top-bar">
			<div class="search-box">
				<input type="text" placeholder="Search products or quotes..." />
			</div>
			<div class="actions">
				<button class="btn-primary">+ New Quote</button>
			</div>
		</header>

		<div class="page-content">
			<slot />
		</div>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0f172a;
		color: #f8fafc;
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
