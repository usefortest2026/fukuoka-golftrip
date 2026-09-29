# Offline PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trip site installable and keep its core itinerary and tools usable offline, while leaving coupon images as an explicit optional download.

**Architecture:** A versioned service worker maintains separate core and coupon caches: navigation is network-first with cached HTML fallback, core assets are cache-first with background refresh, and coupons are cached only through a fixed message API. A small shared PWA controller registers the worker, renders localized install/offline help at the bottom of Overview, and reports optional coupon-download progress.

**Tech Stack:** Web App Manifest, Service Worker/Cache Storage APIs, static HTML/CSS/JavaScript, Python unittest, Node/CDP browser tests, macOS `sips` for icon variants

**Spec:** `docs/superpowers/specs/2026-09-29-offline-current-day-golf-draw-design.md`

## Global Constraints

- First successful visit caches the five-day itinerary, hotel details, packing, draw, icons, and encrypted private-data assets.
- Coupon images are excluded from core precache and remain lazy until opened or explicitly downloaded.
- Weather, Google Maps, remote course photos, Google Fonts, Font Awesome, and other external sites are not promised offline.
- Never create or cache an unencrypted private-data copy.
- Install/offline help belongs at the bottom of More > Overview; do not add a tab.
- Chinese and English status, progress, error, retry, and install guidance must match functionally.
- A new service-worker version must replace old caches instead of trapping users on stale content.
- Do not push or deploy; stop at a localhost preview for user testing and wait for explicit approval.

## Review Focus

- The first offline navigation after a successful online visit must work even with query parameters such as `?p=day4`; Task 2 tests query-bearing navigation fallback.
- A failed core asset during install must not delete the previous working cache; Task 2 tests staged versioned activation behavior.
- Coupons must not enter any cache before user action, including when their `<details>` stay closed; Task 3 inspects cache contents before download.
- A partial coupon download must report the exact failed count and allow retry without redownloading valid entries unnecessarily; Task 3 simulates one failed response.
- Existing `version.txt` reload logic and the service worker must converge on the same release version; Task 5 asserts all HTML, cache, query-string, README, and version values match.

---

### Task 1: Manifest and Installable App Metadata

**Files:**
- Create: `manifest.webmanifest`
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`
- Create: `tests/test_pwa_assets.py`
- Modify: `fukuoka-golf.html:1-18`
- Modify: `fukuoka-golf-v2.html:1-18`
- Modify: `fukuoka-golf-en.html:1-18`

**Interfaces:**
- Consumes: existing `favicon.png` artwork.
- Produces: a manifest with `start_url: "./fukuoka-golf.html"`, `scope: "./"`, `display: "standalone"`, green theme/background colors, and 192/512 PNG icons.

- [ ] **Step 1: Write failing manifest and HTML metadata tests**

Assert the exact manifest fields, icon files and declared sizes, and one manifest/theme-color/apple-mobile-web-app-capable link set in each HTML entry point. Verify coupon files do not appear in the manifest.

- [ ] **Step 2: Run the test and verify failure**

Run: `python3 -m unittest tests.test_pwa_assets -v`

Expected: FAIL because the manifest and icon variants do not exist.

- [ ] **Step 3: Create icon variants and the manifest**

Use `sips -z 192 192 favicon.png --out icons/icon-192.png` and `sips -z 512 512 favicon.png --out icons/icon-512.png`; add the manifest and matching head metadata to all entry points.

- [ ] **Step 4: Verify metadata and image dimensions**

Run: `python3 -m unittest tests.test_pwa_assets -v`

Run: `sips -g pixelWidth -g pixelHeight icons/icon-192.png icons/icon-512.png`

Expected: tests PASS and dimensions report 192×192 and 512×512.

- [ ] **Step 5: Commit install metadata**

```bash
git add manifest.webmanifest icons/icon-192.png icons/icon-512.png tests/test_pwa_assets.py fukuoka-golf.html fukuoka-golf-v2.html fukuoka-golf-en.html
git commit -m "feat: add installable trip app metadata"
```

### Task 2: Versioned Core Offline Cache

**Files:**
- Create: `service-worker.js`
- Create: `pwa.js`
- Create: `tests/test_service_worker_static.py`
- Create: `tests/test_pwa_offline_browser.mjs`
- Modify: `fukuoka-golf.html:301-303`
- Modify: `fukuoka-golf-v2.html:301-303`
- Modify: `fukuoka-golf-en.html:539-541`

**Interfaces:**
- Consumes: completed `trip-day-router.js` and `golf-draw.js` from the earlier plans, plus all existing local core assets.
- Produces: `CORE_CACHE`, `CORE_ASSETS`, install/activate/fetch handlers, and `window.FukuokaPWA.register()` invoked by `pwa.js`.

- [ ] **Step 1: Write failing static cache-contract tests**

Require the core list to contain all three HTML files, CSS, locale scripts, `trip-day-router.js`, `golf-draw.js`, `pwa.js`, `private-trip-info.js`, `private-trip-info.enc.json`, manifest, both app icons, favicon, and `version.txt`. Assert it contains no `coupon-*.jpg`, remote URL, or unencrypted private payload.

- [ ] **Step 2: Run static tests and verify failure**

Run: `python3 -m unittest tests.test_service_worker_static -v`

Expected: FAIL because the service worker/controller are missing.

- [ ] **Step 3: Write failing online-to-offline browser tests**

Following the CDP test harness, visit each language online, wait for `navigator.serviceWorker.ready`, switch network conditions to offline, and reload with `?p=day4`. Assert Day 4 content, hotel copy controls, packing controls, and the draw entry remain available; remote image/font failures may occur but uncaught page exceptions may not. Also assert unsupported-service-worker fallback leaves the online page usable.

- [ ] **Step 4: Implement registration and core caching**

Register `./service-worker.js` with scope `./`. In the worker, install into a versioned staging cache, activate only after the core set succeeds, delete obsolete app caches during activation, claim clients, use network-first for navigation/version checks, and cached local fallback for core assets. Normalize navigation matching so query strings do not prevent HTML fallback.

- [ ] **Step 5: Run core static and browser tests**

Run: `python3 -m unittest tests.test_service_worker_static -v`

Run with localhost and CDP Chrome: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_pwa_offline_browser.mjs`

