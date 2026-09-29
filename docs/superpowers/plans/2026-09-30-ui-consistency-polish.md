# Trip UI Consistency Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the new utility UI and complete the approved cross-site polish without changing excluded flows or deploying.

**Architecture:** Keep the existing DOM-generation modules and shared stylesheet. Make narrow semantic additions only where accessibility or state styling needs them, use the current browser suites for observable behavior, and keep Chinese/English entry points aligned.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node browser tests, Python static tests, service worker.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-consistency-polish-design.md`

## Global Constraints

- Do not change private-information activation, portrait lock, or unrelated touch targets.
- Do not add dependencies, tabs, image assets, persistence, or network requests.
- Preserve draw grouping, coupon caching, install/offline behavior, and both locales.
- Work only on the feature worktree; do not deploy, push, or merge.
- Maintain a clean rollback path to `pre-trip-features-20260929`.

## Review Focus

- A 320px viewport must not overflow after utility cards and English metadata reflow.
- The native install prompt, iOS guidance, standalone state, unsupported fallback, and coupon retry states must remain functional.
- Visible draw completion copy must be concise while assistive technology still receives both group rosters.
- More tabs must expose exactly one selected tab and matching visible tabpanel after every switch.
- Updated assets must be served under one aligned offline version after service-worker control.

---

### Task 1: Normalize the golf draw

**Files:**
- Modify: `tests/test_golf_draw_browser.mjs`
- Modify: `golf-draw.js`
- Modify: `fukuoka-golf-v2.css`

**Interfaces:**
- Consumes: existing `.golf-draw-*` DOM and draw state machine.
- Produces: quiet entry styling, accessible label contrast, dimpled balls, concise visible status, hidden detailed announcement.

- [ ] **Step 1: Complete the failing browser expectations** for the light utility entry, modal-label contrast, layered ball texture, concise visible completion status, and detailed hidden live announcement.
- [ ] **Step 2: Run `node tests/test_golf_draw_browser.mjs`** and confirm it fails for the approved missing presentation.
- [ ] **Step 3: Implement the minimal DOM/CSS changes** without altering grouping, timing duration, persistence, focus trapping, or locale behavior.
- [ ] **Step 4: Run `node tests/test_golf_draw_browser.mjs`** and confirm the entire draw suite passes.
- [ ] **Step 5: Commit** the draw normalization.

### Task 2: Distill offline and coupon controls

**Files:**
- Modify: `tests/test_pwa_offline_browser.mjs`
- Modify: `pwa.js`
- Modify: `fukuoka-golf-v2.css`

**Interfaces:**
- Consumes: current service-worker messages, coupon-download states, install prompt, standalone detection.
- Produces: semantic preparing/ready/unsupported presentation with simplified utility surfaces.

- [ ] **Step 1: Add failing browser expectations** for the removed icon tile, compact offline states, readable secondary action, hidden empty coupon status, and simplified coupon icon treatment.
- [ ] **Step 2: Run `node tests/test_pwa_offline_browser.mjs`** and confirm the new visual/semantic expectations fail while existing functionality remains exercised.
- [ ] **Step 3: Update `pwa.js` state attributes and shared CSS** while preserving all download, partial-retry, install, iOS, standalone, and unsupported branches.
- [ ] **Step 4: Run `node tests/test_pwa_offline_browser.mjs`** and confirm the full PWA suite passes.
- [ ] **Step 5: Commit** the offline and coupon simplification.

### Task 3: Complete responsive, accessibility, performance, and copy polish

**Files:**
- Modify: `tests/test_desktop_layout_browser.mjs`
- Modify: `tests/test_current_day_navigation_browser.mjs`
- Modify: `tests/test_footer_navigation.py`
- Modify: `fukuoka-golf.html`
- Modify: `fukuoka-golf-v2.html`
- Modify: `fukuoka-golf-en.html`
- Modify: `fukuoka-golf-v2.js`
- Modify: `fukuoka-golf-en-v2.js`
- Modify: `fukuoka-golf-v2.css`

**Interfaces:**
- Consumes: existing `switchPage`, `switchSub`, hero metadata, course images, More subpages.
- Produces: correct tab semantics, deliberate English mobile metadata, reduced-motion scrolling, lazy course images, localized fallback copy, decorative image semantics.

- [ ] **Step 1: Add failing observable tests** for tab relationships/state changes, reduced-motion scroll behavior, English mobile metadata, image loading attributes, localized fallback copy, and decorative image alt text.
- [ ] **Step 2: Run the targeted browser and Python tests** and confirm they fail only for the approved missing behavior.
- [ ] **Step 3: Implement the smallest HTML/JS/CSS changes** across all three entry points, preserving the six-item navigation and existing content hierarchy.
- [ ] **Step 4: Run all targeted tests** and confirm they pass at 320px, 390px, desktop, and reduced-motion contexts.
- [ ] **Step 5: Commit** the cross-site polish.

### Task 4: Align offline release assets and verify the branch

**Files:**
- Modify: `fukuoka-golf.html`
- Modify: `fukuoka-golf-v2.html`
- Modify: `fukuoka-golf-en.html`
- Modify: `service-worker.js`
- Modify: `version.txt`
- Modify: `README.md`
- Test: all existing Python and Node/browser suites.

**Interfaces:**
- Consumes: completed CSS, JavaScript, and HTML assets.
- Produces: one versioned local release that updates under the existing service-worker rules.

- [ ] **Step 1: Add or update the release-alignment expectation** if the existing test does not already cover every changed version reference.
- [ ] **Step 2: Bump all release references from `20260929-48` to one new version** without changing cache behavior.
- [ ] **Step 3: Run Python, Node logic, and all six browser suites**, then inspect 320px, 390px, 1024px, and 1440px screenshots for overflow, hierarchy, and state presentation.
- [ ] **Step 4: Request one fresh whole-branch review**, fix any Critical/Important findings through RED→GREEN, and rerun the affected full suites.
- [ ] **Step 5: Commit** the aligned local-review release and leave the branch undeployed.

