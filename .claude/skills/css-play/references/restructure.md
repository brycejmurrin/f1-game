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
node tools/ci/tooling-fast.mjs --jobs=3       # no-browser guard suite, ~2 min idle
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
# the same counts as the ratchets see them (cssClasses, shellNodes, raw spacing/colour) — no browser, <5 s
node tools/check/tree-counts.mjs        # current;  ceilings: tests/data/ratchets.json "tree"
node tools/check/ratchets.mjs           # at/under ceiling?  (--update lowers after a consolidation)
node tools/check/class-usage.mjs        # classes APPLIED (index.html/js) but styled nowhere: rename debris
node --test tests/unit/component-inventory.test.mjs   # docs/COMPONENTS.md must shrink with the count
```

The shell-node grep counts every tag; the ratchet's `shellNodes` excludes
script/link, so the two differ (2,244 vs 1,984 on 2026-09-30) — quote one source.

## The recommendation this procedure produces

Write it in the PR body: the before-numbers above, the rule numbers that apply
(9: methodology only if it lowers `cssClasses`; 11: lower the ratchet in the same
commit; 13: node count needs a parse-time figure, not Lighthouse's), and a verdict
of adopt / reject / partial. Default on the 2026-09-30 numbers (592 classes,
188 custom properties): reject a named methodology, take rules 8 and 10 only.

---

## Load on demand

- The 15 checkable rules (screens/layers, CSS variation, DOM size, anti-methodology) → [restructure-screens-css-rules.md](restructure-screens-css-rules.md).

---

