import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const appVersion = /const APP_VERSION = '([^']+)'/.exec(workerSource)?.[1];
const coreCache = `fukuoka-trip-core-${appVersion}`;

function createHarness({ failInstall = false, serverVersion = appVersion } = {}) {
  const listeners = new Map();
  const cacheNames = new Set(['fukuoka-trip-core-20260929-47', 'unrelated-cache']);
  const stores = new Map();
  let unregistered = false;
  let skipped = false;
  let installRequests = [];

  function cacheFor(name) {
    if (!stores.has(name)) {
      stores.set(name, {
        async addAll(requests) {
          installRequests = requests;
          if (failInstall && name === coreCache) {
            throw new Error('simulated core failure');
          }
        },
        async match() { return undefined; },
        async put() {},
        async keys() { return []; },
      });
    }
    return stores.get(name);
  }

  const caches = {
    async open(name) {
      cacheNames.add(name);
      return cacheFor(name);
    },
    async keys() { return [...cacheNames]; },
    async delete(name) {
      stores.delete(name);
      return cacheNames.delete(name);
    },
  };
  const self = {
    location: new URL('https://trip.test/service-worker.js'),
    clients: { async claim() {} },
    registration: {
      async unregister() {
        unregistered = true;
        return true;
      },
    },
    async skipWaiting() { skipped = true; },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const context = vm.createContext({
    self,
    caches,
    URL,
    Response,
    Request,
    Headers,
    fetch: async () => new Response(serverVersion, { status: 200 }),
    console,
  });
  vm.runInContext(workerSource, context, { filename: 'service-worker.js' });
  return {
    listeners,
    cacheNames,
    get unregistered() { return unregistered; },
    get skipped() { return skipped; },
    get installRequests() { return installRequests; },
  };
}

test('a failed core install preserves the previous working cache', async () => {
  const harness = createHarness({ failInstall: true });
  const lifetimes = [];
  harness.listeners.get('install')({ waitUntil(promise) { lifetimes.push(promise); } });
  await assert.rejects(lifetimes[0], /simulated core failure/);
  assert.equal(harness.cacheNames.has('fukuoka-trip-core-20260929-47'), true);
  assert.equal(harness.cacheNames.has(coreCache), false);
  assert.equal(harness.skipped, false);
});

test('core install bypasses stale browser HTTP-cache entries', async () => {
  const harness = createHarness();
  const lifetimes = [];
  harness.listeners.get('install')({ waitUntil(promise) { lifetimes.push(promise); } });
  await lifetimes[0];
  assert.ok(harness.installRequests.length > 0);
  assert.equal(harness.installRequests.every((request) => request.cache === 'reload'), true);
});

test('a server rollback unregisters the newer worker and clears only app caches', async () => {
  const harness = createHarness({ serverVersion: '20260929-47' });
  const responses = [];
  const lifetimes = [];
  harness.listeners.get('fetch')({
    request: { method: 'GET', mode: 'same-origin', url: 'https://trip.test/version.txt' },
    respondWith(promise) { responses.push(promise); },
    waitUntil(promise) { lifetimes.push(promise); },
  });
  assert.equal(await (await responses[0]).text(), '20260929-47');
  await Promise.all(lifetimes);
  assert.equal(harness.unregistered, true);
  assert.equal([...harness.cacheNames].some((name) => name.startsWith('fukuoka-trip-')), false);
  assert.equal(harness.cacheNames.has('unrelated-cache'), true);
});
