# Trip UI Consistency Polish Design

## Goal

Bring the newly added golf draw, offline/install, and coupon-download controls back into the trip site's calm, practical visual language, then complete the small responsive, performance, accessibility, and copy fixes approved on 2026-09-30.

## Approved scope

- Fix only mandatory item 3 from the design critique: the low-contrast `Golf Day` label.
- Implement every item under “建議一起改”.
- Implement every item under “有空再修”.
- Do not change the private-information triple-click flow, the landscape lock, or unrelated touch-target sizes.
- Keep all work local. Do not deploy, push, or merge.

## Design

### Golf draw

The page entry becomes a quiet white utility row with the site's existing neutral border, restrained shadow, 10px radius, and a pale-green secondary action. The promotional `Golf Day` eyebrow is hidden at the entry and retained inside the dialog in accessible brand green. Draw balls become matte ivory golf balls rendered with subtle CSS dimples, light shadows, and dark-green names. Motion is reduced in distance and rotation. The visible completion status stays concise; a visually hidden live region announces full group membership to assistive technology.

### Offline and coupon controls

The offline/install block becomes a compact white status tool with no large icon tile or negative margin. Status uses a small dot/check plus text, with pale-green outline install action and a readable network note. The coupon control remains inline under the coupon heading, loses its nested circular icon tile, hides an empty status line, and differentiates ready/partial/unsupported states without adding cards.

### Cross-site polish

More subtabs expose correct tab/tabpanel relationships and update `aria-selected`. Off-screen course photos use native lazy loading, async decoding, and dimensions to reduce unnecessary work and layout movement. The English mobile hero deliberately hides its lowest-priority metadata instead of clipping it. JavaScript scrolling respects reduced motion. Chinese fallback hotel copy is correct without JavaScript, and the decorative header image has an empty alt attribute.

### Constraints

- Preserve the existing forest-green, warm-neutral palette and current fonts.
- Preserve all content, draw logic, offline behavior, coupon ordering, navigation structure, and bilingual parity.
- Add no dependencies, tabs, bitmap assets, or external requests.
- Keep 320px–1440px layouts free of horizontal overflow.
- Bump the offline asset version so local testing receives the changed CSS/JS/HTML reliably.

