import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DRAW_UNITS, buildValidPartitions, randomIndex, drawGroups } = require('../golf-draw.js');

const expectedUnits = [
  { name: '偉哥', size: 2 },
  { name: 'Asa', size: 2 },
  { name: '小林', size: 1 },
  { name: 'Derek', size: 1 },
  { name: 'Jack', size: 1 },
  { name: 'Alex', size: 1 },
];

function names(group) {
  return group.map((unit) => unit.name).sort();
}

function total(group) {
  return group.reduce((sum, unit) => sum + unit.size, 0);
}

function partitionKey(partition) {
  return [names(partition.groupA).join('|'), names(partition.groupB).join('|')].sort().join(' :: ');
}

function cryptoSequence(values) {
  let index = 0;
  return {
    getRandomValues(buffer) {
      buffer[0] = values[Math.min(index, values.length - 1)];
      index += 1;
      return buffer;
    },
  };
}

test('exposes_the_six_weighted_draw_units', () => {
  assert.deepEqual(DRAW_UNITS, expectedUnits);
});

test('builds_each_valid_mirror_deduplicated_partition', () => {
  const partitions = buildValidPartitions(DRAW_UNITS);
  assert.equal(partitions.length, 7);
  assert.equal(new Set(partitions.map(partitionKey)).size, 7);

  for (const partition of partitions) {
    assert.deepEqual(
      [...names(partition.groupA), ...names(partition.groupB)].sort(),
      expectedUnits.map((unit) => unit.name).sort(),
    );
    assert.equal(total(partition.groupA), 4);
    assert.equal(total(partition.groupB), 4);
  }
});

test('supports_couples_together_or_split_between_groups', () => {
  const partitions = buildValidPartitions(DRAW_UNITS);
  const coupleNames = new Set(['偉哥', 'Asa']);
  const together = partitions.some(({ groupA, groupB }) =>
    [groupA, groupB].some((group) => group.every((unit) => coupleNames.has(unit.name))),
  );
  const split = partitions.some(({ groupA, groupB }) =>
    [groupA, groupB].every((group) => group.filter((unit) => coupleNames.has(unit.name)).length === 1),
  );
  assert.equal(together, true);
  assert.equal(split, true);
});

test('uses_injected_crypto_to_select_an_index', () => {
  assert.equal(randomIndex(7, cryptoSequence([0])), 0);
  assert.equal(randomIndex(7, cryptoSequence([6])), 6);
});

test('draws_a_valid_copy_without_mutating_units', () => {
  const before = structuredClone(DRAW_UNITS);
  const result = drawGroups(DRAW_UNITS, cryptoSequence([0]));

  assert.equal(total(result.groupA), 4);
  assert.equal(total(result.groupB), 4);
  assert.deepEqual([...names(result.groupA), ...names(result.groupB)].sort(), expectedUnits.map((unit) => unit.name).sort());
  assert.deepEqual(DRAW_UNITS, before);
  assert.notEqual(result.groupA, DRAW_UNITS);
});
