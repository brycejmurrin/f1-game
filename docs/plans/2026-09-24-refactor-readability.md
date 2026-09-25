# Refactor plan — readability & maintainability (2026-09-24)

Practical, phased structure work for Apex 26. **Not a rewrite.** Preserve public
contracts (`window.__apex`, scenery API 114 members, track def fields, CI gates,
IIFE + `tools/manifest.cjs` load order). Measured at ship tip
`ecc06469f` (`claude/f1-game-project-26h3ng`, 2026-09-24).

**Audience:** Bryce (owner) via Terry. Goal: make the tree easier for humans and
agents to navigate without gambling physics, scenery, or renderer parity.

**Related (do not duplicate):**

| Doc | Role vs this plan |
|---|---|
| [`CLEANUP-ROADMAP.md`](CLEANUP-ROADMAP.md) | Earlier carve queue (Tier A–C). Several items landed; this plan **supersedes it as the ranked readability backlog** and absorbs unfinished carves. |
| [`notes/ARCHITECTURE-REVIEW.md`](../notes/ARCHITECTURE-REVIEW.md) | Founding bet, `G` façade lessons, why megafunctions stay. |
| [`ARCHITECTURE-MAP.md`](../ARCHITECTURE-MAP.md) | Correct mental model (domain dirs). Prefer over stale `js/game/` prose. |
| [`SCENERY-AND-TRACK-BUILD.md`](../SCENERY-AND-TRACK-BUILD.md) | Track build pipeline (accurate). |

---

## Snapshot (evidence, not vibes)

| Metric | Value at tip |
|---|---|
| `js/**/*.js` files | 306 |
| Largest logic files | `presets.js` 17 317 (data), `game.js` 9 168, `wgx.js` 6 364, `car3d.js` 4 135, `tlx.js` 4 159, `apex.js` 3 176, `tracks.js` 2 889 |
| Ratcheted ceilings | `tests/data/ratchets.json` — `game.js` lines 9169 / codeLines 4774 / **gMembers 268** / topLets 151 |
| `G` façade | 268 members, 51 `create(ctx)` modules (`check-gctx.mjs`) |
| Circuit pair | 52 defs (~3.8 k total) + 52 scenery files (~31 k total); largest scenery: monaco 1332, singapore 1067 |
| `Tracks.buildProps` | **~1 942 lines inside `tracks.js`** (guards + theme dress + scenery API + lamps + pits) |
| `game.js` megafunctions | `updateCar` **1 956 lines**, `render` **1 520 lines** (do **not** split — see Non-goals) |
| Backend asymmetry | GLX already split (`glx.js` + `post`/`shadow`/`chunked`); WGX still one 6.3 k file; TLX partially split |

Directory totals (lines of `.js`):

| Dir | Lines | Dir | Lines |
|---|---:|---|---:|
| `js/circuits/` | 35 014 | `js/render/` | 31 796 |
| `js/lighting/` | 20 332 | `js/track/` | 11 860 |
| `js/car/` | 11 713 | `js/ui/` | 8 846 |
| `js/audio/` | 6 444 | `js/agent/` | 6 353 |
| `js/race/` | 6 024 | `js/net/` | 5 960 |

---

## Ranking method

Each hotspot scores **impact × risk** (1–5 each), then impact×risk:

- **Impact:** how often agents/humans hit it; how much confusion or ratchet pressure it causes.
- **Risk:** contract surface, physics/parity sensitivity, test cost, `G` façade growth.

Size alone is not rank: `presets.js` is huge but mostly JSON-shaped data; `updateCar` is huge but **must not** be carved for style.

---

## Top hotspots (ranked)

### 1. `js/game.js` — session / glue god file (impact 5 × risk 4 = **20**) — L

**Why it hurts:** 9 168 lines; sections span race flow (1 340), per-frame update (2 409), render (1 534), UI wiring, liveries, car setup. Every new feature defaults here; ratchet is at ceiling. 94 unit tests name `game.js`. `G` is already 268 members — extractions that add many accessors move coupling, not remove it ([ARCHITECTURE.md](../ARCHITECTURE.md) Reorg lessons).

