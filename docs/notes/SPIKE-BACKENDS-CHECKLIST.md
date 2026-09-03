# Spike-backends checklist (WGX/TLX out of the shipped tree)

Inventory for `docs/research/TREE-RESTRUCTURE-2026-09.md` §Phase 2 "WGX/TLX
spike-out (owner's decision)". This is the exact list the Phase 2b move
window executes. The whole-file move (50 files, 7.69 MB) is
`tools/moves/spike-backends.json`, validated with
`node tools/move-tree.mjs tools/moves/spike-backends.json --plan` (0 errors,
73 files rewritten, no leftover bare-name mentions). Everything below is the
**non-move** edits `move-tree.mjs` cannot make on its own — a manifest map, a
generated block, a partial-file split, a rewritten assertion — each with
file:line evidence read from the tree at 66b6618 (2026-09-03), plus the tests
that go RED the moment the move lands and what fixes each.

## What the plan paragraph got wrong

- **`tools/ssr-probe.mjs`** is not one of "the nine WGX/GPU tools." It has no
  `--backend` flag, no `WGX`/`TLX`/`webgpu` reference at all — it is the
  wet-road SSR probe for GLX only (skill `webgl-debug`, not `webgpu-debug`;
  `tools/ssr-probe.mjs:3` `@skill webgl-debug`). It stays.
- **`tools/gpu-game-check.mjs`** cannot move as a whole file: `gpu-census.yml`
  calls it with `--backend webgl2` for the "Game check — GLX / WebGL2 (the
  default backend)" leg (`.github/workflows/gpu-census.yml:204-213`), and
  `tests/unit/ci-coverage.test.mjs:392-410` pins that exact GLX leg and its
  `for (const path3 of ["webgpu", "webgl2", "glx", "wgx"])` loop by source
  text. It has a real GLX caller — it stays, and the workflow's WGX/TLX legs
  inside it (the `three`/`webgpu`-backend calls at `gpu-census.yml:171-197`
  and `:224-234`) are cut or moved as part of the workflow edit below, not
  the tool.
- **`tools/road-lut-census.mjs`** is missing from the plan's explicit tool
  list but is WGX-only (`tools/road-lut-census.mjs:69,75-80` load and read
  `WGX.__roadLutTable`, nothing else) and used only by
  `tests/unit/road-lut-frame.test.mjs` and the `webgpu-debug` skill. It is
  added to the move map.
- **`ci.yml` renderer jobs**: the plan says "826-969"; on this tree
  `renderer-filter:` starts at `.github/workflows/ci.yml:829` and
  `renderer-macos:` runs `907-992` (the next job, `selected:`, starts at
  `:993`). Off by a few lines from staged edits since the plan was written —
  not a substantive error, just re-measure at move time.
- **`docs/research/RENDERER-PERF-AUDIT-2026-09-02.md`** and the **`mcp-probe`
  skill** are NOT whole-file moves the plan implies by listing them beside
  the tools/tests that are — both files also cover GLX in the same file, so
  only their WGX/TLX **sections** move; see below.

## Move map

`tools/moves/spike-backends.json` — 50 files, 7.69 MB, targets under
`spike/backends/{webgpu,three,vendor,tools,tests,docs,skills}/`:

| Bucket | Files | Bytes |
|---|---|---|
| `js/render/webgpu/*` → `spike/backends/webgpu/` | 4 | 512,738 |
| `js/render/three/*` → `spike/backends/three/` | 9 | 447,907 |
| `vendor/three-0.185.1/*` → `spike/backends/vendor/three-0.185.1/` | 6 | 1,097,747 |
| GPU-only tools → `spike/backends/tools/` | 13 | 123,778 |
| WGX/TLX-only unit tests + `tlx-probes.spec.js` → `spike/backends/tests/` | 4 | 156,629 |
| `WEBGPU-PARITY.md` + wgx-gallery (7 files + manifest) → `spike/backends/docs/` | 9 | 5,556,929 (gallery PNGs are the bulk) |
| `webgpu-debug` skill (2) + `.cursor/rules/render-{wgx,tlx}.mdc` (2) → `spike/backends/skills/` | 4 | 8,753 |

`--plan` validation: every source exists, no target collides, 0 errors, 73
files get their path references rewritten by the sweep, 0 leftover bare-name
mentions (a moved file's basename never collides with an untouched file of
the same base name).

Tools kept out of the map on purpose, with the evidence: `gpu-game-check.mjs`
and `ssr-probe.mjs` (above). `harness.mjs` and `chrome-devtools-mcp.sh` also
stay — they are the general Playwright/MCP launch harness dozens of GLX-only
tools import (`harness.mjs`'s importer list includes `ssr-probe.mjs`,
`survey-track.mjs`, `capture/shot.mjs`, `fit-audit.mjs`, 30+ others) — but
both **shrink** (below): they currently re-export/reference
`webgpu-chrome-args.cjs`, which moves.

## Manifest / roster (tools/manifest.cjs, tools/gen-shell.mjs)

- `tools/manifest.cjs:409-415` — the `webgpu:` array in `DEFERRED` (4 files).
  Delete the whole key.
- `tools/manifest.cjs:416-425` — the `three:` array in `DEFERRED` (9 files).
  Delete the whole key. After both, `DEFERRED` becomes `{}`, and the
  DEFERRED machinery in `game.js` (`loadBackendScripts`, the `BACKEND_FILES`/
  `BACKEND_EDGES` consts) has nothing left to inject — see game.js below.
- `tools/manifest.cjs:519-531` — `DEFERRED_EDGES`, 12 pairs, all inside the
  two groups just deleted. Delete the whole array (or leave `[]`).
