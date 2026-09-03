# Restructuring screens, DOM and CSS in a no-build codebase

Fifteen rules, each with the failure it prevents and the measurement that
justifies it. Sourced from shipped code (Pico, USWDS, Phaser, GOV.UK,
typebot.io, medplum), the HTML/CSS specs, and this repo's own history —
2026-08-08. **Every rule here is checkable; none is a matter of taste.**

The governing question for any restructure: **does it reduce a COUNT, or does
it rename things?** Renaming is not restructuring.

---

## Before you touch anything

```sh
node tools/ui/layout-audit.mjs                    # the screen x viewport matrix
node tools/ci/pick-tests.mjs --staged             # which groups this change needs
npm run test:tooling-fast                      # no-browser guard suite, ~20 s
```

**Record the before-numbers.** A restructure with no before/after count is an
opinion:

```sh
# distinct classes across css/ — the number that must go DOWN
grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l
# body nodes in the shell — the number that decides the split question
grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l
# height thresholds — the number that should be <= 2
grep -ohE '(max|min)-height: *[0-9]+px' css/*.css | sort | uniq -c
```

---

## Load on demand

- The 15 checkable rules (screens/layers, CSS variation, DOM size, anti-methodology) → [references/rules.md](restructure-screens-css-rules.md).

---

_Folded into `css-play` on 2026-09-03 (tree restructure Phase 5). Selection trigger it carried, now merged into `css-play`'s description: Use when restructuring or consolidating screens, menus, dialogs, the DOM, or the CSS class/token system in Apex 26 — collapsing duplicate component families, adding or removing a screen layer, deciding whether to split index.html, designing height-responsive layout, or being asked whether a CSS methodology (BEM/CUBE/ITCSS/utilities) is worth adopting. Not for one-off layout bugs (use ui-menu-a11y), one-screen CSS play (use css-play), or renderer/canvas work._