**Smell:** Cohesive blocks still in the entry (liveries ~200 ln, car-setup helpers, pre-race screens, UI wiring) sit beside untouchable `updateCar` / `render`.

**Proposed shape (behavior-preserving, one carve per PR):**

| Carve | Approx | Target | Crossings (guidance) |
|---|---:|---|---|
| Custom liveries paint/persist | ~200 | `js/car/<custom-liveries>.js` (proposed) or extend `js/car/liveries.js` | Low (`Parts`/`store`/`Liveries` — measured free refs) |
| Pre-race / garage-back UI | ~300–500 | `js/ui/<pre-race>.js` (proposed) | Medium — DOM + `G` session flags |
| UI wiring (title buttons, settings doors) | ~260 | fold into existing `title-menu` / `race-settings` | Medium |
| Photo-mode leftovers in game.js | small | `js/camera/photo-cam.js` (exists) | Low if already on `G` |

**File map:** keep `game.js` as state machine + `update`/`updateCar`/`render`/`tick` + thin wiring; new modules `Module.create(G)` via manifest + HARD_EDGES.

**Risk / tests:** `test:guards`, `physics-characterization` only if touching physics lets; otherwise targeted unit + one browser group from `pick-tests`. Lower ratchets after each carve.

**Size:** L overall; **S–M per carve**.

---

### 2. `js/track/tracks.js` → peel `buildProps` / guards (impact 5 × risk 3 = **15**) — L

**Why it hurts:** Engine shell + **~1 942-line** `buildProps` (terrain raycast grid, on-road/pit guards, mass index, theme dress via `Scenery*`, 114-member API wrap, lamp registries, pit furniture). Scenery agents and landmark waves all read this file; `scenery-guards` / `scenery-api-contract` / `verify-track` depend on it.

**Proposed shape:**

```
js/track/tracks.js                 # LIST, build(), centerline, pit helpers, terrainY
js/track/scenery/<build-props>.js  # proposed — orchestration only
js/track/scenery/<guards>.js       # proposed — onTrack / onRoadHit / pit keep-out / massBlocked
js/track/scenery/<api-wrap>.js     # proposed — transformSceneryApi + guarded emitters (optional)
```

Contract **frozen:** `tests/unit/scenery-api-contract.test.mjs` (114 members). No circuit scenery churn.

**Risk / tests:** `scenery-guards`, `scenery-api-contract`, `track-graph`, `pit-complex`, `verify-track` smoke on 2–3 ids, graph-parity if emitters move. Prefer mechanical move of closed functions first (Phase 1).

**Size:** L (split across 2–3 PRs).

---

### 3. Stale `js/game/` fiction in docs (impact 4 × risk 1 = **4**) — S — **Phase 0 (landed in this PR)**

**Why it hurt:** [`ARCHITECTURE.md`](../ARCHITECTURE.md) still described modules under `js/game/` and listed bare filenames that do not exist there. Reality (post TREE-RESTRUCTURE): domain dirs (`js/physics/`, `js/ui/`, `js/race/`, …). [`ARCHITECTURE-MAP.md`](../ARCHITECTURE-MAP.md) was already correct; agents that trusted ARCHITECTURE opened the wrong paths. `docs/research/TREE-RESTRUCTURE-2026-09.md` already recorded “`js/game/` no longer exists.”

**Done here:** Intro sketch + “Extracted game modules” section rewritten to real paths; CLEANUP-ROADMAP pointed at this plan; README linked. Do **not** invent a `js/game/` directory again.

**Risk / tests:** `docs-integrity` (green on this PR).

**Size:** S.

---

### 4. `js/lighting/presets.js` data blob (impact 4 × risk 2 = **8**) — M

**Why it hurts:** 17 317 lines of per-track×TOD×weather knob tables inside a JS global. Ratcheted; pollutes greps, blame, and agent context. Logic already lives in `profiles.js` / `knobs.js` / `atmosphere.js`.

