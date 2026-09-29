import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getTokyoDate, resolveInitialPage } = require('../trip-day-router.js');

const validPages = ['day1', 'day2', 'day3', 'day4', 'day5', 'more'];

test('formats_date_in_tokyo', () => {
  assert.equal(getTokyoDate('2026-11-05T14:59:59.999Z'), '2026-11-05');
  assert.equal(getTokyoDate('2026-11-05T15:00:00.000Z'), '2026-11-06');
});

test('maps_each_trip_date', () => {
  const fixtures = [
    ['2026-11-06T03:00:00.000Z', 'day1'],
    ['2026-11-07T03:00:00.000Z', 'day2'],
    ['2026-11-08T03:00:00.000Z', 'day3'],
    ['2026-11-09T03:00:00.000Z', 'day4'],
    ['2026-11-10T03:00:00.000Z', 'day5'],
  ];

  for (const [now, expected] of fixtures) {
    assert.equal(resolveInitialPage({ now, requestedPage: null, validPages }), expected);
  }
});

test('crosses_at_tokyo_midnight', () => {
  assert.equal(
    resolveInitialPage({ now: '2026-11-05T15:00:00.000Z', requestedPage: null, validPages }),
    'day1',
  );
  assert.equal(
    resolveInitialPage({ now: '2026-11-09T15:00:00.000Z', requestedPage: null, validPages }),
    'day5',
  );
});

test('explicit_valid_page_wins', () => {
  assert.equal(
    resolveInitialPage({ now: '2026-11-07T03:00:00.000Z', requestedPage: 'day4', validPages }),
    'day4',
  );
  assert.equal(
    resolveInitialPage({ now: '2026-11-07T03:00:00.000Z', requestedPage: 'more', validPages }),
    'more',
  );
});

test('invalid_or_outside_trip_defaults_to_day1', () => {
  assert.equal(
    resolveInitialPage({ now: '2026-11-07T03:00:00.000Z', requestedPage: 'day99', validPages }),
    'day1',
  );
  assert.equal(
    resolveInitialPage({ now: '2026-09-29T03:00:00.000Z', requestedPage: null, validPages }),
    'day1',
  );
});
