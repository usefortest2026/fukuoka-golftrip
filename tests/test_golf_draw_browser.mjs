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

async function navigate(file, page = 'day2') {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=${page}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function click(selector) {
  return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function snapshot() {
  return evaluate(`(() => ({
    local: Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
    session: Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])
  }))()`);
}

async function waitForModalState(expected, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const state = await evaluate(`document.querySelector('.golf-draw-modal')?.dataset.state`);
    if (state === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for golf draw state ${expected}`);
}

function assertValidGroups(result, file) {
  assert.deepEqual(result.totals, [4, 4], `${file} keeps both actual-player totals at four`);
  assert.deepEqual(
    result.names.sort(),
    ['偉哥', 'Asa', '小林', 'Derek', 'Jack', 'Alex'].sort(),
    `${file} includes every visible draw unit exactly once`,
  );
  assert.equal(result.playerCount, 6, `${file} renders six result balls`);
  assert.ok(result.announcement.length > 0, `${file} announces the result`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

const files = ['fukuoka-golf.html', 'fukuoka-golf-v2.html', 'fukuoka-golf-en.html'];

for (const file of files) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate(file);
  const placement = await evaluate(`(() => {
    const days = ['day1', 'day2', 'day3', 'day4', 'day5', 'more'];
    return {
      counts: days.map((id) => document.querySelectorAll('#' + id + ' > .golf-draw-entry').length),
      last: ['day2', 'day4', 'day5'].map((id) => document.querySelector('#' + id)?.lastElementChild?.classList.contains('golf-draw-entry')),
      navCount: document.querySelectorAll('.tab-btn').length,
      modalCount: document.querySelectorAll('.golf-draw-modal').length,
    };
  })()`);
  assert.deepEqual(placement.counts, [0, 1, 0, 1, 1, 0], `${file} mounts only on golf days`);
  assert.deepEqual(placement.last, [true, true, true], `${file} places the draw at each golf-day footer`);
  assert.equal(placement.navCount, 6, `${file} does not add a navigation tab`);
  assert.equal(placement.modalCount, 1, `${file} creates one shared modal`);

  const storageBefore = await snapshot();
  await click('#day2 [data-golf-draw-open]');
  const opened = await evaluate(`(() => {
    const modal = document.querySelector('.golf-draw-modal');
    return {
      open: modal.hasAttribute('open'),
      role: modal.getAttribute('role'),
      ariaModal: modal.getAttribute('aria-modal'),
      state: modal.dataset.state,
      names: [...modal.querySelectorAll('.golf-draw-ball')].map((ball) => ball.textContent.trim()).sort(),
      hasHiddenPartnerCopy: modal.textContent.includes('女伴'),
      bodyLocked: document.body.classList.contains('golf-draw-open'),
      activeInside: modal.contains(document.activeElement),
    };
  })()`);
  assert.equal(opened.open, true);
  assert.equal(opened.role, 'dialog');
  assert.equal(opened.ariaModal, 'true');
  assert.equal(opened.state, 'ready');
  assert.deepEqual(opened.names, ['偉哥', 'Asa', '小林', 'Derek', 'Jack', 'Alex'].sort());
  assert.equal(opened.hasHiddenPartnerCopy, false);
  assert.equal(opened.bodyLocked, true);
  assert.equal(opened.activeInside, true);

  const visualTreatment = await evaluate(`(() => {
    function rgb(value) {
      return (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    }
    function luminance(value) {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    }
    function contrast(foreground, background) {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + .05) / (dark + .05);
    }

    const entry = document.querySelector('#day2 > .golf-draw-entry');
    const entryEyebrow = entry.querySelector('.golf-draw-entry-eyebrow');
    const modal = document.querySelector('.golf-draw-modal');
    const modalEyebrow = modal.querySelector('.golf-draw-eyebrow');
    const ball = modal.querySelector('.golf-draw-ball');
    const entryStyle = getComputedStyle(entry);
    const modalStyle = getComputedStyle(modal);
    const ballStyle = getComputedStyle(ball);
    const entryEyebrowStyle = getComputedStyle(entryEyebrow);
    const entryButtonStyle = getComputedStyle(entry.querySelector('.golf-draw-entry-button'));
    return {
      entryEyebrowDisplay: entryEyebrowStyle.display,
      entryBackgroundLuminance: luminance(entryStyle.backgroundColor),
      entryButtonBackgroundLuminance: luminance(entryButtonStyle.backgroundColor),
      entryButtonContrast: contrast(entryButtonStyle.color, entryButtonStyle.backgroundColor),
      modalEyebrowContrast: contrast(getComputedStyle(modalEyebrow).color, modalStyle.backgroundColor),
      ballGradientLayers: (ballStyle.backgroundImage.match(/gradient\\(/g) || []).length,
      ballTextContrast: contrast(ballStyle.color, 'rgb(248, 246, 238)'),
    };
  })()`);
  assert.equal(visualTreatment.entryEyebrowDisplay, 'none', `${file} removes the promotional Golf Day label from the quiet entry card`);
  assert.ok(visualTreatment.entryBackgroundLuminance >= .9, `${file} keeps the draw entry visually consistent with light itinerary cards`);
  assert.ok(visualTreatment.entryButtonBackgroundLuminance >= .8, `${file} keeps the entry action visually secondary`);
  assert.ok(visualTreatment.entryButtonContrast >= 4.5, `${file} keeps the entry action readable`);
  assert.ok(visualTreatment.modalEyebrowContrast >= 4.5, `${file} keeps the modal Golf Day label readable`);
  assert.ok(visualTreatment.ballGradientLayers >= 3, `${file} gives the draw balls a layered golf-ball texture`);
  assert.ok(visualTreatment.ballTextContrast >= 4.5, `${file} keeps names readable over the ivory golf balls`);

  await click('[data-golf-draw-start]');
  await click('[data-golf-draw-start]');
  const drawing = await evaluate(`(() => {
    const modal = document.querySelector('.golf-draw-modal');
    return {
      state: modal.dataset.state,
      busy: modal.getAttribute('aria-busy'),
      disabled: modal.querySelector('[data-golf-draw-start]').disabled,
      resultCount: modal.querySelectorAll('[data-golf-draw-player]').length,
    };
  })()`);
  assert.deepEqual(drawing, { state: 'drawing', busy: 'true', disabled: true, resultCount: 0 });
  await waitForModalState('complete');

  const result = await evaluate(`(() => {
    const modal = document.querySelector('.golf-draw-modal');
    const groups = [...modal.querySelectorAll('.golf-draw-group')];
    const players = [...modal.querySelectorAll('[data-golf-draw-player]')];
    return {
      state: modal.dataset.state,
      totals: groups.map((group) => [...group.querySelectorAll('[data-player-size]')]
        .reduce((sum, player) => sum + Number(player.dataset.playerSize), 0)),
      names: players.map((player) => player.textContent.trim()),
      playerCount: players.length,
      statusText: modal.querySelector('[data-golf-draw-status]').textContent.trim(),
      announcement: modal.querySelector('[data-golf-draw-announcement]').textContent.trim(),
      announcementHidden: modal.querySelector('[data-golf-draw-announcement]').getBoundingClientRect().width <= 1,
      announcementRole: modal.querySelector('[data-golf-draw-announcement]').getAttribute('role'),
      announcementLive: modal.querySelector('[data-golf-draw-announcement]').getAttribute('aria-live'),
      drawAgainVisible: !modal.querySelector('[data-golf-draw-again]').hidden,
    };
  })()`);
  assert.equal(result.state, 'complete');
  assert.equal(result.drawAgainVisible, true);
  assert.equal(result.announcementHidden, true, `${file} keeps the detailed roster visually hidden`);
  assert.equal(result.announcementRole, 'status');
  assert.equal(result.announcementLive, 'polite');
  assertValidGroups(result, file);
  if (file.includes('-en')) {
    assert.equal(result.statusText, 'Groups are ready');
    assert.match(result.announcement, /^Groups are ready\. Group 1: .+; Group 2: .+$/);
  } else {
    assert.equal(result.statusText, '分組完成');
    assert.match(result.announcement, /^分組完成。第一組：.+；第二組：.+$/);
  }

  await click('[data-golf-draw-again]');
  assert.equal(await evaluate(`document.querySelector('.golf-draw-modal').dataset.state`), 'drawing');
  await waitForModalState('complete');
  assertValidGroups(await evaluate(`(() => {
    const modal = document.querySelector('.golf-draw-modal');
    const groups = [...modal.querySelectorAll('.golf-draw-group')];
    const players = [...modal.querySelectorAll('[data-golf-draw-player]')];
    return {
      totals: groups.map((group) => [...group.querySelectorAll('[data-player-size]')]
        .reduce((sum, player) => sum + Number(player.dataset.playerSize), 0)),
      names: players.map((player) => player.textContent.trim()),
      playerCount: players.length,
      announcement: modal.querySelector('[data-golf-draw-announcement]').textContent.trim(),
    };
  })()`), file);

  await click('[data-golf-draw-close]');
  const closed = await evaluate(`(() => ({
    open: document.querySelector('.golf-draw-modal').hasAttribute('open'),
    bodyLocked: document.body.classList.contains('golf-draw-open'),
    openerFocused: document.activeElement === document.querySelector('#day2 [data-golf-draw-open]')
  }))()`);
  assert.deepEqual(closed, { open: false, bodyLocked: false, openerFocused: true });
  assert.deepEqual(await snapshot(), storageBefore, `${file} does not persist a draw result`);

  await click('#day2 [data-golf-draw-open]');
  assert.deepEqual(
    await evaluate(`(() => {
      const modal = document.querySelector('.golf-draw-modal');
      return { state: modal.dataset.state, resultCount: modal.querySelectorAll('[data-golf-draw-player]').length };
    })()`),
    { state: 'ready', resultCount: 0 },
    `${file} resets after close`,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(
    await evaluate(`(() => ({
      open: document.querySelector('.golf-draw-modal').hasAttribute('open'),
      openerFocused: document.activeElement === document.querySelector('#day2 [data-golf-draw-open]')
    }))()`),
    { open: false, openerFocused: true },
    `${file} closes on Escape and restores focus`,
  );
}

const dialogFallbackOverride = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
    try { delete HTMLElement.prototype.inert; } catch (error) {}
  `,
});
await navigate('fukuoka-golf.html');
await click('#day2 [data-golf-draw-open]');
assert.deepEqual(
  await evaluate(`(() => ({
    fallback: document.querySelector('.golf-draw-modal').classList.contains('is-fallback-open'),
    nativeInert: 'inert' in HTMLElement.prototype,
    backgroundHidden: document.querySelector('.app').getAttribute('aria-hidden'),
    backgroundPointerEvents: getComputedStyle(document.querySelector('.app')).pointerEvents,
    backdropVisible: !document.querySelector('.golf-draw-fallback-backdrop').hidden,
    modalPosition: getComputedStyle(document.querySelector('.golf-draw-modal')).position,
    fallbackBodyClass: document.body.classList.contains('golf-draw-fallback-open')
  }))()`),
  {
    fallback: true,
    nativeInert: false,
    backgroundHidden: 'true',
    backgroundPointerEvents: 'none',
    backdropVisible: true,
    modalPosition: 'fixed',
    fallbackBodyClass: true
  },
  'dialog fallback isolates the background without native inert or dialog styling',
);
await evaluate(`(() => {
  const modal = document.querySelector('.golf-draw-modal');
  modal.querySelector('[data-golf-draw-start]').focus();
  modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
})()`);
assert.equal(
  await evaluate(`document.activeElement === document.querySelector('[data-golf-draw-close]')`),
  true,
  'dialog fallback traps forward focus',
);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await new Promise((resolve) => setTimeout(resolve, 80));
assert.deepEqual(
  await evaluate(`(() => ({
    open: document.querySelector('.golf-draw-modal').hasAttribute('open'),
    backgroundHidden: document.querySelector('.app').hasAttribute('aria-hidden'),
    backdropHidden: document.querySelector('.golf-draw-fallback-backdrop').hidden,
    fallbackBodyClass: document.body.classList.contains('golf-draw-fallback-open'),
    openerFocused: document.activeElement === document.querySelector('#day2 [data-golf-draw-open]')
  }))()`),
  { open: false, backgroundHidden: false, backdropHidden: true, fallbackBodyClass: false, openerFocused: true },
  'dialog fallback closes on Escape, restores background and returns focus',
);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: dialogFallbackOverride.identifier });

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await navigate('fukuoka-golf.html');
await click('#day2 [data-golf-draw-open]');
await click('[data-golf-draw-start]');
await waitForModalState('complete', 500);
assert.equal(
  await evaluate(`document.querySelector('.golf-draw-modal').dataset.state`),
  'complete',
  'Reduced motion reveals the result without the full draw delay',
);

assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
socket.close();
console.log('Golf draw browser tests passed.');