**Proposed shape:** Lazy JSON (or chunked JSON per track) under `assets/` or `js/lighting/data/`, fetched once like LAZY_SCENERY / light-presets roster; keep a tiny loader IIFE. Mirror CLEANUP Tier C “presets → lazy JSON.”

**Risk / tests:** lighting unit tests, lamp-bake, one gfx smoke; Pages allow-list for new asset paths.

**Size:** M.

---

### 5. `js/render/webgpu/wgx.js` monolith vs GLX seams (impact 4 × risk 3 = **12**) — L

**Why it hurts:** 6 364 lines while GLX already extracted `post.js`, `shadow.js`, `chunked.js`. Agents porting a GLX fix must hunt the WGX twin. Known horizontal dup: instance cell-set cull cache (~same logic in `glx.js` ~2117+ and `wgx.js` ~5466+).

**Proposed shape (match GLX names):**

```
js/render/webgpu/wgx.js              # device, swapchain, begin/present (exists)
js/render/webgpu/<wgx-post>.js       # proposed — mirror GLX post.js
js/render/webgpu/<wgx-shadow>.js     # proposed
js/render/webgpu/<wgx-chunked>.js    # proposed
js/render/shared/<inst-cells>.js     # proposed — shared cell-key cache (GLX+WGX)
```

**Risk / tests:** `backend-surface-parity`, webgpu lifecycle unit tests, `gpu-census.yml` on macos for real GPU (software SwiftShader is not player evidence — AGENTS.md). DEFERRED roster + `gen-shell`.

**Size:** L.

---

### 6. `js/car/car3d.js` mesh + aero monolith (impact 4 × risk 2 = **8**) — M

**Why it hurts:** 4 135 lines: primitives, wheels, halo, aero flaps/wings, body loft. CLEANUP Tier A item `car-aero` (~520 ln) still open. Garage + parts physics specs couple to aero geometry.

**Proposed shape:**

```
js/car/car3d.js           # body/assembly orchestration (exists)
js/car/<car-aero>.js      # proposed — flaps, wing bands, endplates, aeroLevelOf
js/car/<car-geom>.js      # proposed later — addBox/loft/wishbone helpers
```

**Risk / tests:** `parts-physics` spec, garage shot tools, carview; ratchet lower on car3d.

**Size:** M.

---

### 7. `js/agent/apex.js` + `agentview.js` surface sprawl (impact 4 × risk 2 = **8**) — M

**Why it hurts:** 3 176 + 2 519 lines; `__apex` is the agent contract (`DEBUG-HOOKS.md`). Cam / lobby / corner helpers mixed into one object literal. Ratcheted.

**Proposed shape:** Keep one `ApexApi.create(G)` façade; move implementation clusters to `apex-cam.js`, `apex-lobby.js`, `apex-track.js` (CLEANUP Tier C) that register onto the same API object — **no** public rename of hooks.

**Risk / tests:** `agent-view` spec + unit VM tests; `agentHelp()` manifest stability.

**Size:** M.

---

### 8. Clipboard / copy-text duplication (impact 3 × risk 1 = **3**) — S

**Why it hurts:** `navigator.clipboard.writeText` + textarea fallback copied across `perf/renderer-picker.js`, `gfx-debug-overlay.js`, `camera/*-panel.js`, `lighting/tuner-panel.js`, `net/lobby.js`, `ui/results-sheet.js` (CLEANUP “copy-text”).

**Proposed shape:** `js/core/<clipboard>.js` (proposed) → `ApexClipboard.write(text)` / `read()`.

**Risk / tests:** one small unit test; call-site swap is mechanical.

**Size:** S.

---

### 9. `js/input/input.js` multi-concern (impact 3 × risk 2 = **6**) — M

**Why it hurts:** 2 356 lines — gyro/tilt, keyboard map, pad map, digital slew, menu overlay gating. CLEANUP planned `bindings` / `pad-menu-nav` / `hold-buttons`.

