import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // 還原為最基本的 SvelteKit 處理邏輯，不進行任何 Proxy 或網址替換
    return resolve(event);
};
