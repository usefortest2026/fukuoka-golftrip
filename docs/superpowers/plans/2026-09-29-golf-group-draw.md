# Golf Group Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ephemeral, animated 4+4 golf grouping draw at the bottom of Day 2, Day 4, and Day 5.

**Architecture:** A shared dependency-free UMD module owns weighted partition generation, unbiased selection, localized UI creation, and modal lifecycle. The three HTML entry points load the same module, while the shared stylesheet supplies the golf-ball animation and responsive modal presentation.

**Tech Stack:** Static HTML/CSS, browser JavaScript, Web Crypto, Node.js built-in test runner/assertions, existing CDP browser-test pattern

**Spec:** `docs/superpowers/specs/2026-09-29-offline-current-day-golf-draw-design.md`

## Global Constraints

- Visible names are exactly 偉哥, Asa, 小林, Derek, Jack, Alex.
- Internal weights are 2, 2, 1, 1, 1, 1 respectively; every result is 4+4 actual players.
- Never display partner names, 「女伴」, or visible-name counts per group.
- Entry points appear only at the bottom of Day 2, Day 4, and Day 5; no new tab.
- No copy, share, persistence, backend, or multi-device synchronization.
- Closing resets the game; reopening starts unopened, while “draw again” redraws immediately.
- Use CSS/existing icons only; add no image or third-party library.
- Do not push or deploy; stop at a local preview for user testing.

## Review Focus

- Mirror partitions must not receive double probability; Task 1 verifies canonical deduplication.
- Every name must appear exactly once and both weighted totals must be 4; Task 1 exhaustively verifies every candidate.
- Repeated taps during the two-second animation must not start overlapping draws; Task 2 covers the locked drawing state.
- Escape, close, and reopen must restore the unopened game with no saved result; Task 2 covers modal lifecycle and storage calls.
- Reduced-motion users must receive an immediate readable result; Task 2 covers the media-query branch and final live-region text.

---

### Task 1: Weighted Draw Engine

**Files:**
- Create: `golf-draw.js`
- Create: `tests/test_golf_draw_logic.mjs`

**Interfaces:**
- Consumes: unit arrays shaped as `{ name: string, size: number }[]` and an injected integer selector.
- Produces: `DRAW_UNITS`, `buildValidPartitions(units) -> {groupA, groupB}[]`, `randomIndex(maxExclusive, cryptoLike) -> number`, and `drawGroups(units, cryptoLike) -> {groupA, groupB}`; exports work through CommonJS and `window.FukuokaGolfDraw`.

- [ ] **Step 1: Write failing exhaustive partition tests**

Assert the six exact units and weights, that every generated partition contains every name exactly once, both sums equal 4, no canonical pair repeats when groups are swapped, both-couples-together and one-couple-per-group configurations exist, and deterministic crypto bytes select the expected candidate without mutating `DRAW_UNITS`.

- [ ] **Step 2: Run the logic test and verify failure**

Run: `node --test tests/test_golf_draw_logic.mjs`

Expected: FAIL because `golf-draw.js` does not exist.

- [ ] **Step 3: Implement the pure engine and unbiased index selection**

Enumerate subsets totaling 4, canonicalize each partition by sorted names so left/right mirrors collapse, and select with Web Crypto rejection sampling. Permit a `Math.random()` fallback only when no usable `crypto.getRandomValues` exists.

- [ ] **Step 4: Run the focused logic tests**

Run: `node --test tests/test_golf_draw_logic.mjs`

Expected: all draw-engine tests PASS.

- [ ] **Step 5: Commit the engine**

```bash
git add golf-draw.js tests/test_golf_draw_logic.mjs
git commit -m "feat: add valid weighted golf group draws"
```

### Task 2: Draw Modal and Lifecycle

**Files:**
- Modify: `golf-draw.js`
- Modify: `fukuoka-golf-v2.css:1444`
- Modify: `fukuoka-golf.html:301-302`
- Modify: `fukuoka-golf-v2.html:301-302`
- Modify: `fukuoka-golf-en.html:539-540`
- Modify: `tests/test_footer_navigation.py:154-204`
- Create: `tests/test_golf_draw_browser.mjs`

**Interfaces:**
- Consumes: `drawGroups(...)` from Task 1 and `document.documentElement.lang`.
- Produces: `mountGolfDraw(document, options?)`, three `.golf-draw-entry` sections, one accessible `.golf-draw-modal`, localized Chinese/English controls, and draw availability from all three entry points without changing navigation.

- [ ] **Step 1: Add failing static inclusion assertions**

Extend the Python suite to require one versioned `golf-draw.js` script in every entry point and to keep exactly the existing six top-level pages and three More sub-tabs.

- [ ] **Step 2: Write failing browser lifecycle tests**

Following the existing CDP helpers, assert exactly one entry is the last child of each of `#day2`, `#day4`, and `#day5`, none exists on Day 1/3/More, and opening shows all six names. After drawing, assert group weights are 4+4 using the hidden test-exported weights, each name appears once, and the result live region is populated.

- [ ] **Step 3: Add failing interaction and resilience assertions**

Assert a second start tap during animation does not produce a second timer/result, “再抽一次”/“Draw again” produces another valid result without confirmation, Escape restores focus to the opener, closing and reopening shows no old result, body scrolling is restored, local/session storage setters are never called, and a reduced-motion emulation reveals the result without the two-second wait.

- [ ] **Step 4: Run the new tests and verify failure**

Run: `python3 -m unittest tests.test_footer_navigation -v`

Run with the existing local server and CDP Chrome: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_golf_draw_browser.mjs`

Expected: the new inclusion and draw assertions FAIL while existing regressions remain green.

- [ ] **Step 5: Implement localized DOM creation and modal state**

Extend `golf-draw.js` with `mountGolfDraw(document, options?)`. Append compact entry cards to the three golf days, append a single `role="dialog" aria-modal="true"` modal to `body`, manage focus and background scroll, and use one cancellable draw timer. Use locale copy tables inside the module; names stay unchanged.

- [ ] **Step 6: Add responsive CSS animation and result layout**

Add shared styles for the footer card, full-screen backdrop, six golf balls, two result groups, safe-area padding, 44px minimum controls, drawing/complete states, and `prefers-reduced-motion`. Keep the visual language restrained green and avoid new assets.

- [ ] **Step 7: Load the draw module from all three entry points**

Load it after the locale enhancement script and before `private-trip-info.js`, so it mounts after the source itinerary DOM exists without changing the current navigation hierarchy.

- [ ] **Step 8: Run browser and navigation tests**

Run with the existing local server and CDP Chrome: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_golf_draw_browser.mjs`

Run: `python3 -m unittest tests.test_footer_navigation -v`

Expected: Chinese and English lifecycle, accessibility, layout, reset, script-inclusion, and navigation assertions PASS with no console errors.

- [ ] **Step 9: Commit the complete draw UI**

```bash
git add golf-draw.js fukuoka-golf-v2.css fukuoka-golf.html fukuoka-golf-v2.html fukuoka-golf-en.html tests/test_footer_navigation.py tests/test_golf_draw_browser.mjs
git commit -m "feat: add the golf group draw game"
```
