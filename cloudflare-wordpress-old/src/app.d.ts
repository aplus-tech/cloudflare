// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface PageState {}
        interface Platform {
            env: {
                DB: D1Database;
                HTML_CACHE: KVNamespace;
                MEDIA_BUCKET: R2Bucket;
            };
            context: ExecutionContext;
            caches: CacheStorage & { default: Cache };
        }
    }
}

export { };
