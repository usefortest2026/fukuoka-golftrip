# Course Weather Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User approved preview and authorized deployment.

**Goal:** Deploy the approved collapsed course-weather panels with live data.
**Architecture:** One shared browser/CommonJS module supplies hourly normalization, validated cache fallback and localized rendering. Existing city forecast logic stays intact. Existing accordion styles are extended only for course weather.
**Tech Stack:** Plain JavaScript, CSS, Node tests, existing CDP browser test harness, GitHub Pages.
**Spec:** docs/superpowers/specs/2026-11-05-course-weather.md

## Global Constraints
- All three HTML entry points; days 2, 4, 5 only; Asia/Tokyo and wind in m/s.
- Initially collapsed on every viewport; toggle remains usable after resizing.
- At most 24-hour cached fallback, visibly identified; missing values display as unavailable.
- No deployment of preview snapshot or preview notice; release 20261105-32.

## Review Focus
- Exact date/play-hour filtering excludes cold overnight temperatures.
- Null, empty and out-of-range values never become valid zeroes.
- Failed, partial or wrong-location responses do not poison last valid cache.
- Expired/future/corrupt cache never presents as fresh forecast.
- Desktop resize/accordion handlers preserve weather disclosure state; bilingual narrow layouts fit.

## Task 1: Forecast module and integration
Files: course-weather.js; fukuoka-golf-v2.css; both locale scripts; all three HTML entries; service-worker.js; version.txt; README.md; tests/test_course_weather.mjs; tests/test_pwa_assets.py.
Interfaces: selectHours(payload, course), summarize(hours), requestUrl(course), loadForecast(course, {fetch, storage, now, timeoutMs}); browser mount after locale enhancement.
- [x] Write and run failing Node cases for play-hour filtering, missing/out-of-range values, request coordinates/units, network and cache fallback.
- [x] Implement normalization, request/cache behavior and accessible bilingual disclosure based on approved preview.
- [x] Exclude weather disclosures from desktop auto-open/click-blocking selectors, integrate script and offline core assets, align release.
- [x] Run Node/Python suites.

## Task 2: Browser verification and release
Files: tests/test_course_weather_browser.mjs.
- [x] Check initial collapse, toggle and resize, hourly data, fallback and missing-state rendering in Chinese/English at phone and desktop sizes; intercept only external weather responses.
- [x] Check existing desktop, group-draw and offline browser regressions; inspect actual live weather UI.
- [x] Review final changes; fix material findings.
- [ ] Commit, push main, and verify deployed bytes/version and actual course-weather data.

## Verification record
- 26 Python tests and 85 Node tests passed; forecast unit tests rerun after the cache-expiry fix.
- Course-weather browser checks passed for all three entry points, phone/desktop widths, default collapse, toggle/resize, fallback, unavailable and retry. A near-expiry cache test reproduced the review finding before the fix and passed afterward.
- Existing desktop responsive, group-draw and PWA core offline browser suites passed.
- Desktop suite's five-item Day 5 assertion also failed against deployed HEAD 4f34f2c (actual four). Updated the stale test expectation without changing itinerary data. Group-draw storage check excludes only the weather-cache namespace, since that independent refresh may complete during a draw.
- Independent reviewer found the displayed-cache expiry edge; fixed with expiry timer plus visibility/toggle checks. Targeted rereview found no remaining material issues.
- Real live API data rendered successfully in the local Chinese page; no preview snapshots are included in production.
