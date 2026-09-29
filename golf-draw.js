(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FukuokaGolfDraw = api;
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

  return {
    DRAW_UNITS: DRAW_UNITS,
    buildValidPartitions: buildValidPartitions,
    randomIndex: randomIndex,
    drawGroups: drawGroups
  };
});
