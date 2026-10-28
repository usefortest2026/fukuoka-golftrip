import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const sourceUrl = new URL('touch-gestures.js', root);

function setup({ standalone = true, installed = false } = {}) {
  const document = new EventTarget();
  const window = {
    navigator: { standalone },
    matchMedia: () => ({ matches: installed }),
  };
  // These DOM targets are the only browser boundary needed by the touch handler.
  const blank = { closest: () => null };
  function control(tag) {
    return { closest: (selector) => selector.split(',').map((s) => s.trim()).includes(tag) ? {} : null };
  }
  vm.runInNewContext(fs.existsSync(sourceUrl) ? fs.readFileSync(sourceUrl, 'utf8') : '', { window, document });
  function event(type, time, { target = blank, touches, changedTouches } = {}) {
    const e = new Event(type, { cancelable: true });
    Object.defineProperties(e, {
      timeStamp: { value: time },
      target: { value: target },
      touches: { value: touches || [] },
      changedTouches: { value: changedTouches || [] },
    });
    document.dispatchEvent(e);
    return e.defaultPrevented;
  }
  function tap(time, { x = 100, y = 200, target = blank, duration = 40 } = {}) {
    const point = { identifier: 1, clientX: x, clientY: y };
    const start = event('touchstart', time, { target, touches: [point], changedTouches: [point] });
    const end = event('touchend', time + duration, { target, changedTouches: [point] });
    return { start, end };
  }
  return { event, tap, blank, control };
}

test('installed app cancels the second nearby blank-area tap before native zoom', () => {
  const app = setup();
  assert.deepEqual(app.tap(1000), { start: false, end: false });
  assert.deepEqual(app.tap(1170, { x: 105, y: 204 }), { start: false, end: true });
});

test('display-mode standalone also enables the protection', () => {
  const app = setup({ standalone: false, installed: true });
  app.tap(1000);
  assert.equal(app.tap(1150).end, true);
});

test('ordinary browser tabs keep native touch behavior', () => {
  const app = setup({ standalone: false });
  app.tap(1000);
  assert.equal(app.tap(1150).end, false);
});

test('separate taps and taps far apart remain untouched', () => {
  const app = setup();
  app.tap(1000);
  assert.equal(app.tap(1600).end, false);
  assert.equal(app.tap(1750, { x: 250 }).end, false);
});

for (const tag of ['a', 'button', 'input', 'select', 'textarea', 'label', 'summary', '[role="button"]', '[role="link"]', '[contenteditable]:not([contenteditable="false"])']) {
  test(`repeated taps on ${tag} and its children remain available`, () => {
    const app = setup();
    const target = app.control(tag);
    assert.equal(app.tap(1000, { target }).end, false);
    assert.equal(app.tap(1150, { target }).end, false);
    // A control tap must not become the first half of a blank-area double tap.
    assert.equal(app.tap(1300).end, false);
  });
}

test('scrolling does not become a tap or cancel native scrolling', () => {
  const app = setup();
  app.tap(1000);
  const point = { identifier: 1, clientX: 100, clientY: 200 };
  app.event('touchstart', 1100, { touches: [point] });
  const moved = { ...point, clientY: 260 };
  assert.equal(app.event('touchmove', 1120, { touches: [moved] }), false);
  assert.equal(app.event('touchend', 1140, { changedTouches: [moved] }), false);
  assert.equal(app.tap(1200).end, false);
});

test('pinching and lifting fingers separately never cancels zoom', () => {
  const app = setup();
  app.tap(1000);
  const first = { identifier: 1, clientX: 100, clientY: 200 };
  const second = { identifier: 2, clientX: 200, clientY: 200 };
  app.event('touchstart', 1100, { touches: [first] });
  assert.equal(app.event('touchstart', 1110, { touches: [first, second] }), false);
  assert.equal(app.event('touchmove', 1120, { touches: [first, second] }), false);
  assert.equal(app.event('touchend', 1140, { touches: [first], changedTouches: [second] }), false);
  assert.equal(app.event('touchend', 1150, { changedTouches: [first] }), false);
  assert.equal(app.tap(1200).end, false);
});

test('long presses and cancelled touches do not count as taps', () => {
  const app = setup();
  app.tap(1000);
  assert.equal(app.tap(1100, { duration: 600 }).end, false);
  assert.equal(app.tap(1800).end, false);
  app.event('touchcancel', 1850);
  assert.equal(app.tap(1900).end, false);
});

test('all entry points load the same offline-cached touch protection', () => {
  for (const name of ['fukuoka-golf.html', 'fukuoka-golf-v2.html', 'fukuoka-golf-en.html']) {
    const html = fs.readFileSync(new URL(name, root), 'utf8');
    assert.ok(/<script src="touch-gestures\.js\?v=\d{8}-\d+"><\/script>/.test(html), name);
  }
  assert.match(fs.readFileSync(new URL('service-worker.js', root), 'utf8'), /'\.\/touch-gestures\.js'/);
});
