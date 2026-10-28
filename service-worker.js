const APP_VERSION = '20261028-71';
const APP_CACHE_PREFIX = 'fukuoka-trip-';
const CORE_CACHE = `${APP_CACHE_PREFIX}core-${APP_VERSION}`;
const COUPON_CACHE = `${APP_CACHE_PREFIX}coupons-${APP_VERSION}`;
const CORE_ASSETS = [
  './fukuoka-golf.html',
  './fukuoka-golf-v2.html',
  './fukuoka-golf-en.html',
  './fukuoka-golf-v2.css',
  './fukuoka-golf-v2.js',
  './fukuoka-golf-en-v2.js',
  './trip-day-router.js',
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
const COUPON_ASSETS = [
  './coupon-airport-dutyfree-zh.jpg',
  './coupon-alpen-zh.jpg',
  './coupon-biccamera-zh.jpg',
  './coupon-cocokara-en.jpg',
  './coupon-cocokara-zh.jpg',
  './coupon-cosmos-zh.jpg',
  './coupon-drug11-zh.jpg',
  './coupon-kokumin-zh.jpg',
  './coupon-matsukiyo-en.jpg',
  './coupon-matsukiyo-zh.jpg',
  './coupon-ohga-zh.jpg',
  './coupon-snowpeak-zh.jpg',
  './coupon-sugi-zh.jpg',
  './coupon-sundrug-zh.jpg',
  './coupon-tsuruha-zh.jpg',
  './coupon-yamada-zh.jpg',
];
const COUPON_PATHS = new Set(COUPON_ASSETS.map((asset) => new URL(asset, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    try {
      const requests = CORE_ASSETS.map((asset) => new Request(
        new URL(asset, self.location.href).href,
        { cache: 'reload' }
      ));
      await cache.addAll(requests);
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
      .filter((name) => name.startsWith(APP_CACHE_PREFIX) && name !== CORE_CACHE && name !== COUPON_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CORE_CACHE);
  try {
    return await fetch(request);
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

function releaseParts(version) {
  const match = /^(\d{8})-(\d+)$/.exec(version || '');
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function isOlderRelease(candidate, current) {
  const next = releaseParts(candidate);
  const active = releaseParts(current);
  if (!next || !active) return false;
  return next[0] < active[0] || (next[0] === active[0] && next[1] < active[1]);
}

async function versionNetworkFirst(request) {
  const cache = await caches.open(CORE_CACHE);
  try {
    const response = await fetch(request);
    const version = response.ok ? (await response.clone().text()).trim() : null;
    return { response, version };
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return { response: cached, version: null };
    throw error;
  }
}

async function retireAfterRollback(serverVersion) {
  if (!isOlderRelease(serverVersion, APP_VERSION)) return;
  await self.registration.unregister();
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(APP_CACHE_PREFIX))
    .map((name) => caches.delete(name)));
}

async function cachedCore(request) {
  const url = new URL(request.url);
  const requestedVersion = url.searchParams.get('v');
  if (requestedVersion && requestedVersion !== APP_VERSION) return fetch(request);
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || fetch(request);
}

async function cachedCoupon(request) {
  const names = await caches.keys();
  if (names.includes(COUPON_CACHE)) {
    const cache = await caches.open(COUPON_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
  }
  return fetch(request);
}

async function couponStatus(failed = 0) {
  const names = await caches.keys();
  if (!names.includes(COUPON_CACHE)) {
    return { completed: 0, total: COUPON_ASSETS.length, failed };
  }
  const cache = await caches.open(COUPON_CACHE);
  const matches = await Promise.all(COUPON_ASSETS.map((asset) => cache.match(asset)));
  return {
    completed: matches.filter(Boolean).length,
    total: COUPON_ASSETS.length,
    failed,
  };
}

function postCouponMessage(source, type, status) {
  if (source && source.postMessage) source.postMessage({ type, ...status });
}

async function cacheCoupons(source) {
  const cache = await caches.open(COUPON_CACHE);
  let failed = 0;
  for (const asset of COUPON_ASSETS) {
    if (!await cache.match(asset)) {
      try {
        const response = await fetch(asset, { cache: 'reload' });
        if (!response.ok) throw new Error(`Coupon request failed: ${response.status}`);
        await cache.put(asset, response);
      } catch (error) {
        failed += 1;
      }
    }
    postCouponMessage(source, 'COUPON_CACHE_PROGRESS', await couponStatus(failed));
  }
  postCouponMessage(source, 'COUPON_CACHE_STATUS', await couponStatus(failed));
}

self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;
  if (event.data.type === 'CACHE_COUPONS') {
    event.waitUntil(cacheCoupons(event.source));
  }
  if (event.data.type === 'GET_COUPON_CACHE_STATUS') {
    event.waitUntil(couponStatus().then((status) => {
      postCouponMessage(event.source, 'COUPON_CACHE_STATUS', status);
    }));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.endsWith('/version.txt')) {
    const operation = versionNetworkFirst(request);
    event.respondWith(operation.then((result) => result.response));
    event.waitUntil(operation
      .then((result) => retireAfterRollback(result.version))
      .catch(() => undefined));
    return;
  }

  if (COUPON_PATHS.has(url.pathname)) {
    event.respondWith(cachedCoupon(request));
    return;
  }

  if (CORE_PATHS.has(url.pathname)) {
    event.respondWith(cachedCore(request));
  }
});
