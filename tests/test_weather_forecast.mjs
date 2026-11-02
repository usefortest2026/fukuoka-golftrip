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
const JMA_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/400000.json';

async function renderForecast(htmlFile, localeFile, daily, jma = null) {
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
    attributes: {},
    querySelector: (selector) => nodes[selector],
    getAttribute(name) {
      if (name === 'data-weather-updated') return this.dataset.weatherUpdated || null;
      return this.attributes[name] || null;
    },
    setAttribute(name, value) {
      if (name === 'data-weather-updated') this.dataset.weatherUpdated = value;
      else this.attributes[name] = value;
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
  let jmaUrl = '';
  const context = vm.createContext({
    Date: FixedDate,
    document: {
      querySelector: (selector) => selector.includes('2026-11-06') ? weather : null,
      querySelectorAll: () => [weather],
    },
    fetch: async (url) => {
      if (String(url).includes('jma.go.jp')) {
        jmaUrl = url;
        return jma ? { ok: true, json: async () => jma } : { ok: false, json: async () => null };
      }
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
  return { weather, nodes, requestUrl, jmaUrl };
}

function openMeteoDay({ code, max, min, pop }) {
  return {
    time: ['2026-11-06'],
    weather_code: [code],
    temperature_2m_max: [max],
    temperature_2m_min: [min],
    precipitation_probability_max: [pop],
  };
}

// Mirrors the shape of JMA's 400000.json: [short-term forecast, weekly forecast].
// Decoy areas come first so the script must select Fukuoka region/station by code.
function jmaForecast({ nearReport = '2026-11-05T17:00:00+09:00', nearCodes = [], nearPops = [], nearTemps = [], weeklyDays = [] } = {}) {
  const decoy = (code, key, values) => ({ area: { name: 'decoy', code }, [key]: values.map(() => '999') });
  const weeklyTimes = weeklyDays.map((day) => `${day.date}T00:00:00+09:00`);
  return [
    {
      reportDatetime: nearReport,
      timeSeries: [
        {
          timeDefines: nearCodes.map(([time]) => time),
          areas: [decoy('400020', 'weatherCodes', nearCodes), { area: { name: '福岡地方', code: '400010' }, weatherCodes: nearCodes.map(([, code]) => code) }],
        },
        {
          timeDefines: nearPops.map(([time]) => time),
          areas: [decoy('400020', 'pops', nearPops), { area: { name: '福岡地方', code: '400010' }, pops: nearPops.map(([, pop]) => pop) }],
        },
        {
          timeDefines: nearTemps.map(([time]) => time),
          areas: [decoy('82056', 'temps', nearTemps), { area: { name: '福岡', code: '82182' }, temps: nearTemps.map(([, temp]) => temp) }],
        },
      ],
    },
    {
      reportDatetime: '2026-11-02T17:00:00+09:00',
      timeSeries: [
        {
          timeDefines: weeklyTimes,
          areas: [{ area: { name: '福岡県', code: '400000' }, weatherCodes: weeklyDays.map((day) => day.code ?? ''), pops: weeklyDays.map((day) => day.pop ?? '') }],
        },
        {
          timeDefines: weeklyTimes,
          areas: [decoy('82056', 'tempsMax', weeklyDays), { area: { name: '福岡', code: '82182' }, tempsMax: weeklyDays.map((day) => day.max ?? ''), tempsMin: weeklyDays.map((day) => day.min ?? '') }],
        },
      ],
    },
  ];
}

for (const [html, locale] of entries) {
  const english = html.includes('-en');

  test(`${html}: temperatures and rain probability refresh together`, async () => {
    const { weather, nodes, requestUrl, jmaUrl } = await renderForecast(html, locale, {
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
    assert.equal(jmaUrl, JMA_URL);
    assert.equal(weather.getAttribute('title'), english ? 'Fukuoka forecast · Open-Meteo' : '福岡市預報 · Open-Meteo');
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
    assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), english ? 'Heavy thunderstorm' : '強雷雨');
  });

  test(`${html}: JMA official forecast takes priority over Open-Meteo`, async () => {
    const { weather, nodes } = await renderForecast(
      html,
      locale,
      openMeteoDay({ code: 55, max: 17.9, min: 13.6, pop: 57 }),
      jmaForecast({ weeklyDays: [{ date: '2026-11-06', code: '101', pop: '20', max: '21', min: '14' }] }),
    );
    assert.equal(nodes['.wx-hi'].textContent, '21°');
    assert.equal(nodes['.wx-lo'].textContent, '14°');
    assert.equal(nodes['.wx-icon'].className, 'wx-icon fa-solid fa-cloud-sun');
    assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), english ? 'Sunny with some clouds' : '晴時多雲');
    assert.equal(nodes['.wx-rain-value'].textContent, '20%');
    assert.equal(nodes['.wx-rain'].getAttribute('aria-label'), english ? 'Chance of rain: 20%' : '當日降雨機率 20%');
    assert.equal(weather.getAttribute('title'), english ? 'Fukuoka forecast · JMA' : '福岡市預報 · 日本氣象廳');
    assert.equal(weather.classList.contains('wx-live'), true);
  });

  test(`${html}: JMA short-term forecast overrides weekly and skips a minimum that has already passed`, async () => {
    const { weather, nodes } = await renderForecast(
      html,
      locale,
      openMeteoDay({ code: 0, max: 18, min: 12, pop: 5 }),
      jmaForecast({
        nearReport: '2026-11-06T11:00:00+09:00',
        nearCodes: [['2026-11-06T11:00:00+09:00', '202'], ['2026-11-07T00:00:00+09:00', '100']],
        nearPops: [['2026-11-06T12:00:00+09:00', '30'], ['2026-11-06T18:00:00+09:00', '60'], ['2026-11-07T00:00:00+09:00', '90']],
        nearTemps: [['2026-11-06T00:00:00+09:00', '19'], ['2026-11-06T09:00:00+09:00', '20']],
        weeklyDays: [{ date: '2026-11-06', code: '100', pop: '10', max: '25', min: '' }],
      }),
    );
    assert.equal(nodes['.wx-hi'].textContent, '20°');
    assert.equal(nodes['.wx-lo'].textContent, '12°');
    assert.equal(nodes['.wx-icon'].className, 'wx-icon fa-solid fa-cloud-rain');
    assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), english ? 'Cloudy, chance of rain' : '陰，有時雨');
    assert.equal(nodes['.wx-rain-value'].textContent, '60%');
    assert.equal(nodes['.wx-rain'].getAttribute('aria-label'), english ? 'Daily maximum chance of rain: 60%' : '當日最高降雨機率 60%');
    assert.equal(weather.getAttribute('title'), english ? 'Fukuoka forecast · JMA, Open-Meteo' : '福岡市預報 · 日本氣象廳、Open-Meteo');
  });

  test(`${html}: dates outside the JMA forecast fall back to Open-Meteo`, async () => {
    const { weather, nodes } = await renderForecast(
      html,
      locale,
      openMeteoDay({ code: 3, max: 16.4, min: 9.2, pop: 10 }),
      jmaForecast({ weeklyDays: [{ date: '2026-11-09', code: '100', pop: '0', max: '18', min: '12' }] }),
    );
    assert.equal(nodes['.wx-hi'].textContent, '16°');
    assert.equal(nodes['.wx-lo'].textContent, '9°');
    assert.equal(nodes['.wx-icon'].className, 'wx-icon fa-solid fa-cloud');
    assert.equal(nodes['.wx-rain-value'].textContent, '10%');
    assert.equal(weather.getAttribute('title'), english ? 'Fukuoka forecast · Open-Meteo' : '福岡市預報 · Open-Meteo');
  });

  test(`${html}: JMA weather codes map to matching icons and descriptions`, async () => {
    const cases = [
      ['100', 'fa-sun', 'Sunny', '晴天'],
      ['200', 'fa-cloud', 'Cloudy', '陰天'],
      ['201', 'fa-cloud-sun', 'Cloudy with sunny spells', '多雲時晴'],
      ['102', 'fa-cloud-sun-rain', 'Sunny, chance of rain', '晴，有時雨'],
      ['203', 'fa-cloud-rain', 'Cloudy, chance of rain', '陰，有時雨'],
      ['300', 'fa-cloud-rain', 'Rain', '雨天'],
      ['306', 'fa-cloud-showers-heavy', 'Heavy rain', '大雨'],
      ['240', 'fa-cloud-bolt', 'Cloudy, chance of thunderstorms', '陰，可能有雷雨'],
    ];
    for (const [code, icon, en, zh] of cases) {
      const { nodes } = await renderForecast(
        html,
        locale,
        openMeteoDay({ code: 0, max: 18, min: 12, pop: 5 }),
        jmaForecast({ weeklyDays: [{ date: '2026-11-06', code, pop: '20', max: '21', min: '14' }] }),
      );
      assert.equal(nodes['.wx-icon'].className, `wx-icon fa-solid ${icon}`, `JMA code ${code}`);
      assert.equal(nodes['.wx-icon'].getAttribute('aria-label'), english ? en : zh, `JMA code ${code}`);
    }
  });
}
