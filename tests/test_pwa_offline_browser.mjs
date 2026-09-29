import assert from 'node:assert/strict';

const cdpPort = process.env.CDP_PORT || '9238';
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8765';
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No Chrome page target found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const waiters = new Map();
const pageErrors = [];
const couponRequests = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
  if (message.method === 'Network.requestWillBeSent' && /coupon-.*\.jpg/.test(message.params.request.url)) {
    couponRequests.push(message.params.request.url);
  }
  const listeners = waiters.get(message.method);
  if (listeners?.length) listeners.shift()(message.params);
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function waitFor(method) {
  return new Promise((resolve) => {
    const listeners = waiters.get(method) || [];
    listeners.push(resolve);
    waiters.set(method, listeners);
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(path) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${path}` });
  await loaded;
}

async function waitForValue(expression, description, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function setOffline(offline) {
  await send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
    connectionType: offline ? 'none' : 'wifi',
  });
}

async function connectToServiceWorker() {
  const currentTargets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
  const workerTarget = currentTargets.find((item) => item.type === 'service_worker' && item.url.endsWith('/service-worker.js'));
  if (!workerTarget) throw new Error('No service-worker CDP target found');
  const workerSocket = new WebSocket(workerTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    workerSocket.addEventListener('open', resolve, { once: true });
    workerSocket.addEventListener('error', reject, { once: true });
  });
  let workerId = 1;
  const workerPending = new Map();
  workerSocket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && workerPending.has(message.id)) {
      const handlers = workerPending.get(message.id);
      workerPending.delete(message.id);
      if (message.error) handlers.reject(new Error(message.error.message));
      else handlers.resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent' && /coupon-.*\.jpg/.test(message.params.request.url)) {
      couponRequests.push(message.params.request.url);
    }
  });
  function workerSend(method, params = {}) {
    const id = workerId++;
    workerSocket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => workerPending.set(id, { resolve, reject }));
  }
  await workerSend('Network.enable');
  return { send: workerSend, close: () => workerSocket.close() };
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await setOffline(false);
await navigate('fukuoka-golf.html');
await send('Storage.clearDataForOrigin', {
  origin: new URL(baseUrl).origin,
  storageTypes: 'service_workers,cache_storage',
});
await new Promise((resolve) => setTimeout(resolve, 200));
await navigate(`fukuoka-golf.html?fresh=${Date.now()}`);

await evaluate(`Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => setTimeout(() => reject(new Error('service worker not ready')), 5000))
])`);
if (!await evaluate(`Boolean(navigator.serviceWorker.controller)`)) {
  await navigate(`fukuoka-golf.html?controlled=${Date.now()}`);
}
await waitForValue(`Boolean(navigator.serviceWorker.controller)`, 'service-worker control');

const cacheSnapshot = await evaluate(`(async () => {
  const names = await caches.keys();
  const core = names.find((name) => name.startsWith('fukuoka-trip-core-'));
  const requests = core ? await (await caches.open(core)).keys() : [];
  return { names, urls: requests.map((request) => request.url) };
})()`);

const requiredCoreAssets = [
  'fukuoka-golf.html',
  'fukuoka-golf-v2.html',
  'fukuoka-golf-en.html',
  'fukuoka-golf-v2.css',
  'fukuoka-golf-v2.js',
  'fukuoka-golf-en-v2.js',
  'trip-day-router.js',
  'golf-draw.js',
  'pwa.js',
  'private-trip-info.js',
  'private-trip-info.enc.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'favicon.png',
  'version.txt',
];
const cachedPaths = cacheSnapshot.urls.map((url) => new URL(url).pathname.replace(/^\//, ''));
for (const asset of requiredCoreAssets) {
  assert.ok(cachedPaths.includes(asset), `${asset} is available in the core offline cache`);
}
assert.equal(cacheSnapshot.urls.some((url) => /coupon-.*\.jpg/.test(url)), false, 'coupons stay out of core cache');
assert.equal(cacheSnapshot.urls.some((url) => !url.startsWith(baseUrl)), false, 'remote assets stay out of core cache');
assert.equal(cacheSnapshot.urls.some((url) => /private-trip-info\.json(?:\?|$)/.test(url)), false, 'no unencrypted private payload is cached');

const couponAssets = [
  'coupon-airport-dutyfree-zh.jpg',
  'coupon-alpen-zh.jpg',
  'coupon-cocokara-en.jpg',
  'coupon-cocokara-zh.jpg',
  'coupon-cosmos-zh.jpg',
  'coupon-drug11-zh.jpg',
  'coupon-kokumin-zh.jpg',
  'coupon-matsukiyo-en.jpg',
  'coupon-matsukiyo-zh.jpg',
  'coupon-ohga-zh.jpg',
  'coupon-snowpeak-zh.jpg',
  'coupon-sugi-zh.jpg',
  'coupon-sundrug-zh.jpg',
  'coupon-tsuruha-zh.jpg',
  'coupon-yamada-zh.jpg',
];

await waitForValue(`Boolean(document.querySelector('.v2-coupon-download:not(:disabled)'))`, 'coupon download control');
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label')?.textContent.trim()`), '下載優惠券供離線使用');
assert.deepEqual(
  await evaluate(`(async () => ({
    closed: [...document.querySelectorAll('.v2-scan-coupon')].every((item) => !item.open),
    hydrated: document.querySelectorAll('.v2-coupon-image[src]').length,
    couponCaches: (await caches.keys()).filter((name) => name.startsWith('fukuoka-trip-coupons-')).length
  }))()`),
  { closed: true, hydrated: 0, couponCaches: 0 },
  'coupons remain closed, lazy, and uncached before opt-in',
);