Expected: core cache assertions and online-to-offline reloads PASS.

- [ ] **Step 6: Commit core offline support**

```bash
git add service-worker.js pwa.js tests/test_service_worker_static.py tests/test_pwa_offline_browser.mjs fukuoka-golf.html fukuoka-golf-v2.html fukuoka-golf-en.html
git commit -m "feat: keep the trip itinerary available offline"
```

### Task 3: Optional Coupon Download

**Files:**
- Modify: `service-worker.js`
- Modify: `pwa.js`
- Modify: `fukuoka-golf-v2.css:1444`
- Modify: `tests/test_service_worker_static.py`
- Modify: `tests/test_pwa_offline_browser.mjs`

**Interfaces:**
- Consumes: worker registration from Task 2 and the fixed 15-file union of Chinese/English local coupon assets.
- Produces: worker messages `CACHE_COUPONS` and `GET_COUPON_CACHE_STATUS`; client messages `{type: 'COUPON_CACHE_PROGRESS', completed, total, failed}` and `{type: 'COUPON_CACHE_STATUS', completed, total, failed}`.

- [ ] **Step 1: Add failing cache-separation and UI tests**

Assert the worker owns a fixed `COUPON_ASSETS` list but excludes it from `CORE_ASSETS`. In the browser assert a localized “下載優惠券供離線使用”/“Download coupons for offline use” button appears at the top of the coupon section, coupon caches are empty before action, progress is announced, success changes to “已可離線使用”/“Available offline”, and the images load after switching offline.

- [ ] **Step 2: Add failing partial-error and retry tests**

Intercept one coupon request with a failure, assert the exact incomplete count is shown, restore the response, click retry, and assert every fixed coupon URL is cached without discarding previously successful entries.

- [ ] **Step 3: Implement the worker message protocol**

Cache only the fixed same-origin coupon list, report progress after each asset, retain successes on partial failure, answer status from actual Cache Storage membership, and retry only missing items.

- [ ] **Step 4: Implement localized progress UI and styles**

Have `pwa.js` insert the download control directly below `.v2-coupon-heading`, bind it only after a worker controls the page, expose progress through `role="status"`, and offer retry on partial failure. Preserve current closed-by-default details and `data-src` lazy hydration.

- [ ] **Step 5: Run coupon static and browser tests**

Run: `python3 -m unittest tests.test_service_worker_static -v`

