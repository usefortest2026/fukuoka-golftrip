import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const entries = [
  ['fukuoka-golf.html', 'fukuoka-golf-v2.js'],
  ['fukuoka-golf-v2.html', 'fukuoka-golf-v2.js'],
  ['fukuoka-golf-en.html', 'fukuoka-golf-en-v2.js'],
];

async function renderForecast(htmlFile, localeFile, daily) {
  const html = fs.readFileSync(new URL(htmlFile, root), 'utf8');
  const locale = fs.readFileSync(new URL(localeFile, root), 'utf8');
  const weatherScript = html.match(/\(function\(\)\{function wxIcon\(c\)\{[\s\S]+?\}\)\(\);/)[0];
  const labelStart = locale.indexOf("  document.querySelectorAll('.day-weather').forEach");
  const labelScript = labelStart >= 0 ? locale.slice(labelStart, locale.lastIndexOf('\n})();')) : '';
  const watchers = [];
  const classes = new Set();
  const nodes = {
    '.wx-icon': {
      className: 'wx-icon fa-solid fa-sun',
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] || null; },
    },
    '.wx-hi': { textContent: '21°' },
    '.wx-lo': { textContent: '13°' },
    '.wx-rain': {
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] || null; },
    },
    '.wx-rain-value': { textContent: '20%' },
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
  let requestUrl = '';
  const context = vm.createContext({
    Date: FixedDate,
    document: {
      querySelector: (selector) => selector.includes('2026-11-06') ? weather : null,
      querySelectorAll: () => [weather],
    },
    fetch: async (url) => {
      requestUrl = url;
      return { ok: true, json: async () => ({ daily }) };
    },
    MutationObserver: class {
      constructor(notify) { this.notify = notify; }
      observe() { watchers.push(this.notify); }
    },
  });
  vm.runInContext(weatherScript, context);
  vm.runInContext(labelScript, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { weather, nodes, requestUrl };
}

for (const [html, locale] of entries) {
  test(`${html}: temperatures and rain probability refresh together`, async () => {
    const { weather, nodes, requestUrl } = await renderForecast(html, locale, {
      time: ['2026-11-06'],
      weather_code: [53],
      temperature_2m_max: [22.4],
      temperature_2m_min: [11.2],
      precipitation_probability_max: [42.4],
    });
    assert.equal(nodes['.wx-hi'].textContent, '22°');
    assert.equal(nodes['.wx-lo'].textContent, '11°');
    assert.match(nodes['.wx-icon'].className, /fa-cloud-rain/);
    assert.equal(nodes['.wx-rain-value'].textContent, '42%');
    assert.ok(nodes['.wx-rain'].getAttribute('aria-label').includes('42%'));
    assert.ok(new URL(requestUrl).searchParams.get('daily').split(',').includes('precipitation_probability_max'));
    assert.equal(weather.dataset.weatherUpdated, '2026-10-28');
  });

  test(`${html}: zero percent is a valid rain probability`, async () => {
    const { nodes } = await renderForecast(html, locale, {
      time: ['2026-11-06'], weather_code: [0],
      temperature_2m_max: [20], temperature_2m_min: [11],
      precipitation_probability_max: [0],
    });
    assert.equal(nodes['.wx-rain-value'].textContent, '0%');
  });

  test(`${html}: unavailable or invalid rain probability is not displayed as zero`, async () => {
    for (const chance of [null, 150]) {
      const { nodes } = await renderForecast(html, locale, {
        time: ['2026-11-06'], weather_code: [3],
        temperature_2m_max: [20], temperature_2m_min: [11],
        precipitation_probability_max: [chance],
      });
      assert.equal(nodes['.wx-rain-value'].textContent, '—');
      assert.equal(nodes['.wx-hi'].textContent, '20°');
    }
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

  test(`${html}: drizzle and heavy rain have distinct icons and accessible hints`, async () => {
    const english = html.includes('-en');
    const cases = [
      [53, 'fa-cloud-rain', english ? 'Drizzle' : '毛毛雨'],
      [55, 'fa-cloud-rain', english ? 'Drizzle' : '毛毛雨'],
      [61, 'fa-cloud-rain', english ? 'Light rain' : '小雨'],
      [65, 'fa-cloud-showers-heavy', english ? 'Heavy rain' : '大雨'],
      [82, 'fa-cloud-showers-heavy', english ? 'Heavy showers' : '強陣雨'],
    ];
    for (const [code, icon, description] of cases) {
      const { nodes } = await renderForecast(html, locale, {
        time: ['2026-11-06'],
        weather_code: [code],
        temperature_2m_max: [20],
        temperature_2m_min: [11],
      });
      assert.equal(nodes['.wx-icon'].className, `wx-icon fa-solid ${icon}`, `weather code ${code}`);
      assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), description, `weather code ${code}`);
      assert.equal(nodes['.wx-icon'].getAttribute('title'), description, `weather code ${code}`);
      assert.equal(nodes['.wx-icon'].getAttribute('role'), 'img');
    }
  });

  test(`${html}: heavy thunderstorms retain a specific description`, async () => {
    const { nodes } = await renderForecast(html, locale, {
      time: ['2026-11-06'],
      weather_code: [97],
      temperature_2m_max: [20],
      temperature_2m_min: [11],
    });
    assert.match(nodes['.wx-icon'].className, /fa-cloud-bolt/);
    assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), html.includes('-en') ? 'Heavy thunderstorm' : '強雷雨');
  });
}
