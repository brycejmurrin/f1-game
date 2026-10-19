<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT car-2 (final (continuation; covers the items part 1 left open))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261492542
- Posted: 2026-10-19T06:53:13Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (continuation; covers the items part 1 left open)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT car-2

Continuation of the car-2 partial report. It covers only the items that report left open: the hit/not-hit check for all 46 files, and the `team-style-relief.test.mjs:87-88` confirmation. Rows already reported are not redone. The run, quality, mock and verdict columns stand as in the partial report (45 pass, 1 fail: `spec/parts-mesh-cache` warm-up test, environment timeout, failed twice).

**Debugger method.** The js-debugger MCP attaches only to Chrome page targets. `debugger_targets` returns `[]` for node processes, so the 27 unit files cannot be attached to. I used V8 function coverage instead (`NODE_V8_COVERAGE`, `node -r vmname.cjs --test <file>`), reported as hit/total functions per `js/` file. This is hit/not-hit evidence, not a stepped session. The 19 specs were not checked (see Not run).

| file | purpose (see partial) | run | debugger (V8 coverage, functions hit/total) | quality | mock/wrong-target | verdict |
|---|---|---|---|---|---|---|
| helmets.test.mjs | helmet designs, painter, shell | pass 21/21 | n.a.: `new Function(read(p))` + spawnSync, coverage unattributed (helmets.js is hit 130/164 via livery-helmet-style) | as partial | none | as partial |
| hud-helmet-placement | helmet cam placement | pass | HIT cam-groups 27/129 | as partial | as partial | as partial |
| legend-parts-seed | legend seeds | pass | HIT custom-team 41/50, legends 11/15 | as partial | as partial | as partial |
| legends-team | legends team | pass | HIT parts 13/26, legends 14/16 | as partial | as partial | as partial |
| livery-contrast | contrast | pass | HIT liverytex 109/131, livery-design 10/12, livery-graphics 11/12 | as partial | as partial | as partial |
| livery-decal-surfaces | decals | pass | HIT car-body-geom 100/104, car-wheels 11/20 | as partial | as partial | as partial |
| livery-design | design | pass | HIT liverytex 177/250, livery-graphics 18/24, crest-draw 14/35 | as partial | as partial | as partial |
| livery-draft-mesh-cache | cache | pass | HIT but shallow: car-draw 17/81 | as partial | weak target | as partial |
| livery-finish-contract | finishes | pass | HIT but shallow: car-materials 5/10, car-material-shade 1/1 | as partial | weak target | as partial |
| livery-helmet-style | helmet style | pass | HIT helmets 130/164 | as partial | as partial | as partial |
| livery-tier | tiers | pass | data-level only: livery-design 1/6, car-materials 1/9, car-mesh 1/92 | as partial | weak target | as partial |
| livery-wheels | wheels | pass | HIT car-wheels 18/21, car-geometry 26/26, parts 11/25 | as partial | as partial | as partial |
| livery-zone-finish | zones | pass | data-level only: livery-design 1/6, crest-draw 2/16 | as partial | weak target | as partial |
| loading-card | loading card | pass | HIT loading-screen 63/77 | as partial | as partial | as partial |
| particles-dirty | particles | pass | HIT particles 24/40 | as partial | as partial | as partial |
| parts-distinct-mesh | meshes | pass | HIT car-wheels 17/20 | as partial | as partial | as partial |
| parts-ladder | ladder | pass | data-level: parts 11/25, car-mesh 1/92 | as partial | weak target | as partial |
| parts-locked-equivalent | locked equiv | pass | data-level: parts 14/26, car-mesh 1/92 | as partial | weak target | as partial |
| parts-visual-distinctness | distinctness | pass | HIT car3d 202/275, helmets 365/450, car-geometry 122/126 | as partial | as partial | as partial |
| share-card-data | share data | pass | HIT 5/5 | as partial | as partial | as partial |
| share-card-layout | share layout | pass | HIT 4/5 | as partial | as partial | as partial |
| share-card | share card | pass | HIT but shallow: share-card 3/8, daily-challenge 16/20 | as partial | as partial | as partial |
| team-livery | team livery | pass | HIT custom-liveries 16/17 | as partial | as partial | as partial |
| team-style-relief | relief | pass 3/3 | HIT car3d 3/6, car-body-geom 19/72 | VACUOUS GUARD at :87-88 | see finding 1 | fix guard |
| title-home-scene-prepaint | title scene | pass | n.a.: no js/ coverage attributable (DOM-less/indirect load) | as partial | as partial | as partial |
| ui-fit-garage-livery-r6 | ui fit | pass | n.a.: no js/ coverage attributable | as partial | as partial | as partial |
| ui-journey-career | ui journey | pass | n.a.: no js/ coverage attributable | as partial | as partial | as partial |
| 19 specs (car-effects … parts-setup-ids) | as partial | as partial | not-run | as partial | as partial | as partial |