Run with localhost/CDP: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_pwa_offline_browser.mjs`

Expected: no coupon is cached before opt-in; full, partial, retry, and offline-display cases PASS.

- [ ] **Step 6: Commit optional coupon caching**

```bash
git add service-worker.js pwa.js fukuoka-golf-v2.css tests/test_service_worker_static.py tests/test_pwa_offline_browser.mjs
git commit -m "feat: let travelers download coupons for offline use"
```

### Task 4: Overview Install and Offline Help

**Files:**
- Modify: `pwa.js`
- Modify: `fukuoka-golf-v2.css:1444`
- Modify: `tests/test_pwa_offline_browser.mjs`

**Interfaces:**
- Consumes: `beforeinstallprompt`, `navigator.standalone`, and `matchMedia('(display-mode: standalone)')` when available.
- Produces: one localized `.v2-offline-tools` card appended after `.overview-foot`, with supported install action or iOS instructions and current offline-ready status.

- [ ] **Step 1: Add failing install-help browser cases**

Assert the help card is the final Overview child and creates no fourth sub-tab. Simulate `beforeinstallprompt` and verify the install button invokes `prompt()` once; emulate iOS Safari and verify the concise Share → Add to Home Screen text; emulate standalone mode and verify redundant install controls are hidden while offline status remains.

- [ ] **Step 2: Implement install-state detection and localized help**

Append one compact card after `.overview-foot`; use feature detection rather than user-agent checks where possible, with an iOS-only instruction fallback. Never block or redirect the page when installation is unsupported or dismissed.

- [ ] **Step 3: Style the card within the existing mobile-first system**

Reuse the existing green tokens, panel radius, typography, focus outlines, safe-area behavior, and shared button language. Keep the card compact at 320–500px and non-dominant on desktop.

- [ ] **Step 4: Run browser and footer regressions**

Run with localhost/CDP: `BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_pwa_offline_browser.mjs`

Run: `python3 -m unittest tests.test_footer_navigation -v`

Expected: install/offline states PASS and the More tab still contains only Overview, Hotels, Packing.

- [ ] **Step 5: Commit the install help**

```bash
git add pwa.js fukuoka-golf-v2.css tests/test_pwa_offline_browser.mjs
git commit -m "feat: add trip app install and offline guidance"
```

### Task 5: Version Alignment, Full Local Verification, and User Handoff

**Files:**
- Modify: `version.txt`
- Modify: `README.md`
- Modify: `service-worker.js`
- Modify: `fukuoka-golf.html`
- Modify: `fukuoka-golf-v2.html`
- Modify: `fukuoka-golf-en.html`
- Modify: `tests/test_pwa_assets.py`

**Interfaces:**
- Consumes: all completed current-day, draw, and PWA assets.
- Produces: one consistent local preview release identifier and an unpushed working tree ready for user acceptance testing.

- [ ] **Step 1: Add a failing release-alignment assertion**

Parse `version.txt`; assert its value equals every inline `APP_VERSION`, local asset query suffix, README suffix, and the service-worker cache version.

- [ ] **Step 2: Run and verify version mismatch**

Run: `python3 -m unittest tests.test_pwa_assets -v`

Expected: FAIL until all release identifiers are updated together.

- [ ] **Step 3: Bump all local release identifiers to `20260929-48`**

Update every location covered by the assertion to `20260929-48`, and do not push or deploy it.

- [ ] **Step 4: Run the complete automated suite**

Run: `python3 -m unittest discover -s tests -p 'test_*.py' -v`

Run: `node --test tests/test_trip_day_router.mjs tests/test_golf_draw_logic.mjs`

Run against the same localhost server and CDP Chrome:

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_desktop_layout_browser.mjs`

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_hotel_controls_browser.mjs`

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_visit_japan_browser.mjs`

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_current_day_navigation_browser.mjs`

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_golf_draw_browser.mjs`

`BASE_URL=http://127.0.0.1:8765 CDP_PORT=9238 node tests/test_pwa_offline_browser.mjs`

Expected: all tests PASS with no unexpected console exceptions.

- [ ] **Step 5: Perform local mobile visual verification**

At 390×844 inspect Day 2/4/5 draw placement and animation, More > Overview install/offline card, coupon download progress, Chinese/English layouts, reduced motion, and a true offline reload. Confirm no horizontal overflow or covered bottom controls.

- [ ] **Step 6: Commit the verified local release**

```bash
git add version.txt README.md service-worker.js fukuoka-golf.html fukuoka-golf-v2.html fukuoka-golf-en.html tests/test_pwa_assets.py
git commit -m "chore: prepare offline trip features for local review"
```

- [ ] **Step 7: Stop before deployment**

Report the localhost URL, test evidence, changed commits, and any known browser limitations to the user. Do not run `git push`, GitHub Pages deployment, or any production smoke test until the user explicitly approves after testing.
