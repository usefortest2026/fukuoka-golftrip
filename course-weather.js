(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FukuokaCourseWeather = api;
    api.mount(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var COURSES = [
    { day: 'day2', date: '2026-11-07', lat: 33.649745, lon: 130.493236, start: 11, end: 16 },
    { day: 'day4', date: '2026-11-09', lat: 33.513042, lon: 130.541229, start: 10, end: 16 },
    { day: 'day5', date: '2026-11-10', lat: 33.424437, lon: 130.698915, start: 10, end: 16 }
  ];
  var MAX_CACHE_AGE = 86400000;
  var REFRESH_AFTER = 1800000;
  var COPY = {
    zh: { title: '球場天氣', window: '預估打球時段', zone: '日本時間', temperature: '氣溫', rain: '最高降雨機率', wind: '風速', source: '球場周邊 · Open-Meteo', hourly: '逐時預報', time: '時間', rainColumn: '降雨機率', loading: '正在更新球場預報…', unavailable: '暫時無法取得球場預報，請稍後重試。', cached: '更新失敗，暫用上次預報', partial: '部分時段資料不足，以 — 表示。', updated: '讀取時間', retry: '重新整理' },
    en: { title: 'Course weather', window: 'Estimated playing hours', zone: 'Japan time', temperature: 'Temperature', rain: 'Max rain chance', wind: 'Wind', source: 'Near the course · Open-Meteo', hourly: 'Hourly forecast', time: 'Time', rainColumn: 'Rain chance', loading: 'Updating course forecast…', unavailable: 'Course forecast is unavailable. Please try again later.', cached: 'Update failed; showing the previous forecast', partial: 'Some hours are unavailable, shown as —.', updated: 'Retrieved', retry: 'Refresh' }
  };

  function number(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  }
  function pad(hour) { return String(hour).padStart(2, '0'); }
  function selectHours(payload, course) {
    var hourly = payload && payload.hourly || {};
    var times = Array.isArray(hourly.time) ? hourly.time : [];
    var rows = [];
    for (var hour = course.start; hour <= course.end; hour++) {
      var time = pad(hour) + ':00';
      var index = times.indexOf(course.date + 'T' + time);
      function value(key, min, max) { return number((hourly[key] || [])[index], min, max); }
      rows.push({ time: time, temperature: value('temperature_2m', -80, 60), rain: value('precipitation_probability', 0, 100), wind: value('wind_speed_10m', 0, 150) });
    }
    return rows;
  }
  function summarize(hours) {
    if (!hours.some(function (row) { return row.temperature !== null || row.rain !== null || row.wind !== null; })) return null;
    function range(key) {
      var values = hours.map(function (row) { return row[key]; });
      if (!values.length || values.some(function (v) { return v === null; })) return null;
      return [Math.min.apply(null, values), Math.max.apply(null, values)];
    }
    var temperature = range('temperature'), rain = range('rain'), wind = range('wind');
    return { temperature: temperature, rain: rain && rain[1], wind: wind, partial: !temperature || !rain || !wind };
  }
  function requestUrl(course) {
    var url = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({ latitude: course.lat, longitude: course.lon, hourly: 'temperature_2m,precipitation_probability,wind_speed_10m', timezone: 'Asia/Tokyo', wind_speed_unit: 'ms', start_date: course.date, end_date: course.date }).forEach(function (entry) { url.searchParams.set(entry[0], entry[1]); });
    return url.href;
  }
  function signature(course) { return [course.date, course.lat, course.lon, course.start, course.end].join(':'); }
  function validPayload(payload, course) {
    var units = payload && payload.hourly_units;
    return Boolean(payload && number(payload.latitude, -90, 90) !== null && number(payload.longitude, -180, 180) !== null && Math.abs(payload.latitude - course.lat) < 0.15 && Math.abs(payload.longitude - course.lon) < 0.15 && payload.timezone === 'Asia/Tokyo' && payload.utc_offset_seconds === 32400 && units && units.temperature_2m === '°C' && units.precipitation_probability === '%' && units.wind_speed_10m === 'm/s' && summarize(selectHours(payload, course)));
  }
  async function loadForecast(course, options) {
    var now = options.now === undefined ? Date.now() : options.now;
    var key = 'fukuoka-course-weather-v1:' + signature(course);
    var controller = new AbortController();
    var timer;
    try {
      var request = (async function () {
        var response = await options.fetch(requestUrl(course), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Forecast unavailable');
        var payload = await response.json();
        if (!validPayload(payload, course)) throw new Error('Invalid forecast');
        return payload;
      })();
      var timeout = new Promise(function (_, reject) {
        timer = setTimeout(function () { controller.abort(); reject(new Error('Forecast timed out')); }, options.timeoutMs === undefined ? 8000 : options.timeoutMs);
      });
      var payload = await Promise.race([request, timeout]);
      var hours = selectHours(payload, course), summary = summarize(hours);
      if (!summary.partial) {
        try { options.storage.setItem(key, JSON.stringify({ course: course, updatedAt: now, payload: payload })); } catch (_) { /* Private browsing may disable storage. */ }
      }
      return { state: 'fresh', updatedAt: now, hours: hours, summary: summary };
    } catch (_) {
      try {
        var saved = JSON.parse(options.storage.getItem(key));
        if (saved && saved.course && signature(saved.course) === signature(course) && typeof saved.updatedAt === 'number' && saved.updatedAt <= now && now - saved.updatedAt <= MAX_CACHE_AGE && validPayload(saved.payload, course)) {
          var cachedHours = selectHours(saved.payload, course), cachedSummary = summarize(cachedHours);
          if (!cachedSummary.partial) return { state: 'cached', updatedAt: saved.updatedAt, hours: cachedHours, summary: cachedSummary };
        }
      } catch (_) { /* Invalid or inaccessible cache is equivalent to no data. */ }
      return { state: 'unavailable' };
    } finally { clearTimeout(timer); }
  }
  function formatRange(values) {
    if (!values) return '—';
    var low = Math.round(values[0]), high = Math.round(values[1]);
    return low === high ? String(low) : low + '–' + high;
  }
  function formatTime(timestamp) {
    return new Date(timestamp + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  }
  function mount(doc) {
    if (!doc || !root.fetch) return;
    var copy = COPY[doc.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh'];
    var storage;
    try { storage = root.localStorage; } catch (_) { storage = null; }
    COURSES.forEach(function (course) {
      var info = doc.querySelector('#' + course.day + ' .course-info');
      if (!info || doc.querySelector('#course-weather-' + course.day)) return;
      var panel = doc.createElement('details');
      panel.className = 'v2-accordion course-weather';
      panel.id = 'course-weather-' + course.day;
      var heading = doc.createElement('summary');
      heading.textContent = copy.title;
      panel.appendChild(heading);
      var body = doc.createElement('div');
      body.className = 'v2-accordion-content cw-body';
      body.innerHTML = '<div class="cw-heading"><h3></h3><span></span></div><dl class="cw-metrics"></dl><p class="cw-status" role="status"></p><div class="cw-foot"><span></span><time></time></div><div class="cw-hourly"><table><caption></caption><thead><tr></tr></thead><tbody></tbody></table></div><button type="button" class="cw-refresh"></button>';
      body.querySelector('h3').textContent = copy.window;
      body.querySelector('.cw-heading > span').textContent = pad(course.start) + ':00–' + pad(course.end) + ':00 · ' + copy.zone;
      body.querySelector('.cw-foot > span').textContent = copy.source;
      body.querySelector('caption').textContent = copy.hourly;
      [copy.time, copy.temperature, copy.rainColumn, copy.wind].forEach(function (label) {
        var th = doc.createElement('th'); th.scope = 'col'; th.textContent = label; body.querySelector('thead tr').appendChild(th);
      });
      var status = body.querySelector('.cw-status'), refreshButton = body.querySelector('.cw-refresh');
      refreshButton.textContent = copy.retry;
      var valueNodes = {};
      [['temperature', copy.temperature, 'fa-temperature-half', '°C'], ['rain', copy.rain, 'fa-droplet', '%'], ['wind', copy.wind, 'fa-wind', 'm/s']].forEach(function (metric) {
        var cell = doc.createElement('div');
        cell.className = 'cw-metric';
        cell.innerHTML = '<dt><i class="fa-solid ' + metric[2] + '" aria-hidden="true"></i><span></span></dt><dd><b>—</b><small></small></dd>';
        cell.querySelector('dt span').textContent = metric[1]; cell.querySelector('small').textContent = metric[3];
        valueNodes[metric[0]] = cell.querySelector('b'); body.querySelector('dl').appendChild(cell);
      });
      panel.appendChild(body);
      info.insertAdjacentElement('afterend', panel);
      var pending = false, lastAttempt = 0, expiresAt = 0, expiryTimer;
      function show(result) {
        clearTimeout(expiryTimer);
        expiresAt = result.summary ? result.updatedAt + MAX_CACHE_AGE : 0;
        if (expiresAt) expiryTimer = setTimeout(expire, Math.max(1, expiresAt - Date.now() + 1));
        panel.dataset.weatherState = result.state;
        body.querySelector('.cw-metrics').hidden = !result.summary;
        body.querySelector('.cw-hourly').hidden = !result.summary;
        body.querySelector('.cw-foot').hidden = !result.summary;
        refreshButton.hidden = result.state === 'loading';
        status.textContent = result.state === 'loading' ? copy.loading : result.state === 'unavailable' ? copy.unavailable : result.state === 'cached' ? copy.cached : result.summary.partial ? copy.partial : '';
        status.hidden = !status.textContent;
        if (!result.summary) return;
        valueNodes.temperature.textContent = formatRange(result.summary.temperature);
        valueNodes.rain.textContent = result.summary.rain === null ? '—' : String(Math.round(result.summary.rain));
        valueNodes.wind.textContent = formatRange(result.summary.wind);
        var time = body.querySelector('.cw-foot time');
        time.dateTime = new Date(result.updatedAt).toISOString();
        time.textContent = copy.updated + ' ' + formatTime(result.updatedAt) + ' · ' + copy.zone;
        var tableBody = body.querySelector('tbody'); tableBody.replaceChildren();
        result.hours.forEach(function (hour) {
          var row = doc.createElement('tr');
          [hour.time, hour.temperature === null ? '—' : Math.round(hour.temperature) + '°C', hour.rain === null ? '—' : Math.round(hour.rain) + '%', hour.wind === null ? '—' : Math.round(hour.wind) + ' m/s'].forEach(function (value) {
            var cell = doc.createElement('td'); cell.textContent = value; row.appendChild(cell);
          });
          tableBody.appendChild(row);
        });
      }
      function expire() {
        if (!expiresAt || Date.now() <= expiresAt) return false;
        show({ state: 'unavailable' });
        refresh();
        return true;
      }
      async function refresh() {
        if (pending) return;
        pending = true; lastAttempt = Date.now(); refreshButton.disabled = true;
        if (!panel.dataset.weatherState) show({ state: 'loading' });
        try { show(await loadForecast(course, { fetch: root.fetch.bind(root), storage: storage })); }
        finally { pending = false; refreshButton.disabled = false; }
      }
      refreshButton.addEventListener('click', refresh);
      panel.addEventListener('toggle', function () { if (panel.open && !expire() && Date.now() - lastAttempt > REFRESH_AFTER) refresh(); });
      root.addEventListener('online', refresh);
      doc.addEventListener('visibilitychange', function () { if (!doc.hidden && !expire() && Date.now() - lastAttempt > REFRESH_AFTER) refresh(); });
      refresh();
    });
  }
  return { selectHours: selectHours, summarize: summarize, requestUrl: requestUrl, loadForecast: loadForecast, mount: mount };
});
