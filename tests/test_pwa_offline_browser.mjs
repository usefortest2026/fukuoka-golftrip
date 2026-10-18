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
await send('Network.clearBrowserCache');
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
assert.equal(cacheSnapshot.urls.some((url) => /golf-draw\.js(?:\?|$)/.test(url)), false, 'retired golf draw stays out of core cache');
assert.equal(cacheSnapshot.urls.some((url) => !url.startsWith(baseUrl)), false, 'remote assets stay out of core cache');
assert.equal(cacheSnapshot.urls.some((url) => /private-trip-info\.json(?:\?|$)/.test(url)), false, 'no unencrypted private payload is cached');

const immutableProbe = await evaluate(`(async () => {
  const name = (await caches.keys()).find((item) => item.startsWith('fukuoka-trip-core-'));
  const cache = await caches.open(name);
  const assetUrl = new URL('fukuoka-golf-v2.css', location.href).href;
  const original = await cache.match(assetUrl);
  const sentinel = '/* old-worker-sentinel */';
  await cache.put(assetUrl, new Response(sentinel, { headers: { 'Content-Type': 'text/css' } }));
  const delivered = await fetch('fukuoka-golf-v2.css?v=20991231-99').then((response) => response.text());
  await new Promise((resolve) => setTimeout(resolve, 150));
  const retained = await cache.match(assetUrl).then((response) => response.text());
  await cache.put(assetUrl, original);
  return { delivered, retained, sentinel };
})()`);
assert.notEqual(immutableProbe.delivered, immutableProbe.sentinel, 'an old worker does not serve an old asset for a newer version URL');
assert.equal(immutableProbe.retained, immutableProbe.sentinel, 'runtime fetches do not mutate an installed core cache');

