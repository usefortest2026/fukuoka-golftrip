(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FukuokaGolfDraw = api;
    if (root.document) api.mountGolfDraw(root.document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // 打球日「今日分組」：8 人分成 4＋4，兩種玩法。結果不保存、不同步。
  var COUPLES = [['Royston', 'Lois'], ['Asa', 'Fi']];
  var SINGLES = ['Raistlin', 'Alex', 'Derek', 'Jack'];
  var PLAYERS = ['Royston', 'Lois', 'Asa', 'Fi', 'Raistlin', 'Alex', 'Derek', 'Jack'];
  var GOLF_DAYS = ['day2', 'day4', 'day5'];
  var MODES = ['couple', 'random']; // 左：隨機分組 1（預設），右：隨機分組 2
  var EASE = 'cubic-bezier(.32,.72,0,1)'; // iOS sheet-style curve
  [COUPLES[0], COUPLES[1], COUPLES, SINGLES, PLAYERS, GOLF_DAYS, MODES].forEach(Object.freeze);

  // ---------- Randomness ----------
  function randomIndex(maxExclusive, cryptoLike) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new RangeError('maxExclusive must be a positive integer');
    var source = cryptoLike || root.crypto;
    if (!source || typeof source.getRandomValues !== 'function') return Math.floor(Math.random() * maxExclusive);
    var ceiling = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    var buffer = new Uint32Array(1);
    do { source.getRandomValues(buffer); } while (buffer[0] >= ceiling);
    return buffer[0] % maxExclusive;
  }

  function shuffle(list, cryptoLike) {
    var copy = list.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = randomIndex(index + 1, cryptoLike);
      var swap = copy[index];
      copy[index] = copy[target];
      copy[target] = swap;
    }
    return copy;
  }

  // ---------- Draw logic ----------
  // A result is [group1, group2]; each group is a list of units, and a unit is
  // a couple (two names) or a single player (one name). Both groups hold 4 players.
  function singleUnits(names) {
    return names.map(function (name) { return [name]; });
  }

  // 隨機分組：35 種分法等機率（洗牌後前 4 人為一組）。
  function drawRandom(cryptoLike) {
    var order = shuffle(PLAYERS, cryptoLike);
    return [singleUnits(order.slice(0, 4)), singleUnits(order.slice(4))];
  }

  // 情侶同組：情侶不拆開，共 7 種分法——兩對各帶兩位（6 種），或兩對同組對另外四人（1 種）。
  function couplePartitions() {
    var partitions = [];
    for (var i = 0; i < SINGLES.length; i += 1) {
      for (var j = i + 1; j < SINGLES.length; j += 1) {
        var withFirst = [SINGLES[i], SINGLES[j]];
        var withSecond = SINGLES.filter(function (name) { return withFirst.indexOf(name) < 0; });
        partitions.push([
          [COUPLES[0].slice()].concat(singleUnits(withFirst)),
          [COUPLES[1].slice()].concat(singleUnits(withSecond))
        ]);
      }
    }
    partitions.push([[COUPLES[0].slice(), COUPLES[1].slice()], singleUnits(SINGLES)]);
    return partitions;
  }

  function drawCouple(cryptoLike) {
    var partitions = couplePartitions();
    var picked = partitions[randomIndex(partitions.length, cryptoLike)];
    if (randomIndex(2, cryptoLike)) picked = [picked[1], picked[0]];
    return picked.map(function (group) { return shuffle(group, cryptoLike); });
  }

  function drawGroups(mode, cryptoLike) {
    if (mode === 'couple') return drawCouple(cryptoLike);
    if (mode === 'random') return drawRandom(cryptoLike);
    throw new RangeError('Unknown draw mode: ' + mode);
  }

  function groupNames(group) {
    return group.reduce(function (names, unit) { return names.concat(unit); }, []);
  }

  // ---------- Copy ----------
  var COPY = {
    zh: {
      title: '今日分組',
      modeLabel: '分組方式',
      modes: { random: '隨機分組 2', couple: '隨機分組 1' },
      poolLabel: '今日球員 8 人',
      and: '和',
      draw: '抽籤',
      drawing: '抽籤中…',
      again: '再抽一次',
      group: function (index) { return index ? '第二組' : '第一組'; },
      groupLabel: function (index, time) { return (index ? '第二組' : '第一組') + (time ? '，' + time + ' 開球' : ''); },
      summary: function (groups, times) {
        return groups.map(function (group, index) {
          return (index ? '第二組' : '第一組') + (times[index] ? ' ' + times[index] + ' 開球' : '') + '：' +
            groupNames(group).sort(byName).join('、');
        }).join('；') + '。';
      }
    },
    en: {
      title: "Today's groups",
      modeLabel: 'Grouping',
      modes: { random: 'Random groups 2', couple: 'Random groups 1' },
      poolLabel: "Today's 8 players",
      and: 'and',
      draw: 'Draw',
      drawing: 'Drawing…',
      again: 'Draw again',
      group: function (index) { return index ? 'Group 2' : 'Group 1'; },
      groupLabel: function (index, time) { return (index ? 'Group 2' : 'Group 1') + (time ? ', tee time ' + time : ''); },
      summary: function (groups, times) {
        return groups.map(function (group, index) {
          return (index ? 'Group 2' : 'Group 1') + (times[index] ? ', tee time ' + times[index] : '') + ': ' +
            groupNames(group).sort(byName).join(', ');
        }).join('; ') + '.';
      }
    }
  };

  // ---------- Helpers ----------
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // Read the two tee times shown on the day page, e.g. "11:06 / 11:14". The v2 script
  // moves the tee time from the course info into the "golf day" quick summary.
  function readTeeTimes(day) {
    var cells = day.querySelectorAll('.v2-golf-quick dd, .course-info .info-cell span');
    for (var index = 0; index < cells.length; index += 1) {
      var match = /(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})/.exec(cells[index].textContent || '');
      if (match) return [match[1], match[2]];
    }
    return [];
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // ---------- Markup ----------
  function nameHTML(name) {
    return '<span class="gd-name" data-name="' + escapeHTML(name) + '">' + escapeHTML(name) + '</span>';
  }

  // Names are shown A–Z; a couple keeps its own order (Royston & Lois) and sorts by its first name.
  function byName(a, b) { return a.localeCompare(b, 'en', { sensitivity: 'base' }); }

  function poolUnits(mode) {
    if (mode !== 'couple') return PLAYERS.slice().sort(byName).map(function (name) { return [name]; });
    return COUPLES.map(function (couple) { return couple.slice(); }).concat(SINGLES.map(function (name) { return [name]; }))
      .sort(function (a, b) { return byName(a[0], b[0]); });
  }

  // Shuffle order for the draw animation. In couple mode the two pairs keep the
  // 1-2-1 / 1-2-1 slots so the 4-column pool never reflows into a third row.
  function poolOrder(mode, cryptoLike) {
    if (mode !== 'couple') return shuffle(PLAYERS, cryptoLike).map(function (name) { return [name]; });
    var pairs = shuffle(COUPLES.map(function (couple) { return couple.slice(); }), cryptoLike);
    var singles = shuffle(SINGLES, cryptoLike).map(function (name) { return [name]; });
    return [singles[0], pairs[0], singles[1], singles[2], pairs[1], singles[3]];
  }

  function poolHTML(copy, mode, units) {
    var cells = (units || poolUnits(mode)).map(function (unit) {
      if (unit.length === 2) {
        return '<li class="gd-cell gd-cell-pair">' + nameHTML(unit[0]) +
          '<span class="gd-amp" aria-hidden="true">&amp;</span><span class="gd-sr">' + escapeHTML(copy.and) + '</span>' +
          nameHTML(unit[1]) + '</li>';
      }
      return '<li class="gd-cell">' + nameHTML(unit[0]) + '</li>';
    });
    return '<ul class="gd-pool" aria-label="' + escapeHTML(copy.poolLabel) + '">' + cells.join('') + '</ul>';
  }

  // Each group lists its four names A–Z.
  function sheetHTML(copy, groups, times) {
    return '<div class="gd-sheet-grid">' + groups.map(function (group, groupIndex) {
      var rows = groupNames(group).sort(byName).map(function (name, index) {
        return slotHTML(groupIndex, index + 1, name);
      });
      var time = times[groupIndex] || '';
      return '<section class="gd-group" aria-label="' + escapeHTML(copy.groupLabel(groupIndex, time)) + '">' +
        '<div class="gd-group-head" aria-hidden="true"><b>' + escapeHTML(copy.group(groupIndex)) + '</b>' +
        (time ? '<time>' + escapeHTML(time) + '</time>' : '') + '</div>' +
        '<ol class="gd-slots">' + rows.join('') + '</ol></section>';
    }).join('') + '</div>';
  }

  function slotHTML(groupIndex, line, name) {
    // data-order: deal order, alternating 第一組 / 第二組 line by line.
    return '<li class="gd-slot" data-order="' + ((line - 1) * 2 + groupIndex) + '">' + nameHTML(name) + '</li>';
  }

  function buttonHTML(label) {
    return '<span>' + escapeHTML(label) + '</span><i class="fa-solid fa-shuffle" aria-hidden="true"></i>';
  }

  function panelHTML(copy, id) {
    return '<div class="gd-head"><h3 id="' + id + '-title">' + escapeHTML(copy.title) + '</h3></div>' +
      '<div class="gd-body">' +
        '<div class="gd-mode" role="radiogroup" aria-label="' + escapeHTML(copy.modeLabel) + '" data-gd-selected="' + MODES[0] + '">' +
          '<span class="gd-mode-thumb" aria-hidden="true"></span>' +
          MODES.map(function (mode, index) {
            return '<button type="button" role="radio" aria-checked="' + (index === 0) + '" tabindex="' + (index === 0 ? 0 : -1) + '" data-gd-mode="' + mode + '">' + escapeHTML(copy.modes[mode]) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="gd-sheet" data-gd-sheet></div>' +
        '<div class="gd-actions"><button type="button" class="gd-btn gd-btn-primary" data-gd-go></button></div>' +
        '<p class="gd-sr" data-gd-live role="status" aria-live="polite"></p>' +
      '</div>';
  }

  // ---------- One panel per golf day ----------
  function createPanel(doc, day, copy, options) {
    var cryptoLike = options.crypto;
    var times = readTeeTimes(day);
    var panel = doc.createElement('section');
    var id = 'golf-draw-' + day.id;
    panel.className = 'panel golf-draw';
    panel.id = id;
    panel.setAttribute('aria-labelledby', id + '-title');
    panel.innerHTML = panelHTML(copy, id);
    day.appendChild(panel);

    var sheet = panel.querySelector('[data-gd-sheet]');
    var goButton = panel.querySelector('[data-gd-go]');
    var live = panel.querySelector('[data-gd-live]');
    var modeButtons = Array.prototype.slice.call(panel.querySelectorAll('[data-gd-mode]'));
    var state = { mode: MODES[0], result: null, busy: false };
    var timers = [];

    function later(fn, ms) { timers.push(root.setTimeout(fn, ms)); }

    function canAnimate() {
      return !options.instant && !prefersReducedMotion() && typeof sheet.animate === 'function';
    }

    // FLIP: swap the sheet content, then glide every name from its old spot to its new one.
    function morph(html, morphOptions) {
      morphOptions = morphOptions || {};
      var animate = canAnimate();
      var before = {};
      var startHeight = animate ? sheet.offsetHeight : 0;
      if (animate) {
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-name]'), function (node) {
          before[node.getAttribute('data-name')] = node.getBoundingClientRect();
        });
      }
      sheet.innerHTML = html;
      if (!animate) return 0;
      var duration = morphOptions.duration || 220;
      var end = duration;
      var endHeight = sheet.offsetHeight;
      if (startHeight && startHeight !== endHeight) {
        sheet.animate([{ height: startHeight + 'px' }, { height: endHeight + 'px' }], { duration: duration, easing: EASE });
      }
      Array.prototype.forEach.call(sheet.querySelectorAll('[data-name]'), function (node) {
        var from = before[node.getAttribute('data-name')];
        if (!from) return;
        var to = node.getBoundingClientRect();
        var dx = from.left - to.left;
        var dy = from.top - to.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        var delay = morphOptions.stagger ? morphOptions.stagger(node) : 0;
        end = Math.max(end, duration + delay);
        node.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: duration, delay: delay, easing: EASE, fill: 'backwards' });
      });
      // Surfaces that did not exist before (group cards, pool tiles) fade and settle in.
      if (morphOptions.appear) {
        Array.prototype.forEach.call(sheet.querySelectorAll(morphOptions.appear), function (node) {
          node.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: duration, easing: EASE });
        });
      }
      return end;
    }

    function dealDelay(node) {
      var slot = node.closest('.gd-slot');
      return slot ? Number(slot.getAttribute('data-order')) * 36 : 0;
    }

    function update() {
      panel.querySelector('.gd-mode').setAttribute('data-gd-selected', state.mode);
      modeButtons.forEach(function (button) {
        var selected = button.getAttribute('data-gd-mode') === state.mode;
        button.setAttribute('aria-checked', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (state.busy) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      });
      if (state.busy) {
        goButton.setAttribute('aria-disabled', 'true');
        goButton.innerHTML = buttonHTML(copy.drawing);
      } else {
        goButton.removeAttribute('aria-disabled');
        goButton.innerHTML = buttonHTML(state.result ? copy.again : copy.draw);
      }
      panel.setAttribute('data-gd-state', state.busy ? 'drawing' : state.result ? 'complete' : 'ready');
      panel.setAttribute('data-gd-current-mode', state.mode);
    }

    function draw() {
      if (state.busy) return;
      var result = drawGroups(state.mode, cryptoLike);
      var fromSheet = Boolean(state.result);
      state.busy = true;
      live.textContent = '';
      update();

      function finish() {
        state.busy = false;
        state.result = result;
        update();
        live.textContent = copy.summary(result, times);
      }

      if (!canAnimate()) {
        morph(sheetHTML(copy, result, times));
        finish();
        return;
      }
      (function step(round) {
        if (round < 3) {
          // Phase 1: shuffle in place (the pool, or the previous sheet when drawing again).
          var shuffleHTML = fromSheet
            ? sheetHTML(copy, drawGroups(state.mode, cryptoLike), times)
            : poolHTML(copy, state.mode, poolOrder(state.mode, cryptoLike));
          later(function () { step(round + 1); }, morph(shuffleHTML, { duration: 180 }) + 20);
        } else {
          // Phase 2: deal into 第一組 / 第二組, alternating line by line.
          var dealt = morph(sheetHTML(copy, result, times), {
            duration: 460,
            stagger: dealDelay,
            appear: fromSheet ? null : '.gd-group-head, .gd-slots'
          });
          later(finish, dealt + 60);
        }
      })(0);
    }

    function setMode(mode) {
      if (state.busy || mode === state.mode || MODES.indexOf(mode) < 0) return;
      var fromSheet = Boolean(state.result);
      state.mode = mode;
      state.result = null;
      live.textContent = '';
      morph(poolHTML(copy, mode), { duration: 340, appear: fromSheet ? '.gd-cell' : null });
      update();
    }

    goButton.addEventListener('click', draw);
    modeButtons.forEach(function (button) {
      button.addEventListener('click', function () { setMode(button.getAttribute('data-gd-mode')); });
    });
    panel.querySelector('.gd-mode').addEventListener('keydown', function (event) {
      var keys = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Home: 1, End: 1 };
      if (!keys[event.key]) return;
      event.preventDefault();
      if (state.busy) return;
      var next = event.key === 'Home' ? MODES[0]
        : event.key === 'End' ? MODES[1]
        : (state.mode === MODES[0] ? MODES[1] : MODES[0]);
      setMode(next);
      modeButtons.filter(function (button) { return button.getAttribute('data-gd-mode') === next; })[0].focus();
    });

    sheet.innerHTML = poolHTML(copy, state.mode);
    update();
    return panel;
  }

  function mountGolfDraw(doc, options) {
    options = options || {};
    if (!doc || doc.querySelector('.golf-draw')) return [];
    var lang = (doc.documentElement.lang || '').toLowerCase();
    var copy = COPY[lang.indexOf('en') === 0 ? 'en' : 'zh'];
    var panels = [];
    GOLF_DAYS.forEach(function (dayId) {
      var day = doc.getElementById(dayId);
      if (day) panels.push(createPanel(doc, day, copy, options));
    });
    return panels;
  }

  return {
    PLAYERS: PLAYERS,
    COUPLES: COUPLES,
    SINGLES: SINGLES,
    GOLF_DAYS: GOLF_DAYS,
    randomIndex: randomIndex,
    shuffle: shuffle,
    couplePartitions: couplePartitions,
    drawRandom: drawRandom,
    drawCouple: drawCouple,
    drawGroups: drawGroups,
    groupNames: groupNames,
    readTeeTimes: readTeeTimes,
    mountGolfDraw: mountGolfDraw
  };
});
