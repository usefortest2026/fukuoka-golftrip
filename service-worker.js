const APP_VERSION = '20260929-47';
const APP_CACHE_PREFIX = 'fukuoka-trip-';
const CORE_CACHE = `${APP_CACHE_PREFIX}core-${APP_VERSION}`;
const CORE_ASSETS = [
  './fukuoka-golf.html',
  './fukuoka-golf-v2.html',
  './fukuoka-golf-en.html',
  './fukuoka-golf-v2.css',
  './fukuoka-golf-v2.js',
  './fukuoka-golf-en-v2.js',
  './trip-day-router.js',
  './golf-draw.js',
  './pwa.js',
  './private-trip-info.js',
  './private-trip-info.enc.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.png',
  './cover.jpg',
  './version.txt',
];
const CORE_PATHS = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    try {
      await cache.addAll(CORE_ASSETS);
    } catch (error) {
      await caches.delete(CORE_CACHE);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(APP_CACHE_PREFIX) && name !== CORE_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CORE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const cleanUrl = new URL(request.url);
      cleanUrl.search = '';
      await cache.put(cleanUrl.href, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./fukuoka-golf.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cachedCore(request, event) {
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      const cleanUrl = new URL(request.url);
      cleanUrl.search = '';
      await cache.put(cleanUrl.href, response.clone());
    }
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/version.txt')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (CORE_PATHS.has(url.pathname)) {
    event.respondWith(cachedCore(request, event));
  }
});