await navigate('fukuoka-golf.html?p=more&layout=1');

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
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label')?.textContent.trim()`), '離線儲存');
const utilityPresentation = await evaluate(`(() => {
  const couponIcon = document.querySelector('.v2-coupon-download-icon');
  const couponStatus = document.querySelector('.v2-coupon-download-status');
  const couponButton = document.querySelector('.v2-coupon-download');
  const couponHeading = document.querySelector('.v2-coupon-heading');
  const couponTitle = couponHeading.querySelector('h2');
  const couponSection = document.querySelector('.v2-trip-coupons');
  const couponEyebrow = couponHeading.querySelector('.eyebrow');
  const headingIcon = couponHeading.querySelector('.v2-coupon-heading-icon');
  const tools = document.querySelector('.v2-offline-tools');
  const networkNote = document.querySelector('.v2-offline-network-note');
  const iconStyle = getComputedStyle(couponIcon);
  const couponButtonStyle = getComputedStyle(couponButton);
  const couponSectionStyle = getComputedStyle(couponSection);
  const couponTitleRect = couponTitle.getBoundingClientRect();
  const couponButtonRect = couponButton.getBoundingClientRect();
  return {
    couponIconWidth: couponIcon.getBoundingClientRect().width,
    couponIconBackground: iconStyle.backgroundColor,
    emptyCouponStatusDisplay: getComputedStyle(couponStatus).display,
    couponControlDirectlyInHeading: couponButton.closest('.v2-coupon-offline').parentElement === couponHeading,
    couponButtonWidth: couponButtonRect.width,
    couponButtonBackground: couponButtonStyle.backgroundColor,
    couponButtonBorderStyle: couponButtonStyle.borderStyle,
    couponHeadingHeight: couponHeading.getBoundingClientRect().height,
    couponTitleActionCenterGap: Math.abs((couponTitleRect.top + couponTitleRect.height / 2) - (couponButtonRect.top + couponButtonRect.height / 2)),
    headingIconDisplay: getComputedStyle(headingIcon).display,
    eyebrowDisplay: getComputedStyle(couponEyebrow).display,
    couponSectionBackground: couponSectionStyle.backgroundColor,
    couponSectionBorderStyle: couponSectionStyle.borderStyle,
    couponSectionRadius: couponSectionStyle.borderRadius,
    couponSectionPadding: couponSectionStyle.padding,
    toolsInMoreHeader: tools.parentElement === document.querySelector('#more > .day-head'),
    toolsHiddenOnline: tools.hidden,
    toolsHeightOnline: tools.getBoundingClientRect().height,
    toolsModeOnline: tools.dataset.mode,
    toolsPositionOnline: getComputedStyle(tools).position,
    installVisibleOnline: Boolean(tools.querySelector('.v2-install-button:not([hidden])')),
    readyStatusHiddenOnline: document.querySelector('.v2-offline-ready-status').hidden,
    networkNoteDisplay: getComputedStyle(networkNote).display,
  };
})()`);
assert.ok(utilityPresentation.couponIconWidth <= 16, 'coupon download uses a small linear icon');
assert.equal(utilityPresentation.couponIconBackground, 'rgba(0, 0, 0, 0)', 'coupon download removes the nested icon tile');
assert.equal(utilityPresentation.emptyCouponStatusDisplay, 'none', 'empty coupon status does not reserve space');
assert.equal(utilityPresentation.couponControlDirectlyInHeading, true, 'coupon saving is a direct title-row action');
assert.ok(utilityPresentation.couponButtonWidth < 180, 'coupon saving is a compact text action');
assert.equal(utilityPresentation.couponButtonBackground, 'rgba(0, 0, 0, 0)');
assert.equal(utilityPresentation.couponButtonBorderStyle, 'none');
assert.ok(utilityPresentation.couponHeadingHeight < 90, 'coupon heading does not grow a separate download row');
assert.ok(utilityPresentation.couponTitleActionCenterGap <= 12, 'coupon title and save action share one row');
assert.equal(utilityPresentation.headingIconDisplay, 'none', 'coupon heading removes the decorative icon tile');
assert.equal(utilityPresentation.eyebrowDisplay, 'none', 'coupon heading removes the redundant Shopping label');
assert.equal(utilityPresentation.couponSectionBackground, 'rgba(0, 0, 0, 0)', 'coupon content is not wrapped in another card');
assert.equal(utilityPresentation.couponSectionBorderStyle, 'none');
assert.equal(utilityPresentation.couponSectionRadius, '0px');
assert.equal(utilityPresentation.couponSectionPadding, '0px');
assert.equal(utilityPresentation.toolsInMoreHeader, true, 'offline and install states live with the More heading');
if (utilityPresentation.installVisibleOnline) {
  assert.equal(utilityPresentation.toolsHiddenOnline, false, 'the native install action remains available when offered');
  assert.equal(utilityPresentation.toolsModeOnline, 'install');
  assert.equal(utilityPresentation.toolsPositionOnline, 'absolute', 'the install action does not create a footer row');
} else {
  assert.equal(utilityPresentation.toolsHiddenOnline, true, 'online mode removes the redundant offline row');
  assert.equal(utilityPresentation.toolsHeightOnline, 0, 'hidden online tools reserve no vertical space');
}
assert.equal(utilityPresentation.readyStatusHiddenOnline, true);
assert.equal(utilityPresentation.networkNoteDisplay, 'none');
assert.deepEqual(
  await evaluate(`(async () => ({
    closed: [...document.querySelectorAll('.v2-scan-coupon')].every((item) => !item.open),
    hydrated: document.querySelectorAll('.v2-coupon-image[src]').length,
    couponEntries: (await Promise.all((await caches.keys())
      .filter((name) => name.startsWith('fukuoka-trip-coupons-'))
      .map(async (name) => (await (await caches.open(name)).keys()).length)))
      .reduce((total, count) => total + count, 0)
  }))()`),
  { closed: true, hydrated: 0, couponEntries: 0 },
  'coupons remain closed, lazy, and uncached before opt-in',
);

