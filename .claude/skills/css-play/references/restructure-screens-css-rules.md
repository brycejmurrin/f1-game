# Restructure rules — screens/layers, CSS variation, DOM size, fashionable-but-unproven

Load from the SKILL.md index when the task needs this detail.

## Screens and layers

**1. Screen visibility must be a TOTAL function over a declared registry.**
On every transition, assign state to *every* screen, not just the two involved.
*Prevents:* two screens open at once, and screens drifting out of the list.
2,140 vanilla-JS repos converge on this shape; `js/ui/layers.js` exists
because three modules each kept their own list and **they differed by five
screens** — career plus three sub-sheets and quali were missing from the input
gate, so arrow keys inside the career hub latched the car's steering.

**2. Never enumerate screens with `querySelectorAll('.screen')` when a declared
list exists.** *Prevents:* a screen silently leaving the invariant when it loses
a class — no error, no failing test.

**3. Never rank UI layers by `z-index` if any layer is a modal `<dialog>`.**
A top-layer dialog computes `z-index: auto`, i.e. 0. Rank `:modal` first, then
z-index — which is what `UiLayers.top()` does. *Prevents:* keyboard and wheel
input going to the screen *behind* the open modal.

**4. Put `autofocus` on exactly one element inside every modal dialog, even when
you want the default.** The HTML spec instructs this outright: *"authors should
use the `autofocus` attribute on the descendant element of the dialog that the
user is expected to immediately interact with."* On a long scrolling sheet, put
it on `.sheet-body` (the spec's own second example). *Prevents:* focus landing
on the last focusable element and auto-scrolling the dialog — or the whole
document — past its own content. **This rule's fix already landed: 17
`autofocus` attributes now exist across the 19 modal dialogs** — re-run
`grep -c '<dialog' index.html` and `grep -c autofocus index.html` before
treating this as an open problem, and do not "fix" (remove) an autofocus
attribute you find; it was added on purpose.

**5. Use `showModal()` and let the platform own inertness, Escape, backdrop and
focus-return. Never hand-roll a focus trap.** *Prevents:* re-implementing 406
lines (USWDS `usa-modal`) or 353 (a11y-dialog), plus the four upstream bugs
a11y-dialog's own source cites. **Corollary:** non-modal `show()` gives you none
of these — if you use it you own Escape and focus return, and must say so in a
comment.

**6. `closedby` and `requestClose()` are progressive enhancement, feature-
detected, never load-bearing.** Baseline newly-available 2025 (Safari 18.4).
And `close()` **ignores `closedby` entirely** — only `requestClose()` honours it.
*Prevents:* a dismissal path that silently does not exist on a one-year-old
iPhone, which is this project's primary target.

**7. Give a dialog an explicit `max-height` and `overflow` before it can ever be
tall.** *Prevents:* the document scrolling to reveal the focused element and
leaving the user's scroll position destroyed after close.

---

## CSS: put variation in properties, not in classes

**8. Variation belongs in custom properties on context selectors, not in new
classes.** One primitive class + N `--prop` overrides. The template is already
in this repo, `css/components.css`:

```css
#pausemenu  { --sheet-w: 420px; }
#pmsettings { --sheet-w: 760px; }
/* …12 more contexts… */
.sheet { width: min(100%, var(--sheet-w, 520px)); }
```

One class, fourteen contexts, zero variant classes. *Prevents:* class-family
growth. **Measured:** Pico CSS ships a complete design system in **2,835 lines /
16 classes / 251 custom properties**. This repo currently measures **7,833
lines / 543 classes / 76 custom properties** (re-run the commands at the top
of this file to refresh) — 33.9x the classes on 2.8x the lines with 0.3x the
tokens. The ratio is inverted, and that is the whole finding.

**9. Reject any CSS methodology that renames without reducing.** Require a
before/after count of distinct classes before adopting one. *Prevents:* a week
spent converting to BEM or CUBE and shipping the same number of differently-named
classes. CUBE describes itself as *"a step back from BEM's principles"* — a
disposition, not a mechanism.

**10. Import ITCSS's one durable rule — specificity is inversely proportional to
reach — and none of its folder structure.** `@layer reset, base, components,
hud, overlays` already does the ordering natively. *Prevents:* a Sass-shaped
directory tree in a project with no build step.

**11. Ratchet the distinct-class count the way `tests/data/ratchets.json` ratchets
game.js, and lower the ceiling when you consolidate.** *Prevents:* a cleanup
undone by the next three features with nothing to notice.

**12. Prefer exception-based base styles to per-element classes.** Every Layout:
*"it's a mistake to think in terms of (utility) classes too early… laborious,
prone to error… will lead to bloated markup."* One property plus N one-line
context overrides beats N variant classes.

---

## DOM size and height

**13. Do NOT split a monolithic HTML file below ~1,400 body nodes.** Lighthouse
warns at ~800 and errors at ~1,400; this shell currently measures 1,133 (re-run
`grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l` — it was ~969 when this
rule was written, still comfortably under the 1,400 error line, so the
conclusion below is unaffected by the drift). **`display:none` subtrees are not
in the render tree at all** — they cost parse time and memory, never frames.
*Prevents:* a large cross-cutting refactor bought with a benchmark nobody ran.
On GitHub Pages, fetch-and-inject partials additionally cost an RTT per screen
and break `sw.js`, whose precache is derived from the shell's own script tags.
**Report "leave it alone" when that is the answer** — it usually is. The real
cost here is CSS selector complexity (543 classes), not node count.

**14. Express height responsiveness as at most TWO breakpoints, resolved once
into a single `data-density` attribute.** *Prevents:* N media queries asking the
same question N slightly different ways, which is exactly how they drift.
Material ships three height tiers from two breakpoints; this repo measured
eight thresholds (500/520/560/599/600/620/640/700 across five files) when this
rule was written (2026-08-08) — that consolidation has since happened: as of
2026-08-21 the live set is **three height queries across three files**:
`(orientation: landscape) and (max-height: 560px)` in `css/tokens.css`
(spacing-only density), `max-height: 699px` in `css/menus.css` (title-screen
compact zoom cap, paired with a width arm), and `min-height: 600px` in
`css/track-detail.css`; `css/data.css` and `css/responsive.css` now carry
none (`css/tuner.css` still records the deliberately removed 620px). Already
at the target this rule argues for. Re-run the measurement before treating
this as an open problem.

**15. `container-type: size` IS usable when the element has an explicit block
size — do not assume container queries are inline-only.** Baseline widely
available since Feb 2023, and shipped in typebot.io, medplum, voyager, fluxer.
The real constraint is only that a size container cannot be sized by its
contents; a full-viewport shell at `100svh` already has an explicit block size.
*Prevents:* falling back to viewport media queries for a component-local
question. **Note the boundary:** `js/ui/sheet-shape.js` is still right that a
*content-sized sheet* cannot be a size container — the shell can, the sheet
cannot.

---

## While restructuring

**Never edit `js/` or `css/` while a Playwright run is in flight**, and never
bump `?v=N` / `version.json` mid-run — the shell version guard force-reloads
every open test page. Use a worktree (`../../../../docs/notes/PARALLEL-WORK.md`). Bump the cache
as the LAST edit before commit (`node tools/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`); check-changes/references/bump.md).