**Proposed shape:**

```
js/input/input.js              # poll() façade + shared state (exists)
js/input/<key-bindings>.js     # proposed — already partially in ui/key-binds for DOM
js/input/<pad-bindings>.js     # proposed
js/input/<tilt>.js             # proposed — gyro path
```

**Risk / tests:** `steering` / input specs; careful with menu Escape ladder (`ui-menu-a11y`).

**Size:** M.

---

### 10. `js/audio/engine.js` monolith (impact 3 × risk 2 = **6**) — M

**Why it hurts:** 2 894 lines — WebAudio graph, engine loops, SFX, session type. CLEANUP: extract `music-playback` first.

**Proposed shape:** `engine.js` (car engine voice) + `music.js` / `sfx-bank.js` as needed; keep `GameAudio` global stable.

**Risk / tests:** `audio-tune` unit + audio specs; no change to audible defaults without A/B.

**Size:** M.

---

### 11. `js/net/lobby.js` (impact 3 × risk 2 = **6**) — M

**Why it hurts:** 1 819 lines at ratchet edge; room/invite code + WebRTC + UI. CLEANUP: `lobby-codes` (~230 ln) first.

**Proposed shape:** `js/net/<lobby-codes>.js` (proposed — encode/decode/paste) then optional UI peel.

**Risk / tests:** multiplayer specs; handshake must stay bit-compatible.

**Size:** S then M.

---

### 12. `js/car/liverytex.js` canvas paint sprawl (impact 3 × risk 2 = **6**) — M

**Why it hurts:** 3 147 lines of 2D crest/number/mark painting; team-specific crest functions. Hard to find “where does Haas get its mark?”

**Proposed shape:** `liverytex.js` (atlas + API) + `liverytex-crests.js` (per-team drawers) or data-driven crest table. No visual change.

**Risk / tests:** livery / fin-design unit tests; garage shots optional.

**Size:** M.

---

### 13. `js/physics/debris-world.js` sim+render (impact 3 × risk 3 = **9**) — M

**Why it hurts:** 1 312 lines; Rapier side-world + draw. CLEANUP: `debris-render` split. Touches race-control / incidents.

**Proposed shape:** `debris-world.js` (sim) + `debris-draw.js` (meshes/buffers).

**Risk / tests:** race-control / debris specs; do not change activation gates in `game.js`.

**Size:** M.

---

### 14. `js/data/telemetry.js` + hub UI helpers (impact 2 × risk 2 = **4**) — M

**Why it hurts:** 1 649-line telemetry monolith; duplicated team chip / swatch patterns across hub tabs (CLEANUP). Lower daily agent pain than track/game but still a readability tax.

**Proposed shape:** `telem-canvas` extract; shared `team-chip` helper; internal `api.js` merge dedup (no new file required).

**Risk / tests:** data-lifecycle / telemetry unit tests.

**Size:** M.

---

### 15. CSS / UI sheet giants (impact 2 × risk 2 = **4**) — M

**Why it hurts:** `components.css` 2 146, `menus.css` 2 029; token adoption ratchets (`rawColor`, `rawSpacing`). Not “wrong,” but slow to search. Prefer `css-play` skill rhythms over a big bang.

**Proposed shape:** Peel by **interaction** (already partly done: setting-row, career, tuner sheets) — one sheet per concern when a feature already owns a file. No hero redesign.

**Risk / tests:** layout-audit / ui specs; tree cssClass ratchet.

**Size:** M (incremental).

---

## Phased sequence

### Phase 0 — safe renames / docs / inventory (S, days of agent time; low risk)

1. **Correct layout fiction** in live docs (`ARCHITECTURE.md` `js/game/` → domain paths; link ARCHITECTURE-MAP). *(This PR.)*
2. Mark [`CLEANUP-ROADMAP.md`](CLEANUP-ROADMAP.md) status: `SettingRow` already exists (`js/ui/setting-row.js`); point unfinished Tier A/B/C at **this** plan’s ranks.
3. Optional: one-page “where is X?” table in ARCHITECTURE-MAP if agents still miss homes (only if docs-integrity stays green).
4. **No** circuit scenery waves, elevation bakes, or physics retunes.

