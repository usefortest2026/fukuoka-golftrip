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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(path) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${path}` });
  await loaded;
  await sleep(250);
}

async function setReducedMotion(reduce) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
}

async function waitForState(dayId, wanted, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await evaluate(`document.querySelector('#golf-draw-${dayId}')?.dataset.gdState`);
    if (state === wanted) return;
    await sleep(40);
  }
  throw new Error(`${dayId} draw did not reach ${wanted}`);
}

// Reads the visible sheet as plain data.
function readSheet(dayId) {
  return evaluate(`(() => {
    const panel = document.querySelector('#golf-draw-${dayId}');
    const groups = [...panel.querySelectorAll('.gd-group')].map((group) => ({
      label: group.querySelector('.gd-group-head b')?.textContent,
      time: group.querySelector('.gd-group-head time')?.textContent || '',
      rows: [...group.querySelectorAll('.gd-slot')].map((slot) => ({
        name: slot.querySelector('.gd-name').textContent,
        marked: slot.children.length !== 1 + slot.querySelectorAll('.gd-sr').length || getComputedStyle(slot, '::before').content !== 'none' || getComputedStyle(slot, '::after').content !== 'none'
      }))
    }));
    return {
      state: panel.dataset.gdState,
      mode: panel.dataset.gdCurrentMode,
      hasRule: Boolean(panel.querySelector('.gd-rule')),
      button: panel.querySelector('[data-gd-go]').textContent,
      buttonClass: panel.querySelector('[data-gd-go]').className,
      live: panel.querySelector('[data-gd-live]').textContent,
      poolCells: panel.querySelectorAll('.gd-pool .gd-cell').length,
      poolOrder: [...panel.querySelectorAll('.gd-pool .gd-cell')].map((cell) => [...cell.querySelectorAll('.gd-name')].map((name) => name.textContent).join('&')),
      poolPairs: [...panel.querySelectorAll('.gd-cell-pair')].map((cell) => [...cell.querySelectorAll('.gd-name')].map((name) => name.textContent).join('&')),
      groups
    };
  })()`);
}

function assertEveryoneOnce(sheet, label) {
  const names = sheet.groups.flatMap((group) => group.rows.map((row) => row.name)).sort();
  assert.deepEqual(names, ['Alex', 'Asa', 'Derek', 'Fi', 'Jack', 'Lois', 'Raistlin', 'Royston'], `${label}: all eight names once`);
  for (const group of sheet.groups) {
    assert.equal(group.rows.length, 4, `${label}: four players per group`);
    const names = group.rows.map((row) => row.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')), `${label}: names in each group are A–Z`);
  }
}

function assertCouplesAdjacent(sheet, label) {
  for (const [a, b] of [['Royston', 'Lois'], ['Asa', 'Fi']]) {
    const group = sheet.groups.find((item) => item.rows.some((row) => row.name === a));
    assert.ok(group.rows.some((row) => row.name === b), `${label}: ${a} & ${b} share a group`);
  }
  assert.ok(sheet.groups.every((group) => group.rows.every((row) => !row.marked)), `${label}: couples carry no visual marker`);
}

const COPY = {
  'fukuoka-golf.html': { tee: '開球', draw: '抽籤', again: '再抽一次', first: '第一組', live: '第一組 ' },
  'fukuoka-golf-v2.html': { tee: '開球', draw: '抽籤', again: '再抽一次', first: '第一組', live: '第一組 ' },
  'fukuoka-golf-en.html': { tee: 'Tee', draw: 'Draw', again: 'Draw again', first: 'Group 1', live: 'Group 1, tee time ' },
};
const TEE_TIMES = { day2: ['11:06', '11:14'], day4: ['10:00', '10:08'], day5: ['10:08', '10:16'] };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

for (const [file, copy] of Object.entries(COPY)) {
  await setReducedMotion(false);
  await navigate(`${file}?p=day2`);

  const placement = await evaluate(`[...document.querySelectorAll('.golf-draw')].map((panel) => ({
    day: panel.parentElement.id,
    last: panel.parentElement.lastElementChild === panel
  }))`);
  assert.deepEqual(placement.map((item) => item.day), ['day2', 'day4', 'day5'], `${file}: one draw on each golf day only`);
  for (const item of placement) {
    assert.ok(item.last, `${file}: draw sits at the bottom of ${item.day}`);
  }

  const storageBefore = await evaluate(`JSON.stringify([Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()])`);

  let sheet = await readSheet('day2');
  assert.equal(sheet.state, 'ready');
  assert.equal(sheet.mode, 'couple', `${file}: couples-together is the default`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#golf-draw-day2 [data-gd-mode]')].map((b) => b.dataset.gdMode + ':' + b.getAttribute('aria-checked'))`), ['couple:true', 'random:false'], `${file}: couples-together on the left, random on the right`);
  assert.deepEqual(sheet.poolOrder, ['Alex', 'Asa&Fi', 'Derek', 'Jack', 'Raistlin', 'Royston&Lois'], `${file}: default pool shows the couples`);
  await evaluate(`document.querySelector('#golf-draw-day2 [data-gd-mode="random"]').click()`);
  sheet = await readSheet('day2');
  assert.equal(sheet.mode, 'random');
  assert.equal(sheet.poolCells, 8, `${file}: pool lists eight players`);
  assert.deepEqual(sheet.poolOrder, ['Alex', 'Asa', 'Derek', 'Fi', 'Jack', 'Lois', 'Raistlin', 'Royston'], `${file}: pool is A–Z`);
  assert.equal(sheet.button, copy.draw);
  assert.equal(sheet.hasRule, false, `${file}: no explanation line under the mode tabs`);

  // Animated draw: busy state ignores extra taps and mode changes.
  await evaluate(`document.querySelector('#golf-draw-day2 [data-gd-go]').focus()`);
  await evaluate(`document.querySelector('#golf-draw-day2 [data-gd-go]').click()`);
  assert.equal(await evaluate(`document.querySelector('#golf-draw-day2').dataset.gdState`), 'drawing', `${file}: animation runs`);
  await evaluate(`document.querySelector('#golf-draw-day2 [data-gd-go]').click(); document.querySelector('#golf-draw-day2 [data-gd-mode="couple"]').click()`);
  await waitForState('day2', 'complete');
  sheet = await readSheet('day2');
  assert.equal(sheet.mode, 'random', `${file}: mode is locked while drawing`);
  assertEveryoneOnce(sheet, `${file} random`);
  assert.deepEqual(sheet.groups.map((group) => group.time), TEE_TIMES.day2, `${file}: groups carry the tee times`);
  assert.equal(sheet.groups[0].label, copy.first);
  assert.ok(sheet.groups.every((group) => group.rows.every((row) => !row.marked)), `${file}: rows show names only`);
  await sleep(700);
  assert.equal(await evaluate(`document.querySelector('#golf-draw-day2').dataset.gdState`), 'complete', `${file}: the extra tap did not queue a second draw`);
  assert.equal(await evaluate(`document.querySelectorAll('#golf-draw-day2 .gd-stamp').length`), 0, `${file}: no draw count or stamp`);
  assert.ok(sheet.live.startsWith(copy.live), `${file}: screen readers hear the groups`);
  assert.equal(sheet.button, copy.again);
  assert.match(sheet.buttonClass, /gd-btn-primary/, `${file}: draw again keeps the solid button`);
  assert.equal(await evaluate(`document.activeElement === document.querySelector('#golf-draw-day2 [data-gd-go]')`), true, `${file}: focus stays on the button`);

  // Switching mode resets to the pool; arrow keys move between modes.
  await evaluate(`document.querySelector('#golf-draw-day2 .gd-mode').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  sheet = await readSheet('day2');
  assert.equal(sheet.mode, 'couple', `${file}: arrow keys switch back to couple mode`);
  assert.equal(sheet.state, 'ready');
  assert.deepEqual(sheet.poolPairs, ['Asa&Fi', 'Royston&Lois'], `${file}: couples are shown together in the pool`);
  assert.deepEqual(sheet.poolOrder, ['Alex', 'Asa&Fi', 'Derek', 'Jack', 'Raistlin', 'Royston&Lois'], `${file}: couple-mode pool is A–Z`);
  assert.equal(await evaluate(`document.activeElement?.dataset.gdMode`), 'couple', `${file}: focus follows the selected mode`);

  // Many quick draws with reduced motion.
  await setReducedMotion(true);
  let together = 0;
  for (let round = 0; round < 40; round += 1) {
    await evaluate(`document.querySelector('#golf-draw-day2 [data-gd-go]').click()`);
    sheet = await readSheet('day2');
    assert.equal(sheet.state, 'complete', `${file}: reduced motion shows the result at once`);
    assertEveryoneOnce(sheet, `${file} couple ${round}`);
    assertCouplesAdjacent(sheet, `${file} couple ${round}`);
    if (sheet.groups.some((group) => ['Royston', 'Lois', 'Asa', 'Fi'].every((name) => group.rows.some((row) => row.name === name)))) together += 1;
  }
  assert.ok(together < 40, `${file}: couples are not always in the same group`);

  // Panels on other days are independent and use their own tee times.
  await evaluate(`document.querySelectorAll('.nav .tab-btn')[3].click()`);
  await sleep(150);
  await evaluate(`document.querySelector('#golf-draw-day4 [data-gd-go]').click()`);
  const day4 = await readSheet('day4');
  assert.deepEqual(day4.groups.map((group) => group.time), TEE_TIMES.day4, `${file}: Day 4 uses its tee times`);
  assert.equal(day4.state, 'complete', `${file}: Day 4 draws on its own`);
  await evaluate(`document.querySelectorAll('.nav .tab-btn')[4].click()`);
  await sleep(150);
  await evaluate(`document.querySelector('#golf-draw-day5 [data-gd-go]').click()`);
  assert.deepEqual((await readSheet('day5')).groups.map((group) => group.time), TEE_TIMES.day5, `${file}: Day 5 uses its tee times`);
  await evaluate(`document.querySelectorAll('.nav .tab-btn')[3].click()`);
  await sleep(150);

  const layout = await evaluate(`(() => {
    const panel = document.querySelector('#golf-draw-day4');
    return {
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      overflow: [...panel.querySelectorAll('.gd-name')].filter((name) => {
        const box = name.getBoundingClientRect();
        const cell = name.closest('.gd-slot, .gd-cell').getBoundingClientRect();
        return box.left < cell.left - 1 || box.right > cell.right + 1;
      }).map((name) => name.textContent),
      targets: [...panel.querySelectorAll('.gd-mode, .gd-btn')].map((node) => Math.round(node.getBoundingClientRect().height))
    };
  })()`);
  assert.ok(layout.page <= layout.viewport, `${file}: no horizontal page scroll at 390px`);
  assert.deepEqual(layout.overflow, [], `${file}: nothing clips inside the draw`);
  assert.ok(layout.targets.every((height) => height >= 44), `${file}: touch targets are at least 44px`);

  const storageAfter = await evaluate(`JSON.stringify([Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()])`);
  assert.equal(storageAfter, storageBefore, `${file}: draws are not saved`);

  await navigate(`${file}?p=day2`);
  assert.equal(await evaluate(`document.querySelector('#golf-draw-day2').dataset.gdState`), 'ready', `${file}: reload starts fresh`);
}

assert.deepEqual(pageErrors, [], 'no page errors');
socket.close();
console.log('golf draw browser checks passed');
