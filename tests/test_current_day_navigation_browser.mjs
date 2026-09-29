import assert from 'node:assert/strict';
import fs from 'node:fs';

const cdpPort = process.env.CDP_PORT || '9238';
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8765';
const releaseVersion = fs.readFileSync(new URL('../version.txt', import.meta.url), 'utf8').trim();
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

async function navigate(file, query = '') {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}${query}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const RealDate = Date;
    const fixed = '2026-11-07T03:00:00.000Z';
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return new RealDate(fixed).getTime(); }
    }
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
  })();`,
});

const files = ['fukuoka-golf.html', 'fukuoka-golf-v2.html', 'fukuoka-golf-en.html'];

for (const file of files) {
  await navigate(file);
  assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day2', `${file} auto-opens Day 2`);
  assert.equal(await evaluate(`document.querySelectorAll('.v2-day-state').length`), 0, `${file} renders no Today/Next badge`);

  await navigate(file, `?p=day4&_=${releaseVersion}`);
  assert.deepEqual(
    await evaluate(`({
      active: document.querySelector('.page.active')?.id,
      params: new URL(location.href).searchParams.toString()
    })`),
    { active: 'day4', params: `_=${releaseVersion}` },
    `${file} respects an explicit day and preserves unrelated query state`,
  );

  await navigate(file, '?p=more');
  assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'more', `${file} opens More directly`);

  await navigate(file, '?p=bogus');
  assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day1', `${file} rejects invalid page ids`);

  await navigate(file, '?p=');
  assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day1', `${file} rejects an explicitly empty page id`);

  await navigate(file);
  assert.equal(
    await evaluate(`(() => {
      [...document.querySelectorAll('.tab-btn')].find((button) =>
        (button.getAttribute('onclick') || '').includes("'day5'")
      ).click();
      return document.querySelector('.page.active')?.id;
    })()`),
    'day5',
    `${file} keeps a manual selection after automatic routing`,
  );
}

assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
socket.close();
console.log('Current-day routing browser tests passed.');