### Phase 1 — mechanical splits (S–M, behavior-identical moves)

Rules: move closed functions / data; same globals; `gen-shell` + ratchet `--update` (lower); no new `G` members unless already on façade.

Order (suggested):

1. Clipboard helper (#8)
2. Lobby-codes peel (#11)
3. `car-aero` from car3d (#6)
4. WGX post/shadow/chunked file moves mirroring GLX (#5) — one subsystem per PR
5. `buildProps` → `build-props.js` **orchestration only** (leave guards in place first) (#2)
6. Music-playback from audio engine (#10)

### Phase 2 — behavior-preserving extractions modules (M–L)

Use `tools/check/extract-module.mjs`; sort by **boundary crossings**, not line count.

1. game.js liveries / pre-race UI (#1) — prefer deps seams (`create(G, deps)`) over widening `G`
2. scenery **guards.js** extraction (#2) — heavy test surface, high payoff for landmark work
3. shared `inst-cells` (#5)
4. apex implementation clusters (#7)
5. debris-render (#13)
6. presets → lazy JSON (#4)
7. input bindings / tilt (#9)

### Phase 3 — only if Phase 1–2 stuck (optional)

- TLX further alignment with GLX file seams
- liverytex crest split (#12)
- telemetry canvas (#14)

---

## Explicit non-goals

| Do not | Why |
|---|---|
| Rewrite physics math / tyre model for style | Determinism pinned by `physics-characterization`; `updateCar` is one integration |
| Split `updateCar()` or `render()` | Documented in ARCHITECTURE Reorg — inventing a state struct risks pace/arc invariants |
| Churn all 52 `js/circuits/scenery/*.js` | Landmark/accuracy work is separate; scenery API is frozen |
| Convert the IIFE tree to ESM | Declined 2026-09-10 (ARCHITECTURE-REVIEW); ESM islands only for new shallow subsystems |
| Merge GLSL / WGSL / TSL shader sources | Different backends by design |
| Raise ratchets to land features | Extract or pay with a reasoned `--update` + lower after |
| Big-bang directory renames | Load-order / HARD_EDGES / Pages / agent skills all couple to paths |
| Feature work dressed as “cleanup” | Scenery landmarks, elevation, lighting looks stay on their own PRs |

---

## Execution checklist (every carve)

```sh
node tools/check/extract-module.mjs <file> <start> <end>   # free refs
# edit SOURCE only — never hand-edit generated shell/roster
node tools/gen/gen-shell.mjs          # if manifest changed
node tools/check/ratchets.mjs --update   # lower after extraction
npm run test:guards
node tools/ci/pick-tests.mjs
# then tooling-fast and at most ONE browser group (AGENTS.md rules 4–5)
```

One carve → one commit → guards → targeted tests → draft PR. Prefer naming **Not run** groups over widening a run on a busy box.

---

## Top 5 moves (executive)

1. **Docs: kill `js/game/` fiction** — unblock every agent session (Phase 0).
2. **Peel `tracks.js` `buildProps` / guards** — biggest scenery maintainability win without touching 52 circuits.
3. **Continue `game.js` extractions by crossing count** — liveries / UI first; never `updateCar`/`render`.
4. **Split WGX along GLX seams + shared inst-cells** — makes renderer fixes findable.
5. **Data out of the tree: `presets.js` → lazy JSON** — reclaim 17 k lines of agent context.

---

## Measurement stamp

| Field | Value |
|---|---|
| Tip SHA | `ecc06469f` |
| Branch measured | `origin/claude/f1-game-project-26h3ng` |
| Date (UTC) | 2026-09-24 |
| Method | `wc -l`, section/brace spans in Node, `ratchets.json`, `check-gctx.mjs`, `extract-module.mjs` free-ref samples, grep for clipboard/inst-cell dup |
