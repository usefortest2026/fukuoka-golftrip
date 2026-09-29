(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FukuokaGolfDraw = api;
    if (root.document) api.mountGolfDraw(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DRAW_UNITS = [
    { name: '偉哥', size: 2 },
    { name: 'Asa', size: 2 },
    { name: '小林', size: 1 },
    { name: 'Derek', size: 1 },
    { name: 'Jack', size: 1 },
    { name: 'Alex', size: 1 }
  ];
  DRAW_UNITS.forEach(Object.freeze);
  Object.freeze(DRAW_UNITS);

  function groupKey(group) {
    return group.map(function (unit) { return unit.name; }).sort().join('\u0000');
  }

  function buildValidPartitions(units) {
    var results = [];
    var seen = {};
    var limit = 1 << units.length;
    for (var mask = 1; mask < limit - 1; mask += 1) {
      var groupA = [];
      var groupB = [];
      var totalA = 0;
      var totalB = 0;
      units.forEach(function (unit, index) {
        if (mask & (1 << index)) {
          groupA.push(unit);
          totalA += unit.size;
        } else {
          groupB.push(unit);
          totalB += unit.size;
        }
      });
      if (totalA !== 4 || totalB !== 4) continue;
      var keyA = groupKey(groupA);
      var keyB = groupKey(groupB);
      var key = [keyA, keyB].sort().join('\u0001');
      if (seen[key]) continue;
      seen[key] = true;
      if (keyA > keyB) {
        var swap = groupA;
        groupA = groupB;
        groupB = swap;
      }
      results.push({ groupA: groupA.slice(), groupB: groupB.slice() });
    }
    return results;
  }

  function randomIndex(maxExclusive, cryptoLike) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new RangeError('maxExclusive must be a positive integer');
    var source = cryptoLike || root.crypto;
    if (!source || typeof source.getRandomValues !== 'function') {
      return Math.floor(Math.random() * maxExclusive);
    }
    var range = 0x100000000;
    var ceiling = Math.floor(range / maxExclusive) * maxExclusive;
    var value;
    do {
      var buffer = new Uint32Array(1);
      source.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= ceiling);
    return value % maxExclusive;
  }

  function shuffle(group, cryptoLike) {
    var copy = group.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = randomIndex(index + 1, cryptoLike);
      var swap = copy[index];
      copy[index] = copy[target];
      copy[target] = swap;
    }
    return copy;
  }

  function drawGroups(units, cryptoLike) {
    var sourceUnits = units || DRAW_UNITS;
    var partitions = buildValidPartitions(sourceUnits);
    if (!partitions.length) throw new Error('No valid 4+4 golf grouping is available.');
    var selected = partitions[randomIndex(partitions.length, cryptoLike)];
    return {
      groupA: shuffle(selected.groupA, cryptoLike),
      groupB: shuffle(selected.groupB, cryptoLike)
    };
  }

  var COPY = {
    zh: {
      eyebrow: 'Golf Day',
      entryTitle: '今日分組抽籤',
      entryBody: '六顆球分成兩組，關閉後不保留結果。',
      open: '開始抽籤',
      dialogTitle: '今天誰跟誰一組？',
      dialogBody: '按下開始後，六顆球會隨機落入兩組。',
      start: '開始抽籤',
      again: '再抽一次',
      close: '關閉',
      ready: '準備好了，按下開始抽籤。',
      drawing: '正在洗牌…',
      complete: '分組完成',
      groupA: '第一組',
      groupB: '第二組',
      error: '暫時無法完成 4＋4 分組，請再試一次。'
    },
    en: {
      eyebrow: 'Golf Day',
      entryTitle: 'Today’s group draw',
      entryBody: 'Six balls, two groups. Results disappear when you close.',
      open: 'Start the draw',
      dialogTitle: 'Who’s playing together today?',
      dialogBody: 'Start the draw and watch six balls land in two groups.',
      start: 'Start the draw',
      again: 'Draw again',
      close: 'Close',
      ready: 'Ready when you are.',
      drawing: 'Shuffling the balls…',
      complete: 'Groups are ready',
      groupA: 'Group 1',
      groupB: 'Group 2',
      error: 'We could not make a valid 4 + 4 grouping. Please try again.'
    }
  };

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function mountGolfDraw(doc, options) {
    if (!doc || doc.querySelector('.golf-draw-modal')) return;
    var locale = doc.documentElement.lang && doc.documentElement.lang.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
    var copy = COPY[locale];
    var cryptoLike = options && options.crypto;
    var openers = [];
    var opener = null;
    var drawTimer = null;
    var fallbackBackground = [];

    ['day2', 'day4', 'day5'].forEach(function (dayId) {
      var day = doc.getElementById(dayId);
      if (!day) return;
      var entry = element(doc, 'section', 'golf-draw-entry');
      var copyWrap = element(doc, 'div', 'golf-draw-entry-copy');
      copyWrap.appendChild(element(doc, 'span', 'golf-draw-entry-eyebrow', copy.eyebrow));
      copyWrap.appendChild(element(doc, 'h3', 'golf-draw-entry-title', copy.entryTitle));
      copyWrap.appendChild(element(doc, 'p', 'golf-draw-entry-body', copy.entryBody));
      var button = element(doc, 'button', 'golf-draw-entry-button', copy.open);
      button.type = 'button';
      button.setAttribute('data-golf-draw-open', '');
      entry.appendChild(copyWrap);
      entry.appendChild(button);
      day.appendChild(entry);
      openers.push(button);
    });

    if (!openers.length) return;

    var modal = element(doc, 'dialog', 'golf-draw-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'golf-draw-title');
    modal.setAttribute('aria-describedby', 'golf-draw-description');
    modal.setAttribute('aria-busy', 'false');
    modal.dataset.state = 'ready';
    var fallbackBackdrop = element(doc, 'div', 'golf-draw-fallback-backdrop');
    fallbackBackdrop.hidden = true;
    fallbackBackdrop.setAttribute('aria-hidden', 'true');

    var shell = element(doc, 'div', 'golf-draw-shell');
    var closeButton = element(doc, 'button', 'golf-draw-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('data-golf-draw-close', '');
    closeButton.setAttribute('aria-label', copy.close);

    var heading = element(doc, 'div', 'golf-draw-heading');
    heading.appendChild(element(doc, 'span', 'golf-draw-eyebrow', copy.eyebrow));
    var title = element(doc, 'h2', 'golf-draw-title', copy.dialogTitle);
    title.id = 'golf-draw-title';
    heading.appendChild(title);
    var description = element(doc, 'p', 'golf-draw-description', copy.dialogBody);
    description.id = 'golf-draw-description';
    heading.appendChild(description);

    var stage = element(doc, 'div', 'golf-draw-stage');
    stage.setAttribute('role', 'list');
    DRAW_UNITS.forEach(function (unit, index) {
      var ball = element(doc, 'span', 'golf-draw-ball', unit.name);
      ball.setAttribute('role', 'listitem');
      ball.style.setProperty('--ball-index', index);
      ball.style.setProperty('--ball-x', ((index % 3) - 1) * 16 + 'px');
      ball.style.setProperty('--ball-y', (index % 2 ? 10 : -9) + 'px');
      stage.appendChild(ball);
    });

    var results = element(doc, 'div', 'golf-draw-results');
    var groupA = element(doc, 'section', 'golf-draw-group');
    var groupB = element(doc, 'section', 'golf-draw-group');
    groupA.dataset.group = 'a';
    groupB.dataset.group = 'b';
    groupA.appendChild(element(doc, 'h3', '', copy.groupA));
    groupB.appendChild(element(doc, 'h3', '', copy.groupB));
    var groupAList = element(doc, 'div', 'golf-draw-group-list');
    var groupBList = element(doc, 'div', 'golf-draw-group-list');
    groupA.appendChild(groupAList);
    groupB.appendChild(groupBList);
    results.appendChild(groupA);
    results.appendChild(groupB);
    results.hidden = true;

    var status = element(doc, 'p', 'golf-draw-status', copy.ready);
    status.setAttribute('data-golf-draw-status', '');
    var announcement = element(doc, 'p', 'golf-draw-announcement', copy.ready);
    announcement.setAttribute('data-golf-draw-announcement', '');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');

    var actions = element(doc, 'div', 'golf-draw-actions');
    var startButton = element(doc, 'button', 'golf-draw-primary', copy.start);
    startButton.type = 'button';
    startButton.setAttribute('data-golf-draw-start', '');
    var againButton = element(doc, 'button', 'golf-draw-primary', copy.again);
    againButton.type = 'button';
    againButton.setAttribute('data-golf-draw-again', '');
    againButton.hidden = true;
    actions.appendChild(startButton);
    actions.appendChild(againButton);

    shell.appendChild(closeButton);
    shell.appendChild(heading);
    shell.appendChild(stage);
    shell.appendChild(results);
    shell.appendChild(status);
    shell.appendChild(announcement);
    shell.appendChild(actions);
    modal.appendChild(shell);
    doc.body.appendChild(fallbackBackdrop);
    doc.body.appendChild(modal);

    function clearResults() {
      groupAList.replaceChildren();
      groupBList.replaceChildren();
    }

    function reset() {
      root.clearTimeout(drawTimer);
      drawTimer = null;
      clearResults();
      modal.dataset.state = 'ready';
      modal.setAttribute('aria-busy', 'false');
      stage.hidden = false;
      results.hidden = true;
      startButton.hidden = false;
      startButton.disabled = false;
      againButton.hidden = true;
      status.textContent = copy.ready;
      announcement.textContent = copy.ready;
    }

    function renderGroup(list, units) {
      units.forEach(function (unit, index) {
        var player = element(doc, 'span', 'golf-draw-player', unit.name);
        player.setAttribute('data-golf-draw-player', '');
        player.dataset.playerSize = unit.size;
        player.style.setProperty('--player-index', index);
        list.appendChild(player);
      });
    }

    function finishDraw() {
      try {
        var groups = drawGroups(DRAW_UNITS, cryptoLike);
        clearResults();
        renderGroup(groupAList, groups.groupA);
        renderGroup(groupBList, groups.groupB);
        stage.hidden = true;
        results.hidden = false;
        modal.dataset.state = 'complete';
        modal.setAttribute('aria-busy', 'false');
        startButton.hidden = true;
        startButton.disabled = false;
        againButton.hidden = false;
        var namesA = groups.groupA.map(function (unit) { return unit.name; });
        var namesB = groups.groupB.map(function (unit) { return unit.name; });
        status.textContent = copy.complete;
        announcement.textContent = locale === 'en'
          ? copy.complete + '. ' + copy.groupA + ': ' + namesA.join(', ') + '; ' + copy.groupB + ': ' + namesB.join(', ')
          : copy.complete + '。' + copy.groupA + '：' + namesA.join('、') + '；' + copy.groupB + '：' + namesB.join('、');
      } catch (error) {
        modal.dataset.state = 'error';
        modal.setAttribute('aria-busy', 'false');
        startButton.disabled = false;
        status.textContent = copy.error;
        announcement.textContent = copy.error;
      }
    }

    function beginDraw() {
      if (modal.dataset.state === 'drawing') return;
      clearResults();
      modal.dataset.state = 'drawing';
      modal.setAttribute('aria-busy', 'true');
      stage.hidden = false;
      results.hidden = true;
      startButton.hidden = false;
      startButton.disabled = true;
      againButton.hidden = true;
      status.textContent = copy.drawing;
      announcement.textContent = copy.drawing;
      var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      drawTimer = root.setTimeout(finishDraw, reduced ? 80 : 1800);
    }

    function isolateFallbackBackground() {
      fallbackBackground = [];
      Array.prototype.forEach.call(doc.body.children, function (node) {
        if (node === modal || node === fallbackBackdrop || node.tagName === 'SCRIPT') return;
        var supportsInert = 'inert' in node;
        fallbackBackground.push({
          node: node,
          supportsInert: supportsInert,
          inert: supportsInert ? Boolean(node.inert) : false,
          ariaHidden: node.getAttribute('aria-hidden')
        });
        if (supportsInert) node.inert = true;
        node.setAttribute('aria-hidden', 'true');
      });
    }

    function restoreFallbackBackground() {
      fallbackBackground.forEach(function (state) {
        if (state.supportsInert) state.node.inert = state.inert;
        if (state.ariaHidden === null) state.node.removeAttribute('aria-hidden');
        else state.node.setAttribute('aria-hidden', state.ariaHidden);
      });
      fallbackBackground = [];
    }

    function fallbackFocusable() {
      return Array.prototype.filter.call(
        modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (node) { return !node.hidden; }
      );
    }

    function handleFallbackKeydown(event) {
      if (!modal.classList.contains('is-fallback-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = fallbackFocusable();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && (doc.activeElement === first || !modal.contains(doc.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || !modal.contains(doc.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFallbackFocus(event) {
      if (!modal.classList.contains('is-fallback-open') || modal.contains(event.target)) return;
      event.stopPropagation();
      var focusable = fallbackFocusable();
      (focusable[0] || modal).focus();
    }

    function openModal(event) {
      opener = event.currentTarget;
      reset();
      doc.body.classList.add('golf-draw-open');
      if (typeof modal.showModal === 'function') modal.showModal();
      else {
        modal.setAttribute('open', '');
        modal.classList.add('is-fallback-open');
        fallbackBackdrop.hidden = false;
        doc.body.classList.add('golf-draw-fallback-open');
        isolateFallbackBackground();
      }
      startButton.focus();
    }

    function closeModal() {
      reset();
      doc.body.classList.remove('golf-draw-open');
      if (typeof modal.close === 'function' && modal.open) modal.close();
      else {
        modal.removeAttribute('open');
        modal.classList.remove('is-fallback-open');
        fallbackBackdrop.hidden = true;
        doc.body.classList.remove('golf-draw-fallback-open');
        restoreFallbackBackground();
      }
      if (opener) opener.focus();
    }

    openers.forEach(function (button) { button.addEventListener('click', openModal); });
    closeButton.addEventListener('click', closeModal);
    startButton.addEventListener('click', beginDraw);
    againButton.addEventListener('click', beginDraw);
    modal.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeModal();
    });
    doc.addEventListener('keydown', handleFallbackKeydown);
    doc.addEventListener('focusin', handleFallbackFocus);
    fallbackBackdrop.addEventListener('click', closeModal);

    return { modal: modal, reset: reset };
  }

  return {
    DRAW_UNITS: DRAW_UNITS,
    buildValidPartitions: buildValidPartitions,
    randomIndex: randomIndex,
    drawGroups: drawGroups,
    mountGolfDraw: mountGolfDraw
  };
});
