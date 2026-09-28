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

async function setViewport(width) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width >= 1024 ? 900 : 844,
    deviceScaleFactor: 1,
    mobile: width < 1024,
  });
}

async function navigate(file, page) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${file}?p=${page}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function inspectDayTwo(file, width) {
  await setViewport(width);
  await navigate(file, 'day2');
  return evaluate(`(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const app = document.querySelector('.app');
    const nav = document.querySelector('.nav');
    const navInner = document.querySelector('.nav-inner');
    const main = document.querySelector('main');
    const buttons = [...document.querySelectorAll('.tab-btn')];
    const summary = rect('#day2 > .v2-summary');
    const quick = rect('#day2 > .v2-golf-quick');
    const firstDetail = rect('#day2 > .panel');
    return {
      app: rect('.app'),
      heroLogo: rect('.hero img'),
      heroTitle: rect('.hero h1'),
      appPaddingBottom: getComputedStyle(app).paddingBottom,
      main: rect('main'),
      mainMarginLeft: getComputedStyle(main).marginLeft,
      nav: rect('.nav'),
      navPosition: getComputedStyle(nav).position,
      navTop: getComputedStyle(nav).top,
      navBottom: getComputedStyle(nav).bottom,
      navInnerDisplay: getComputedStyle(navInner).display,
      firstButton: rect('.tab-btn:nth-child(1)'),
      secondButton: rect('.tab-btn:nth-child(2)'),
      moreIcon: rect('.tab-btn:last-child i'),
      moreLabel: rect('.tab-btn:last-child span'),
      navTypography: {
        primary: getComputedStyle(buttons[0].querySelector('span:nth-of-type(1)')).fontSize,
        date: getComputedStyle(buttons[0].querySelector('span:nth-of-type(2)')).fontSize,
        icon: getComputedStyle(buttons[0].querySelector('i')).fontSize,
      },
      desktopNavLabelsVisible: buttons.slice(0, 5).every((button) =>
        [...button.querySelectorAll('span')].every((span) => {
          const style = getComputedStyle(span);
          const box = span.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
        })
      ),
      navWeekdays: buttons.slice(0, 5).map((button) => {
        const weekday = button.querySelector('.nav-weekday');
        return weekday ? {
          text: weekday.textContent.trim(),
          display: getComputedStyle(weekday).display,
          fontSize: getComputedStyle(weekday).fontSize,
        } : null;
      }),
      summaryDividerWidths: [...document.querySelectorAll('#day2 .v2-summary-list li')]
        .map((item) => getComputedStyle(item).borderRightWidth),
      quickDividerWidths: [...document.querySelectorAll('#day2 .v2-quick-grid > div')]
        .map((item) => getComputedStyle(item).borderRightWidth),
      summary,
      quick,
      firstDetail,
      detailsCount: document.querySelectorAll('#day2 details').length,
      closedDetailsCount: document.querySelectorAll('#day2 details:not([open])').length,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      activePage: document.querySelector('.page.active')?.id,
      buttonCount: buttons.length,
    };
  })()`);
}

