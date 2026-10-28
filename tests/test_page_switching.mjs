import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const navigation = require('../trip-day-router.js');

function element(active = false) {
  const classes = new Set(active ? ['active'] : []);
  return { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } };
}

function scrollArea() {
  // Native momentum is a browser release check: press PageDown on D2, then immediately
  // select D3 and verify scrollTop stays zero. This unit fixture models smooth-scroll timing only.
  return {
    style: { overflowY: 'auto', display: 'flex' },
    scrollTop: 640,
    scrollTo(options) {
      // Native smooth scrolling completes later, after the new day has appeared.
      if (options.behavior !== 'smooth') this.scrollTop = options.top;
    },
  };
}

test('navigation resets the position and preserves a usable scroll container', () => {
  assert.equal(typeof navigation.resetScroll, 'function');
  const app = scrollArea();
  const view = {};
  navigation.resetScroll(app, view);
  assert.equal(app.scrollTop, 0);
  assert.equal(app.style.overflowY, 'auto');
  assert.equal(app.style.display, 'flex');
});

test('rapid day changes restore the original overflow setting', () => {
  assert.equal(typeof navigation.resetScroll, 'function');
  const app = scrollArea();
  app.style.overflowY = '';
  const view = {};
  navigation.resetScroll(app, view);
  navigation.resetScroll(app, view);
  assert.equal(app.scrollTop, 0);
  assert.equal(app.style.overflowY, '');
  assert.equal(app.style.display, 'flex');
});

for (const filename of ['fukuoka-golf.html', 'fukuoka-golf-v2.html', 'fukuoka-golf-en.html']) {
  for (const [label, reducedMotion, hasApp] of [['normal motion', false, true], ['reduced motion', true, true], ['window fallback', false, false]]) {
    test(`${filename}: switching D2 to D3 starts at the top immediately (${label})`, () => {
      const html = fs.readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
      const source = html.match(/function switchPage\([\s\S]+?(?=function switchSub\()/)[0];
      const pages = { day2: element(true), day3: element() };
      const tabs = [element(true), element()];
      const app = scrollArea();
      const window = Object.assign(scrollArea(), {
        matchMedia: () => ({ matches: reducedMotion }),
        FukuokaTripDay: navigation,
      });
      const context = vm.createContext({
        window,
        document: {
          querySelector: () => hasApp ? app : null,
          querySelectorAll: (selector) => selector === '.page' ? Object.values(pages) : tabs,
          getElementById: (id) => pages[id],
        },
      });
      vm.runInContext(source, context);
      context.switchPage('day3', tabs[1]);
      assert.equal(pages.day2.classList.contains('active'), false);
      assert.equal(pages.day3.classList.contains('active'), true);
      assert.equal(tabs[1].classList.contains('active'), true);
      assert.equal((hasApp ? app : window).scrollTop, 0);
      assert.equal(app.style.overflowY, 'auto');
    });
  }
}
