import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const draw = require('../golf-draw.js');

const COUPLE_KEYS = ['Lois|Royston', 'Asa|Fi'];

function groupKey(group) {
  return draw.groupNames(group).slice().sort().join(',');
}

function partitionKey(result) {
  return result.map(groupKey).sort().join(' / ');
}

function assertValidResult(result) {
  assert.equal(result.length, 2, 'two groups');
  for (const group of result) assert.equal(draw.groupNames(group).length, 4, 'four players per group');
  const everyone = result.flatMap(draw.groupNames).sort();
  assert.deepEqual(everyone, [...draw.PLAYERS].sort(), 'every player appears exactly once');
}

function assertCouplesTogether(result) {
  for (const couple of draw.COUPLES) {
    const holders = result.filter((group) => group.some((unit) => unit.length === 2 && unit.slice().sort().join('|') === couple.slice().sort().join('|')));
    assert.equal(holders.length, 1, `${couple.join(' & ')} is one unit inside exactly one group`);
  }
}

function tally(mode, runs) {
  const counts = new Map();
  for (let index = 0; index < runs; index += 1) {
    const result = draw.drawGroups(mode);
    assertValidResult(result);
    if (mode === 'couple') assertCouplesTogether(result);
    const key = partitionKey(result);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

test('roster has the eight players, two couples and four singles', () => {
  assert.deepEqual([...draw.PLAYERS], ['Royston', 'Lois', 'Asa', 'Fi', 'Raistlin', 'Alex', 'Derek', 'Jack']);
  assert.deepEqual(draw.COUPLES.map((couple) => [...couple]), [['Royston', 'Lois'], ['Asa', 'Fi']]);
  assert.deepEqual([...draw.SINGLES], ['Raistlin', 'Alex', 'Derek', 'Jack']);
  assert.deepEqual([...draw.GOLF_DAYS], ['day2', 'day4', 'day5']);
});

test('random mode reaches all 35 splits with equal probability', () => {
  const runs = 70000;
  const counts = tally('random', runs);
  assert.equal(counts.size, 35, 'C(8,4) / 2 distinct splits');
  const expected = runs / 35;
  for (const [key, count] of counts) {
    assert.ok(Math.abs(count - expected) < expected * 0.15, `${key} drawn ${count} times, expected about ${expected}`);
  }
});

test('random mode can split a couple', () => {
  const counts = tally('random', 2000);
  const splitsACouple = [...counts.keys()].some((key) => key.split(' / ').some((group) => {
    const names = group.split(',');
    return names.includes('Royston') !== names.includes('Lois');
  }));
  assert.ok(splitsACouple);
});

test('couple partitions are the seven valid 4 + 4 splits', () => {
  const partitions = draw.couplePartitions();
  assert.equal(partitions.length, 7);
  assert.equal(new Set(partitions.map(partitionKey)).size, 7, 'no duplicate or mirrored splits');
  for (const partition of partitions) {
    assertValidResult(partition);
    assertCouplesTogether(partition);
  }
  const bothCouplesTogether = partitions.filter((partition) => partition.some((group) => group.filter((unit) => unit.length === 2).length === 2));
  assert.equal(bothCouplesTogether.length, 1, 'exactly one split puts both couples together');
});

test('couple mode never splits a couple and gives every split equal probability', () => {
  const runs = 35000;
  const counts = tally('couple', runs);
  assert.equal(counts.size, 7);
  const expected = runs / 7;
  for (const [key, count] of counts) {
    assert.ok(Math.abs(count - expected) < expected * 0.1, `${key} drawn ${count} times, expected about ${expected}`);
  }
  const together = [...counts].filter(([key]) => key.split(' / ').some((group) => COUPLE_KEYS.every((couple) => couple.split('|').every((name) => group.split(',').includes(name)))));
  assert.equal(together.length, 1, 'one key holds both couples in one group');
});

test('either couple can land in either group, in any line order', () => {
  const firstGroupHasRT = new Set();
  const rtLines = new Set();
  for (let index = 0; index < 3000; index += 1) {
    const [first] = draw.drawCouple();
    firstGroupHasRT.add(draw.groupNames(first).includes('Royston'));
    const line = draw.groupNames(first).indexOf('Royston');
    if (line >= 0) rtLines.add(line);
  }
  assert.deepEqual([...firstGroupHasRT].sort(), [false, true]);
  assert.ok(rtLines.size >= 3, 'couples are not pinned to the top of the group');
});

test('randomIndex validates input and rejects biased values', () => {
  assert.throws(() => draw.randomIndex(0), RangeError);
  assert.throws(() => draw.randomIndex(1.5), RangeError);
  const values = [0xffffffff, 7];
  const fakeCrypto = { getRandomValues(buffer) { buffer[0] = values.shift(); return buffer; } };
  assert.equal(draw.randomIndex(6, fakeCrypto), 1, 'out-of-range value is redrawn, then 7 % 6');
});

test('draws still work without Web Crypto', () => {
  assertValidResult(draw.drawGroups('random', {}));
  const result = draw.drawGroups('couple', {});
  assertValidResult(result);
  assertCouplesTogether(result);
});

test('unknown modes are rejected', () => {
  assert.throws(() => draw.drawGroups('teams'), RangeError);
});