const workerConnection = await connectToServiceWorker();
await workerConnection.send('Network.setBlockedURLs', { urls: ['*coupon-cocokara-zh.jpg*', '*coupon-cocokara-en.jpg*'] });
await setOffline(true);
await evaluate(`window.dispatchEvent(new Event('offline'))`);
const offlineUtility = await evaluate(`(() => {
  const tools = document.querySelector('.v2-offline-tools');
  const status = document.querySelector('.v2-offline-ready-status');
  return {
    toolsHidden: tools.hidden,
    toolsHeight: tools.getBoundingClientRect().height,
    statusHidden: status.hidden,
    networkNoteDisplay: getComputedStyle(document.querySelector('.v2-offline-network-note')).display,
  };
})()`);
assert.equal(offlineUtility.toolsHidden, false, 'offline status becomes visible only when needed');
assert.ok(offlineUtility.toolsHeight > 0, 'offline status has a compact visible surface');
assert.equal(offlineUtility.statusHidden, false);
assert.equal(offlineUtility.networkNoteDisplay, 'block', 'network-dependent exceptions appear only while offline');
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none'
});
await evaluate(`document.querySelector('.v2-scan-coupon summary').click()`);
await waitForValue(`Boolean(document.querySelector('.v2-coupon-image-error'))`, 'Chinese uncached coupon offline error');
assert.equal(
  await evaluate(`document.querySelector('.v2-coupon-image-error').textContent.trim()`),
  '這張優惠券尚未下載，請連上網路後再試。',
);
await setOffline(false);
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi'
});
await navigate('fukuoka-golf-en.html?p=more&uncached=1');
await waitForValue(`Boolean(document.querySelector('.v2-coupon-download:not(:disabled)'))`, 'English coupon control');
await setOffline(true);
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none'
});
await evaluate(`document.querySelector('.v2-scan-coupon summary').click()`);
await waitForValue(`Boolean(document.querySelector('.v2-coupon-image-error'))`, 'English uncached coupon offline error');
assert.equal(
  await evaluate(`document.querySelector('.v2-coupon-image-error').textContent.trim()`),
  'This coupon has not been downloaded. Connect to the internet and try again.',
);
await setOffline(false);
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi'
});
await workerConnection.send('Network.setBlockedURLs', { urls: [] });
await navigate('fukuoka-golf.html?controller-replacement=1');
await waitForValue(`Boolean(document.querySelector('.v2-coupon-download:not(:disabled)'))`, 'coupon control after reconnect');

await evaluate(`(() => {
  window.__replacementWorkerMessages = [];
  window.__replacementWorker = { postMessage: (message) => window.__replacementWorkerMessages.push(message.type) };
  Object.defineProperty(navigator.serviceWorker, 'controller', {
    configurable: true,
    get: () => window.__replacementWorker
  });
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  document.querySelector('.v2-coupon-download').click();
})()`);
assert.ok(
  (await evaluate(`window.__replacementWorkerMessages`)).includes('CACHE_COUPONS'),
  'coupon commands use the replacement service-worker controller',
);
await evaluate(`(() => {
  delete navigator.serviceWorker.controller;
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
})()`);
await waitForValue(`document.querySelector('.v2-coupon-download')?.dataset.state === 'idle'`, 'active coupon worker after controller replacement');

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
assert.equal(
  await evaluate(`getComputedStyle(document.querySelector('.v2-coupon-download-status')).color`),
  'rgb(128, 88, 13)',
  'partial coupon state uses the existing warning tone',
);

await workerConnection.send('Network.setBlockedURLs', { urls: [] });
const requestsBeforeRetry = couponRequests.length;
await evaluate(`document.querySelector('.v2-coupon-download').click()`);
await waitForValue(`document.querySelector('.v2-coupon-download')?.dataset.state === 'ready'`, 'complete coupon cache');
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label').textContent.trim()`), '已儲存');
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
assert.equal(await evaluate(`document.querySelector('.v2-coupon-download-label').textContent.trim()`), 'Saved');

const overviewTools = await evaluate(`({
  inMoreHeader: document.querySelector('.v2-offline-tools')?.parentElement === document.querySelector('#more > .day-head'),
  tabCount: document.querySelectorAll('#more > .tabs > .seg').length,
  hidden: document.querySelector('.v2-offline-tools')?.hidden,
  mode: document.querySelector('.v2-offline-tools')?.dataset.mode,
  installVisible: Boolean(document.querySelector('.v2-install-button:not([hidden])')),
  online: navigator.onLine,
  status: document.querySelector('.v2-offline-ready-status')?.textContent.trim(),
  networkNote: document.querySelector('.v2-offline-network-note')?.textContent.trim()
})`);
assert.equal(overviewTools.inMoreHeader, true, 'offline tools stay with the More heading');
assert.equal(overviewTools.tabCount, 3, 'offline tools do not add a More sub-tab');
if (overviewTools.installVisible) {
  assert.equal(overviewTools.hidden, false, 'a native browser install prompt may expose only the install action');
  assert.equal(overviewTools.mode, 'install');
} else {
  assert.equal(overviewTools.hidden, true, 'online mode hides the offline utility without a native install action');
}
assert.ok(overviewTools.status, 'offline-ready text remains available for the actual offline state');
assert.equal(overviewTools.networkNote, 'Google Maps, live weather and external sites still require internet.');