**Any new class family must be added to `docs/COMPONENTS.md`** or
`tests/unit/component-inventory.test.mjs` fails. A consolidation must *remove*
entries there — that test is how you prove the count went down.

---

## Fashionable but unproven — do not adopt on vibes

- **CUBE CSS** — no evidence it reduces anything; self-described as a disposition.
- **ITCSS as a directory structure** — the triangle is a Sass build-order
  artefact. Only the specificity/reach maxim transfers.
- **`content-visibility` on already-`display:none` screens** — web.dev
  recommends it for *offscreen* content; near-zero marginal gain over
  `display:none`, which already skips rendering entirely.
- **Auto-hiding/collapsing headers on short viewports** — trades fixed chrome
  for scroll jitter and hides the only text identifying the screen. No source
  found recommending it for landscape game UI.
- **Fetched HTML partials on a static host** — commonly proposed, actively
  harmful here (RTT per screen, breaks the sw.js precache seed).
- **Tailwind / Open Props / any token package** — all require a build step or
  duplicate the 102 tokens this repo already has, and would fight
  `tests/unit/css-tokens.test.mjs`, which asserts every token has a consumer.

---

## Deep references

- `docs/archive/research/UI-LAYOUT-CRITIQUE-2026-08.md` — every screen measured at 852x393
- `docs/archive/research/UI-REDESIGN-2026-08.md` — the scale/type/container proposal (read §9 first)
- `../../../../docs/COMPONENTS.md` — the seven axes and which mechanism owns each
- `docs/COMPONENTS.md` — the class-family inventory
- `ui-menu-a11y` skill — per-bug menu/dialog/Escape/focus workflow
- `check-changes` skill — picking and running the validation groups
