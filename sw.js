const CACHE_NAME = 'ludo-dice-v2';
const DICE_URLS = [
    './ludo/assets/dice/1.png',
    './ludo/assets/dice/2.png',
    './ludo/assets/dice/3.png',
    './ludo/assets/dice/4.png',
    './ludo/assets/dice/5.png',
    './ludo/assets/dice/6.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(DICE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isDiceAsset = url.pathname.includes('/ludo/assets/dice/') && /\/(?:[1-6])\.png$/.test(url.pathname);

    if (!isDiceAsset) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            });
        })
    );
});