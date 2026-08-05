# UI P1 Type Scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish B1 — migrate remaining menu stylesheets onto `--fs-1`…`--fs-7` so UI SIZE can eventually drive tokens (and B4 can consider retiring `zoom`).

**Architecture:** One stylesheet per commit. Before/after font-size dump in each commit message. Phone-first rung mapping per `docs/research/UI-DESIGN-PRINCIPLES.md`. Hero titles and large HUD digits stay as documented one-offs.

**Tech Stack:** CSS custom properties in `css/tokens.css`; Playwright `test:ui` / `layout-audit` for verification; `?v=` + `version.json` bump last per commit.

**Spec:** [`docs/superpowers/specs/2026-08-05-ui-improvement-program-design.md`](../specs/2026-08-05-ui-improvement-program-design.md) §4 P1.

## Global Constraints

- Migrate **one file per commit** with a before/after dump.
- Do not declare unread `--fs-N` tokens (`tests/css-tokens.test.mjs`).
- Do not refresh `menu-baseline` unless the dump proves an intentional visual delta.
- Do not edit `js/`/`css/` while a Playwright group is in flight.
- Bump `?v=N` + `version.json` as the last edit of each CSS commit.
- Phone landscape legibility floor wins over desktop comfort when mapping ambiguous sizes.

## Migration order

| Order | File | Notes |
|---|---|---|
| done | `components.css`, `data.css` | Already on tokens |
| 1 | `menus.css` | Title, select, race settings — highest traffic |
| 2 | `carsetup.css` | Garage |
| 3 | `career.css` | Career hub/setup |
| 4 | `overlays.css` | Results, touch chrome labels that share menu scale |
| 5 | `tuner.css` | Lighting/camera tuner |
| 6 | `track-detail.css` / `responsive.css` | Mop-up |
| skip / partial | `hud.css` | HUD digits stay off-scale; only migrate shared labels that belong on `--fs-*` |

### Rung map (from tokens.css)

| Token | px | Use |
|---|---|---|
| `--fs-1` | 10 | micro labels, badges |
| `--fs-2` | 12 | body base |
| `--fs-3` | 13 | body emphasis |
| `--fs-4` | 14 | control label / subhead |
| `--fs-5` | 16 | button text / larger subhead |
| `--fs-6` | 20 | section heading |
| `--fs-7` | 22 | large heading — declare only when first consumer lands |

Adjacent consolidations (documented, not silent): 11→`--fs-2`, 15→`--fs-5`, 17–19→`--fs-6`.

---

### Task 1: Dump + migrate `menus.css`

**Files:** `css/menus.css`, `version.json`, `index.html` (`?v=`)

- [ ] **Step 1: Before dump**

```sh
grep -nE 'font-size:\s*[0-9.]+px' css/menus.css | tee artifacts/tmp/fs-menus-before.txt
wc -l artifacts/tmp/fs-menus-before.txt
```

- [ ] **Step 2: Replace each site with the nearest rung** (or leave a one-off with a one-line comment why)

- [ ] **Step 3: After dump + diff**

```sh
grep -nE 'font-size:\s*[0-9.]+px' css/menus.css | tee artifacts/tmp/fs-menus-after.txt
diff -u artifacts/tmp/fs-menus-before.txt artifacts/tmp/fs-menus-after.txt || true
```

- [ ] **Step 4: Cache bump + commit** with dumps summarized in the message

```bash
# sed bump ?v= and version.json
git add css/menus.css index.html version.json
git commit -m "refactor(css): menus.css onto --fs-* type scale"
```

- [ ] **Step 5: `npm run test:tooling-fast`** (css-tokens + layers)

Repeat Tasks 2–6 for `carsetup`, `career`, `overlays`, `tuner`, mop-up — same steps, different file.

---

### Task 7: Assert allow-list

**Files:** add or extend a tooling test (e.g. `tests/css-type-scale.test.mjs`) that fails if menu CSS gains new raw `font-size: Npx` outside an allow-list of commented one-offs / HUD.

- [ ] **Step 1: Write the failing test** counting raw px font-sizes in menu stylesheets
- [ ] **Step 2: Allow-list only documented hero/HUD exceptions**
- [ ] **Step 3: Commit**

---

### Task 8: Verify

```sh
node tools/pick-tests.mjs css/menus.css css/carsetup.css css/career.css
node tools/test-bg.mjs ui   # after box is quiet; one group
node tools/layout-audit.mjs --screens=title,select,garage,career
```

---

## Spec coverage

P1 design item → Tasks 1–8. P1b spacing tokens deferred. B4 not in scope.
