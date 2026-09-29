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

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await setOffline(false);
await navigate('fukuoka-golf.html');

await evaluate(`Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, reject) => setTimeout(() => reject(new Error('service worker not ready')), 5000))
])`);
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

await setOffline(false);
const unsupportedOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, get: () => undefined });`,
});
await navigate('fukuoka-golf.html?p=day4');
assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day4', 'online page works without service-worker support');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: unsupportedOverride.identifier });

assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
socket.close();
console.log('PWA core offline browser tests passed.');
