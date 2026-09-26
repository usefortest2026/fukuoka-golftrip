import assert from 'node:assert/strict';
import fs from 'node:fs';

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
    pageErrors.push(message.params.exceptionDetails.text);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setViewport(width) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

async function navigate(file) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=more` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  await evaluate(`document.querySelectorAll('#more .seg')[1].click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function inspect(file, width) {
  await setViewport(width);
  await navigate(file);
  return evaluate(`(() => {
    const languageButton = document.querySelector('.lang-switch');
    const languageStyle = getComputedStyle(languageButton);
    const languageHitArea = getComputedStyle(languageButton, '::before');
    const title = document.querySelector('.hero h1');
    const heroInner = document.querySelector('.hero-inner');
    const heroInnerBox = heroInner.getBoundingClientRect();
    const heroInnerStyle = getComputedStyle(heroInner);
    const languageBox = languageButton.getBoundingClientRect();
    const moreSubtitle = document.querySelector('#more > .day-head > p');
    const heroMetaItems = [...document.querySelectorAll('.hero-meta > span:nth-child(odd)')];
    const hotelsHeading = document.querySelector('#hotels .section-label');
    const distance = document.querySelector('#hotels .hotel-distance');
    const distanceStyle = distance && getComputedStyle(distance);
    const hotels = [...document.querySelectorAll('#hotels .hotel')].map((hotel) => {
      const row = hotel.querySelector('.v2-hotel-map-actions');
      const links = row ? [...row.querySelectorAll(':scope > a')] : [];
      const official = links[0];
      const map = links[1];
      const rowStyle = row && getComputedStyle(row);
      const mapStyle = map && getComputedStyle(map);
      const mapArrow = map && getComputedStyle(map, '::after');
      const officialBox = official && official.getBoundingClientRect();
      const mapBox = map && map.getBoundingClientRect();
      return {
        linkCount: links.length,
        rowDisplay: rowStyle?.display,
        rowJustify: rowStyle?.justifyContent,
        rowWrap: rowStyle?.flexWrap,
        officialText: official?.textContent.trim(),
        mapText: map?.textContent.trim(),
        mapBackground: mapStyle?.backgroundColor,
        mapColor: mapStyle?.color,
        mapBorderWidth: mapStyle?.borderWidth,
        mapMinHeight: mapStyle?.minHeight,
        mapArrow: mapArrow?.content,
        officialTop: officialBox?.top,
        mapTop: mapBox?.top,
        sameLine: Boolean(officialBox && mapBox && Math.abs(officialBox.top - mapBox.top) < 2),
        mapOnRight: Boolean(officialBox && mapBox && mapBox.left > officialBox.left),
      };
    });
    return {
      language: {
        width: languageStyle.width,
        height: languageStyle.height,
        tapTop: languageHitArea.top,
        tapRight: languageHitArea.right,
        tapBottom: languageHitArea.bottom,
        tapLeft: languageHitArea.left,
        overlapsHeaderContent:
          languageBox.left < heroInnerBox.right - parseFloat(heroInnerStyle.paddingRight),
        titleClientWidth: title.clientWidth,
        titleScrollWidth: title.scrollWidth,
      },
      hotels,
      distance: distance && {
        text: distance.textContent.trim(),
        fontSize: distanceStyle.fontSize,
      },
      hotelsHeading: hotelsHeading?.textContent.trim(),
      moreSubtitle: moreSubtitle?.textContent.trim() || null,
      heroMetaItemCount: heroMetaItems.length,
      heroCalendarCount: document.querySelectorAll('.hero-meta .fa-calendar-days').length,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
}

async function inspectQuickInfo(file, width) {
  await setViewport(width);
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=day2` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return evaluate(`(() => {
    const action = document.querySelector('#day2 .v2-quick-action .v2-nav-button');
    return {
    heading: document.querySelector('#day2 .v2-golf-quick .v2-block-head h3').textContent.trim(),
    labels: [...document.querySelectorAll('#day2 .v2-quick-grid dt')].map((label) => {
      const style = getComputedStyle(label);
      return {
        text: label.textContent.trim(),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    }),
    actionTrailingContent: getComputedStyle(action, '::after').content,
    pageOverflow: document.documentElement.scrollWidth > innerWidth,
  }})()`);
}

async function inspectDayFourPaceNote(file, width) {
  await setViewport(width);
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=day4` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return evaluate(`(() => {
    const note = document.querySelector('#day4 .v2-pace-note');
    const style = note && getComputedStyle(note);
    return {
      boxedNoteCount: [...document.querySelectorAll('#day4 .course-info .info-cell b')]
        .filter((label) => ['注意', 'Note'].includes(label.textContent.trim())).length,
      note: note && {
        text: note.textContent.trim(),
        background: style.backgroundColor,
        borderWidth: style.borderWidth,
      },
    };
  })()`);
}

async function inspectRestaurantMapButton(file, width) {
  await setViewport(width);
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=day3` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  return evaluate(`(() => {
    const button = document.querySelector('#day3 .contact-actions .v2-nav-button');
    return {
      text: button.textContent.trim(),
      trailingContent: getComputedStyle(button, '::after').content,
    };
  })()`);
}

async function inspectPrivateInfoForm(file, width) {
  await setViewport(width);
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=day2` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  const closedLabel = await evaluate(`document.querySelector('#day2 .private-info-toggle').textContent.trim()`);
  await evaluate(`document.querySelector('#day2 .private-info-toggle').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return evaluate(`(() => {
    const input = document.querySelector('#day2 .private-info-form input');
    const inputBox = input.getBoundingClientRect();
    return {
      closedLabel: ${JSON.stringify(closedLabel)},
      openLabel: document.querySelector('#day2 .private-info-toggle').textContent.trim(),
      inputFontSize: getComputedStyle(input).fontSize,
      inputFocused: document.activeElement === input,
      inputWithinViewport: inputBox.left >= 0 && inputBox.right <= innerWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const [file, labels, distanceText, hotelsHeading, moreSubtitle] of [
  ['fukuoka-golf.html', ['官方網站', 'Google Maps 導航'], '兩間飯店之間約 6 分鐘車程。', '住宿飯店', null],
  ['fukuoka-golf-en.html', ['Official website', 'Open in Google Maps'], 'The two hotels are about 6 minutes apart by car.', 'Confirmed Hotels', null],
]) {
  for (const width of [320, 390]) {
    const result = await inspect(file, width);
    const { titleClientWidth, titleScrollWidth, ...language } = result.language;
    assert.deepEqual(language, {
      width: '48px',
      height: '32px',
      tapTop: '-6px',
      tapRight: '0px',
      tapBottom: '-6px',
      tapLeft: '0px',
      overlapsHeaderContent: false,
    });
    assert.equal(
      titleScrollWidth <= titleClientWidth,
      true,
      `${file} at ${width}px truncates the title (${titleScrollWidth}px > ${titleClientWidth}px)`,
    );
    assert.equal(result.hotels.length, 2);
    assert.equal(result.hotelsHeading, hotelsHeading);
    assert.equal(result.moreSubtitle, moreSubtitle);
    assert.equal(result.heroMetaItemCount, 2, `${file} should not show a trip-duration item in the header`);
    assert.equal(result.heroCalendarCount, 0, `${file} should not show the header calendar icon`);
    assert.deepEqual(result.distance, { text: distanceText, fontSize: '13px' });
    assert.equal(result.pageOverflow, false);
    for (const hotel of result.hotels) {
      assert.equal(hotel.linkCount, 2);
      assert.equal(hotel.rowDisplay, 'flex');
      assert.equal(hotel.rowJustify, 'space-between');
      assert.equal(hotel.rowWrap, 'nowrap');
      assert.equal(hotel.officialText, labels[0]);
      assert.equal(hotel.mapText, labels[1]);
      assert.equal(hotel.mapBackground, 'rgba(0, 0, 0, 0)');
      assert.equal(hotel.mapColor, 'rgb(36, 100, 61)');
      assert.equal(hotel.mapBorderWidth, '0px');
      assert.equal(hotel.mapMinHeight, '44px');
      assert.equal(hotel.mapArrow, 'none');
      assert.equal(hotel.sameLine, true, JSON.stringify(hotel));
      assert.equal(hotel.mapOnRight, true);
    }
    if (width === 390) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const locale = file.includes('-en') ? 'en' : 'zh';
      fs.writeFileSync(`/private/tmp/fukuoka-hotel-controls-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
    }
  }
}

