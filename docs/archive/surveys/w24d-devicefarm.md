# W24d — Device Farm test types for better phone profiling (2026-10-26)

Fleet D survey (docs-only). Bryce, 2026-10-24 ~5:54 PM PT: improve logging, tiles,
tests and **Device Farm test types** so profiling is better. This note covers
**AWS Device Farm** only (`apex-profiler`; Fleet D devices: **iPhone 14** and
**iPhone 14 Pro**). Propose only — no device minutes spent this session.

Tip surveyed: `c44627de1` (`claude/f1-game-project-26h3ng`).

**Read first, do not duplicate:** `docs/notes/DEVICE-FARM-ANALYSIS-2026-10-24.md`
(A·Y1 / #3671) ranked *code levers* and *harness method fixes* (#3672–#3676).
Method items in that note §5 have largely landed in `devicefarm-iphone.mjs` /
`devicefarm-method.mjs` (build/first/thermal/warm, `--prime`, units.json).
`devicefarm-syslog.mjs` (#3675 / #3683) parses paid-for syslogs. `coldrace`
(#3713) covers cold first-race arms. This survey asks what **new scenarios**
would still unlock questions the current catalog cannot.

Sources: analysis §1/§2e/§5, `DEVICE-FARM-LEDGER-2026-10-23.md` (incl. row 29),
`AWS-DEVICE-FARM-IPHONE-2026-10-23.md` §4, `tools/perf/devicefarm-*.mjs`,
`tests/specs/garage-livery-churn.spec.js`, `js/ui/platform-session.js`.

## Gap map (today vs brief)

| Brief scenario | Existing harness (tip) | Remaining gap on Fleet D phones |
|---|---|---|
| Cold boot | `devicefarm-boot.mjs` (defaults `--device "iPhone 14"`) | Only measured on **18 Pro Max** (ledger row 16); never on 14 / 14 Pro |
| Thermal soak | `soak` presets + ladder + **60 s** auto (`--soak-s`); `thermalNow` per arm (#3676) | No multi-minute time series; soak does not poll thermal every 30 s over 5–10 min |
| Memory pressure | `devicefarm-syslog.mjs` post-hoc; `auto` + `--all` download | No *active* pressure scenario (garage + race + photo to force footprint) |
| Long race | `tracks` ≈ 20 s; `races` = six *entries*; `coldrace` = entry arms | No continuous multi-lap / 5–10 min race window |
| Garage churn | Playwright `garage-livery-churn.spec.js` (SwiftShader) | Never run on Device Farm Safari |
| Background / resume | `platform-session.js` hide/pause/sentinel | No DF scenario backgrounds Safari mid-race |
| 14 vs 14 Pro | Fleet D owns both (ledger :115) | **One** 14 Pro row (ledger 29 `coldrace`); ~16 iPhone 14 rows — no standing matrix |

Existing scenarios kept as baseline (bench, cache, races, tracks, warmplus, visor,
soak, photo, flags, touch, coldrace): this note does not re-rank A·Y1's code levers.

## Ranked findings (impact first, max 10)

### 1. Standing 14 / 14 Pro matrix is still missing — **S · D**

**Problem.** Fleet D policy is iPhone 14 **and** 14 Pro
(`DEVICE-FARM-LEDGER-2026-10-23.md:115`). The ledger has one 14 Pro session
(row 29, `coldrace` only). Any 14→14 Pro delta (thermal headroom, fill, jetsam)
is still one-sample noise.

**Evidence.** Ledger :115; row 29; analysis §2e noise rules (≥ 3 fresh units for
cold claims under 4 s).

**Proposed change.** Every new Fleet D paid run: same scenario flags on
`--device "iPhone 14"` and `--device "iPhone 14 Pro"`. Start with one cheap
existing chain (`visor,soak,photo` or `tracks monza:night`) on a **fresh**
14 Pro to baseline beside an iPhone 14 unit the same build.

**Size.** S (~2×13 device-min). **Fleet.** D (tools / iOS runs).

### 2. Cold-boot never paid for on Fleet D phones — **S · D**

**Problem.** First-visit menu time (FCP, wired, request count, Safari-kill warm)
is only known for 18 Pro Max. Mid-range players on 14 / 14 Pro have no boot
number; #3515 / reload revalidation claims cannot be checked on D's devices.

**Evidence.** Ledger row 16 (`devicefarm-boot.mjs` / #3616); harness default
already `iPhone 14` (`tools/archive/perf/devicefarm-boot.mjs:9`).

**Proposed change.** `node tools/archive/perf/devicefarm-boot.mjs --device "iPhone 14"
--trials 3` and the same on 14 Pro against live Pages (once with `?apex=1`).
Report already carries thermal when available (`devicefarm-boot.mjs:132–135`).

**Size.** S. **Fleet.** D (`tools/archive/perf/devicefarm-boot.mjs`).

### 3. Multi-minute thermal time series (not 60 s soak) — **M · D** (governor read: A)

**Problem.** `soak` ends with a 60 s auto-governor window
(`devicefarm-iphone.mjs:612–650`, `--soak-s` default 60). `#3676` added
`thermalNow` per arm (`:546–556`), which is enough for A/B arms, not for heat
drift over a real drive. A player heat complaint still cannot be separated from
a code regression.

**Evidence.** Soak body `:612–650`; analysis §2e (thermal 0 only where polled
historically); `thermalNow` is once-per-arm, not a series.

**Proposed change.** `--scenario thermal` (or `--soak-s 300` + mandatory series):
one pinned WebGPU race, sample fps p50/p95/p99 + `autoTier` +
`mobile: deviceInfo.thermalState` (+ battery if offered) every 30 s for
**5–10 min**. Prime with `--prime` so the window is not the cold compile.

**Size.** M. **Fleet.** D (tools); A owns governor interpretation if tiers move
(`js/perf/governor.js`).

### 4. Active memory-pressure scenario (syslog is not a recipe) — **M · D**

**Problem.** Syslog parsing landed (`devicefarm-syslog.mjs`, #3675/#3683) and
`download --all` can pull the ~300 MB log. Nothing *causes* pressure on purpose.
The ledger's unreproduced `createBuffer` failure and "~54 MB CPU geometry
copies" warning still lack a repro recipe.

**Evidence.** Ledger "also seen" near the early table; `devicefarm-syslog.mjs:2–7`;
download note in `devicefarm-iphone.mjs:1090–1103`.

**Proposed change.** `--scenario mempress`: cold WebGPU entry → garage open → N
livery colour edits → race 60 s → Photo open/close → second race; record hitch
counts, console `createBuffer` / device-lost lines, and pair one arm with
`auto` + syslog summarise. Remote access first; automated route only if jetsam
lines are required.

**Size.** M. **Fleet.** D (tools + iOS); A if TLX geometry-copy levers appear
(`js/render/three/`).

### 5. Long-race scenario (continuous 5–10 min) — **M · D**

**Problem.** `tracks` ≈ 20 s after entry; `races` = six separate cold entries;
`coldrace` = entry-path arms (#3713). None is a long drive. Thermal drift, GC
spikes, and governor settle need time-on-track.

**Evidence.** Scenario headers `devicefarm-iphone.mjs:11–18`; `coldrace` `:737–759`;
analysis row 18's 60 s soak is still the longest published continuous race
window in A·Y1.

**Proposed change.** `--scenario longrace --minutes 8 --tracks monza:day`
(WebGPU pin): one entry, sample every 30 s (fps, p99, n50/n100, thermal,
`autoTier`, hitch attribution when present). Do not reload mid-window (avoids
crash-sentinel artefact; analysis §2d / harness comment `:537`).

**Size.** M. **Fleet.** D (tools); A if a settle bug appears.

### 6. Port garage livery churn to Device Farm — **M · D**

**Problem.** `garage-livery-churn.spec.js` proves GPU texture / flap / geoLive
flatness on **SwiftShader in CI**, not on Safari WebGPU on a 6 GB phone — the
environment where Bryce reported garage lag after enough LIVERY edits.

**Evidence.** Spec `tests/specs/garage-livery-churn.spec.js:100–122`; no
`garage` scenario in `devicefarm-iphone.mjs` dispatch (`:894–905`).

**Proposed change.** `--scenario garage`: title → CAR → LIVERY → create → N
distinct `c2` edits with settle; record flap/texture proxies via `__apex` /
renderer hooks the spec already uses, frame max during edits, 20 s post-edit
idle. Run on 14 and 14 Pro, WebGPU pin.

**Size.** M. **Fleet.** D (tools + UI/garage); A only if TLX dispose/geo is the fix.

### 7. Background / resume mid-race — **M · D**

**Problem.** Production pauses on hide, disarms the gfx probe, cancels mirror
prep, and toggles the governor sentinel
(`js/ui/platform-session.js:323–335`; race-entry guard `js/game.js:2715`).
None of that is exercised on Device Farm. Phone players background constantly.

**Evidence.** `platform-session.js:324–335`; `game.js:2715`; no DF scenario
drives hide/show.

**Proposed change.** `--scenario resume`: enter race → 10 s sample → background
Safari 5–15 s (endpoint-permitted home / `mobile: backgroundApp`) → foreground →
20 s sample. Metrics: pause reason, time-to-first-good-frame, AudioContext state,
sentinel/crashStrikes, thermal. If the remote-access exclusion list blocks
backgrounding, document the block (still a finding).

**Size.** M. **Fleet.** D (iOS / tools).

### 8. Shared `sampleArm()` metric pack for new scenarios — **M · D**

**Problem.** #3676 unified build/first/thermal/warm on existing writers via
`rowMeta` / `thermalNow`. New scenarios (3–7) will re-diverge unless they share
one helper from day one.

**Evidence.** `thermalNow` / `rowMeta` at `devicefarm-iphone.mjs:546–556`;
analysis §5.1–§5.7.

**Proposed change.** Every new scenario row: `apexSha`/`apexBuild`, `unit`,
`api`, `thermal[]` (series where timed), `battery?`,
`fps{p50,p95,p99,max,n50,n100}`, `autoTier`/`scale`, `hitches[]`, `errors[]`.
One `sampleArm()` used by thermal/longrace/mempress/garage/resume.

**Size.** M. **Fleet.** D (`tools/perf/devicefarm-*.mjs`).

### 9. Chain budget: one 13-minute session = boot + garage + race + resume — **S–M · D**

**Problem.** Remote access bills ~13 device-minutes floor (analysis §1, §5.9).
Separate boot / garage / resume sessions waste the floor. `visor,soak,photo`
already chains (`devicefarm-iphone.mjs:16–18`, `:894–905`).

**Evidence.** Analysis §5.9; chain loop in `run`.

**Proposed change.** Support `--scenario boot,garage,longrace,resume` with one
session ARN and shared report. Order: boot (menu) → garage → longrace → resume.
Skip redundant cold compiles after the first race entry.

**Size.** S–M. **Fleet.** D (tools).

### 10. Keep A·D1 owed runs and new catalog work on separate queues — **S · process**

**Problem.** A·D1 / A·D2 still execute existing harness on Bryce's "Go" (touch
AFTER, flags A/B, coldrace dose). Mixing that with new scenario *development*
burns the trial without growing the catalog.

**Evidence.** Analysis §4 levers still marked as device runs; `coldrace` row 29
is catalog growth, not a substitute for findings 2–7.

**Proposed change.** Orchestrator split: (a) A·D* executes existing flags on Go;
(b) Fleet D implements findings 3–8 behind `--scenario` with `--self-test` first;
(c) first paid minutes for a new flag = one 14 + one 14 Pro confirm, then stop.

**Size.** S. **Fleet.** D + A (coordination only; no code in this PR).

## Explicitly not re-proposed (already landed or filed)

A·Y1 levers #3672–#3676 (lit-WGSL stability, hitch attribution, entry floor,
syslog parse, harness method); `coldrace` (#3713); `devicefarm-syslog.mjs`
(#3683); governor quantum / TLX pass census lanes. Cite when a new scenario
*depends* on them; do not re-file.

## Suggested first paid minutes (after harness flags land)

| order | command sketch | devices | answers |
|---|---|---|---|
| 1 | `devicefarm-boot.mjs --trials 3` | 14, 14 Pro | finding 2 |
| 2 | existing `tracks monza:night` on fresh 14 Pro | 14 Pro (+ 14) | finding 1 |
| 3 | `--scenario thermal --soak-s 300` (once flag exists) | 14, 14 Pro | finding 3 |
| 4 | `--scenario garage` then `mempress` | 14 | findings 6, 4 |
| 5 | `--scenario longrace,resume` chain | 14 | findings 5, 7, 9 |

No AWS jobs from this PR.