assert.equal(await evaluate(`(() => {
  window.__installPromptCalls = 0;
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.defineProperties(event, {
    prompt: { value: () => { window.__installPromptCalls += 1; return Promise.resolve(); } },
    userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) }
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
})()`), true, 'install prompt is retained for the explicit button');
await waitForValue(`Boolean(document.querySelector('.v2-install-button:not([hidden])'))`, 'supported install action');
assert.deepEqual(
  await evaluate(`(() => {
    const button = document.querySelector('.v2-install-button');
    const style = getComputedStyle(button);
    return {
      minHeight: style.minHeight,
      background: style.backgroundColor,
      color: style.color,
      borderStyle: style.borderStyle,
    };
  })()`),
  { minHeight: '44px', background: 'rgba(0, 0, 0, 0)', color: 'rgb(36, 100, 61)', borderStyle: 'none' },
  'install action stays a quiet inline heading action',
);
await setOffline(true);
await evaluate(`window.dispatchEvent(new Event('offline'))`);
assert.equal(
  await evaluate(`document.querySelector('.v2-install-button').hidden`),
  true,
  'the install action does not compete with the true offline status',
);
assert.equal(
  await evaluate(`document.querySelector('.v2-offline-ready-status').hidden`),
  false,
  'the true offline status remains visible',
);
await setOffline(false);
await evaluate(`window.dispatchEvent(new Event('online'))`);
await waitForValue(`Boolean(document.querySelector('.v2-install-button:not([hidden])'))`, 'install action after reconnect');
await evaluate(`document.querySelector('.v2-install-button').click()`);
await waitForValue(`window.__installPromptCalls === 1`, 'one native install prompt');

const iosOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    Object.defineProperty(Navigator.prototype, 'platform', { configurable: true, get: () => 'MacIntel' });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 });
    Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => false });
  `,
});
await navigate('fukuoka-golf-en.html?p=more&mode=ios');
await waitForValue(`Boolean(document.querySelector('.v2-offline-tools'))`, 'iOS install guidance');
assert.match(
  await evaluate(`document.querySelector('.v2-install-guidance')?.textContent.trim()`),
  /Share.*Add to Home Screen/,
  'iOS receives Share to Add to Home Screen guidance',
);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: iosOverride.identifier });

const standaloneOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(display-mode: standalone)'
      ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } }
      : nativeMatchMedia(query);
  `,
});
await navigate('fukuoka-golf.html?p=more&mode=standalone');
await waitForValue(`Boolean(document.querySelector('.v2-offline-tools'))`, 'standalone offline status');
assert.deepEqual(
  await evaluate(`({
    toolsHidden: document.querySelector('.v2-offline-tools').hidden,
    installVisible: Boolean(document.querySelector('.v2-install-button:not([hidden])')),
    guidanceVisible: Boolean(document.querySelector('.v2-install-guidance:not([hidden])')),
    statusVisible: Boolean(document.querySelector('.v2-offline-ready-status:not([hidden])'))
  })`),
  { toolsHidden: true, installVisible: false, guidanceVisible: false, statusVisible: false },
  'standalone online mode removes every redundant install and offline status row',
);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: standaloneOverride.identifier });

await setOffline(true);
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none'
});
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
  assert.equal(state.drawEntries, 0, `${file} keeps the retired golf draw out of the offline UI`);
}

await navigate('fukuoka-golf.html?p=more');
await evaluate(`document.querySelector('.v2-scan-coupon summary').click()`);
await waitForValue(`document.querySelector('.v2-coupon-image')?.naturalWidth > 0`, 'cached coupon image offline');

await setOffline(false);
await workerConnection.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi'
});
const unsupportedOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `Object.defineProperty(Navigator.prototype, 'serviceWorker', { configurable: true, get: () => undefined });`,
});
await navigate('fukuoka-golf.html?p=day4');
assert.deepEqual(
  await evaluate(`({
    active: document.querySelector('.page.active')?.id,
    offlineStatus: document.querySelector('.v2-offline-ready-status')?.textContent.trim(),
    offlineState: document.querySelector('.v2-offline-ready-status')?.dataset.state,
    couponStatus: document.querySelector('.v2-coupon-download-label')?.textContent.trim()
  })`),
  {
    active: 'day4',
    offlineStatus: '此瀏覽器不支援離線行程',
    offlineState: 'unsupported',
    couponStatus: '此瀏覽器不支援優惠券離線下載'
  },
  'unsupported-service-worker fallback stays usable and explains unavailable offline controls',
);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: unsupportedOverride.identifier });

assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
workerConnection.close();
socket.close();
console.log('PWA core offline browser tests passed.');
