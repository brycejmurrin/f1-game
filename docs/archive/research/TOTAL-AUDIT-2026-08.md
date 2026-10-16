# Total-audit — dated record (2026-08)

Dated record: the whole-tree audit workflow (19 domain finders reading every
source file and doc in full; batched adversarial verification — 1 skeptic per
batch, 2 for high severity; one synthesizer). 197 findings survived hostile
review. This is an EXECUTION PLAN feeding the campaign fix batches; items are
worked off against it and it archives when spent. Uncompressed findings:
[raw/2026-08-total-audit.json](raw/2026-08-total-audit.json).

Session-verified addendum (not from the finders — discovered while chasing the
tracks-walls spec failures, confirmed via instrumented headless repro):
**`__apex.jump()` does not cancel an active IncidentSim takeover window** — a
car wedged into a wall hard enough to arm R2 stays owned by the Rapier
side-world, which re-imposes the pre-jump pose (position AND ~6 m/s handback
crawl) over the teleport every tick. Fix: an IncidentSim release(car) called
from jump() (and rescuePlayer). This joins Batch A alongside the RETAIN_FLOOR
fix the finders did catch.

---

# Whole-tree audit synthesis — 197 verified findings (2026-08)

## Verdict

The tree is structurally healthy after the cleanup campaign: the guard suites, the engine/data split, the G-façade discipline, and the docs infrastructure all held up under adversarial audit — 197 findings confirmed, zero net refutations, and roughly 70% of them are prose drift or dead code, not behavior. The single most important discovery **corrects AUDIT-SYNTHESIS-2026-08.md FIX-NOW #3**: the curvature-sign campaign fixed the *labels* (agentview/apex/camera placement) but the retired `+k = right` convention is still **live behavior** in three engine consumers — kerbs built on the outside of every corner (mesh.js:204), tyre barriers on the inside (tracks.js:1549), corner boards inside (tracks.js:1601) — plus the same inversion class in the camera tuner's SIDE/YAW (cam-tune.js:145). The rest of the mess concentrates in four pockets: headers/docs describing retired designs (net signalling's Trystero era, WGX parity claims, the matTexMix "ships at 0" inversion, MQTT/two-backend leftovers); the data hub's freshness story (LIVE tab's refresh defeated by its own cache, hardcoded years); tools that exit 0 while measuring nothing (motion-capture, check-bank, the two fit sweeps clicking dead ids); and a long tail of comment drift in scenery/circuits. Nothing found undermines the restructure plan — R1/R2/R3 remain GO as scoped, and six findings fold cleanly into them.

## Fix now — BATCHES A, B AND C ALL LANDED 2026-08-07

Worked off in two commits: `89ce4f2f` (A+B+C, bump v1025) and `d23b70b8`
(the tail, bump v1026). Two things happened in the landing that this record
is the only durable place to note:

- **A regression the first commit shipped, repaired by the second.**
  `89ce4f2f` captured an intermediate `js/circuits/paul_ricard.js` whose
  modelGroup bounds had been widened to the honest 56 m — and those bounds are
  an atomic road-footprint test, so preflight then rejected the cabanon AND
  its wall together (299,716 verts vs 299,946). `d23b70b8` splits the wall
  into its own guarded run; emitted geometry is byte-identical to before.
- **An art change reverted, not landed.** The train had activated a dormant
  `setback` massing option in the city generator. `building()` has never read
  that key, so every street circuit shipped with the hash-picked archetypes;
  switching it on costs a severe interpenetration on Baku (clip-audit
  31 → 32, A/B confirmed). Removed with the reasoning in place; the decision
  is a design ticket in CAMPAIGN-2026-08.md.

One baseline moved, and it was earned: `tools/coplanar-baseline.json`
interlagos 3 → 2, because un-collapsing the Arquibancadas crowdBanks removed
a z-fighting spot. Geometry sweeps are green across all 40 circuits.

The list below stands as the record of what was found.



Everything below is an immediate commit. **Batch A + B touch `js/`, `css/`, `index.html`, `sw.js`, `manifest.json` — land as at most three commits sharing ONE `?v=N` + `version.json` bump as the last edit** (`.claude/skills/bump-cache`), never mid-test-run. **Batch C is docs/tools/spike — no bump.** Run `node tools/verify-track.cjs <id>` for every track/circuit edit; `pick-tests` for the rest.

### Batch A — high-severity `js/` + shell (bump train)