Units: 27/27 pass, each under 1 s. 23 hit their targets, 4 not attributable.

**Top findings**
1. `tests/unit/team-style-relief.test.mjs:87-88` | `const src = \`${S.Car3D}\`; assert.doesNotMatch(String(src), /Math\.random/)` is vacuous | confirmed at runtime: `S.Car3D` is an object, so the string is `"[object Object]"` and the regex can never match; the "no Math.random in car3d" guard cannot fail | read `fs.readFileSync("js/car/car3d.js","utf8")` (and car-body-geom.js if relevant) for the regex | high (runtime-confirmed)
2. `tests/unit/livery-finish-contract.test.mjs` | exercises only car-materials 5/10 and car-material-shade 1/1 | finish contract is checked at data level, not through the mesh build | add one build-through assertion | medium
3. `tests/unit/livery-tier.test.mjs`, `parts-ladder.test.mjs`, `parts-locked-equivalent.test.mjs` | car3d 2/6, liverytex 2/72, car-mesh 1/92: the tier and ladder data are checked, the code that applies them is barely run | a regression in the applying code would not fail these | keep, but add a mesh-level assertion in the spec layer | medium
4. `tests/unit/livery-draft-mesh-cache.test.mjs` | car-draw 17/81 | the cache path is touched, most draw code is not | confirm the cache hit/miss branch specifically | low

**Gaps**
- The 4 unattributed files (helmets, title-home-scene-prepaint, ui-fit-garage-livery-r6, ui-journey-career) cannot be shown to hit any js/ function. helmets.js itself is covered via livery-helmet-style and parts-visual-distinctness.
- Coverage is function-level; it shows a function ran, not that its branches were asserted.

**Not run**
- 19 specs (car-effects, career-hub, career-season, career, carview-parts, custom-team, garage-livery-churn, garage-out-before-card, garage-prebuild, livery-wheels, parts-budget, parts-catalog, parts-liveries, parts-livery-contrast, parts-livery-crest, parts-livery-designs, parts-livery-zones, parts-mesh-cache, parts-setup-ids): debugger pass not run. They need a Chrome page target, and in this container (SwiftShader, no /dev/dri) the specs take 8–798 s each (~5000 s total), which is impractical to repeat under a debugger. Their pass/fail result is in the partial report.
- Node targets are not attachable by the js-debugger MCP (`debugger_targets` returned `[]`); V8 coverage was the substitute.

**Helpers** (not on a PR): branch `cursor/test-review-helpers-car-2`, commit a7a45cd3, folder `docs/notes/test-review-2026-10-19/helpers/car-2/` (vmname.cjs, cov.mjs, run-units.sh, units-summary.txt). https://github.com/brycejmurrin/f1-game/tree/cursor/test-review-helpers-car-2/docs/notes/test-review-2026-10-19/helpers/car-2

Compactions: 3 (levels not measured with /context). Redone: only re-reading the partial report.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


---
_Generated by [Claude Code](https://claude.ai/code)_
