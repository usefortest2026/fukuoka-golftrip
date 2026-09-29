(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FukuokaTripDay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TRIP_PAGES = {
    '2026-11-06': 'day1',
    '2026-11-07': 'day2',
    '2026-11-08': 'day3',
    '2026-11-09': 'day4',
    '2026-11-10': 'day5'
  };

  function getTokyoDate(now) {
    var date = now instanceof Date ? now : new Date(now);
    var parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).forEach(function (part) {
      parts[part.type] = part.value;
    });
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function resolveInitialPage(options) {
    var requestedPage = options.requestedPage;
    var validPages = options.validPages || [];
    if (requestedPage !== null && requestedPage !== undefined) {
      return validPages.indexOf(requestedPage) !== -1 ? requestedPage : 'day1';
    }
    return TRIP_PAGES[getTokyoDate(options.now)] || 'day1';
  }

  return {
    getTokyoDate: getTokyoDate,
    resolveInitialPage: resolveInitialPage
  };
});
