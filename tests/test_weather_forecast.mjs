import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const entries = [
  ['fukuoka-golf.html', 'fukuoka-golf-v2.js', '預報'],
  ['fukuoka-golf-v2.html', 'fukuoka-golf-v2.js', '預報'],
  ['fukuoka-golf-en.html', 'fukuoka-golf-en-v2.js', 'Forecast'],
];

async function renderForecast(htmlFile, localeFile, daily) {
  const html = fs.readFileSync(new URL(htmlFile, root), 'utf8');
  const locale = fs.readFileSync(new URL(localeFile, root), 'utf8');
  const weatherScript = html.match(/\(function\(\)\{function wxIcon\(c\)\{[\s\S]+?\}\)\(\);/)[0];
  const labelStart = locale.indexOf("  document.querySelectorAll('.day-weather').forEach");
  const labelScript = locale.slice(labelStart, locale.lastIndexOf('\n})();'));
  const watchers = [];
  const classes = new Set();
  const nodes = {
    '.wx-icon': { className: 'wx-icon fa-solid fa-sun' },
    '.wx-hi': { textContent: '21°' },
    '.wx-lo': { textContent: '13°' },
    '.v2-weather-label': { textContent: 'Historical' },
  };
  const weather = {
    dataset: { date: '2026-11-06' },
    querySelector: (selector) => nodes[selector],
    getAttribute(name) {
      return name === 'data-weather-updated' ? this.dataset.weatherUpdated || null : null;
    },
    setAttribute(name, value) {
      if (name === 'data-weather-updated') this.dataset.weatherUpdated = value;
      watchers.forEach((notify) => notify());
    },
    classList: {
      contains: (name) => classes.has(name),
      add(name) {
        classes.add(name);
        watchers.forEach((notify) => notify());
      },
    },
  };
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-10-28T03:00:00.000Z']));
    }
    static now() { return Date.parse('2026-10-28T03:00:00.000Z'); }
  }
  const context = vm.createContext({
    Date: FixedDate,
    document: {
      querySelector: (selector) => selector.includes('2026-11-06') ? weather : null,
      querySelectorAll: () => [weather],
    },
    fetch: async () => ({ ok: true, json: async () => ({ daily }) }),
    MutationObserver: class {
      constructor(notify) { this.notify = notify; }
      observe() { watchers.push(this.notify); }
    },
  });
  vm.runInContext(weatherScript, context);
  vm.runInContext(labelScript, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { weather, nodes };
}

for (const [html, locale, forecastLabel] of entries) {
  test(`${html}: fetched temperatures are identified as a dated forecast`, async () => {
    const { weather, nodes } = await renderForecast(html, locale, {
      time: ['2026-11-06'],
      weather_code: [53],
      temperature_2m_max: [22.4],
      temperature_2m_min: [11.2],
    });
    assert.equal(nodes['.wx-hi'].textContent, '22°');
    assert.equal(nodes['.wx-lo'].textContent, '11°');
    assert.match(nodes['.wx-icon'].className, /fa-cloud-rain/);
    assert.ok(nodes['.v2-weather-label'].textContent.includes(forecastLabel));
    assert.ok(nodes['.v2-weather-label'].textContent.includes('10/28'));
    assert.equal(weather.dataset.weatherUpdated, '2026-10-28');
  });

  test(`${html}: missing forecast values do not replace temperatures with zero`, async () => {
    const { weather, nodes } = await renderForecast(html, locale, {
      time: ['2026-11-06'],
      weather_code: [null],
      temperature_2m_max: [null],
      temperature_2m_min: [null],
    });
    assert.equal(nodes['.wx-hi'].textContent, '21°');
    assert.equal(nodes['.wx-lo'].textContent, '13°');
    assert.equal(weather.classList.contains('wx-live'), false);
  });
}