- `tools/manifest.cjs:543-545` — `PATHS.WGSL_CHUNKS`, `PATHS.WGSL_POST`,
  `PATHS.WGX` — read by `tests/unit/webgpu-lifecycle.test.mjs:8-13` and
  `tests/unit/road-lut-frame.test.mjs` (via `road-lut-census.mjs`), both of
  which move with their sources. Delete the three PATHS entries once those
  tests are gone (nothing else reads them — `grep` above showed only the
  moving tests as readers).
- `tools/manifest.cjs:207-213` — `SHELL_NOTES.after["js/render/glx.js"]`, the
  hand-authored HTML comment gen-shell inserts after the GLX tag explaining
  the two DEFERRED backends. Rewrite or delete once there is nothing
  deferred to explain.
- `tools/gen-shell.mjs:96-107` (`swOptionalFiles`/`swOptionalBlock`) —
  `Object.values(MANIFEST.DEFERRED).flat()` becomes `[]` automatically once
  `DEFERRED` is empty; the generated sw.js block just prints an empty
  "DEFERRED renderer backends" group. Cosmetic — either accept the empty
  group or teach `swOptionalBlock` to skip a title whose file list is empty
  (a small tool edit, not required for correctness).
- `tools/gen-shell.mjs:125-149` (`rosterSource`) — `DEFERRED`/`DEFERRED_EDGES`
  still get written into the generated `js/roster.js` as empty
  values (`{}`/`[]`). No edit needed; `node tools/gen-shell.mjs` regenerates
  `js/roster.js`, `index.html`'s tag blocks, `tools/carview.html` and
  `sw.js`'s optional block from the edited manifest automatically. Run it
  once after the manifest edit, not by hand.

## `index.html` importmap

`index.html:1744-1761` — the inline `<script type="importmap">` (hand-authored,
not a `@gen-shell` block — confirmed no `@gen-shell:` markers surround it,
unlike the tag blocks at `:52-85` and `:1763-1912`). It resolves `three`,
`three/webgpu`, `three/tsl`, `three/addons/` to `./vendor/three-0.185.1/…`
plus three Trystero specifiers (`@trystero-p2p/core`, `@trystero-p2p/nostr`,
`@noble/secp256k1`) that are UNRELATED to the WGX/TLX spike (multiplayer
stays shipped) — **delete only the four `three*` keys, keep the three
Trystero ones**. `index.html:208-217` — the `preloadThreeVendor()` calls this
importmap's specifiers are for are also removed (see game.js below, which is
the sole caller).

## `sw.js` optional entries

- `sw.js:52-77` (hand-authored, not `@gen-shell`) — the block seeding
  `vendor/three-0.185.1/three.{webgpu,core,tsl}.min.js` into the OPTIONAL
  precache set with the comment explaining why (TLX opt-in). Delete these
  three lines and the comment above them once `vendor/three-0.185.1/` is
  gone from the shipped tree. `addons/tsl/display/BloomNode.js` was already
  NOT precached (comment at `sw.js:69-71` — "nothing imports it today")
  so nothing to remove there.
- `sw.js:102-116` (generated, `// @gen-shell:sw-optional` … `// /@gen-shell:sw-optional`)
  — the "DEFERRED renderer backends" group (13 lines, the same file list as
  `DEFERRED`). Regenerated to empty automatically by `gen-shell.mjs` once the
  manifest edit lands — no hand edit.
- `sw.js:284-289` (hand-authored) — the `/^js\/render\/(three|webgpu)\/|…/`
  regex in the build-stamping code that appends `?v=<build>` to DEFERRED
  paths. With `DEFERRED` empty this regex still compiles and simply never
  matches a `js/render/(three|webgpu)/` path (none will be seeded) — no
  correctness bug, but the alternative's first clause becomes dead. Trim it
  to the remaining clauses (`^js\/circuits\/scenery\/|^js\/data\/|^js\/net\/|^js\/game\/light-presets\.js$`)
  as a cleanup, not a requirement.

## `Gfx.create()` and the boot canary

- `js/render/gfx.js:184-212` (`create(canvas, opts)`) — the `if (pref === "three")`
  branch (`:186-194`, checks `typeof TLX === "undefined"`) and the WGX branch
  (`:197-212`, checks `typeof WGX === "undefined"`) both already return `null`
  on an absent global — this is the "already the documented behaviour" the
  plan paragraph cites. **No functional change needed**: once `TLX`/`WGX`
  never load, `Gfx.create()` returns `null` for every `pref` value and
  `game.js` falls through to `GLX.init(canvas)` exactly as today's "backend
  refused" path does. Simplification (optional, not required): delete the
  two dead branches and the `pref` parameter entirely, since nothing can set
  `pref` to `"three"`/`"webgpu"` and have it matter once `BACKEND_KEY`
  (`js/render/gfx.js:160`) reads are pointless.