async function inspectDayTop(file, width, pageId, secondarySelector) {
  await setViewport(width);
  await navigate(file, pageId);
  const layout = await evaluate(`(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      summary: rect('#${pageId} > .v2-summary'),
      secondary: rect('#${pageId} > ${secondarySelector}'),
      firstDetail: rect('#${pageId} > .panel'),
      secondaryDividerWidths: [...document.querySelectorAll(
        '#${pageId} > ${secondarySelector} .v2-route-stop, #${pageId} > ${secondarySelector} .v2-quick-grid > div'
      )].map((item) => getComputedStyle(item).borderRightWidth),
      detailsCount: document.querySelectorAll('#${pageId} details').length,
      closedDetailsCount: document.querySelectorAll('#${pageId} details:not([open])').length,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  if (width === 1440) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-desktop-${pageId}-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  return layout;
}

async function inspectDayThreeLinks(file, width) {
  await setViewport(width);
  await navigate(file, 'day3');
  const result = await evaluate(`(() => {
    const summary = document.querySelector('#day3 > .v2-summary').getBoundingClientRect();
    const firstDetail = document.querySelector('#day3 > .panel').getBoundingClientRect();
    const items = [...document.querySelectorAll('#day3 .timeline > .item:first-child .stop-list > li')];
    const links = items.map((item) => item.querySelector(':scope > a'));
    return {
      routeBlockCount: document.querySelectorAll('#day3 > .v2-route').length,
      summaryBottom: summary.bottom,
      firstDetailTop: firstDetail.top,
      itemCount: items.length,
      links: links.filter(Boolean).map((link) => ({
        text: link.textContent.trim(),
        href: link.href,
        target: link.target,
        rel: link.rel,
        cursor: getComputedStyle(link).cursor,
      })),
      everyItemStartsWithLink: links.every((link, index) => link && items[index].firstElementChild === link),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  if (width === 390 || width === 1440) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-day3-${width}-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  return result;
}

async function inspectFiveItemSummary(file, width) {
  await setViewport(width);
  await navigate(file, 'day5');
  return evaluate(`(() => {
    const items = [...document.querySelectorAll('#day5 .v2-summary-list li')].map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right, width: box.width };
    });
    return {
      items,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
}

async function inspectStickyHeader(file, width) {
  await setViewport(width);
  await navigate(file, 'day3');
  return evaluate(`(async () => {
    const app = document.querySelector('.app');
    const hero = document.querySelector('.hero');
    app.scrollTop = 600;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      scrollTop: app.scrollTop,
      heroTop: hero.getBoundingClientRect().top,
      heroPosition: getComputedStyle(hero).position,
    };
  })()`);
}

async function inspectDayFiveOptionLabels(file, width) {
  await setViewport(width);
  await navigate(file, 'day5');
  return evaluate(`([...document.querySelectorAll('#day5 .stop-list strong')]
    .map((node) => node.textContent.trim())
    .filter((text) => /^(Option|選項)/.test(text)))`);
}

async function inspectDayFiveCoupons(file, width) {
  await setViewport(width);
  await navigate(file, 'more');
  const initialLoadedImages = await evaluate(`([...document.querySelectorAll('#overview .v2-coupon-image')]
    .filter((image) => image.hasAttribute('src')).length)`);
  await evaluate(`(async () => {
    document.querySelectorAll('#overview details.v2-scan-coupon').forEach((details) => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const image of document.querySelectorAll('#overview .v2-coupon-image')) {
      image.scrollIntoView({ block: 'center' });
      if (!image.complete) {
        await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }
    }
  })()`);
  const result = await evaluate(`(() => {
    const section = document.querySelector('#overview > .v2-trip-coupons');
    const overviewList = document.querySelector('#overview > .overview-list');
    const dayCards = [...document.querySelectorAll('#overview .overview-day')];
    const dayFiveCard = dayCards.at(-1);
    const images = [...document.querySelectorAll('#overview .v2-coupon-image')].map((item) => {
      const box = item.getBoundingClientRect();
      const link = item.closest('.v2-coupon-image-link');
      return {
        src: item.getAttribute('src') || '',
        alt: item.alt,
        complete: item.complete,
        naturalWidth: item.naturalWidth,
        loading: item.loading,
        decoding: item.decoding,
        fetchPriority: item.fetchPriority,
        dataSrc: item.dataset.src || '',
        width: box.width,
        left: box.left,
        right: box.right,
        linkHref: link?.getAttribute('href') || '',
        target: link?.target || '',
        rel: link?.rel || '',
      };
    });
    const mapLinks = [...document.querySelectorAll('#overview .v2-coupon-map')];
    const referenceButton = document.querySelector('#day2 .contact-actions .v2-nav-button');
    const visualStyle = (item) => {
      const style = getComputedStyle(item);
      return {
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    };
    return {
      sectionExists: Boolean(section),
      dayFiveSectionExists: Boolean(document.querySelector('#day5 > .v2-trip-coupons')),
      followsDayFiveCard: overviewList?.lastElementChild === dayFiveCard && section?.previousElementSibling === overviewList,
      passportOffers: document.querySelectorAll('#overview .v2-passport-offer').length,
      couponDetails: document.querySelectorAll('#overview details.v2-scan-coupon').length,
      initialLoadedImages: ${initialLoadedImages},
      images,
      mapLinks: mapLinks.map((link) => ({
        href: link.href,
        height: link.getBoundingClientRect().height,
        target: link.target,
        rel: link.rel,
        classes: link.className,
        visualStyle: visualStyle(link),
      })),
      referenceButtonStyle: visualStyle(referenceButton),
      officialLinks: document.querySelectorAll('#overview .v2-offer-link, #overview .v2-nearby-official').length,
      sectionTop: section?.getBoundingClientRect().top || 0,
      dayFiveCardBottom: dayFiveCard?.getBoundingClientRect().bottom || 0,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);

  if (width === 390 || width === 1440) {
    await evaluate(`document.querySelector('#overview > .v2-trip-coupons')?.scrollIntoView({ block: 'start' })`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-coupons-${width}-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }
  return result;
}

async function inspectMore(file, width) {
  await setViewport(width);
  await navigate(file, 'more');
  const overview = await evaluate(`(() => {
    const moreIcon = document.querySelector('.tab-btn:last-child i');
    const cards = [...document.querySelectorAll('#overview .overview-day')].map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    });
    return {
      cards,
      moreIconClass: moreIcon?.className || '',
      activeSubpage: document.querySelector('#more .subpage.active')?.id,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);

  if (width === 1440) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-desktop-more-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }

  await evaluate(`document.querySelectorAll('#more .seg')[1].click()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const hotelActive = await evaluate(`document.querySelector('#more .subpage.active')?.id`);
  if (width === 1440) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-desktop-hotels-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }

  await evaluate(`document.querySelectorAll('#more .seg')[2].click()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const packing = await evaluate(`(() => {
    const groups = [...document.querySelectorAll('#packing .pack-group')].map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    });
    return {
      activeSubpage: document.querySelector('#more .subpage.active')?.id,
      groups,
      pointerFailures: [...document.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), label.check-row, [onclick]')]
        .filter((element) => getComputedStyle(element).cursor !== 'pointer')
        .map((element) => element.tagName + '.' + element.className),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);

  if (width === 1440) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const locale = file.includes('-en') ? 'en' : 'zh';
    fs.writeFileSync(`/private/tmp/fukuoka-desktop-packing-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
  }

  return {
    overview,
    hotelActive,
    packing,
    tabs: await evaluate(`([...document.querySelectorAll('#more .seg')].map((item) => item.textContent.trim()))`),
  };
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const file of ['fukuoka-golf.html', 'fukuoka-golf-en.html']) {
  for (const width of [390, 768]) {
    const result = await inspectDayTwo(file, width);
    assert.equal(result.buttonCount, 6);
    assert.equal(result.activePage, 'day2');
    assert.equal(result.pageOverflow, false, `${file} overflows horizontally at ${width}px`);
    assert.ok(result.app.width <= 680.5, `${file} mobile/tablet app grew beyond 680px`);
    assert.equal(result.navPosition, 'fixed');
    assert.equal(result.navBottom, '0px');
    assert.equal(result.mainMarginLeft, '0px');
    assert.ok(result.quick.top >= result.summary.bottom, `${file} quick info should remain stacked at ${width}px`);
    assert.ok(result.detailsCount > 0);
    assert.ok(result.closedDetailsCount > 0, `${file} mobile/tablet details should remain collapsible`);
    assert.deepEqual(
      result.navWeekdays.map((weekday) => weekday?.display),
      ['none', 'none', 'none', 'none', 'none'],
      `${file} weekdays should stay hidden in the mobile bottom navigation`,
    );
  }

  for (const width of [1024, 1440]) {
    const result = await inspectDayTwo(file, width);
    assert.equal(result.buttonCount, 6);
    assert.equal(result.activePage, 'day2');
    assert.equal(result.pageOverflow, false, `${file} overflows horizontally at ${width}px`);
    assert.ok(result.app.width >= width - 1, `${file} desktop app does not fill ${width}px viewport`);
    assert.ok(result.app.left <= 1 && result.app.right >= width - 1, `${file} desktop app leaves outer gutters`);
    assert.ok(
      result.heroTitle.left - result.heroLogo.right >= 12 && result.heroTitle.left - result.heroLogo.right <= 24,
      `${file} desktop header title is detached from the logo`,
    );
    assert.equal(result.appPaddingBottom, '0px');
    assert.equal(result.navPosition, 'fixed');
    assert.ok(result.nav.bottom < 500, `${file} desktop navigation is still attached to the bottom edge`);
    assert.ok(result.nav.width >= 160 && result.nav.width <= 190, `${file} desktop navigation width is unexpected`);
    assert.ok(result.nav.top >= 72, `${file} desktop navigation should sit below the header`);
    assert.equal(result.navInnerDisplay, 'grid');
    assert.ok(result.secondButton.top > result.firstButton.bottom - 1, `${file} desktop navigation is not vertical`);
    assert.ok(
      Math.abs((result.moreIcon.top + result.moreIcon.height / 2) - (result.moreLabel.top + result.moreLabel.height / 2)) < 2,
      `${file} More icon and label are not aligned`,
    );
    assert.ok(result.main.left > result.nav.right, `${file} main content overlaps desktop navigation`);
    assert.ok(result.main.width >= width - 192, `${file} desktop content remains too narrow`);
    assert.deepEqual(result.navTypography, { primary: '14px', date: '14px', icon: '18px' });
    assert.equal(result.desktopNavLabelsVisible, true, `${file} desktop navigation hides a day, date, or weekday label`);
    assert.deepEqual(
      result.navWeekdays.map((weekday) => weekday?.text),
      file.includes('-en')
        ? ['Fri', 'Sat', 'Sun', 'Mon', 'Tue']
        : ['五', '六', '日', '一', '二'],
      `${file} desktop navigation has incorrect weekday abbreviations`,
    );
    assert.deepEqual(
      result.navWeekdays.map((weekday) => `${weekday?.display}/${weekday?.fontSize}`),
      ['block/14px', 'block/14px', 'block/14px', 'block/14px', 'block/14px'],
      `${file} desktop navigation weekdays are not visible at the intended size`,
    );
    assert.deepEqual(
      result.summaryDividerWidths,
      result.summaryDividerWidths.map(() => '0px'),
      `${file} desktop summary still has separators between times`,
    );
    assert.deepEqual(
      result.quickDividerWidths,
      result.quickDividerWidths.map(() => '0px'),
      `${file} desktop quick info still has internal separators`,
    );
    assert.ok(result.quick.top >= result.summary.bottom, `${file} desktop summary and quick info should be stacked`);
    assert.ok(Math.abs(result.quick.left - result.summary.left) < 2, `${file} desktop summary and quick info should share a left edge`);
    assert.ok(Math.abs(result.quick.width - result.summary.width) < 2, `${file} desktop summary and quick info should share a width`);
    assert.ok(result.firstDetail.top >= result.quick.bottom, `${file} details overlap the desktop quick info`);
    assert.ok(Math.abs(result.firstDetail.width - result.summary.width) < 2, `${file} detail panels should use the full content width`);
    assert.ok(result.detailsCount > 0);
    assert.equal(result.closedDetailsCount, 0, `${file} desktop details should all be expanded`);

    await evaluate(`document.querySelectorAll('.tab-btn')[3].click()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(await evaluate(`document.querySelector('.page.active')?.id`), 'day4');

    if (width >= 1024) {
      await navigate(file, 'day2');
      const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const locale = file.includes('-en') ? 'en' : 'zh';
      fs.writeFileSync(`/private/tmp/fukuoka-desktop-${width}-${locale}.png`, Buffer.from(screenshot.data, 'base64'));
    }
  }

  const desktopHeader = await inspectStickyHeader(file, 1440);
  assert.ok(desktopHeader.scrollTop > 200, `${file} desktop page did not scroll far enough to test the header`);
  assert.equal(desktopHeader.heroPosition, 'fixed', `${file} desktop header should be fixed to the viewport`);
  assert.ok(Math.abs(desktopHeader.heroTop) < 1, `${file} desktop header should remain at the top while scrolling`);

  const mobileHeader = await inspectStickyHeader(file, 390);
  assert.ok(mobileHeader.scrollTop > 200, `${file} mobile page did not scroll far enough to test the header`);
  assert.notEqual(mobileHeader.heroPosition, 'sticky', `${file} mobile header should scroll normally`);
  assert.ok(mobileHeader.heroTop < -100, `${file} mobile header should leave the viewport while scrolling`);

  const optionLabels = await inspectDayFiveOptionLabels(file, 390);
  assert.deepEqual(
    optionLabels,
    file.includes('-en')
      ? ['Option 1 | Akizuki Castle Ruins:', 'Option 2 | Fukuoka city:']
      : ['選項一｜秋月城遺址：', '選項二｜福岡市區：'],
    `${file} D5 option labels are not localized correctly`,
  );

  for (const [pageId, secondarySelector] of [['day4', '.v2-golf-quick']]) {
    const result = await inspectDayTop(file, 1440, pageId, secondarySelector);
    assert.equal(result.pageOverflow, false);
    assert.ok(result.secondary.top >= result.summary.bottom, `${file} ${pageId} top sections should be stacked`);
    assert.ok(Math.abs(result.secondary.left - result.summary.left) < 2, `${file} ${pageId} top sections should align`);
    assert.ok(Math.abs(result.secondary.width - result.summary.width) < 2, `${file} ${pageId} top sections should have equal widths`);
    assert.ok(result.firstDetail.top >= result.secondary.bottom, `${file} ${pageId} detail content overlaps the top sections`);
    assert.equal(result.closedDetailsCount, 0, `${file} ${pageId} desktop details should all be expanded`);
    assert.deepEqual(
      result.secondaryDividerWidths,
      result.secondaryDividerWidths.map(() => '0px'),
      `${file} ${pageId} secondary section still has internal separators`,
    );
  }

  for (const width of [390, 1440]) {
    const result = await inspectDayThreeLinks(file, width);
    assert.equal(result.routeBlockCount, 0, `${file} still renders the duplicate route timeline`);
    assert.equal(result.itemCount, 5);
    assert.equal(result.links.length, 5, `${file} is missing scenic-stop navigation links`);
    assert.equal(result.everyItemStartsWithLink, true);
    assert.equal(new Set(result.links.map((link) => link.href)).size, 5);
    assert.equal(result.links.every((link) => link.href.includes('google.com/maps/search/')), true);
    assert.equal(result.links.every((link) => link.target === '_blank' && link.rel.includes('noopener')), true);
    assert.equal(result.links.every((link) => link.cursor === 'pointer' && link.text.length > 0), true);
    assert.ok(result.firstDetailTop >= result.summaryBottom);
    assert.equal(result.pageOverflow, false);
  }

  for (const width of [1024, 1440]) {
    const result = await inspectFiveItemSummary(file, width);
    assert.equal(result.pageOverflow, false);
    assert.equal(result.items.length, 5);
    assert.ok(
      result.items.every((item) => Math.abs(item.top - result.items[0].top) < 2),
      `${file} five-item desktop summary should stay on one row at ${width}px`,
    );
  }

  const more = await inspectMore(file, 1440);
  const mobileMore = await inspectMore(file, 390);
  assert.equal(more.overview.activeSubpage, 'overview');
  assert.ok(more.overview.moreIconClass.includes('fa-circle-info'), `${file} More should use an information icon`);
  assert.equal(more.overview.moreIconClass.includes('fa-ellipsis'), false, `${file} More should not look expandable`);
  assert.equal(more.overview.pageOverflow, false);
  assert.ok(more.overview.cards.length >= 5);
  assert.ok(more.overview.cards[1].top >= more.overview.cards[0].bottom, `${file} overview should be a single desktop column`);
  assert.ok(Math.abs(more.overview.cards[1].left - more.overview.cards[0].left) < 2, `${file} overview rows should align`);
  assert.ok(Math.abs(more.overview.cards[1].width - more.overview.cards[0].width) < 2, `${file} overview rows should share a width`);
  assert.deepEqual(
    more.tabs,
    file.includes('-en')
      ? ['Overview', 'Hotels', 'Packing']
      : ['總覽', '飯店', '行李'],
  );
  assert.deepEqual(mobileMore.tabs, more.tabs);
  assert.equal(more.hotelActive, 'hotels');
  assert.equal(more.packing.activeSubpage, 'packing');
  assert.equal(more.packing.pageOverflow, false);
  assert.equal(more.packing.groups.length, 4);
  assert.ok(Math.abs(more.packing.groups[0].top - more.packing.groups[1].top) < 2, `${file} packing groups are not two columns`);
  assert.ok(more.packing.groups[1].left > more.packing.groups[0].right, `${file} packing columns overlap`);
  assert.deepEqual(more.packing.pointerFailures, [], `${file} has clickable controls without a pointer cursor`);

  for (const width of [390, 1440]) {
    const coupons = await inspectDayFiveCoupons(file, width);
    assert.equal(coupons.sectionExists, true, `${file} overview is missing the coupon section`);
    assert.equal(coupons.dayFiveSectionExists, false, `${file} coupons should not remain in the D5 detail page`);
    assert.equal(coupons.followsDayFiveCard, true, `${file} coupons should immediately follow the D5 overview row`);
    assert.equal(coupons.sectionTop >= coupons.dayFiveCardBottom, true, `${file} coupons should follow the D5 overview row`);
    assert.equal(coupons.passportOffers, 3);
    assert.equal(coupons.images.length, 13);
    assert.equal(coupons.couponDetails, 13);
    assert.equal(coupons.initialLoadedImages, 1);
    assert.equal(coupons.mapLinks.length, 13);
    assert.equal(coupons.officialLinks, 0);
    assert.equal(coupons.pageOverflow, false, `${file} coupons overflow at ${width}px`);
    assert.ok(coupons.images.every((item) => item.complete && item.naturalWidth >= 590));
    assert.ok(coupons.images.every((item) => item.src.startsWith('coupon-') && item.src === item.linkHref));
    assert.ok(coupons.images.every((item) => item.loading === 'lazy'));
    assert.ok(coupons.images.every((item) => item.decoding === 'async'));
    assert.ok(coupons.images.every((item) => item.fetchPriority === 'low'));
    assert.ok(coupons.images.every((item) => item.dataSrc === item.src));
    assert.ok(coupons.images.every((item) => fs.statSync(item.src).size <= 240_000));
    assert.ok(coupons.images.every((item) => item.alt.length > 0));
    assert.ok(coupons.images.every((item) => item.target === '_blank' && item.rel.includes('noopener')));
    assert.ok(coupons.images.every((item) => item.width >= 280), `${file} coupon codes are too small at ${width}px`);
    assert.ok(coupons.images.every((item) => item.left >= 0 && item.right <= width + 1));
    assert.ok(coupons.mapLinks.every((item) => item.href.includes('google.com/maps/search/')));
    assert.ok(coupons.mapLinks.every((item) => item.classes.split(/\s+/).includes('v2-nav-button')));
    assert.ok(coupons.mapLinks.every((item) => JSON.stringify(item.visualStyle) === JSON.stringify(coupons.referenceButtonStyle)));
    assert.ok(coupons.mapLinks.every((item) => item.height >= 32));
    assert.ok(coupons.mapLinks.every((item) => item.target === '_blank' && item.rel.includes('noopener')));
  }
}

socket.close();
console.log('Desktop responsive layout checks passed.');
