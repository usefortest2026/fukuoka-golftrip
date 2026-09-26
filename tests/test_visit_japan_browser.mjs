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

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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

async function navigate(file, page) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=${page}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function inspect(file, page, scope) {
  await navigate(file, page);
  return evaluate(`(() => {
    const links = [...document.querySelectorAll('${scope} .v2-service-link')];
    const dayOneLink = '${page}' === 'day1' ? links[0] : null;
    const summaryHead = dayOneLink?.closest('.v2-summary .v2-block-head');
    const summaryTitle = summaryHead?.querySelector('h3');
    const icon = dayOneLink?.querySelector('i');
    const linkTitle = dayOneLink?.querySelector('strong');
    const linkDetail = dayOneLink?.querySelector('small');
    const linkBox = dayOneLink?.getBoundingClientRect();
    const summaryBox = dayOneLink?.closest('.v2-summary')?.getBoundingClientRect();
    const summaryHeadBox = summaryHead?.getBoundingClientRect();
    const summaryTitleBox = summaryTitle?.getBoundingClientRect();
    const iconBox = icon?.getBoundingClientRect();
    const linkTitleBox = linkTitle?.getBoundingClientRect();
    return {
      links: links.map((link) => {
        const box = link.getBoundingClientRect();
        return {
          href: link.href,
          target: link.target,
          rel: link.rel,
          title: link.querySelector('strong')?.textContent.trim(),
          detail: link.querySelector('small')?.textContent.trim(),
          height: box.height,
        };
      }),
      dayOnePlacement: dayOneLink && {
        inSummaryHeader: Boolean(summaryHead),
        rightOfSummaryTitle: Boolean(linkBox && summaryTitleBox && linkBox.left > summaryTitleBox.right),
        summaryHeight: summaryBox?.height,
        summaryHeaderHeight: summaryHeadBox?.height,
        linkHeight: linkBox?.height,
        summaryTitleHeight: summaryTitleBox?.height,
        iconHeight: iconBox?.height,
        iconAndTextCentersAligned: Boolean(iconBox && linkTitleBox && Math.abs(
          (iconBox.top + iconBox.height / 2) - (linkTitleBox.top + linkTitleBox.height / 2)
        ) < 1),
        detailHidden: linkDetail && getComputedStyle(linkDetail).display === 'none',
      },
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
for (const [file, detail] of [
  ['fukuoka-golf.html', '入境審查與海關申報'],
  ['fukuoka-golf-en.html', 'Immigration & customs declaration'],
]) {
  for (const [page, scope, width] of [
    ['day1', '#day1', 320],
    ['day1', '#day1', 390],
    ['day1', '#day1', 1440],
    ['more', '#overview', 390],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width >= 1024 ? 900 : 844,
      deviceScaleFactor: width >= 1024 ? 1 : 2,
      mobile: width < 1024,
    });
    const result = await inspect(file, page, scope);
    assert.equal(result.links.length, 1, `${file} ${scope} should have one Visit Japan Web link`);
    assert.deepEqual(result.links[0], {
      href: 'https://www.vjw.digital.go.jp/',
      target: '_blank',
      rel: 'noopener',
      title: 'Visit Japan Web',
      detail,
      height: width >= 1024 ? 32 : 44,
    });
    assert.equal(result.overflow, false, `${file} ${scope} should not overflow horizontally`);
    if (page === 'day1') {
      assert.equal(result.dayOnePlacement.inSummaryHeader, true);
      assert.equal(result.dayOnePlacement.rightOfSummaryTitle, true);
      assert.equal(result.dayOnePlacement.summaryTitleHeight < 30, true);
      assert.equal(result.dayOnePlacement.iconHeight >= 18, true);
      assert.equal(result.dayOnePlacement.iconAndTextCentersAligned, true);
      assert.equal(result.dayOnePlacement.detailHidden, true);
      if (width >= 1024) {
        assert.ok(
          result.dayOnePlacement.summaryHeaderHeight <= 44,
          `${file} desktop summary header is too tall: ${result.dayOnePlacement.summaryHeaderHeight}px`,
        );
        assert.ok(
          result.dayOnePlacement.linkHeight <= 36,
          `${file} desktop Visit Japan link is too tall: ${result.dayOnePlacement.linkHeight}px`,
        );
      }
    }
    if (file === 'fukuoka-golf.html' && width === 390) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(
        `/private/tmp/fukuoka-visit-japan-${page}.png`,
        Buffer.from(screenshot.data, 'base64'),
      );
    }
    if (file === 'fukuoka-golf.html' && page === 'day1' && width === 1440) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(
        '/private/tmp/fukuoka-visit-japan-day1-desktop.png',
        Buffer.from(screenshot.data, 'base64'),
      );
    }
  }
}

socket.close();
console.log('Visit Japan Web browser regression checks passed.');
