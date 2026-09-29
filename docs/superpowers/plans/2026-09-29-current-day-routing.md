# Current-Day Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the correct itinerary day from 2026-11-06 through 2026-11-10 using Japan time, while preserving explicit links and manual navigation.

**Architecture:** Put date calculation and initial-page selection in one small UMD-style module that is usable by both the browser and Node tests. The existing inline page bootstrap in all three HTML entry points consumes that module; the old Today/Next enhancement is removed so routing is the only visible behavior change.

**Tech Stack:** Static HTML, browser JavaScript, Node.js built-in test runner/assertions, existing Python unittest suite

**Spec:** `docs/superpowers/specs/2026-09-29-offline-current-day-golf-draw-design.md`

## Global Constraints

- Date decisions use `Asia/Tokyo`, never the device time zone.
- Map 2026-11-06 through 2026-11-10 to `day1` through `day5` exactly.
- A valid explicit `?p=dayN` or `?p=more` wins over automatic routing.
- Outside the five trip dates, and for an invalid `p`, default to `day1`.
- Do not add a now/next card or any new navigation state UI; remove the existing generated Today/Next badges.
- Keep Chinese production, Chinese v2, and English entry points behaviorally aligned.
- Do not push or deploy; stop at a local preview for user testing.

## Review Focus

- Tokyo midnight while the phone is still on the previous calendar day must select the new Japan day; Task 1 pins this with UTC boundary timestamps.
- An invalid `p` value must not activate an arbitrary DOM node; Task 1 and Task 2 pin fallback to `day1`.
- `?p=more` must remain a supported explicit deep link; Task 1 and Task 2 cover it.
- Cleaning `p` from the address bar must retain the cache-busting `_` query parameter; Task 2 covers the final URL.
- Clicking another day after automatic selection must remain on that day; Task 2 covers manual navigation after bootstrap.

---

### Task 1: Pure Japan-Date Page Resolver

**Files:**
- Create: `trip-day-router.js`
- Create: `tests/test_trip_day_router.mjs`

**Interfaces:**
- Consumes: a Date-compatible value plus a requested page string.
- Produces: `getTokyoDate(now: Date|string|number) -> string` and `resolveInitialPage(options: {now, requestedPage, validPages}) -> string`, exported as CommonJS in Node and `window.FukuokaTripDay` in browsers.

- [ ] **Step 1: Write the failing resolver tests**

Add tests named `formats_date_in_tokyo`, `maps_each_trip_date`, `crosses_at_tokyo_midnight`, `explicit_valid_page_wins`, and `invalid_or_outside_trip_defaults_to_day1`. Assert all five exact date/page pairs, `2026-11-05T15:00:00.000Z -> day1`, `2026-11-09T15:00:00.000Z -> day5`, explicit `day4`/`more`, and invalid `day99 -> day1`.

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `node --test tests/test_trip_day_router.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or equivalent missing-module output.

- [ ] **Step 3: Implement the two exported functions**

Create `trip-day-router.js` as a dependency-free UMD module. Use `Intl.DateTimeFormat(..., { timeZone: 'Asia/Tokyo' })`; keep the trip-date mapping and default page inside this module.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/test_trip_day_router.mjs`

Expected: all resolver tests PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add trip-day-router.js tests/test_trip_day_router.mjs
git commit -m "feat: resolve the current itinerary day in Japan"
```

### Task 2: Entry-Point Routing Integration

**Files:**
- Modify: `fukuoka-golf.html:239-282`
- Modify: `fukuoka-golf-v2.html:239-282`
- Modify: `fukuoka-golf-en.html:466-520`
- Modify: `fukuoka-golf-v2.js:504-527`
- Modify: `fukuoka-golf-en-v2.js:454-471`
- Create: `tests/test_current_day_navigation.py`
- Create: `tests/test_current_day_navigation_browser.mjs`

**Interfaces:**
- Consumes: `window.FukuokaTripDay.resolveInitialPage(...)` from Task 1 and the existing `switchPage(id, btn)` functions.
- Produces: identical initial routing in all three HTML files, with no generated `.v2-day-state` badges.

- [ ] **Step 1: Write failing static integration tests**

In `tests/test_current_day_navigation.py`, assert each HTML entry point loads `trip-day-router.js` before its page-bootstrap script, calls `resolveInitialPage`, and preserves `_` while removing only `p`. Assert neither enhancement script contains `Asia/Taipei`, `data-state = ...next`, nor generated `Next` text.

- [ ] **Step 2: Run the static tests and verify failure**

Run: `python3 -m unittest tests.test_current_day_navigation -v`

Expected: FAIL because the router is not loaded and the old badge block still exists.

- [ ] **Step 3: Write failing browser behavior tests**

Use the existing Chrome DevTools Protocol test style. Before each navigation, install a page-start Date shim for fixed UTC timestamps. For each entry point assert: no `p` on 2026-11-07 Japan time activates `day2`; `?p=day4&_=test` activates `day4` and leaves `?_=test`; `?p=more` activates `more`; `?p=bogus` activates `day1`; clicking the Day 5 tab after auto-routing keeps `day5` active.

- [ ] **Step 4: Integrate the resolver into all HTML entry points**

Load `trip-day-router.js` before the current inline routing bootstrap. Refactor `fromParam()` to resolve the initial page once, activate its matching button, retain unrelated query parameters, synchronize the language link, and avoid rerunning on later manual tab clicks.

- [ ] **Step 5: Remove the old Today/Next badge generation**

Delete the `tripDays`/`Intl.DateTimeFormat`/`.v2-day-state` blocks at the end of both enhancement scripts; do not replace them with another status label.

- [ ] **Step 6: Run focused static and browser tests**

Run: `python3 -m unittest tests.test_current_day_navigation -v`

Run with the existing local server and CDP Chrome: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_current_day_navigation_browser.mjs`

Expected: all assertions PASS; page console error list is empty.

- [ ] **Step 7: Run existing navigation regressions**

Run: `python3 -m unittest tests.test_footer_navigation -v`

Expected: all existing footer, overview, coupon, hotel, and copy assertions PASS.

- [ ] **Step 8: Commit the integration**

```bash
git add fukuoka-golf.html fukuoka-golf-v2.html fukuoka-golf-en.html fukuoka-golf-v2.js fukuoka-golf-en-v2.js tests/test_current_day_navigation.py tests/test_current_day_navigation_browser.mjs
git commit -m "feat: open the itinerary on today's Japan date"
```