- `js/game.js:216-286` — the whole boot-canary block (`optIn` resolution,
  `PROBE_KEY` arm/disarm, `loadBackendScripts` call, `preloadThreeVendor()`
  call). With `BACKEND_FILES.three`/`BACKEND_FILES.webgpu` both `[]`
  (manifest edit above), `optIn` can still evaluate true (a stale
  `apex26.gfxBackend=three` value in a returning player's localStorage), but
  `loadBackendScripts([])` resolves immediately with nothing loaded and
  `Gfx.create()` returns `null` — the existing fallback path handles this
  correctly with NO edit required. The **simplification** (matches the
  plan's "the boot canary simplifies"): delete `preloadThreeVendor()`
  (`js/game.js:207-215`, only caller is the `if (pref === "three")` line at
  `:266`), delete the `optIn`/`PROBE_KEY` machinery
  (`js/game.js:44-82,219-286,7796-7807,8951-8968`) since a backend that can
  never bind needs no crash-canary, and delete `RendererPicker`'s WEBGPU/THREE
  stops (see below) so a player can no longer even select a dead pick.
- `js/game.js:7796-7807` and `:8951-8968` — the re-arm-around-first-present
  and the visibility/pagehide disarm handlers, both gated on
  `_backendBound`, which can only become true inside the dead-code path
  above. Deletable in the same pass.

## RENDERER picker (`js/perf/renderer-picker.js`)

- `js/perf/renderer-picker.js:12` — `const BACKENDS = ["webgl2", "three", "webgpu"]`.
  Shrinks to `["webgl2"]`, which collapses the picker from a 3-stop
  `<select>` + `‹›` control to a no-op (or the control itself is removed —
  the plan says "shrinks to WEBGL2").
- `js/perf/renderer-picker.js:149-157` — `RENDERER_LS_KEYS` (11 keys:
  `apex26.gfxBackend`, `apex26.gfxBackendProbe`, `apex26.gfxWgxLevel`,
  `apex26.gfxWgxLite`, `apex26.gfxWgxOk`, `apex26.gfxWgxFail`,
  `apex26.gfxTlxFail`, `apex26.envProbeOff`, `apex26.perChunkOff`,
  `apex26.tlxForceGL`, `apex26.tlxViz`, `apex26.wgxCapture`) and
  `RENDERER_SS_KEYS` (5 keys: `apex26.gfxClaimFail`, `apex26.gfxBound`,
  `apex26.ctxLostReloads`, `apex26.wgxCapture`, `apex26.tlxAutoGL`) — the
  `clearRendererStorage()` (`:159-165`) reset list. Drop every WGX/TLX-only
  key; `apex26.gfxBackend` and `apex26.gfxBackendProbe` may still be worth
  clearing for returning players with a stale pick.
- `js/perf/renderer-picker.js:12-583` more broadly — roughly 200 of the
  file's 584 lines are THREE PATH / SCREENSHOTS / diag-copy machinery
  (`THREE_PATHS`, `readThreePath`, `applyThreePath`, `threePathLabel`,
  `liveThreeApi`, `readShotMode`, `writeShotMode`, `shotModeLabel`,
  `presentStatus`, `initPresentControls`) that exists only to steer TLX/WGX
  screenshot behaviour. Deletable wholesale; `renderer-picker.js` would drop
  to roughly the `webgl2`-only paint/reset/init functions.
- `tests/unit/gfx-backend-canary.test.mjs` has 108 rewrite hits and ~40 tests
  naming `renderer-picker.js` directly (`nextBackend`/`prevBackend` wrap,
  THREE PATH cycling, RESET RENDERER, THREE/WEBGPU selection) — see the RED
  tests section below.

## `backend-surface-parity.test.mjs`

`tests/unit/backend-surface-parity.test.mjs:76-93` today: `GLX_FILE =
"js/render/glx.js"`, `BACKENDS = [["WGX (WebGPU)", "js/render/webgpu/wgx.js"],
["TLX (three.js/TSL)", "js/render/three/tlx.js"]]`, and the test "every GLX
member is declared by every other backend" scans `GLX_FILE` for member names
and asserts each is present (by regex) in `wgx.js` and `tlx.js`'s source.
Once those two files move, this rewrites to what the plan calls
"GLX-vs-`gfx.js`-header": compare `GLX_FILE`'s member set against the public
surface `js/render/gfx.js` documents in its interface comment
(`js/render/gfx.js:27-132`, the `create(canvas) -> bool`/`present(po)`/etc.
list) instead of against WGX/TLX source, so the guard keeps its job (catch a
GLX method the façade contract does not know about) with no backend left to
diff against.

## `godray-keep-nearest.test.mjs`

`tests/unit/godray-keep-nearest.test.mjs:17-25` reads three backend files
(`js/render/webgpu/wgx.js` tagged `"wgx"`, `js/render/glx/post.js` tagged
`"glx"`, `js/render/three/tlx-post.js` tagged `"tlx"`) and the test at `:77`
("the three backend clones stay in lockstep") asserts all three extract the
same keep-nearest-K algorithm text. With WGX and TLX gone this shrinks to one
copy — the `glx` entry alone — and the "stay in lockstep" test either deletes
outright (nothing to compare) or narrows to asserting the GLX copy still
matches the frozen algorithm text inline (the plan's "shrinks to one copy").

## `LampChunks` (`js/render/lamp-chunks.js`)

`js/render/lamp-chunks.js:1-7` header: "GLXChunked binds each chunk's index
list per draw, and WGX uploads the concatenated table to a storage buffer
once per bake." Rewrite to drop the WGX clause — GLXChunked stays the only
consumer of the shared bake. `js/render/lamp-chunks.js:38` also names "the
WGX storage layout" in a comment on the `concat` field; same edit.
`tests/unit/lamp-chunks.test.mjs:10` cites WGX in its own header comment
too — update for consistency, not required for the guard to pass (it does
not assert on WGX by name).

## `gpu-census.yml` / `ci.yml`

- `.github/workflows/gpu-census.yml` — jobs `plan:` (`:78-96`) and `census:`
  (`:97-`, ends `:398`). Inside `census:`: the "Game check — three.js /
  WebGPU" leg (`:171-183`) and "Game check — three.js / WebGL2 (control)"
  leg (`:185-197`) test TLX only — delete or move with the spike. "Game
  check — GLX / WebGL2 (the default backend)" (`:204-213`) stays (calls the
  shared `gpu-game-check.mjs --backend webgl2`). "Game check — WGX / WebGPU
  (native, opt-in)" (`:224-234`) tests WGX only — delete or move. The
  "WebGPU adapter census" step (`:139-146`) and "What does the OS think it
  has" (`:123-`) are general hardware-detection, not WGX/TLX-specific code,
  but exist only to answer "can this box run WGX/TLX" — the plan keeps "one
  `gpu-census.yml census_only` dispatch" as a post-move verification step
  (parses the workflow, not a functional check), so the whole workflow can
  plausibly survive in reduced form (census + the surviving GLX leg only) —
  this is a genuine judgment call for the move window, not settled by this
  inventory.
- `.github/workflows/ci.yml` — `renderer-filter:` (`:829-906`, the diff-touch
  check that decides whether renderer specs run) and `renderer-macos:`
  (`:907-992`, runs `npm run test:gfx` on the `macos-latest` Metal runner).
  `test:gfx` (`package.json` line 12) names `tests/specs/tlx-probes.spec.js`
  in its spec list — once that spec moves, `renderer-filter`'s package.json
  parse (`ci.yml:889`, `node -e '...scripts["test:gfx"]...'`) either needs
  `test:gfx` rewritten to drop `tlx-probes.spec.js` (package.json edit,
  below) or the whole job is deleted per the plan's "move with the spike or
  are deleted."
- `package.json:12` (`"test:gfx"`) — lists `tlx-probes.spec.js` as the last
  spec in the string. Drop it (or the whole script, if `renderer-macos`
  goes with the spike) once the spec moves — otherwise `test:gfx` refers to
  a path that no longer exists in the shipped tree.
- `tests/unit/ci-coverage.test.mjs:396-410` ("gpu-census has a NATIVE WGX
  leg…") pins `gpu-census.yml`'s WGX/TLX game-check text verbatim (the exact
  `--backend webgpu` step name, the `tlxLeg`/`path3` regexes). This test
  goes RED the moment those legs move or are cut — see below.

## AGENTS.md

- `AGENTS.md:40-41` — the two WGX/TLX verification-table rows ("WGX /
  `js/render/webgpu/`" → `wgx-validate.mjs --static`; "TLX / `js/render/three/`,
  WGX / `js/render/webgpu/`" → `gfx-probe --backend three --tlx-webgpu
  --lavapipe montreal`). Collapse to one pointer row: "spike/backends/ (WGX,
  TLX) → `spike/backends/README.md`" per the plan.
- `AGENTS.md:103-141` — the whole "Software pixels in this container (no
  real GPU)" section: the SwiftShader/Lavapipe soft-present explanation
  (`:115-121`) and the five-row backend/command table (`:124-128`) are
  entirely WGX/TLX. Collapse to a pointer at the spike README (the "real GPU
  reachable" subsection just above it, `:103-113`, stays — it is about
  `macos-latest`/hardware detection generally, still relevant to GLX perf
  questions, and `gpu-game-check.mjs`'s surviving GLX leg specifically).
- `AGENTS.md:133-141` — "A UNIT TEST OF A RENDERER BACKEND IS NOT EVIDENCE
  THAT IT RUNS" paragraph, WGX-specific (`mcp-cli.mjs probe --backend
  webgpu`). Folds into the same pointer, OR is kept and reworded to speak
  about GLX's own dead-canary risk if the point is judged worth keeping for
  the shipped renderer too (judgment call).
- `AGENTS.md:170-171` — "DEFERRED backends, no script tag, injected at boot:
  `webgpu/` WGX and `three/` TLX" in the Layout section's `js/render/` bullet.
  Delete this clause; `js/render/` no longer has a DEFERRED subtree.
- `AGENTS.md:252` — "TLX, and WGX implement it" in the Baked asset pack
  section (`tools/assets.mjs verify` gates licences). Rewrite to "GLX
  implements it" once the other two backends are gone.
- `AGENTS.md:288,290,295` — `docs/RENDERERS.md` description ("GLX/WGX/TLX,
  cross-backend parity"), the WGX/WGSL pointer to
  `docs/research/WEBGPU-PARITY.md` (moving), and the two-rule WGSL callout
  ("sampleCount is 1 or 4 ONLY… breaking either makes WGX refuse silently").
  All three collapse to the spike pointer.
- `AGENTS.md:481-492`-equivalent guard — `docs-integrity.test.mjs`'s "every
  renderer backend directory is described in AGENTS.md" test
  (`tests/unit/docs-integrity.test.mjs:481-492`) walks `js/render/`'s actual
  subdirectories and fails if one is undescribed. Once `js/render/webgpu/`
  and `js/render/three/` no longer exist on disk, this guard is satisfied
  automatically by AGENTS.md naming only `js/render/glx.js` — no edit
  required to this specific test, but the AGENTS.md Layout bullet at `:170`
  (above) still needs its clause removed for accuracy.

## `RENDERER-PERF-AUDIT-2026-09-02.md` — partial-file split

`docs/research/RENDERER-PERF-AUDIT-2026-09-02.md` headings: `## WGX (native
WebGPU, js/render/webgpu/)` at `:16`, `## GLX (WebGL2, …)` at `:110`, `## TLX
(three.js r185, js/render/three/)` at `:192`, Round 2 material from `:281`
mixing all three backends (`## The sun-shaft march, found twice
independently` etc.). This is ONE doc covering all three backends, so
`move-tree.mjs` cannot move it (it moves whole files). The move window must
hand-split: cut the WGX section (`:16-109`) and TLX section (`:192-280`) plus
whatever Round-2 subsections are WGX/TLX-only into a new file — `RENDERER-PERF-AUDIT.md`,
placed under `spike/backends/docs/` alongside `WEBGPU-PARITY.md` — leaving the GLX section
(`:110-191`) and any backend-neutral Round-2 material in place under the
original path — re-verify the split against `docs-integrity.test.mjs`'s
broken-link and doc-index checks afterward (this doc is a `docs/research/`
file, exempt from the broken-path checker but NOT from the docs/README index
checks if it stays listed).

## `mcp-probe` skill — partial-file split

`.claude/skills/mcp-probe/SKILL.md:9-10,22,56-62` and
`.claude/skills/mcp-probe/references/recipes.md:1-72,188-205` are the WGX/TLX
probing half (backend flags, soft-present readback, the `--tlx-webgpu`
recipe, the SwiftShader post-death repro). The rest of both files (chrome-devtools
MCP setup, live 3D/`__apex` debugging, background-Chromium measurement, A/B
two-tree comparisons, deploy-liveness checks) is backend-neutral or GLX-
specific and stays. This is a hand edit inside two files that keep most of
their content — not a move-tree candidate. Cut the WGX-specific
paragraphs/recipes, leave a one-line pointer to `spike/backends/README.md`
where they were, and update `.claude/skills/README.md:53`'s **webgpu-debug**
row to point at the spike (or delete the row if `webgpu-debug`'s skill
directory moves wholesale — it does, per the move map above; the skills
index guard `tests/unit/docs-integrity.test.mjs` ("the skills index lists
every skill") will need that row removed, not just re-pointed).

## Every other file naming wgx/tlx/webgpu/three outside the moved set

Classified delete / shrink / pointer-to-spike / keep, from the tree-wide
grep (excludes the docs archive directory, excludes files already covered above):

| File | Class | Why |
|---|---|---|
| `js/render/glx.js:766-767,778,2161,2175,2193-2194` | shrink | Comments citing WGX/TLX for context ("mirrors WGX", "WGX and TLX both export this"); harmless once those files are gone but stale — trim in the same pass as any GLX edit that touches these lines, not urgent. |
| `js/render/glx/shadow.js:38,68,81,128,225,230,272,309` | shrink | Same — comments contrasting GLX behaviour with WGX/TLX shadow handling. Non-blocking. |
| `js/render/glx/post.js:88` | shrink | "Partial select nearest-K (match WGX)" comment — see godray-keep-nearest above; the algorithm itself does not change. |
| `js/render/shaders/lit.js:151,550,570,878,882,991` | shrink | GLSL comments citing WGX/WebGPU parity decisions (RAW footprint, SAA snapshot). The GLSL logic is unaffected; comments go stale, not wrong — low priority. |
| `js/render/shaders/post.js:1128,1141` | shrink | Same class, GLSL comments citing WGX. |
| `js/render/shaders/chunks.js:1,5,60` | shrink | Header cites `wgsl-chunks.js` (WGSLChunks) as the "maintainability-tax" sibling. Rewrite the header once the WGSL sibling is gone from the shipped tree (still true as history — a spike pointer is fine). |
| `js/perf/gfx-debug-overlay.js:5,32-58,77,105,130-131` | shrink | The debug overlay reads `apex26.gfxBackend`, `apex26.tlxForceGL`, `apex26.gfxTlxFail`, `apex26.gfxWgxFail`, `G.__tlx`, `G.softPresentState` and prints WGX/TLX-specific diagnostic lines. With those keys permanently absent the reads just return falsy and the lines never print — no crash, dead code. Shrink at leisure. |
| `js/lighting/knobs.js` (25 hits, e.g. `:448` "WebGL2 and WebGPU") | keep, shrink later | `TUNE_DEFS` `help` strings reference "WebGL2 and WebGPU" per-knob (which backends implement it). Cosmetic once only WebGL2 ships; not load-bearing for any guard found. Low priority. |
| `js/perf/metrics-overlay.js:160-165,215,225-228,480,496` | shrink | The bug-report `diag()` output includes a `tlx` field and reads `apex26.gfxBackend`. With the backend permanently `"webgl2"` (or empty), the field is always empty-string — dead but harmless. Shrink at leisure. |
| `js/agent/apex.js:1057,2417,2494,2501,2542` | shrink | `__apex.info()`/`diag()` surface reports `gfxBackend` from storage and comments cite "identically on GLX, TLX and WGX". Same class as metrics.js — dead reads, not wrong ones. |
| `js/lighting/tuner-panel.js:24-27` | delete (dead branch) | `if (g && g.hasPerChunkLights === false) return " · not supported by the three.js renderer…"` — this branch can only fire when `g` (the bound backend) is TLX, which can never bind again. Delete the branch; `hasPerChunkLights` on GLX is always defined so the guard is unreachable already once TLX is gone, not just cosmetically stale. |
| `js/perf/quality-preset.js:1` | shrink | Header comment; no functional WGX/TLX coupling found beyond the pref key already covered under renderer-picker. |
| `js/track/tracks.js:146,694,732` | shrink | Comments naming "the WebGL2/TLX/WGX backend" and "GLX/WGX/TLX" batch drawing, and a WGX-specific scenery skip note. No functional code depends on a WGX/TLX identity check here (confirmed no `pref ===`/backend-name branch in these lines) — comment-only. |
| `js/physics/debris-world.js:1127,1130` | shrink | Comment: "updateInstances since 2026-09-02 (glx.js, wgx.js, tlx.js)…which is still GLX + WGX only." Stale once WGX is gone; rewrite to "GLX only." |
| `js/perf/governor.js:63,209` | shrink | Comments about WebGPU/three.js perf tiers in PerfGov's own reasoning; no functional coupling. |
| `js/car/car3d.js:12,196` | shrink | Comments citing the WGX/TSL shading id-chain and "GLX/WGX paint" — no functional coupling. |
| `js/render/lamp-chunks.js` | shrink (see above, own section) | |
| `js/lighting/profiles.js:78` | keep | "three.js genuinely cannot bind per-chunk sets" — this IS a functional capability gate (`hasPerChunkLights`), but the gate degrades safely once TLX never binds (the condition it guards becomes permanently one-sided, same as tuner.js — could be simplified alongside it). |
| `js/car/car-mesh.js:275-276` | shrink | Comment: "no backend has ever had a deleteMesh (GLX, TLX and WGX all expose freeMesh…)". Rewrite to name GLX only. |
| `types/game-ctx.d.ts:128,130,491` | shrink | `GfxBackend` type comment says "GLX by default; TLX/WGX when opted in" — rewrite once opting in is impossible. |
| `bench.html:408,431-432` | shrink | Reads `GLX.__tlx` to report which "three" backend is bound; with TLX gone `GLX.__tlx` is always undefined and the field always reads GLX's own webgl2 state — degrades safely, not wrong. Shrink at leisure. |
| `docs/CONSOLE-RECIPES.md:177-197` | delete | The whole "Three.js DevTools extension" subsection instructs the reader to opt into `apex26.gfxBackend='three'` and use `__tlx.*` probes — none of this works once TLX is gone. Delete the subsection. |
| `docs/DEBUG-HOOKS.md:692,739,759` | shrink | `__apex` hook docs mentioning WGX's texture-array path and the `stored` overrides table listing `gfxBackend`. Trim the WGX-specific clause at `:692`; the `stored` table entry at `:759` can stay (the key still round-trips harmlessly) or be pruned for accuracy. |
| `docs/AGENT-SURFACE.md:29,36,110,122,128,153` | shrink/pointer | The `chrome-devtools` MCP row's "WebGPU flags" clause (`:29`), the `apex_wgx_validate_static`/`apex_gfx_probe` rows (`:122,128` — these tools move, so their MCP wrap rows are removed too, along with the `apex-tools-mcp.mjs` wrap registrations at `tools/apex-tools-mcp.mjs:326-328,414-420,537-538,574-576` and the `apex_wgx_validate`/`apex_wgx_validate_static` entries `tests/unit/apex-tools-mcp.test.mjs:167,184` pins), the tools/README pointer row at `:153`. |
| `docs/ARCHITECTURE.md:8,40-41,150,162-337` (35 hits) | delete/shrink | The `js/render/` module table entries for WGX/TLX, the whole "GLX/WGX/TLX" renderer-selection section (`:229-337`, the biggest single block: boot-canary explanation, the DEFERRED/opt-in table, WGX gap list, TLX façade wiring). This is the live architecture doc's renderer chapter — it needs a substantial rewrite to describe GLX-only rendering, not a one-line pointer. Budget real editing time here in the move window. |
| `docs/ARCHITECTURE-REVIEW.md:136-157,469,526-532,568-569,615,668-679` | shrink | Standing-assessment prose about the three-backend cost/parity tradeoff and specific WGX/TLX defect notes (the `tlx-probes` M6 skid red-test discussion at `:668-679` describes a test that is about to move — either delete that discussion or move it into the spike's own provenance notes). |
| `docs/LIGHTING-TUNER-SLIDERS.md:227,444,448` | shrink | "three backends" framing in the slider-parity table intro; rewrite to describe GLX only once WGX/TLX are gone (or note the sliders' spike-only knobs are moot). |
| `docs/README.md` renderer section | shrink + pointer (see index row below) | Rewrite the "Renderers (GLX / WGX / TLX)" subsection to describe GLX only, point at `spike/backends/README.md` for the other two, and update the RENDERERS.md row's one-line description. |
| `docs/RENDERERS.md` (whole doc) | major shrink | This is THE renderer architecture doc — "three-renderer architecture" title, `## Who does what`, `## Frame pipeline (all three)`, `## Boot/safety`, `## Screenshots — why WebGPU can look black`, `## Parity snapshot`, `## Cross-backend parity`, `## Boot evidence`. Nearly every section assumes three backends. This is a full rewrite to a GLX-only renderer doc plus a pointer to the spike, not a trim — budget the most editing time here of any single doc. |
| `docs/TESTING.md` (10+ hits: WGX/TLX group descriptions, the `tlx-probes` M6/M9 timeout case studies, spec coverage table rows for `tlx-probes.spec.js`/`webgpu-lifecycle.test.mjs`/`renderer-soft-lifecycle.test.mjs`/`road-lut-frame.test.mjs`/`gfx-backend-canary.test.mjs`) | shrink | Remove the coverage-table rows for the four moved test files; `gfx-backend-canary.test.mjs` stays (rewritten, not moved — see RED tests below) so its row stays too, edited to describe the GLX-only scope. |
| `docs/PERF-FINDINGS.md` (10 hits) | shrink | Perf case studies citing `gfx-probe.mjs`/`gpu-game-check.mjs`/`wgx-capture.mjs`/`tlx-pack-check.cjs` by path. Dated findings — leave as historical record with a note, or move the WGX/TLX-specific findings into the spike's own notes if they are still load-bearing evidence for anything (they are not cited by any live guard per the grep above). |
| `docs/notes/CEILING-HISTORY.md` (5 hits) | keep | Ratchet history for `js/render/webgpu/wgx.js` and `js/render/three/tlx.js` lines — this is provenance (why the ceiling moved) for files about to leave the ratchets.json table (below). Leave as-is; it is dated history, not a live claim. |
| `docs/research/CI-RENDERING-PERFORMANCE.md`, `BUG-HUNT-2026-09-02.md`, `PERF-HUNT-2026-08-18.md`, `SURVEY-BUGS-PERF-2026-08-17.md`, `ENGINEERING-PRACTICE-NOTES.md` | keep | All under `docs/research/`, exempt from the docs-integrity broken-path checker (research is dated record, per `docs/README.md`'s own framing). No edit required; they remain accurate as history of what was investigated when WGX/TLX were live. |
| `.claude/skills/asset-pack/SKILL.md:16-17`, `references/workflow.md:12-21,67,78` | shrink | "GLX, TLX, and WGX all implement the arrays" claims — rewrite to GLX-only once the other backends cannot bind. Functionally harmless if left (a `supported: false` on an absent global still reads as "not supported," same outcome) but stale documentation. |
| `.claude/skills/webgl-debug/SKILL.md` | keep | Only 1 hit found in the earlier grep pass and it is incidental (backend-neutral framing) — no edit needed. |
| `.claude/skills/pwa-cache-service-worker/SKILL.md:16`, `references/workflow.md:54` | shrink | Cites the DEFERRED backends and the sw.js optional-entry trap — rewrite once DEFERRED is empty; the trap itself (forgetting an sw.js optional entry) still applies generically, so keep the lesson, drop the WGX/TLX example. |
| `.claude/skills/lighting-tuner/SKILL.md:38,41`, `references/symptoms.md:82` | shrink | "webgl-debug / webgpu-debug" pointer and `test-bg.mjs gfx` group description naming `tlx`. Drop the webgpu-debug pointer; `test:gfx` itself is edited above (package.json). |
| `.claude/skills/slim-bloat/references/do-not.md:13` | keep | "No ES modules (vendored three.js only)" — this describes the general no-ES-modules rule using three.js as the historical example of the sole IIFE exception. Even after the spike-out this sentence stays true in spirit (the rule exists because of that exception, which is now provenance) — reword only if it reads as claiming three.js still ships, otherwise keep. |
| `.claude/workflows/total-audit.js:67` | keep | A workflow config line scoping an audit lens to `js/render/three/` and `js/render/webgpu/` — becomes a no-op scope (nothing to audit there) once the directories are gone; not worth editing unless the workflow is run again, at which point it will simply audit nothing and should be updated then. |
| `.claude/workflows/redesign-judge-panel.js:39` | keep | Historical redesign-panel config citing "the repo already uses an importmap" as a prior-art note — describes the past decision, not current structure; provenance, not a live claim. |
| `README.md:136` | shrink | "`js/render/` (WebGL2/WebGPU…)" one-line layout blurb — rewrite to WebGL2-only. |
| `.github/workflows/pages.yml:159` | keep | Lists three.js among the dynamically-imported libraries the deploy-staging test checks for 404s — becomes moot once nothing dynamically imports it, but harmless if left (the check just never fires for a three.js path that no longer exists in the shell). Low priority. |

## Tests/ratchets that go RED, and the fix

| Guard | Why it goes red | Fix |
|---|---|---|
| `tests/data/ratchets.json` — `js/render/webgpu/wgx.js` (6037 lines), `js/render/three/tlx.js` (3132), `js/render/webgpu/wgsl-chunks.js` (1934), `js/render/three/tsl-lit.js` (1777) entries | `tools/ratchets.mjs` (`node --test tests/unit/ratchets.test.mjs`) reads each `files` key as a path and fails with `missing: true` (`tools/ratchets.mjs:55`) when the file no longer exists — `tests/unit/ratchets.test.mjs:14` asserts `rows.filter(r => r.missing)` is empty. | Delete the four `js/render/webgpu/wgx.js` / `js/render/three/tlx.js` / `js/render/webgpu/wgsl-chunks.js` / `js/render/three/tsl-lit.js` entries from `tests/data/ratchets.json`'s `files` object. (`js/render/glx.js` at 2259 lines stays.) |
| `tests/unit/load-order.test.mjs:172-181` ("DEFERRED_EDGES leave more than one TLX file ready at wave 0") | Asserts on `ApexRoster.DEFERRED_EDGES`/wave-0 shape that no longer exists once `DEFERRED` is `{}`. | Delete this test (and any sibling DEFERRED-wave assertions in the same file that assume a non-empty `DEFERRED`). |
| `tests/unit/global-registry.test.mjs:60,148` (`TLXShaders: 8` writer count, DEFERRED-only-global crash guard) | The `GlobalRegistry` entry for `TLXShaders` (multi-writer accumulator, 8 files write it) has no files left once `js/render/three/*` moves — the registry scan finds 0 writers, not 8, and the test's declared count goes stale/fails. | Delete the `TLXShaders` (and any `WGXShaders`-equivalent, if one exists — grep did not surface a separate entry) row from the registry table. |
| `tests/unit/ci-coverage.test.mjs:392-410` | Pins `gpu-census.yml`'s exact WGX-leg source text (`--backend webgpu`, the `tlxLeg`/`path3` regex, `r.wgx = typeof g.softPresent`). Goes red the moment those workflow lines move/delete. | Delete or rewrite the test to match whatever `gpu-census.yml` looks like after the workflow edit (delete outright if the WGX/TLX legs are cut rather than kept in reduced form). |
| `tests/unit/mcp-cli.test.mjs:72-177` (`--backend webgpu`/`--tlx-webgpu`/`--tlx-auto` flag tests, the `webgpu-chrome-args.cjs` sync check) | `tools/mcp-cli.mjs` still has this flag surface in the shipped tree (mcp-cli.mjs itself is not in the move map — it is a general MCP driver, not WGX/TLX-only, used for GLX probing too). Its WGX/TLX-specific flags (`--backend webgpu`, `--tlx-webgpu`, etc.) become dead once no backend can bind, but the flags and their tests do not automatically break — they still set localStorage keys and reload; the reload just lands on GLX regardless of the pick. **Judgment call**: either strip the WGX/TLX flag surface from `mcp-cli.mjs` (making these tests obsolete — delete them) or leave `mcp-cli.mjs` as a generic prober that happens to have dead flags (tests stay green, doing nothing useful). Recommend stripping, since a probe flag that silently does nothing is worse than one that errors. |
| `tests/unit/skill-progressive.test.mjs:106,127,141,225-236,405-467,478-482` | Multiple tests assert on `webgpu-debug/SKILL.md`'s and `webgpu-debug/references/defects.md`'s content, plus the `webgpu-debug` skill's presence in `.claude/skills/README.md` and the `wgx-capture.mjs` row in `tools/README.md` pairing with `webgpu-debug`. All of these move or are deleted. | Delete the `webgpu-debug`-specific test cases; remove the skill's row from `.claude/skills/README.md` (the docs-integrity "skills index lists every skill" guard requires this — a row naming a skill directory that no longer exists under `.claude/skills/` fails the OTHER direction of that same guard once the skill moves). |
| `tests/unit/tools-runnable.test.mjs:255,259,502-509` | Runs `pick-tests.mjs js/render/three/tlx.js` and `wgx-validate.mjs --static` as smoke tests, and asserts `wgx-gallery.mjs`/`wgx-shot.mjs` forwarding. All three tools/paths move. | Delete these three test cases (or point them at `spike/backends/tools/...` if the move window decides the spike keeps its OWN smoke-tested tools — out of scope for this inventory, a move-window decision). |
| `tests/unit/backend-surface-parity.test.mjs` | See dedicated section above — rewritten, not deleted. | GLX-vs-`gfx.js`-header comparison, per the plan. |
| `tests/unit/godray-keep-nearest.test.mjs` | See dedicated section above — rewritten, not deleted. | Shrinks to the GLX-only copy. |
| `tests/unit/light-grid.test.mjs:242-314` (16 hits: WGX god-ray knob reads, TLX `k()`/`gk()` key checks, "every TUNE_DEFS uniform lives on GLX, WGX, and TLX") | Directly reads `js/render/webgpu/wgx.js` and the `js/render/three/*` shader files by path; the "every uniform lives on GLX/WGX/TLX" test literally cannot pass once two of the three are gone. | Delete the WGX-specific and TLX-specific test cases; rewrite "every TUNE_DEFS uniform lives on GLX, WGX, and TLX" to assert GLX only (a real narrowing of guarantee — flag this loss explicitly in the move-window PR description, since it was catching a real parity-drift class). |
| `tests/unit/perf-try.test.mjs` (28 hits, `tests/unit/perf-governor.test.mjs` 6 hits) | Both files assert PerfGov/PerfTry gating logic is IDENTICAL across `js/render/webgpu/wgsl-*.js`, `js/render/webgpu/wgx.js`, and `js/render/three/tsl-*.js`/`tlx*.js` by reading and regex-matching those sources directly. | Delete every assertion block that reads a moved file; keep the GLX-only assertions (both files also test `js/render/glx.js`/`js/render/shaders/*.js` extensively — those stay). This is the largest single per-test edit burden in the whole move: budget real time here, not a one-line fix. |
| `tests/unit/perf-governor.test.mjs:449-533` | Same class — TLX/WGX carReflect, sunShaft, wet-mirror parity assertions. | Same fix — delete the moved-file assertions, keep GLX's. |
| `tests/unit/ui-sheets-audit.test.mjs:255-310` (RENDERER select option-text and pick-persistence tests) | Asserts `optText()` returns `["WEBGL2", "THREE.JS", "WEBGPU"]` and that selecting `"three"`/`"webgpu"` persists to `apex26.gfxBackend`. Goes red once `BACKENDS` shrinks to `["webgl2"]` (renderer-picker.js edit above). | Rewrite to assert the single-stop (or removed) control's actual new behaviour. |
| `tests/unit/apex-tools-mcp.test.mjs:167,184` (`apex_wgx_validate_static`, `apex_wgx_validate` catalog entries) | Asserts these MCP tool names exist in the `apex-tools` catalog. The wraps are removed from `tools/apex-tools-mcp.mjs` (AGENT-SURFACE.md section above). | Delete these two assertions (and any `apex_gfx_probe` one, if that wrap is also cut — the tool moves, so its MCP wrap should go with it). |
| `tests/unit/comment-citations.test.mjs` (1 hit, `js/render/webgpu/wgsl-chunks.js` cited-count example in its own header comment) | Just an illustrative example in a comment, not an assertion against a live count — check before assuming red; likely fine as historical color. | Verify at move time; probably no fix needed. |
| `tests/unit/track-foundation.test.mjs` (1 hit) | Grep hit only — verify at move time whether it is a live path assertion or an incidental comment; not confirmed red from this pass. | Re-check when the file list is final. |
| `package.json` `"test:gfx"` (line 12), `"wgx:gallery"`/`"wgx:capture"` scripts (lines naming `wgx-shot.mjs`/`wgx-capture.mjs`) | The two `wgx:*` npm scripts point at tools that move; `test:gfx` names `tlx-probes.spec.js`. | Delete `"wgx:gallery"` and `"wgx:capture"` from `scripts`, or repoint them at `spike/backends/tools/...` if the spike keeps its own npm entry points (move-window decision). Drop `tlx-probes.spec.js` from `test:gfx`'s spec list. |

## `spike/backends/README.md` draft

Written as a real file at `spike/backends/README.md` (created empty of the
moved content it will eventually sit beside, since this session makes no
moves) — see that file for the full re-attach draft: what each subdirectory
will hold once the move lands, the eight re-attach steps, and the provenance
note. It is linked from this checklist's cross-references above rather than
duplicated here, so there is exactly one copy to keep in sync.

## `docs/README.md` index row

Add, under "Engineering reference (current)" or as its own line near the
Renderers subsection (docs-integrity's "docs/README indexes every live
engineering doc" test only requires the filename appear somewhere in
`docs/README.md` — this note lives at `docs/notes/SPIKE-BACKENDS-CHECKLIST.md`,
matching the existing `notes/CEILING-HISTORY.md` row's pattern):

```
| [notes/SPIKE-BACKENDS-CHECKLIST.md](notes/SPIKE-BACKENDS-CHECKLIST.md) | The WGX/TLX spike-out inventory: the move map, every non-move edit with file:line evidence, the tests that go red and their fixes, the `spike/backends/README.md` re-attach draft. |
```

This note itself must pass `docs-integrity.test.mjs`'s "live docs reference
only files that exist" check — every path cited above resolves on the
CURRENT tree (pre-move), since this is an inventory of what the move window
will do, not a description of a tree that already changed. Re-verify after
any edit to this file with `node --test tests/unit/docs-integrity.test.mjs`.
