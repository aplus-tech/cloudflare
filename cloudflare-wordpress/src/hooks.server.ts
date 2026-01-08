import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // 徹底停用 Proxy，只處理本地 API 或頁面
    return resolve(event);
};