const workerConnection = await connectToServiceWorker();
await workerConnection.send('Network.setBlockedURLs', { urls: ['*coupon-yamada-zh.jpg*'] });
await evaluate(`document.querySelector('.v2-coupon-download').click()`);
await waitForValue(`document.querySelector('.v2-coupon-download')?.dataset.state === 'partial'`, 'partial coupon result');
const partial = await evaluate(`(async () => {
  const name = (await caches.keys()).find((item) => item.startsWith('fukuoka-trip-coupons-'));
  return {
    label: document.querySelector('.v2-coupon-download-label').textContent.trim(),
    status: document.querySelector('.v2-coupon-download-status').textContent.trim(),
    count: name ? (await (await caches.open(name)).keys()).length : 0
  };
})()`);
assert.equal(partial.count, couponAssets.length - 1, 'successful coupon downloads survive one failed response');
assert.match(partial.label, /重試/);
assert.match(partial.status, /1 張失敗/);

await workerConnection.send('Network.setBlockedURLs', { urls: [] });
const requestsBeforeRetry = couponRequests.length;
await evaluate(`document.querySelector('.v2-coupon-download').click()`);
await waitForValue(`document.querySelector('.v2-coupon-download')?.dataset.state === 'ready'`, 'complete coupon cache');
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label').textContent.trim()`), '已可離線使用');
assert.equal(couponRequests.length - requestsBeforeRetry, 1, 'retry downloads only the one missing coupon');
assert.equal(
  await evaluate(`(async () => {
    const name = (await caches.keys()).find((item) => item.startsWith('fukuoka-trip-coupons-'));
    return name ? (await (await caches.open(name)).keys()).length : 0;
  })()`),
  couponAssets.length,
  'the fixed coupon set is cached after retry',
);

await navigate('fukuoka-golf-en.html?p=more');
await waitForValue(`document.querySelector('.v2-coupon-download')?.dataset.state === 'ready'`, 'English coupon status');
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label').textContent.trim()`), 'Available offline');

await setOffline(true);
for (const file of ['fukuoka-golf.html', 'fukuoka-golf-v2.html', 'fukuoka-golf-en.html']) {
  await navigate(`${file}?p=day4`);
  const state = await evaluate(`({
    active: document.querySelector('.page.active')?.id,
    hotelCopies: document.querySelectorAll('#hotels .v2-copy-address').length,
    packingControls: document.querySelectorAll('#packing [data-pack]').length,
    drawEntries: document.querySelectorAll('.golf-draw-entry').length
  })`);
  assert.equal(state.active, 'day4', `${file} restores query-bearing Day 4 offline`);
  assert.ok(state.hotelCopies > 0, `${file} retains hotel copy controls offline`);
  assert.ok(state.packingControls > 0, `${file} retains packing controls offline`);
  assert.equal(state.drawEntries, 3, `${file} retains every golf draw entry offline`);
}

await navigate('fukuoka-golf.html?p=more');
await evaluate(`document.querySelector('.v2-scan-coupon summary').click()`);
await waitForValue(`document.querySelector('.v2-coupon-image')?.naturalWidth > 0`, 'cached coupon image offline');

await setOffline(false);
const unsupportedOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, get: () => undefined });`,
});
await navigate('fukuoka-golf.html?p=day4');
assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day4', 'online page works without service-worker support');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: unsupportedOverride.identifier });

assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
workerConnection.close();
socket.close();
console.log('PWA core offline browser tests passed.');