**Sign-convention cluster** — same genus as the queued agentview/apex fix (known #1, AUDIT-SYNTHESIS FIX-NOW #3), but these are live behavior the queued fix does not touch:
- js/track/mesh.js:204 — apex kerbs placed on the OUTSIDE of every corner (stale `+curv = right` read) → `inside = c.sign > 0 ? -1 : 1`; fix the findCorners doc at :28 in the same edit
- js/track/tracks.js:1549 — tyre barriers (and their driving limits) on the corner INSIDE on every permanent circuit → `outside = c.sign > 0 ? 1 : -1`
- js/track/tracks.js:1601 — corner boards + braking-marker trios erected inside → same flip
- js/game/cam-tune.js:145 — SIDE/YAW knobs act inverted ((fz,−fx) is screen-LEFT) → `rx = -fz, rz = fx` and negate yaw rotation

**Player-facing state and flow:**
- js/game/career-ui.js:523 — toggling to a flavour with a full slot set loads slot-0's save, so START CAREER silently routes into the wrong career → never `useSlot` when `free < 0`
- index.html:736 — Escape on the quali classification clicks the hidden BACK and throws the result away → guard the q-back handler on `q-done`
- index.html:57 — version-guard reload drops `#vs=CODE` invite links on stale shells (exactly the mismatched-build case) → append `location.hash`
- js/game/racecontrol.js:120 — YELLOW_MAX/SC_MAX caps are a no-op; a persistent hazard holds a caution forever → force-lower on `sinceT >= cap` regardless of `desired`, drop the dead disjunct
- js/game/incidentsim.js:441 — RETAIN_FLOOR fires only at exactly 0; clean settles hand back at crawl speed → `clamp(outV || inV*RETAIN_FLOOR, inV*RETAIN_FLOOR, inV*RETAIN_MAX)`
- js/game.js:6379 — the entire DRIZZLE tier (rainSeed + 3 shipped sliders) is unreachable in WET sessions → gate the overlay on `isWetRoad()` and pass `isRaining()` as the storm flag (plumbing exists)
- js/game/results.js:40 — remote human's " PLAYER" tag destroyed by the later `textContent` write → set textContent first, append after (quali.js order)
- js/game/spotify.js:1157 — PLAY button dead in default remote mode (`player.resume()` on null, swallowed) → call `BACKEND.start()` like sp-toggle
- index.html:968 — HOW TO PLAY teaches buttons mode auto-accelerates; it has a GAS pedal → reword (touch mode only)

**Agent surface:**
- js/game/agentview.js:1634 — `describe("span:n")` reads lap fractions as metres (sub-metre spans) → convert via `* total` as worldModel() does
- js/game/agentview.js:1665 — prop `lateralM` reports the ±1 side selector as metres → return `lat: null` in propPos's k-branch

**Scenery/track builds** (verify-track each touched circuit):
- js/track/scenery-nature.js:986 — `bush({form:"agave"})` throws ReferenceError (`norm` not destructured) → add `norm` to the ctx destructure
- js/track/scenery-structures.js:833 — pit speed sign built as a horizontal ring; floating digits on every circuit → basis with ring spanning (u,t), face offset along −side·r
- js/track/scenery-structures.js:558 — ~1 in 18 night crowd bands render as glowing HDR slabs → clamp pick() to dark branches at night, HDR for speckles only
- js/circuits/interlagos.js:662 — both Arquibancadas crowdBanks collapse to node 0 as z-fighting duplicates → pass fractions (0.830/0.845), drop the ignored 6th arg, rewrite the stale comment
- js/circuits/nurburgring.js:489 — Burg Nürburg built TWICE on two hills → delete one block (keep :489-542), renumber the duplicate "7." headers

**Renderer:**
- js/render/glx.js:928 (+ js/render/assets.js:21, js/render/shaders/lit.js:109) — matTexMix truth cluster: begin() fallback 0.0 inverts the shipped TUNE_DEFS 1.0, and both prose sites teach "ships at 0" → fallback 1.0; rewrite assets.js guarantee #3 and the lit.js:109-113 comment to "ships at 1.0; 0 is the A/B off-switch"
- js/render/webgpu/wgsl-post.js:862 — SSR "upper screen" cutoff vertically inverted for y-down uv (runs on sky, rejects road) → gate/fade on `1.0 - in.uv.y`
- js/render/webgpu/wgsl-chunks.js:707 — LIT ignores ssrTex alpha, darkening wet road toward black → blend per the documented consumer contract using `.a`

**Net/data:**
- js/net/lobby.js:209 — lobby's stale onClose closes the session with reason "local" after NetPlay adopts it; RIVAL DISCONNECTED suppressed → clear the lobby `sessions` map in finishStart()
- js/net/nostr.js:16 — header describes the opt-in legacy Trystero path as the default → rewrite for directExchange (own WebSockets + NetRendezvous.seal)
- js/net/snapshot.js:18 — wire table says "u8 index into cars[]" — the one thing the id must never be → "G.wireId (teamIndex*2 + seat)"
- js/data/live.js:8 — LIVE tab's 30 s refresh defeated by the 10-min TTL while the "updated" stamp advances → short TTL/bypass for latest-session requests, or stamp only on network responses
- js/data/live.js:101 — returning to the LIVE tab shows AUTO lit but the interval permanently disarmed → resumeLiveAuto() on the cached-node path (or exclude "live" from it)
- js/data/schedule.js:14 — hardcoded "2026 CALENDAR" over clock-derived data → derive the year

**CSS:**
- css/track-detail.css:18 — comments (and topmodal.js:90) claim #track-detail is a real `<dialog>`; it's a div with a lying `aria-modal` and a load-bearing z-index a reader would delete → either migrate it to `<dialog class="screen">` or correct both comments and drop aria-modal

### Batch B — `js/`/shell low sweep (rides the same bump; comment drift, dead code, one-liners)

*game.js:* :2293 stale-mods log → move below recomputePlayerMods; :7191 TT_LAPS=4 matches no chip → add 4 or default 3; dead façade keys :2761 carFromWireId, :2711 setPaused, :2589 simRnd, :2630 renderAlpha, :2700 updateTrackPreview (also drop it from career-ui.js:10's header list) → delete; :1295 8-char visualKey initializer + both examples → 12-char; :4659 wing-view derivation → shipped 3.6/2.8; :1240 local `els` shadowing the DOM registry → rename `flaps`; :7322 `.cz-off` has no CSS rule → add opacity 0.35 in menus.css.

*js/game modules:* career-ui.js:257 "a accident" → article-aware join; atmosphere.js:375 dark predicate hand-written 4× and redundant → use `isNightSession`; agentview-raster.js:571 dead `const b = Tracks` → delete; lighting.js:7 (+:260-264) persistence "lives in game.js" → point at light-store.js and the five-layer order; input.js:6 retired screen-halves header → keyboard > gamepad > buttons > tilt > touch(drag); hud.js:173 caution "in game.js" → racecontrol.js (**fold into the queued known-#10 fix — different file, the debrisworld edit won't touch it**); hud.js:6 façade list missing state/otEnabled/aeroZoneAhead/aeroZones/cautionInfo → add; menus.js:17 unused renderStatBars wrapper → delete; results.js:17 identical-branch ternary → delete; quali.js:81 unused `els` destructure → `const { $ } = G`; steer-tuning.js:427 orphaned GEARS comment (code lives in game.js:7745) → delete/move.

*js/track:* spline.js:17 (+tracks.js:2187) "+turn = right" authoring doc contradicts the measured LEFT convention → reword (doc side of the Batch-A sign cluster); models.js:209/:249 box counts stored as `vertices` → real counts or rename `parts`; mesh.js:542 dead pyMin + misattributed baseline comment → delete/point at TrackSurface.profile; mesh.js:319/:323/:324 dead bp/ka/kb/line → delete; tracks.js:1758 Monaco harbour predicate duplicated + barrierGap special-cased in the ENGINE → move to monaco.js dressingExclusions + `barrierGap: 2.0` in its def; maps.js:54 write-only `turns` + stale cache-shape comment → drop/fix; scenery-city.js:755 write-only `setback:` → pass `arch:"setback"` or delete; :24 unused `cantilever` destructure → drop; scenery-nature.js:528 "RAW.addBox" comment vs ctx.instance reality (+unused RAW destructure) → fix; :963 phantom "scrub" form → remove from doc; :767 (+:592, :613) three disagreeing grandstand counts vs real 230+33 → one current pair or none; scenery-data.js:108 "two alternating" vs THREE stripes → delete stale sentence; :442 madrid "terracotta" never used → "steel" or correct the comment; :44 stranded emitter-guard doc over the CROWD_DAY palette → move to grandstandEx in scenery-nature.js; scenery-structures.js:98 leaning-fence comment over an empty block → move to the fence-mesh branch; scenery-identity.js:85 local `along` shadowing the ctx node walker → rename `armOff`.

*js/circuits:* jacarepagua.js:106 wrap-blind arc exclusion → `a > 3.3 || a < 2.2`; madrid.js:560 two-bays/one-bay/two-tiers self-contradiction vs `tiers: 3` → delete superseded paragraph; albert_park.js:351 (+:547) stale palm/tent distances → update to 15-23/34+; :87 dead track-centre loop + its `void`s → delete; jeddah.js:143 unreachable-and-wrong concreteCanyon fallback → delete (shared helper always wired); mexico.js:782/:822 convoluted duplicated guard with an s==0.04 pinhole → `s < 0.50` once; qatar.js:581 reference to a removed skyline() loop → reword; monza.js:287 identical-branch ternary → literal 1.8; monaco.js:954 header names groundPlane, code uses waterField → fix header; paul_ricard.js:528 cabanon wall emitted ~50 m outside its modelGroup bounds → extend bounds or emit the wall as its own guarded run.

*js/render:* shaders/lit.js:64 severed comment tail on vNrm → rejoin to :59; glx.js:1045 uEnvStr fallback comment claims "the TUNE_DEFS default" but only matches mobile → reword or make tier-aware; gfx.js:71 seam contract omits shadowCtr/cloudSpeed, depthBias, drawParticles + the instancing/material-array families (**land WITH the queued known-#3 header rewrite** — this is contract content that rewrite must not drop); glx/post.js:458 "nearest-8" vs 12 uploaded/6 marched → make the three numbers agree; shaders/post.js:161 dead NEARP/FARP → delete; glx/chunked.js:148 (+glx.js drawInstanced) don't honor draw()'s translucency invariants → document both as opaque-only (all callers pass alpha 1) or mirror the masking; webgpu/wgsl-chunks.js:443 "no blocker search" comment 30 lines above a real blocker search → rewrite; wgx.js:1371 dead `_envReady` ternary + over-broad gate comment → delete/reword; wgx.js:1328 params2 "_" lane actually shadowBias → fix comment; three/tsl-lit.js:1315 write-only `__tlxMatU` citing a nonexistent refresh path → delete; tlx-chunked.js:48 contract omits releaseMirrors → add; tsl-post.js:31 contract omits `spread` → add.

*js/net:* netplay.js:750 predict(c) passes the car as the timestamp (NaN target) → default to `nowMs()`; sdp.js:238 packed invite one byte over-allocated → drop the final `+1`; lobby.js:294 stale-invite branch unreachable (needs >90 s, watcher gives up at 60) → lower the threshold or key off invite age; transport.js:202 "no static TURN is shipped" block contradicts the SHIPPED RELAY block below it → fold/delete; :260 comment points at CLAUDE.md for prose now in docs/MULTIPLAYER.md → repoint; handshake.js:35 "TURN costs money / never connect" → shipped free relay covers it; :22 compression interop claim is one-directional → qualify or return "browser too old"; rendezvous.js:237 (+:319-322) "public MQTT broker" naming + dead third get() arg → Nostr pool, remove arg.

*js/data:* live.js:86 + telemetry.js:279 unreachable Promise rejection handlers (inputs pre-caught) → delete; api.js:101 V8-string-matched JSON parse detection defeats the 401/403 stale-cache refusal on Firefox/Safari → catch structurally (`instanceof SyntaxError`); api.js:275 meetingTtl serves 7-day TTL for unknown/future meetings → mirror sessionTtl (TTL_LATEST); api.js:7 header omits the live-auth-lockout exception → append it; hub.js:42 phantom `gen` field in the state-map comment → fix; export.js:213 hardcoded [2025,2024,2023] pills (the exact trap hub.js purged) → clock-derived; :243 "a minute" vs "~10 min" back-to-back → align; telemetry.js:578 inline shortLS re-derivation → call the helper; :713 telView retained after close → null it in stopTelAnim; :1536 cumdist cached twice as t.cum and tel._cum → one property.

*js/car:* car3d.js:1968 nose cap/stripes lofted to fixed z past styled nose tips (±10 cm float on haas/williams) → derive endpoints from styledNoseStations; parts.js:470 four cockpit SIGNATURE descs contradict their own visual recipes → reword to match; liverytex.js:791 self-init comment says game.js stopped calling loadLogos — it didn't; all 11 logos load twice → delete the game.js:7865 call; car3d.js:1768 sponsor-board block first half teaches retired 0.24..0.84 sizing (+liverytex.js:1016 twin) → rewrite to 0.32..0.80; liveries.js:19 fin painted "on teams whose chassis fits one" vs unconditional emit → reword (+rename TEAM_STYLE.fin value-2 doc); liverytex.js:25 crest region "(sidepods, nose)" vs engine-cover+fin reality → fix.

*Shell/css/sw:* components.css:663 z-index values for three top-layer `<dialog>`s + wrong "still `<div>`s" comment → delete/rewrite; tokens.css:489 ten ungated `:hover` sites across carsetup/data/tuner/career vs the "every :hover" claim → wrap in `@media (hover: hover)`; :74 @property rationale cites a nonexistent scroll-driven animation → describe the ScrollFade JS path; sw.js:171 uniquely-busted version.json cached per launch, never matched → skip or key on bare "version.json"; :41 rapier.mjs (ON by default) missing from the optional precache that seeds rarely-used jsQR → add it; index.html:302 + manifest.json:4 "24 real circuits" vs 40 → "24-round season + 16 classics"; :666 LAPS/WEATHER/TIME rows lack the role="group"/aria-labelledby their four siblings carry → add; css/career.css:173 red outset focus ring violates the tokens.css 3:1 policy → drop the override; index.html:471 comment says room codes are hidden without a configured relay — retired design, never hidden → rewrite (**shell-side sibling of queued known #9; the rendezvous.js fix won't touch it**).

### Batch C — docs / tools / spike (no cache bump)

**High first:**
- docs/MULTIPLAYER.md:63 — all_rejected relay-refusal detection is legacy-branch-only; the doc teaches it as shipped → describe directExchange, mark all_rejected legacy (or port OK=false detection — then it's a js commit)
- docs/MULTIPLAYER.md:85 — "seal()/open() … nothing calls them" while both are live on the default path (**corrects the doc to match rendezvous.js's already-fixed header; companion to queued known #9**)
- docs/DEBUG-HOOKS.md:89 — phantom `select` state in the canonical enum (**extends AUDIT-SYNTHESIS FIX-NOW #6, which fixed ARCHITECTURE/CAREER but missed the hooks reference**)
- docs/ARCHITECTURE.md:437 — `Tracks.curvature` "+ = right turn" (**extends FIX-NOW #3 — a doc site outside both the queue and the review's list**) → "+ = left"
- docs/research/ENGINEERING-PRACTICE-NOTES.md:236 — presents the store.js silent-swallow as current; it shipped fixed (noteBroken/store.broken/persistState) → dated postscript noting what landed and which recommendations remain open
- .claude/skills/tune-physics/SKILL.md:17 — teaches pre-Phase-C defaults (3.2 m / 60 m/s / PACE 1.0) that steer-tuning overwrites at boot (3.60 / ~41.7 / 0.840) → update table, name steer-tuning.js as source of truth (**extends PHASE-C-SLIDER-DESIGN, which already marks these SHIPPED**)
- tools/README.md:137 — rtc-e2e's description grafted onto the turn-local bullet → move the sentences to :94
- tools/menu-fit.mjs:68/:73 — clicks dead #sel-team-card/#sel-customize; uncaught evaluate aborts the whole sweep before report.json → route via the garage (as layout-audit does) + .catch per screen
- tools/fit-audit.mjs:68/:73 — same dead ids; two screens silently absent from the WCAG matrix, exit 0 → same garage routes
- tools/motion-capture.mjs:79 — ffmpeg candidate path stale; tool exits 0 printing a 0-frame flicker report → add `ffmpeg-*/ffmpeg-linux` glob + fail loudly on spawn error/zero frames
- CLAUDE.md (from js/render/webgpu/wgx.js:2354) — WGX gap list wrongly includes PCSS; a blocker-search PCSS-lite ships → drop "PCSS" from CLAUDE.md now, and from gfx.js:8 when the queued known-#3 rewrite lands

**Docs low:** ARCHITECTURE.md:702 stale `(Tracks.LIST.length)` → delete; :30 DEFERRED backends listed in the script-tag sketch → remove/annotate; :312 antialias/dpr claims miss the mobile tiers → reword; :488 dead CLAUDE.md "Parts system" pointer → docs/PARTS.md; :113 ~303 vs ARCHITECTURE-REVIEW's ~415 for the same block → reconcile (**an internal contradiction between the two live architecture docs — cite the review**); docs/README.md:62 "thirteen" vs 14 rows/files → fourteen; :93 (+:86-87) "no live doc references" the archive vs two research docs that do → soften; LAYOUT-AUDIT.md:84 21 vs 22/24 roots → recount or defer to SCREENS; SCENERY-API.md:21 nonexistent CLAUDE.md section pointer → redirect; SCENERY-GROUNDING.md:318 canopyR attributed to tracks.js → scenery-nature.js; AGENT-WORLD-API.md:676 dead game.js:2705 cite → cite the symbol; SCENE-GRAPH-PLAN.md:12/:206 unresolvable companion path → ../archive/research/; :250/:410 "six emitters" vs sixteen → fix; PHASE-C-SLIDER-DESIGN.md:308 "NOT verified" note contradicting the recorded double sweep → delete; playwright-probe SKILL.md:74 `previewCam(frac, mode)` reversed → swap; scenery-dress SKILL.md:110 ~50k-vert budget contradicted 10-40× by every circuit → real guidance; agent-view SKILL.md:96 "8 upgrade categories" → 12 (**sibling of queued known #6, different file**); ASSET-API-RESEARCH.md:23 four drifted glx.js cites → repoint/symbol names; PLATFORM-INPUT-NOTES.md:152 perf.js:45 → :91.

**Tools low:** check-bank.mjs:25 write-only hasBank + hardcoded `return true` → delete the block, soften README's "banking grip" row; assets.mjs:275 lit.js:196 → :225; :562 import-pack wipes committed models/env manifest sections → start from readManifest(); coplanar-audit.cjs:84 (+:16) slipped cites → game.js:5196 / glx.js:375-376 or symbols; import-circuit-path.mjs:190 self-check blind to the 16 committed classics → merge COMMITTED+CLASSICS; float-audit.cjs:614 --clip NOTE steers readers to build clip-audit, which exists → delete the mode or reduce to a pointer; layout-audit.mjs:699 dead "photomode" id → "photo-controls"; manifest.cjs:266 orphaned TSL comment in HARD_EDGES → delete; :311 PATHS doc-block separated from its const by 60 lines → move above :378; profile-gameloop.mjs:28 no try/finally around server+browser → wrap (survey-track pattern); track-build-vm.cjs:119 dead `/track-geom/` frame filter (+:80 comment; mirror float-audit.cjs:126) → `/track\/geom\.js/`; README.md:63 "escaped twice" vs vstd-lint's four → four; verify-track.cjs:128 "js/tracks/" comment (**sibling of queued known #13, different file**) → js/circuits/; :3 header understates the 20-file TRACK_VM load → reword; nostr-probe.mjs:4 phantom --skip-publish → implement or delete phrase; test-shards.sh:63 "\r unrolled" claim with no tr → add the tr or drop the claim; survey-track.mjs:16 pathless ground-profile.mjs pointer → full skills path; ssr-probe.mjs:17 missing "mix" mode in the flags doc → add.

**Spike:** capture-m8.mjs:50 separator-less path-containment check → compare against `ROOT + sep` (capture.mjs already does); physics/deep-handover.mjs:86 write-only hitWindowEdge with a meaningless formula + wrong doc shape → return `clamped` on the winning k per the :75 doc; spike-data.js:16 phantom `out` param in the frameLights doc → fix; ADOPTION-PLAN.md:90 deleted `spike/physics/vendor/` path → vendor/rapier-0.19.3.

## Feed the restructure

Mapped to the waves in docs/archive/research/AUDIT-SYNTHESIS-2026-08.md § RESTRUCTURE:

**R1 (audio-panel extraction) — 2 findings.** R1's organizing principle is "panel wiring lives with its panel"; these two are that principle applied:
- js/game/audio.js:1029 — stale "trackIdx >= 0 → race loop" block above setMusicEnabled, contradicted by startMusic's own :1050-1055 → delete the two lines while re-reading the panel↔audio seam during the extraction.
- js/game/photomode.js:257 — lt-help-on/lt-reset/lt-copy (including the COPY VALUES export bake-lighting depends on) wired in photomode.js while every other #lighting control lives in tuner.js → move into tuner.js's create(G) as an R1 companion commit; it is the lighting-panel twin of the ownership problem R1 fixes for the audio panel.

**R2 (tests/ split) — 0 new findings, one sequencing constraint.** No finding lands inside tests/ (out of scope), but R2 step 5 edits tools/fit-audit.mjs:27 and tools/menu-fit.mjs:32 (the `../tests/helpers/f1-api-mock.js` imports). Land the Batch-C dead-route fixes for those two files **before** R2, so the mechanical git-mv commit stays mechanical and doesn't carry functional fixes.

**R3 (tools/ subdirs, reduced form) — 6 findings:**
- tools/rtc-e2e.mjs:58 (+ rtc-e2e-3p.mjs:54, rtc-e2e-room.mjs:56) — hardcoded `/opt/pw-browsers/chromium` with no ladder → fold the pickChromium/env fallback into the `tools/net/` move commit (the move already rewrites their path handling).
- tools/career-economy.mjs:47 and tools/layout-audit.mjs:684 — same hardcoded-Chromium violation; both files stay flat under R3's cut line, but fix them in the same launch-ladder hygiene pass so the convention lands once, everywhere.
- tools/render-car.mjs:173 — relative `--out` resolves against tools/ (HERE) → resolve against cwd/ROOT inside the `tools/car/` move commit, which edits exactly those ROOT-resolution lines; fix the :26 ±36°-vs-±30° header in the same touch.
- tools/apex-capture.mjs:279 — CAMS list missing "drift" (12 of 13 modes) → fold into the `tools/capture/` move; derive the list from GameTables/__apex at runtime so it cannot drift again.

## Defer

1. **js/track/tracks.js:275 (HIGH — the one high-severity deferral)** — transformSceneryApi ignores `sceneryCoordinates:"racing"` for SIDE and ranges, leaving kyalami/paul_ricard with three conventions in one file. Deferred because current output is *correct by hand-compensation* (kyalami.js:84-87 documents the author working around it); the fix is a lockstep engine + two-circuit migration needing verify-track and pixel checks on both. Schedule as its own change, first in line after the fix-now batches — never inside a sweep commit.
2. js/render/webgpu/wgsl-fx.js:28 — the "descending smoothstep is UB" porting rule vs five shipped shaders using it. Needs a WGSL-spec ruling before choosing which side to rewrite; picking wrong churns five shaders on a frozen backend.
3. Wire-or-delete design decisions (each needs an owner call, not a mechanical fix): js/game/carmesh.js:287 dead getBoostFlame (wire the ERS flame or delete the export); js/track/themes.js:83 dead variant()/variants/spacing machinery; js/track/landmark-kit.js:45 unreachable facade/stadiumSection/arch.
4. js/car/car3d.js:2566 — helmet + tally light share the body FINISH remap; whether a chrome car should have a chrome helmet is an art decision, not drift. Amend the two comments if the answer is "intended".
5. js/data/live.js:201 — dead timeDiff gap-bar; the real fix is fetching OpenF1 /intervals (feature work) vs deleting a wanted feature.
6. js/data/api.js:69 — localStorage cache has no eviction; a sweep-on-quota is small feature work, not a one-liner.
7. js/circuits/hungaroring.js:54 — unused api destructures across 12 circuit files; mechanical but 12-file churn needing a convention decision (void-list vs trim). Fold into the docs/ARCHITECTURE-REVIEW.md backlog beside recorded item #23.
8. tools/float-audit.cjs:48 — inline VM copy drifted from track-build-vm.cjs; **already recorded as outstanding in track-build-vm.cjs:3-6's own header** — consolidation is a refactor, do it when float-audit is next touched (its :614 --clip deletion in Batch C shrinks the surface first).
9. spike/capture-m8.mjs:44 — 4-site static-server duplication; spike/ is concluded provenance, and the one divergence that mattered (the :50 traversal guard) is fixed in Batch C. Extract a shared server only if the spikes are ever rerun in anger.

## Coverage

**Audited:** the whole working tree except tests/ — js/game (game.js core + all ~40 modules), js/track (engine + the four scenery-* files + data tables), js/circuits (20 of 40 files audited line-by-line; all 40 swept shallowly for the destructure-residue and count checks), js/render (GLX + glx/ passes + shaders + WGX incl. WGSL + TLX/TSL), all 13 js/net files, js/data, js/car, the shell (index.html, all css/, sw.js, manifest.json), tools/ (~60 tools, README, manifest.cjs), docs/ (reference + research + .claude/skills), and spike/. **Adversarial verification:** every finding heard 1-2 skeptics; 0 were refuted (the cam-tune.js:145 inversion survived one refutation attempt, upheld on the pixel-verified screen-right basis). The critic rounds' main additions were the cross-file corroborations — the sign-convention cluster's shared genus, the matTexMix three-site truth cluster, and the legacy-vs-default path split in js/net that flipped four "doc" findings from cosmetic to high. **Genuinely unaudited:** tests/ per-file semantics (dedicated audit in flight — its findings are not in this report); the other ~20 circuit files' per-line scenery semantics; vendor/ (three.js r184, rapier 0.19.3); worker/ (Cloudflare relay); the binary content of assets/pack; .github/workflows beyond what R2's plan already covers; playwright.config.js (its one known defect is recorded and deferred as known #18). Relative to docs/research/AUDIT-SYNTHESIS-2026-08.md: this pass confirms its FIX-NOW items all landed, **extends** #3 (sign convention) with four live-behavior sites and two doc sites it missed, **extends** #6 (state-enum docs) into DEBUG-HOOKS.md, **extends** #7 (renderer-seam rewrite) with the gfx.js:71 contract omissions and the CLAUDE.md PCSS correction, and finds nothing that changes R1/R2/R3's GO verdicts.

---

## Appendix — the 197 confirmed findings (compact)

| Sev | Kind | Where | Claim |
|---|---|---|---|
| high | dead-code | `js/game.js:6379` | The entire DRIZZLE weather tier is unreachable: in a WET (non-raining) session the rain overlay is hidden and never drawn, so rainSeed(drizzle=true) and the three shipped DRIZZLE t |
| low | bug | `js/game.js:2293` | startRace()'s diagnostic Log.info reads module-level playerMods/playerAeroLoad BEFORE recomputePlayerMods() (2307) refreshes them, so the race-envelope log line reports the previou |
| low | bug | `js/game.js:7191` | The time-trial default lap count (TT_LAPS = 4) is not one of the TT lap chips [3, 5, 8], so the TT race-settings screen opens with no LAPS chip highlighted and defaults to a sessio |
| low | dead-code | `js/game.js:2761` | G.carFromWireId (function at 1357) has zero consumers anywhere in js/, tests/, or tools/ — netplay resolves wire ids through its own remotes map, never this helper. |
| low | dead-code | `js/game.js:2711` | The façade key G.setPaused has no consumer — photomode.js deliberately stopped calling it, and no other module or test uses it. |
| low | dead-code | `js/game.js:2589` | G.simRnd (the `simSeed, simRnd,` shorthand pair) exports simRnd to no consumer — every module that could draw from the sim stream documents that it deliberately must not. |
| low | dead-code | `js/game.js:2630` | The G.renderAlpha getter/setter pair is consumed by nothing. |
| low | dead-code | `js/game.js:2700` | G.updateTrackPreview has no consumer — career-ui.js's header claims to consume it through the façade but never references it, and menus.js uses its own local updateTrackPreview. |
| low | contradiction | `js/game.js:1295` | playerVisualKey's initializer "11111111" is an 8-character key from the 8-category parts era, directly under a comment calling it the 'Full 12-char cosmetic key' — Parts.CATALOG ha |
| low | drift | `js/game.js:4659` | The wing-view frustum-derivation comment derives distances (~4.5 m front, ~3.6 m rear) that do not match the shipped presets (3.6 and 2.8). |
| low | mess | `js/game.js:1240` | drawAeroFlaps shadows the module-wide `els` DOM-element registry with a local `const els` holding flap geometry, inviting a wrong-object bug on any future edit inside the function. |
| high | bug | `js/game/cam-tune.js:145` | The CAMERA TUNER's SIDE and YAW knobs act inverted relative to their player-facing help text ('right (+)' moves/pans LEFT), because apply() takes (fz, −fx) as the right vector when |
| high | bug | `js/game/agentview.js:1634` | describe("span:n") reads reg.spans' s0/s1 as arc-METRES when they are stored as LAP FRACTIONS, so every span reports sub-metre fromS/toS/lengthM and a near-zero fromFrac — contradi |
| high | bug | `js/game/agentview.js:1665` | describe("prop:n") reports lateralM as ±1.0 m for every prop that carries a side flag, because propPos() returns the ±1 side SELECTOR as the 'signed lateral offset'. |
| high | bug | `js/game/career-ui.js:523` | On the NEW CAREER form, toggling to a flavour whose slot set is FULL loads that set's slot-0 save (Career.active() becomes true), so pressing START CAREER silently routes into the  |
| low | bug | `js/game/career-ui.js:257` | The generated RELIABILITY guide sentence reads 'cars stop — an engine, a gearbox, a accident': joining the deduped REASONS with ', a ' produces bad grammar before 'accident'. |
| low | dead-code | `js/game/carmesh.js:287` | CarMesh.getBoostFlame() is a dead export — no caller anywhere — so the documented 'blue-white plasma quad behind the tailpipe while ERS boost is deploying' is never drawn. |
| low | drift | `js/game/audio.js:1029` | The comment block above setMusicEnabled still teaches 'trackIdx >= 0 -> one of the race loops; trackIdx < 0 -> menu loop', which the code below it explicitly abandoned — startMusic |
| low | duplication | `js/game/atmosphere.js:375` | The dark-session predicate `G.raceTimeOfDay === "night" // (G.raceTimeOfDay === "default" && isNightSession)` is hand-written four times, and each copy is redundant — isNightSessio |
| low | dead-code | `js/game/agentview-raster.js:571` | plan() declares a write-only local `const b = Tracks;` that is never read. |
| high | bug | `js/game/incidentsim.js:441` | The RETAIN_FLOOR handback speed floor never applies for any nonzero settle speed, so cars are handed back from a clean incident settle at crawl speed despite two comments promising |
| low | contradiction | `js/game/lighting.js:7` | The lighting.js header says lighting profile persistence and (track, time-of-day, weather) resolution 'live in game.js', but they live in js/game/light-store.js — whose own header  |
| low | drift | `js/game/input.js:6` | The module header still teaches the retired 'lower-screen halves' touch-steering scheme and folds buttons mode into touch, contradicting the anchored-drag rewrite and the actual st |
| low | drift | `js/game/hud.js:173` | Comment says the caution flag is 'driven by the debris caution state machine in game.js', but the caution machine lives in js/game/racecontrol.js — a sibling occurrence (different  |
| low | drift | `js/game/hud.js:6` | The header's enumerated list of ctx-façade members consumed by GameHud omits five members the code actually reads: state, otEnabled, aeroZoneAhead, aeroZones, cautionInfo. |
| low | dead-code | `js/game/menus.js:17` | The `renderStatBars` wrapper binding is never used anywhere in menus.js — a leftover from the removed YOUR CAR summary card the header itself says is gone. |
| high | bug | `js/game/results.js:40` | The ' PLAYER' tag appended for a remote human's results row is immediately destroyed by a later textContent assignment, so the text marker never renders. |
| high | drift | `js/game/racecontrol.js:120` | The documented YELLOW_MAX/SC_MAX 'hard caps' ('so a stuck hazard cannot neutralise a race forever', 'bounded, ~a lap or two') are a no-op: the cap is only consulted after the hazar |
| high | bug | `js/game/spotify.js:1157` | The MUSIC & SOUND panel's PLAY button (as-sp-play) silently does nothing in the default 'remote' mode whenever a track is loaded: it calls player.resume() but `player` is null in r |
| low | dead-code | `js/game/results.js:17` | The ternary `(season.round > 1 ? "" : "")` in the results title appends an empty string on both branches — a dead expression, presumably a leftover from removed suffix logic. |
| low | dead-code | `js/game/quali.js:81` | `els` is destructured from the G facade and never used anywhere in the file. |
| low | drift | `js/game/steer-tuning.js:427` | The trailing comment '// GEARS toggle: usable when thumbs are free (tilt or desktop keyboard).' describes code that does not exist in this file — the pm-gears toggle is wired in ga |
| low | mess | `js/game/photomode.js:257` | Three lighting-tuner footer controls (lt-help-on, lt-reset, lt-copy — including the COPY VALUES export that bake-lighting depends on) are wired in photomode.js, while every other # |
| high | bug | `js/track/mesh.js:204` | buildKerbs places the full-length apex kerb on the OUTSIDE of every corner (and the short exit kerb on the inside) because it still uses the retired '+curv = right turn' sign read. |
| high | bug | `js/track/tracks.js:1549` | Tyre barriers intended for the outside of tight corners are placed (and their driving limits tightened) on the corner INSIDE on every permanent circuit, via the same inverted sign  |
| high | contradiction | `js/track/tracks.js:275` | transformSceneryApi ignores sceneryCoordinates:"racing" for sides and ranged helpers — SIDE always flips and ranges are always remapped as "source" — contradicting the mode contrac |
| low | bug | `js/track/tracks.js:1601` | Corner-number boards and braking-marker trios are erected on the corner INSIDE instead of the outside via the same inverted sign mapping. |
| low | contradiction | `js/track/spline.js:17` | spline.js contradicts itself about the turn-sign convention: the centerline() authoring doc says '+turn = right' while curvatureRaw() in the same file documents (with a measurement |
| low | bug | `js/track/models.js:209` | groundPatch and groundedSegments record their emitted BOX/SEGMENT count in the diagnostics field named `vertices`, so their entries under-report size ~24x relative to every other e |
| low | dead-code | `js/track/mesh.js:542` | buildTerrain computes a local pyMin that is never used, beneath a five-line comment describing baseline behaviour actually owned by TrackSurface.floorY. |
| low | dead-code | `js/track/mesh.js:319` | buildRoad declares four dead locals: bp, ka, kb, and line are never referenced in the function. |
| low | dead-code | `js/track/themes.js:83` | SceneryThemes.variant() has zero callers, and every theme's `variants` and `spacing` tables have zero readers — the deterministic variant machinery is entirely dead. |
| low | dead-code | `js/track/landmark-kit.js:45` | LandmarkKit's facade(), stadiumSection() and arch() are exported but unreachable — only roof, canopy and tower are ever invoked. |
| low | mess | `js/track/tracks.js:1758` | The tracks ENGINE hard-codes Monaco-specific dressing data — the harbour-skip predicate is duplicated verbatim at two sites and the Monaco barrier gap is special-cased twice — viol |
| low | dead-code | `js/track/maps.js:54` | The cache's `turns` field (corner count) is write-only, and the cache-shape comment omits the `sectors` field the object actually carries. |
| high | bug | `js/track/scenery-nature.js:986` | bush({form:"agave"}) throws ReferenceError: norm is not defined, crashing the scenery build the moment any circuit uses the documented agave form. |
| high | bug | `js/track/scenery-structures.js:833` | signBoard "speed" builds its red-rimmed disc as a horizontal open ring around the post instead of a vertical board facing the road, so every circuit's pit speed sign shows floating |
| high | bug | `js/track/scenery-structures.js:558` | crowdBand colours the whole continuous crowd band via pick(), whose night branch returns the HDR phone-light colour ~5.5% of the time, so about 1 in 18 stand row-bands on night cir |
| low | dead-code | `js/track/scenery-city.js:755` | cityFront's `setback:` option is write-only — building() never reads opts.setback, so the commented "tall units step back at the top" behaviour never happens. |
| low | drift | `js/track/scenery-nature.js:528` | crowdBank's comment says spectators are "Emitted with RAW.addBox", but the code emits them via ctx.instance(..., {unguarded:true}), and RAW is destructured but never used anywhere  |
| low | drift | `js/track/scenery-nature.js:963` | bush()'s opts doc lists form "scrub" but no code implements it — "scrub" silently falls through to the default clump geometry. |
| low | contradiction | `js/track/scenery-nature.js:767` | Three grandstand call-site counts in the same file disagree with each other and with the tree: "all 248 existing call sites" (line 592), "221 of 226 call sites" (line 613), and "33 |
| low | contradiction | `js/track/scenery-data.js:108` | The BARRIER header contradicts itself: it first says each livery is "two alternating day stripe colours" then, six lines later, "Each theme cycles THREE stripe colours" — the entri |
| low | drift | `js/track/scenery-data.js:442` | STAND_SETS.madrid's comment claims "the file hardcodes these at its own call sites", but madrid.js hardcodes crimson/sandstone/STEEL — "terracotta" from the row appears at no madri |
| low | mess | `js/track/scenery-data.js:44` | A doc-block describing the grandstand EMITTER's guard strategy is stranded in the pure-data file directly above the CROWD_DAY clothing palette; the code it describes lives in scene |
| low | drift | `js/track/scenery-structures.js:98` | The fence-post recorder contains a comment describing a leaning catch fence canting "its top third back over the track", but the block under it is empty — the post is the same vert |
| low | mess | `js/track/scenery-identity.js:85` | floodMast declares a local `const along = (i - (arms - 1) / 2) * 1.8` that shadows the ctx `along()` node walker destructured at line 17 — a numeric scalar silently masking a core  |
| low | dead-code | `js/track/scenery-city.js:24` | `cantilever` is destructured from ctx but never used in this module — its only other mentions are a comment explaining the arm is deliberately inlined instead. |
| high | bug | `js/circuits/interlagos.js:662` | The two Arquibancadas upper-terrace crowdBank calls pass node indices into a helper that takes lap fractions, so both banks collapse to node 0 (start/finish) as byte-identical over |
| low | bug | `js/circuits/jacarepagua.js:106` | The treeline-ring exclusion `if (a > 3.3 && a < 8.6) continue` never excludes the wrapped third of the mountain arc, because `a` is always < 6.284 so `a < 8.6` is always true. |
| low | contradiction | `js/circuits/madrid.js:560` | Two adjacent comment paragraphs above the main-grandstand call contradict each other and the code: one says the stand was 'split into two 46 m bays', the next says it was 'kept to  |
| low | drift | `js/circuits/albert_park.js:351` | The palm-avenue comment claims 'gap 26 keeps canopy clear of the guardrail... and the grandstand shell' but the code plants the palms at gap 15-23; a similar stale number sits at t |
| low | dead-code | `js/circuits/albert_park.js:87` | The track-centre computation (cx, cz) is a dead O(n) loop: its results are never used, only silenced with `void` at the end of scenery(). |
| low | dead-code | `js/circuits/jeddah.js:143` | The local concreteCanyon fallback ignores the `stripeCol`/`stripeEvery` options that every call site passes, so if it ever ran it would silently reintroduce the exact 'accent colou |
| low | dead-code | `js/circuits/hungaroring.js:54` | Twelve of the twenty audited circuit files destructure scenery-api members they never reference — copy-paste residue from sibling circuits, handled inconsistently (albert_park void |
| low | mess | `js/circuits/mexico.js:782` | The guard `if (s < 0.04 // (s > 0.04 && s < 0.50)) return` — duplicated verbatim at two scatter passes — is a convoluted equivalent of `s < 0.50` that leaves a one-node pinhole at  |
| high | duplication | `js/circuits/nurburgring.js:489` | Burg Nürburg — the castle the file itself calls the circuit's unique, one-of-a-kind landmark — is built TWICE by two independent live blocks, producing two castles on two separate  |
| low | drift | `js/circuits/qatar.js:581` | Comment says 'the skyline() loop above carves out this frac range for them', but the skyline loop it refers to was removed — the section above now deliberately emits nothing. |
| low | dead-code | `js/circuits/monza.js:287` | Ternary with identical branches: `side < 0 ? 1.8 : 1.8` always yields 1.8, so the side test is dead. |
| low | drift | `js/circuits/monaco.js:954` | Section header names the wrong mechanism: it says the harbour uses 'groundPlane water:true' but the code emits the basin via waterField(). |
| low | bug | `js/circuits/paul_ricard.js:528` | The cabanon's dry-stone wall is emitted up to ~50 m outside its modelGroup's declared bounds, so most of the wall escapes the atomic footprint preflight the group exists to provide |
| high | drift | `js/render/assets.js:21` | The module's headline guarantee #3 — 'IT IS OFF UNTIL ASKED... uMatTexMix is a LIGHTING TUNER knob shipped at 0. The pack is inert weight until someone moves matTexMix' — is false: |
| high | drift | `js/render/glx.js:928` | begin()'s matTexMix fallback of 0.0 (and its comment 'Default 0 = pure procedural, which is the shipped look') inverts the shipped TUNE_DEFS default of 1.0, violating this file's o |
| low | drift | `js/render/shaders/lit.js:109` | LIT_FS teaches 'uMatTexMix is a LIGHTING TUNER knob shipped at 0 — at 0 nothing here executes and the render is byte-identical to the pure-procedural game', but the knob ships at 1 |
| low | drift | `js/render/glx.js:1045` | The uEnvStr fallback comment claims 'Fallback mirrors the TUNE_DEFS carEnvCube default (0 = probe OFF)', but TUNE_DEFS ships carEnvCube at 0.3 on desktop (probe ON) — the 0.0 fallb |
| low | drift | `js/render/gfx.js:71` | The seam contract ('transcribed from the real GLX object', gfx.js:26) omits real seam surface: frame.shadowCtr and frame.cloudSpeed, opts.depthBias, and the drawParticles method th |
| low | drift | `js/render/glx/post.js:458` | Comment says 'upload the nearest-8 lamps to the eye' but the code uploads the nearest 12, and the godray shader's beam loop only ever reads the nearest 6 — none of the three number |
| low | dead-code | `js/render/shaders/post.js:161` | SSAO_FS declares `const float NEARP = 0.1, FARP = 900.0;` but neither constant is referenced anywhere in the shader. |
| low | mess | `js/render/glx/chunked.js:148` | drawChunked keeps depth writes ON and never masks alpha writes for alpha<1 draws (drawInstanced in glx.js likewise skips the alpha mask), so the translucency invariants draw() docu |
| low | mess | `js/render/shaders/lit.js:64` | LIT_VS carries an orphaned comment tail on the vNrm line — '// is glued to the panels, not streaming in world.' — the severed second half of vObjPos's comment at :59, now misattach |
| high | bug | `js/render/webgpu/wgsl-post.js:862` | The SSR pass's 'upper screen (never wet road)' cutoff is vertically inverted for WGSL's y-down uv, so it rejects the near road (bottom 38% of the frame) and runs over the sky band  |
| high | bug | `js/render/webgpu/wgsl-chunks.js:707` | LIT Block 8 ignores the SSR texture's alpha mask, mixing every wet up-facing pixel toward ssrTex.rgb by wet*ssrStrength — which is transparent BLACK wherever the SSR pass masked ou |
| high | contradiction | `js/render/webgpu/wgx.js:2354` | CLAUDE.md (and gfx.js:8) teach that WGX has 'no volumetrics/PCSS/MSAA/gpuTimer/createTextureArray', but WGX reports pcss() => true and actually implements a PCSS-lite blocker-searc |
| low | drift | `js/render/webgpu/wgsl-chunks.js:443` | The shadow-block comment says the penumbra is 'a fixed-kernel approximation of PCSS (no blocker search; pcssPen scales the filter step)', but the code 30 lines below performs a rea |
| low | contradiction | `js/render/webgpu/wgsl-fx.js:28` | This file's stated porting rule — 'WGSL smoothstep is UNDEFINED when edge0 >= edge1', hence every descending smoothstep must be rewritten — is contradicted by sibling WGSL files th |
| low | dead-code | `js/render/webgpu/wgx.js:1371` | `_envReady` is initialised true and never reassigned, so the `d[82] = _envReady ? carReflect : 0` ternary is dead, and the comment above it claims a gate that never gates. |
| low | drift | `js/render/webgpu/wgx.js:1328` | The params2 layout comment says the fourth lane is unused ('shadowOn, strength, texel, _') but the code 20 lines later packs shadowBias into it, matching the WGSL struct. |
| low | dead-code | `js/render/three/tsl-lit.js:1315` | `m.__tlxMatU = matU` is write-only — no code anywhere reads __tlxMatU — and its comment points at a 'tlx.js refresh path' that does not exist. |
| low | drift | `js/render/three/tlx-chunked.js:48` | The SHAPE CONTRACT says the factory returns '{ build, cull, visList, free }', omitting releaseMirrors — the member tlx.js's present() depends on for the staged memory release the f |
| low | drift | `js/render/three/tsl-post.js:31` | The SHAPE CONTRACT's returned-member list omits `spread`, which the factory returns and tlx-post.js drives every present() as the BLOOM SPREAD knob. |
| high | bug | `js/net/lobby.js:209` | The lobby's transport.onClose handler stays bound after NetPlay adopts the sessions and closes the NetSession with the hardcoded reason "local", so a mid-race peer drop is misrepor |
| high | drift | `js/net/snapshot.js:18` | The wire-format table documents the per-car id as "u8 index into cars[]", but the id on the wire is G.wireId (teamIndex*2 + seat) — a cars[] index is exactly what the id must never |
| high | contradiction | `js/net/nostr.js:16` | The file header says Trystero's data channel carries the invite/answer strings and Trystero's `password` option encrypts the payload, but the default code path (directExchange) nev |
| high | drift | `docs/MULTIPLAYER.md:63` | The NetNostr section teaches that exchange() intercepts Trystero's console.warn and reports all_rejected when every live relay refuses, but that detection exists only on the opt-in |
| high | drift | `docs/MULTIPLAYER.md:85` | The doc says seal()/open()/topicFor() are unit-tested "but nothing calls them", while seal() and open() are live on the default room-code path — an agent trusting the doc would tre |
| low | bug | `js/net/netplay.js:750` | predict(c) called with a car but no time passes the car object itself as the timestamp (`now == null ? c : now`), producing a NaN target so interp.predict returns the newest raw sa |
| low | bug | `js/net/sdp.js:238` | The packed-invite buffer is allocated one byte too large, so every compact code carries a stray trailing 0x00 byte the format never defines. |
| low | dead-code | `js/net/lobby.js:294` | failureMsg's stale-invite branch (`slow = secs > 90`) is unreachable from the connect watcher, which gives up at 60 s — so the "invite probably went stale" diagnosis can effectivel |
| low | contradiction | `js/net/transport.js:202` | Adjacent comment blocks disagree about whether a TURN relay ships: one says "no static TURN is shipped. A relay comes from ONE of apex26.turnApi / apex26.turn", while the next bloc |
| low | drift | `js/net/handshake.js:35` | The header says symmetric-NAT pairs need "a TURN relay (which costs money)" and will "simply never connect", but a free-tier TURN relay now ships by default. |
| low | drift | `js/net/rendezvous.js:237` | Comments still name the public fallback backend as "the public MQTT broker" and pass a dead third "MQTT listen time" argument to get(), but the public backend is the Nostr relay po |
| low | drift | `js/net/handshake.js:22` | The header claims the format flag lets "a compressing peer and a non-compressing peer still understand each other", but a browser without DecompressionStream cannot decode .z/.s co |
| low | drift | `js/net/transport.js:260` | A comment says "CLAUDE.md documents prefetchIce() as the thing that has to land before a connection is built", but that documentation moved to docs/MULTIPLAYER.md. |
| high | bug | `js/data/live.js:8` | The LIVE tab's 30 s auto-refresh and REFRESH button are defeated by the API layer's 10-minute cache for the latest session, while the 'updated HH:MM:SS' stamp still advances every  |
| high | bug | `js/data/live.js:101` | Leaving the LIVE tab and returning within its 5-minute cache window shows the AUTO button still lit while the auto-refresh interval is permanently disarmed. |
| high | bug | `js/data/schedule.js:14` | The SCHEDULE tab heading is hardcoded '2026 CALENDAR' while the data under it is fetched for the clock-derived current season, so from Jan 2027 it will label the 2027 calendar as 2 |
| low | dead-code | `js/data/live.js:201` | The classification gap-bar feature keys on p.timeDiff, a field F1API.positions() never returns, so maxGap stays 0 and the gap bar/label never render. |
| low | dead-code | `js/data/live.js:86` | refresh()'s Promise.all rejection handler is unreachable because every input promise already has .catch(catchLive) which swallows all errors by returning null. |
| low | dead-code | `js/data/telemetry.js:279` | renderTelemetryBody's rejection handler is unreachable: the preceding .catch converts every sessionDrivers failure into a resolved null. |
| low | bug | `js/data/api.js:101` | fetchRetry identifies JSON.parse failures by V8-specific message strings, so on Firefox/Safari a non-JSON error body is rethrown as a raw SyntaxError — and for a 401/403 that messa |
| low | contradiction | `js/data/api.js:275` | meetingTtl and sessionTtl make opposite default choices for unknown recency: sessionTtl documents 'stay conservative' and returns the 10-min TTL, while meetingTtl returns the 7-day |
| low | drift | `js/data/api.js:7` | The module header says final failures always serve stale cache when present, but the code deliberately refuses stale cache for live-session auth lockouts (401/403/'Live F1 session' |
| low | drift | `js/data/hub.js:42` | The state-map comment documents a 'gen' field that the stored objects never contain. |
| low | contradiction | `js/data/export.js:213` | The EXPORT tab hardcodes the season pills to [2025, 2024, 2023], so the current (2026) season cannot be gathered — the exact hardcoded-year trap hub.js's clock-derived YEARS commen |
| low | contradiction | `js/data/export.js:243` | Two live status strings printed back-to-back in the same log pane disagree on the gather duration: 'this can take a minute' vs '~10 min'. |
| low | mess | `js/data/telemetry.js:578` | buildTelemetryView re-derives the shortLS() predicate inline instead of calling the helper defined 500 lines above. |
| low | bug | `js/data/telemetry.js:713` | telView is never cleared when the popup closes, so the last view — canvases, offscreen bases, and all lap sample arrays — stays retained in memory until the next lap load overwrite |
| low | mess | `js/data/telemetry.js:1536` | Each lane's cumulative-distance table is computed and cached twice under two different property names: t.cum for the delta/gauges and tel._cum for locAt's dot interpolation. |
| low | mess | `js/data/api.js:69` | The localStorage cache has no eviction: expired apex26.api.* entries (including ~50 KB car_data/location responses) accumulate forever, and once quota is hit every future write fai |
| low | bug | `js/car/car3d.js:1968` | Livery nose-cap and nose/spine stripes are lofted to fixed z endpoints (3.185 / 3.14) while TEAM_STYLE.noseTipZ moves the actual nose tip by ±0.10 m, so on short-nosed teams the pa |
| low | drift | `js/car/parts.js:470` | Four cockpit SIGNATURE option descriptions (shown in the GARAGE) state halo furniture their own visual recipes do not build. |
| low | drift | `js/car/liverytex.js:791` | The self-init comment says logo loading 'used to be kicked off by js/game.js', but game.js still calls LiveryTex.loadLogos at boot, so all 11 team-logo PNGs are fetched/decoded twi |
| low | contradiction | `js/car/car3d.js:1768` | The SPONSOR BOARD comment block contradicts itself and the code: its first half says the board must cover yFrac 0.24..0.84 (centre 0.54, height 0.60, '0.20 m clears'), while its ow |
| low | drift | `js/car/liveries.js:19` | The header says the `fin` colour paints the shark fin 'on the teams whose chassis style fits one', but car3d.js builds and paints the shark-fin plate (finC) unconditionally on ever |
| low | contradiction | `js/car/liverytex.js:25` | The REGIONS.crest inline comment says the crest region maps to '(sidepods, nose)', but the same file (and carmesh) say and do 'engine cover + shark fin' — sidepods carry titleA/str |
| low | drift | `js/car/car3d.js:2566` | The livery-FINISH comment claims 'Bodywork paint is the only thing emitted as SURFACES.paint', but the driver's helmet dome, helmet crown stripe/nose flash and the T-cam tally ligh |
| high | bug | `index.html:57` | The shell version guard's stale-build reload drops location.hash, silently destroying VS FRIEND invite links (#vs=CODE) opened on a stale shell. |
| high | bug | `index.html:736` | Escape on the qualifying classification clicks the deliberately-hidden BACK button and silently throws the quali result away. |
| high | drift | `index.html:968` | HOW TO PLAY teaches 'In button and touch modes the car accelerates for you — just steer and brake', but buttons mode does not auto-accelerate: the player must hold the GAS pedal. |
| high | contradiction | `css/track-detail.css:18` | track-detail.css (and topmodal.js) say #track-detail is 'now a real <dialog>' in the top layer, but index.html ships it as a <div role="dialog" aria-modal="true"> toggled via hidde |
| low | dead-code | `css/components.css:663` | The z-index ladder declares values for #pausemenu (30), #pmsettings (35) and #race-settings (30), all of which are top-layer <dialog>s where z-index is never consulted — the exact  |
| low | drift | `css/tokens.css:489` | tokens.css asserts 'This gate applies to every :hover in the split stylesheet', but ten :hover rules across four files are ungated, giving iOS the stuck-hover state the gate exists |
| low | bug | `sw.js:171` | The network-first branch caches every uniquely cache-busted version.json?_=<timestamp> request under its full URL, adding one never-again-matched cache entry per app launch until t |
| low | bug | `sw.js:41` | The optional precache seeds every dynamically-injected vendor file except vendor/rapier-0.19.3/rapier.mjs — the one that is ON by default — so an installed-but-not-yet-raced offlin |
| low | drift | `index.html:302` | The title-screen subtitle and manifest.json both advertise '24 real circuits' while the game ships and lists 40 (24 season rounds + 16 classics). |
| low | drift | `css/tokens.css:74` | The @property registration comment for --sfade-t/--sfade-b cites 'the scroll-driven animation in css/components.css (.scroll-y)' — neither the animation nor any .scroll-y rule exis |
| low | mess | `js/game.js:7322` | MY TEAM's cz-off state class (colour set to NONE) has no CSS rule, so a NONE'd colour well keeps showing its stale colour at full strength — unlike its garage twin cs-liv-off, whic |
| low | mess | `index.html:666` | RACE SETTINGS chip rows are inconsistently labelled for assistive tech: LAPS, WEATHER and TIME OF DAY lack the role="group"/aria-labelledby their four sibling rows carry. |
| low | contradiction | `css/career.css:173` | .cr-input's red focus ring contradicts the tokens.css focus policy, which documents that brand red measures ~2.6:1 on this page — under the 3:1 WCAG 1.4.11 floor a focus indicator  |
| low | drift | `index.html:471` | The VS FRIEND markup comment says room codes are 'hidden unless a relay is configured (localStorage apex26.rendezvous)', but #vs-code-entry is never hidden and room codes need no c |
| high | bug | `tools/menu-fit.mjs:68` | The default menu-fit sweep crashes at its 4th screen: the 'teampicker' setup clicks #sel-team-card (and 'customize' at line 73 clicks #sel-customize), ids that no longer exist anyw |
| high | bug | `tools/fit-audit.mjs:68` | fit-audit's 'teampicker' (line 68) and 'customize' (line 73) rows click the nonexistent #sel-team-card / #sel-customize, so two of the thirteen screens report 'missing/hidden' in e |
| high | bug | `tools/motion-capture.mjs:79` | On the current sandbox layout motion-capture can never find ffmpeg — candidate "/opt/pw-browsers/ffmpeg-linux" no longer exists (the binary moved to /opt/pw-browsers/ffmpeg-1011/ff |
| low | drift | `tools/apex-capture.mjs:279` | The 'cameras' sweep's CAMS list carries 12 camera modes while GameTables.CAM_MODES has 13 — the 'drift' mode is silently never captured by the tool billed as the camera-coverage sw |
| low | dead-code | `tools/check-bank.mjs:25` | The 'bankAngle accessor sanity' block is a no-op: `hasBank` is write-only and the page.evaluate hardcodes `return true`, so nothing bank-specific is ever verified despite the comme |
| low | drift | `tools/assets.mjs:275` | Comment cites matBumpHeight at js/render/shaders/lit.js:196, but the function is defined at lit.js:225. |
| low | drift | `tools/coplanar-audit.cjs:84` | The depth-resolution comment cites js/game.js:3736 for the 0.3/0.9 near planes, but that code now lives ~1460 lines later (js/game.js:5196); the glx.js:372-373 cull-face cite at li |
| low | drift | `tools/import-circuit-path.mjs:190` | `--self-check` claims to regenerate "every committed path" (line 24) but resolves feature ids only through COMMITTED (24 season circuits), so the 16 classic traces now committed in |
| low | duplication | `tools/float-audit.cjs:48` | float-audit still carries its own ~95-line inline VM buildContext duplicating tools/track-build-vm.cjs — the harness explicitly "extracted from float-audit" — and the copy has drif |
| low | drift | `tools/float-audit.cjs:614` | float-audit's --clip mode's closing NOTE says its counts become useful only once primitives are tagged by call site and cross-model pairs filtered — which tools/clip-audit.cjs has  |
| low | contradiction | `tools/career-economy.mjs:47` | chromium.launch hard-codes executablePath "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" with no CHROME/PW_CHROMIUM or bundled-browser fallback, contradicting the tools/READM |
| low | contradiction | `tools/layout-audit.mjs:684` | layout-audit hard-codes executablePath "/opt/pw-browsers/chromium" with no env override or existence check, violating the README's documented Chromium fallback ladder and failing t |
| low | dead-code | `tools/layout-audit.mjs:699` | OVERLAY_IDS includes "photomode", an element id that exists nowhere — photo mode's actual root is #photo-controls — so the entry is dead and the real photo-mode overlay is not cove |
| low | bug | `tools/assets.mjs:562` | import-pack builds a brand-new manifest with `models: {}` and `env: {}` instead of merging via readManifest(), so installing a browser bake silently erases every committed bake-mod |
| low | drift | `tools/manifest.cjs:266` | An orphaned comment in HARD_EDGES — "TSL shader factories before tlx.js (TLX.create invokes TLXShaders.chunks/.lit ...)" — sits directly above the unrelated glx→assets edge; the TS |
| high | contradiction | `tools/README.md:137` | The turn-local.cjs bullet carries rtc-e2e.mjs's description grafted on, teaching that the TURN fixture 'covers the one path nothing else can', 'takes minutes', and should be 'run b |
| low | bug | `tools/render-car.mjs:173` | A relative --out resolves against tools/ (HERE), not the invocation cwd or repo root, so '--out=scratch/renders/x' run from the repo root silently writes to tools/scratch/renders/x |
| low | bug | `tools/profile-gameloop.mjs:28` | No try/finally around the run: any throw after spawning the python http.server (line 28) or launching Chromium (line 31) orphans both on this 4-core box, since server.kill()/browse |
| low | contradiction | `tools/rtc-e2e.mjs:58` | rtc-e2e.mjs:58, rtc-e2e-3p.mjs:54 and rtc-e2e-room.mjs:56 hardcode executablePath '/opt/pw-browsers/chromium' with no fallback, contradicting the README Chromium convention and fai |
| low | dead-code | `tools/track-build-vm.cjs:119` | The stack-frame filter `!/track-geom/.test(l)` can never match since the emitters file was renamed js/track-geom.js -> js/track/geom.js, so it filters nothing and geom.js frames le |
| low | contradiction | `tools/README.md:63` | The vstd-lint row says the PACE invariant 'escaped twice (A5..., A13...)' while vstd-lint.mjs's own header says it 'has been violated FOUR times', adding A16's two FX-block cases. |
| low | drift | `tools/verify-track.cjs:128` | Comment says '@circuits' expands to every js/tracks/<id>.js, but the code loads manifest.CIRCUITS_DIR which is js/circuits (js/tracks/ does not exist). |
| low | drift | `tools/verify-track.cjs:3` | Header says the tool 'Loads js/track/tracks.js (+ js/track/geo-paths.js) in a Node.js VM', but it actually loads the full 20-file TRACK_VM manifest list (geom, surface, models, gra |
| low | drift | `tools/nostr-probe.mjs:4` | Usage advertises '# or run with --skip-publish' as the no-deps alternative, but no code reads that flag — the tool unconditionally exits 2 without @noble/curves and always publishe |
| low | drift | `tools/render-car.mjs:26` | Header says part-detail presets are 'each category's audited best angle + two ±36° offsets', but detail() emits ±30° offsets. |
| low | drift | `tools/test-shards.sh:63` | Comment claims the line-reporter's \r progress is 'unrolled so grep sees real lines', but the pipeline never converts \r — the only tr runs after grep and converts \n to spaces. |
| low | drift | `tools/survey-track.mjs:16` | Header points to 'ground-profile.mjs' with no path, implying tools/ground-profile.mjs, which does not exist — the tool lives at .claude/skills/survey-track/ground-profile.mjs. |
| low | drift | `tools/ssr-probe.mjs:17` | The flags list documents '--debug=<mode> off (default) / gates / hitmiss / hitcol', omitting the implemented 'mix' mode. |
| high | drift | `docs/DEBUG-HOOKS.md:89` | The info() reference says state can be 'select' (`menu｜select｜count｜race｜results｜…`), but no such state exists. |
| high | drift | `docs/ARCHITECTURE.md:437` | The Tracks engine contract says `Tracks.curvature(track, s)` returns "+ = right turn", but the measured convention is + = LEFT. |
| low | drift | `docs/ARCHITECTURE.md:702` | The season description carries a stale "(`Tracks.LIST.length`)" fragment contradicting the 24-round statement in the same sentence. |
| low | contradiction | `docs/ARCHITECTURE.md:30` | The load-order sketch lists js/render/webgpu/* and js/render/three/* as entries in the script-tag load order, but both trees are DEFERRED with no script tag. |
| low | drift | `docs/ARCHITECTURE.md:312` | The GLX contract states the context is created with "alpha:false, antialias:true" (and line 289 "dpr capped at 2"), but antialias is desktop-only and the mobile dpr cap is 1.5. |
| low | drift | `docs/ARCHITECTURE.md:488` | The parts.js row points readers at a CLAUDE.md "Parts system" section that no longer exists. |
| low | contradiction | `docs/ARCHITECTURE.md:113` | ARCHITECTURE.md sizes the garage-live-preview extraction candidate at ~303 lines while ARCHITECTURE-REVIEW.md says ~415 lines for the same block, both as 2026-08 measurements. |
| low | contradiction | `docs/README.md:62` | The research index says "The thirteen that survive here" but its own table lists 14 docs and docs/research/ holds 14 .md files. |
| low | contradiction | `docs/LAYOUT-AUDIT.md:84` | The doc says "the app has 21 screen roots" but its own top-level table lists 22 screens and the executable SCREENS inventory it defers to holds 24 distinct roots (38 cells). |
| low | drift | `docs/SCENERY-API.md:21` | The doc says the shared city-dressing system "is summarised in the City & scenery dressing section of CLAUDE.md", but CLAUDE.md has no such section. |
| low | drift | `docs/SCENERY-GROUNDING.md:318` | The doc says "canopyR(kind, h) in js/track/tracks.js is the single source of truth", but canopyR is defined in js/track/scenery-nature.js. |
| low | drift | `docs/AGENT-WORLD-API.md:676` | §5k cites "`prog` accumulates from `c._prevS` (`js/game.js:2705`)" but that line is now photomode G-façade accessor code. |
| high | drift | `docs/research/ENGINEERING-PRACTICE-NOTES.md:236` | Part 4 presents the store.js silent-swallow data-loss gap as current and unfixed, but js/game/store.js now logs and records every failed localStorage read/write. |
| high | drift | `.claude/skills/tune-physics/SKILL.md:17` | The tuning table teaches pre-Phase-C values as the shipped defaults — WHEELBASE 3.2 m (:17), STEER_SPEED_REF 60 m/s (:20), PACE 1.0 (:27) — but the steer store overwrites all three |
| low | contradiction | `docs/README.md:93` | The archive section claims the twelve archive/research investigations are referenced by 'no live doc or source file' (and :86-87 'no live doc depends on it'), but two live research |
| low | drift | `docs/research/SCENE-GRAPH-PLAN.md:12` | The doc names 'EXTERNAL-MODEL-SOURCES.md' as its companion with a bare sibling filename, but that file was moved to docs/archive/research/, so the reference no longer resolves from |
| low | contradiction | `docs/research/SCENE-GRAPH-PLAN.md:250` | §6 says the stats table covers 'the six emitters migrated so far' (and :409-410 'six emitters') while the header (:4-7) and :291 say sixteen emitters are migrated — and the table i |
| low | contradiction | `docs/research/PHASE-C-SLIDER-DESIGN.md:308` | §3's closing note says RESPONSE is 'NOT verified by drive or tune-sweep.mjs' and tells the reader to run the sweep, contradicting the Status header and §2, which report that exact  |
| low | drift | `.claude/skills/playwright-probe/SKILL.md:74` | The skill writes the previewCam call as `previewCam(frac, mode)` — arguments reversed — and a call in that order silently returns false (mode validated first). |
| low | contradiction | `.claude/skills/scenery-dress/SKILL.md:110` | The vertex-budget rule 'Keep the props mesh roughly under ~50k verts' is contradicted by every shipped circuit, which run 10-40x that figure. |
| low | drift | `.claude/skills/agent-view/SKILL.md:96` | carView docs contrast mesh components against 'the 8 upgrade categories' — there are 12 upgrade categories (same wrong count as the queued setup-ui.js:3 fix, but in a different fil |
| low | drift | `docs/research/ASSET-API-RESEARCH.md:23` | The doc's glx.js line citations have drifted ~35-470 lines from the code they name, so the 'load-bearing' anchors point at unrelated code. |
| low | drift | `docs/research/PLATFORM-INPUT-NOTES.md:152` | The jetsam/OOM 'no signal at all' note is cited to js/game/perf.js:45, but that comment now lives at perf.js:91; line 45 is the unrelated _floorMs threshold text. |
| low | bug | `spike/capture-m8.mjs:50` | The static server's path-containment check `!p.startsWith(ROOT)` lacks a trailing separator, so any sibling path sharing the prefix escapes the root. |
| low | dead-code | `spike/physics/deep-handover.mjs:86` | projectLocal's `hitWindowEdge: Math.abs(bd) === W` is a write-only field computed with a meaningless formula (best squared distance in m² compared to the window size in node counts |
| low | drift | `spike/spike-data.js:16` | The file's own API doc-block documents `SpikeData.frameLights(out, eye, fwd)` but the implementation takes no `out` parameter. |
| low | drift | `spike/ADOPTION-PLAN.md:90` | The R0 plan references `spike/physics/vendor/rapier.mjs`, a path that was deliberately deleted — the physics harnesses now import the game's own vendor copy. |
| low | duplication | `spike/capture-m8.mjs:44` | The free-port + MIME-table + static-file-server + chromePath boilerplate is hand-written in four places and the copies have already diverged on the path-traversal guard. |
| low | mess | `tools/manifest.cjs:311` | The "Named paths for direct single-file consumers" doc-block is separated from the PATHS const it documents by the entire 60-line DEFERRED section inserted between them. |