for (const [file, label] of [
  ['fukuoka-golf.html', 'Google Maps 導航'],
  ['fukuoka-golf-en.html', 'Open in Google Maps'],
]) {
  assert.deepEqual(await inspectRestaurantMapButton(file, 390), {
    text: label,
    trailingContent: 'none',
  });
}

for (const [file, closedLabel, openLabel] of [
  ['fukuoka-golf.html', '密碼', '關閉'],
  ['fukuoka-golf-en.html', 'Password', 'Close'],
]) {
  assert.deepEqual(await inspectPrivateInfoForm(file, 430), {
    closedLabel,
    openLabel,
    inputFontSize: '16px',
    inputFocused: true,
    inputWithinViewport: true,
    pageOverflow: false,
  });
}

for (const [file, expectedHeading, expectedLabels] of [
  ['fukuoka-golf.html', '高爾夫當日重點', ['飯店出發', 'Tee Time', '服裝重點']],
  ['fukuoka-golf-en.html', 'Golf Day Quick Info', ['Hotel departure', 'Tee Time', 'Dress highlight']],
]) {
  const result = await inspectQuickInfo(file, 390);
  assert.equal(result.pageOverflow, false);
  assert.equal(result.actionTrailingContent, 'none');
  assert.equal(result.heading, expectedHeading);
  assert.deepEqual(
    result.labels,
    expectedLabels.map((text) => ({ text, fontSize: '14px', fontWeight: '800' })),
  );
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const locale = file.includes('-en') ? 'en' : 'zh';
  fs.writeFileSync(`/private/tmp/fukuoka-quick-type-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
}

for (const [file, noteText] of [
  ['fukuoka-golf.html', '節奏提醒：半場目標 2 小時 15 分'],
  ['fukuoka-golf-en.html', 'Pace reminder: target 2 hr 15 min per nine holes'],
]) {
  const result = await inspectDayFourPaceNote(file, 390);
  assert.equal(result.boxedNoteCount, 0);
  assert.deepEqual(result.note, {
    text: noteText,
    background: 'rgba(0, 0, 0, 0)',
    borderWidth: '0px',
  });
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const locale = file.includes('-en') ? 'en' : 'zh';
  fs.writeFileSync(`/private/tmp/fukuoka-d4-pace-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
}

assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`);
console.log('hotel controls browser test passed');
socket.close();
