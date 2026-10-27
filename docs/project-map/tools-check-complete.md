# tools/check — complete source map

Scope: all 56 tracked files under `tools/check/`, read in full from the working tree on 2026-10-27. Baseline HEAD: `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. No audit CLI, tests, workflow, browser, game VM, compiler or mutation tool was executed for this map. Parent owns documentation verification. This is source evidence, not a measured clean audit verdict.

Navigation followed `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. These files are outside `js/`, where that skill explicitly allows source searches; import/command references below are source locations, not LSP-resolved runtime callers. No unattached or remote LSP result is claimed as evidence about this local checkout.

## Structure and execution boundaries

Despite its directory name, this is not a uniformly static or read-only collection. Espree/eslint-scope linters expose pure helpers to Node tests; ratchets compose counters and branch-relative Git policy; report CLIs may deliberately exit green on findings. VM instruments boot the real simulation via `tools/lib/game-vm.cjs`; browser probes use `tools/lib/harness.mjs` or Playwright. `extract-module`, `trim-comments`, `font-digits`, ratchet write modes, merge-hygiene fix, and twin-fidelity mutate files. A successful report is not automatically a gate, and static eligibility is not browser, GPU, audio-device or physics fidelity evidence.

The key composition is ratchets -> tree-counts -> wait-polling-lint; ratchets -> check-gctx/shell-ids/vm-filename-lint, plus CI assert-audit/twinned-specs/pick-tests; bloat-scan -> ratchets load; dup-functions -> dup-keys tree walker; track-oracle -> physics-oracle pinned boot/serialization. The vm-filename-lint CLI imports ratchets dynamically to avoid a module initialization cycle. Ratchets normalizes writes through merge-hygiene.

`tests/groups.json` is test grouping source; package scripts/tooling-fast are generated projections. `package.json:69` maps typecheck to check-gctx. `.githooks/pre-commit:95` invokes ratchets auto-raise; deploy.mjs:412 uses update absolute as merge cure; CI uses base ratchet comparison and tolerance diff, and workflow/shader wrappers in its tooling job. These source call sites do not establish that any check ran in this session.

## Command contracts

Flags below are derived from parsing/driver source, not help execution. For Node files invoke `node tools/check/<name>`; Python files use `python3`. Unless explicitly named, source exceptions may produce normal uncaught nonzero exits; numeric report outcomes alone do not necessarily fail.

| File | Inputs / invocation | Outputs, guards, limitations |
|---|---|---|
| `ai-band.mjs` | VM rubber-band census; --track monza --diff normal --seconds 90 --runs 1 --seed 1 --wear off; --json. | Human retained; forces catchup pace; 60 Hz, 10 s settling, 15 Hz samples; 40 m reporting dead zone. Outputs gap/band shares and first-run checklist; reports, does not gate the checklist. |
| `ai-field.mjs` | VM field census; track/diff/seconds/runs/seed/wear; --json. | AI-only; 10 s settling, 4 Hz gaps/contact, per-frame attack/cover edges; repeats seed then rebuild. Reports medians/ranges for passes, dwell, errors, wear. Single JSON run omits multi-run stat/seeds. Mistake denominator counts unfinished cars; other statistics include full window. |
| `ai-human.mjs` | VM scripted-player census; --track monza --seconds 240 --runs 1 --pace .97 --offset 0 --wear off; --json. | Normal difficulty, 10 s settle; physical input follower with position reinsertion when isolated, 3 s event grace. Reports alongside contacts/elections and offset self-check. A scripted driver is not user driving; encounter density varies; no behavior pass/fail. |
| `ai-line.mjs` | VM solo line census; track/diff/runs/seed/wear, --json. | AI player, rivals removed, second-lap recording with 400 s cap. Scores corners length >40 m and isolated apex >=120 m; approach 30 m mean and nearest apex. Fails incomplete recording, not shallow lines. |
| `ai-pace.mjs` | VM field lap timing; --track monza --laps 2 [--diff] --wear off --json. | Default easy/normal/hard; AI-only; excludes out lap, reports field median of each car best. Bounded steps; zero timed cars prints a row rather than failing; no statistical repeat flag. |
| `ai-race.mjs` | Dispatcher pace/field/tactics/line/human/ratings/band/stuck; forwards argv; --repeat N becomes --runs N. | spawnSync current Node, inherited stdio, child status preserved/null ->1. Help 0; missing/unknown command 2. Does not route strategy census. |
| `ai-ratings.mjs` | Data VM ratings correlation; --json. | Loads mat4/hash32/driver-ratings and ai-ratings-math; reports Pearson matrix, cluster threshold <.5, style sums, ranking. Decorrelated=false does not make CLI fail. |
| `ai-strategy-census.mjs` | VM whole-race tyre census; track=bahrain laps=10 seed=1 weather=dry; --json. | Wear real/normal difficulty; removes player from cars; samples pitArmed edges at 10 Hz until results/all finished/large cap. Reports plans/compounds/reasons/DSQ/over-life; explicitly exits 0, including bad measured outcomes. |
| `ai-stuck.mjs` | VM AI-only stuck tracker; track/diff/seconds>=60/runs<=25/wear; --json. | Seeds 1..runs, rebuild per seed; createStuckTracker counts timer episodes/rescues, pit-box exemption. Reports totals/per-car, no threshold gate; zero means none observed. |
| `ai-tactics.mjs` | VM tactical census; --track --laps --runs --seed --diff --mode field\|human --pace --wear --json --out. | 4 Hz order/contact with per-frame attack edges; stops at first AI finish or horizon; intervals via 10 m checkpoint interpolation. Settled pass uses 15 s rule. Output file written without mkdir; human reinsertion/grace and scripted follower bound evidence; unknown mode falls to field. |
| `audio-test.cjs` | Chromium/WebAudio pitch assertions; optional baseURL, --help. | Starts harness server otherwise; two sequential browser sessions sample rev/gear/load/voices. Enforces monotonic/equal pitch, brighter pull, manufacturer trims; errors fail. Objective rate/centroid is not listening or target audio-device proof. |
| `bloat-scan.mjs` | Read-only --json [path...]; ratchet slack + skill/agent/AGENTS sizes. | Loads effective ceilings, reports all selected files with >=800 marked large; skips dot dirs/node_modules in requested scopes. Missing/empty scopes fail; negative slack is reported without failure. Counts split-newline, not wc lines. |
| `check-gctx.mjs` | Parity and facade usage; --no-tsc, --json. | Espree/eslint-scope on manifest candidates; compares G and GameEls members/writability/factory roster, follows aliases and nested els. Emits artifacts/gctx/usage.ts + tsconfig and tsc mapped errors. Missing/unlaunchable tsc skips with notice; name/writability only, not assigned value types; computed/stashed ctx not tracked; dead members report only. |
| `check-js-types.mjs` | Runs local .bin/tsc -p tsconfig.checkjs.json --noEmit --pretty false; --json. | Only config include physics JS + checkjs declarations and opt-in @ts-check; missing tsc exit2, diagnostic/compiler nonzero exit1. JSON errors only matching file(line,col): error TS lines, ok follows compiler status. |
| `check-physics.mjs` | Browser bank\|grip\|roadfollow\|steer; own harness server. | Measures finite motion/steering/road-follow and prints PASS/FAIL. Measurement failures do not set exit status. Several waitForFunction calls pass POLL in arg2 (predicate data), so intended 8 s timeout/polling do not apply. Uses wall-time sleeps in grip/steer. |
| `class-usage.mjs` | Static CSS class sweep of index.html/js/tests. | Regex literal classes via class attrs/name/list/el and queried selectors; css top-level files define class tokens. Missing rule waived by query or reasoned KNOWN. unexplained fails. Dynamic/concatenated names skipped; tokens do not establish selector applicability. |
| `cross-file-paths.mjs` | Static relative-reference audit tests/ + tools/. | Espree module then script; imports/exports/dynamic import/require/new URL literal refs. Checks union of direct, JS variants and index candidates. Broken refs/parse errors exit1. Existence only, even directories accepted; does not model ESM resolver, computed paths, js roster, or new URL second argument. |
| `defend-duel.mjs` | VM staged two-car defendPull on/off; --track --diff --fracs --gaps --dxs --dvs --secs --pair --json FILE --v0. | Retires others, picks long straight samples, resets pair state each cell, interleaves arms, regrids when session ends. Reports pass outcomes/branch counts, optional full JSON; no outcome gate except no straight. Artificial duel does not establish field quality. |
| `destructure-usage.mjs` | Manifest script-global destructuring audit; --json. | Espree scopes unresolved identifier destructures against top-level literal/IIFE export sets + expandos. Defaults allowed to miss; spread/computed/Object.assign/defineProperty invalidate static provider. Parse errors skipped; G handled by check-gctx. Fails missing keys only. |
| `determinism-bisect.mjs` | VM or saved traces; --track --seed/--seed-a --seed-b --steps --trace-a/b --write-a/b --expect-diverge --json. | Linear first-divergence search (not binary), SHA1 stable-key hash of player/field/rng/timers; optional output traces. Validates matching traces unless expect-diverge. Both seeds default42 independently; --seed-a does not update seedB despite help wording. |
| `doctor.mjs` | Read-only --tree --json --root DIR --catalog FILE. | Bounded files<=2MiB and inventory<=2000; Node >=minimum subset, dependency resolution, YAML/frontmatter, local links/mirrors, browser executable/cache/Python/tmux, supplied session catalog metadata. No child/browser/network/writes; warnings remain green, fail ->1, invalid CLI ->2. Presence is not live readiness. |
| `dup-functions.mjs` | Espree duplicate function declarations across js/tools/tests. | Uses dup-keys walk/ROOTS; checks statement lists in programs/blocks/static blocks/switch cases, supports export declarations. Parse failure finding; exit1 any hit; unknown args2. Does not prove general variable/function collision absence or switch shared-scope conflicts across cases. |
| `dup-keys.mjs` | Espree duplicate static object-literal keys across js/tools/tests. | Module then script parse, parse failures fail. Getter+setter pair allowed, init/accessor and repeated kind clash. Computed/spread keys ignored; node_modules skipped, SKIP_PATHS currently empty. No class/object-pattern checking. |
| `episode-diff.mjs` | VM replay cold/warm reset snapshots; --track --seed uint32 --episodes 2..100 --seconds .05..120 --json. | Snapshots primitive per-car fields; objects replaced by tags, compare first two snapshots; validate positive finite rollout/grid digests across all episodes. Digest mismatch fails; leaked fields with identical digest report but stay green. Existing game handle avoids boot but caller owns track/state. |
| `evaluate-scope-lint.mjs` | Spec callback lexical audit; --json. | Espree + eslint-scope on top-level tests/specs/*.spec.js; evaluate/evaluateHandle/waitForFunction/$eval/$$eval inline callbacks, allowlisted page globals. By-reference/computed method callbacks missed; unresolved undeclared names ignored. Text CLI fails rows; JSON explicitly exits0 even violations/parse errors. |
| `extract-module.mjs` | file start end [--mutable a,b --out FILE --g-out FILE]. | Range whole-program parse with espree, free-reference resolution eslint-scope; mutable names rewritten to G including shorthand; emits accessor text. Writes only requested paths without mkdir. Analysis defaults builtins filter; no wrapping fallback; classification and integration remain manual. |
| `font-digits.py` | fontTools .woff2 ledger generator; --check. | Reads assets/fonts; digit advances/GSUB/GPOS/features/tnum single substitutions into tests/data/font-digits.json. Default rewrites ledger; --check semantic JSON compare/stale failure. Requires fonttools+brotli; not CI/native rendering proof; glyph error may be stored in ledger. |
| `html-sink-lint.mjs` | JS HTML-sink audit; --json. | Espree2022, dynamic inner/outerHTML/srcdoc assignment or insertAdjacentHTML/contextualFragment/document.write/writeln call. Constants recursively include numeric literals/template constant expressions. Allowlist receiver-source+sink/count; unaudited/stale/count/parse fail. No taint flow, assignments operators beyond =/+=, or computed sink aliases; cheap source prefilter can miss unusual split spellings. |
| `i18n-lint.mjs` | Locale audit [--dir DIR --json] or --guard. | Locale English schema/keys/placeholders/CLDR plural/identical/control chars; missing keys/length warning only. Guard migrated JS selected sinks with >=3 ASCII letter run, I18n.t exemption, keyed allowlist; stale/parse/HTML hits fail. ICU-lite regex not full ICU parser; HTML best effort first closing-tag extraction, data-only allowlists not reason-validated. |
| `lifecycle-census.mjs` | capture-contract CLI; --track --seed --out --cycles plus shared --plan/help. | VM resource snapshots/owner reset, pending WATCH cancellation fixture, 1..12 fresh VM soak cycles, failed unknown-track boot cleanup. Writes census.json and stdout; failed invariant1, exception2. Timers/rAF/rejection counts only; optional Rapier incident physical launch explicitly not exercised. |
| `lockup-bench.mjs` | VM brake speed/pedal/bias/weather sweep; --json; TRACK/FRAC env. | Pin seat, position re-pinned after step, force/yaw/speed persist. Reports peak axle fraction/lock/flat spots/stopping time; no outcome gate; unknown/help args not validated before measurement. |
| `merge-hygiene.mjs` | Default check or --fix for ratchets.json/groups.json formatting. | Deep key sort ratchets, sorted groups files/flags, toolingFast comment blocks glued to next path. Check drift1, fix rewrites only differing files. Pure normalization preserves selected unknown metadata; follow gen-test-groups after groups fix; formatting, not schema/semantics. |
| `occlusion-estimate.mjs` | VM props raster estimator [track=vegas] [cameras=16]; OCC_W/H. | 72m cells, triangle depth winners at centreline 1.3m view; outputs submitted/visible cells/vertices. No road/terrain/cars/fog/radial baseline; optimistic bound, no GPU performance proof. Drops triangles crossing behind camera instead of clipping; FAR in projection does not itself enforce clip-z. |
| `offline-precache-check.cjs` | Browser PWA test [warm=spa] [cold=cota], help/dash flags exit0. | CWD-root server and verify-track informational count; separate SW-blocked online cold reference; install sentinel, 52 scenery files/presets, controlled reload, deleted essential cache survival, origin server shutdown, uncacheable-fetch proof, cold offline race props exact match. Counts/availability not pixels; args allow same warm/cold, which defeats cold guarantee. Browser mandatory. |
| `physics-oracle.mjs` | VM golden traces --track --steps --trace IDs --ghost FILE --no-recipes --out. | Pinned weather/storage/assist guards, resident scenery, retired AI. Recipes parsed from physics characterization spec; ghost v3 revision/dt/track checked. Raw doubles incl special-number strings, source hashes and HEAD provenance; writes selected trace JSON. Output path configurable (not actually restricted to artifacts despite header). Generates truth for comparison, does not perform port comparison. |
| `physics-tune-sweep.mjs` | Browser slider/notch/track sweep; --sliders --tracks --notches --aggr --steps --json FILE; APEX_WORKERS. | Pure validated plan, actual DOM input events, curvature speed policy, aggregate completion/offroad/slip/g estimates. Defaults monza/suzuka/bahrain; pace19 others10. Worker pool1..8; source wait/sleep settling and policy limitations; DNF/error rows report rather than fail. Output dirs mkdir; concurrency is explicit and expensive. |
| `player-dyn.mjs` | VM --json --seat pin\|shipped; TRACK/FRAC. | bench/measure exports; position re-pin to straight, parked rivals; braking/accel/skidpad/steer/load/flick/midcorner tables. Relative behavior tests external; CLI no numeric threshold failure. finite aggregate computed before midCorner rows, so does not include final two measurements. |
| `quick-validate.mjs` | Optional browser smoke [port=3477], --help. | Pure port/parser/probe helpers; own server, 844x390 browser, async race arming deadline then jump/step/physics/light/camera probes, console/page errors fail. Tests no pixels or native renderer assurance; initial boot wait has no polling; globals probe includes GLX even comment calls all FULL. |
| `ratchets.mjs` | Effective ceiling mechanism; check/json, --base REF, --update/preview/lower-only/absolute/fragment/reason, --auto-raise[=N], --fold/min-fragments, --seed, --pin-sites. | Loads base + sorted additive branch fragments; lines/codeLines/topLets/gMembers/routes plus tree metrics. Measures working tree, defaults slack max(60,4%) unless tighter. Four pin counts diff-relative by default when base reachable, absolute env override; inherited overage can pass. Update writes topic delta or absolutes/folds; auto only bounded non-exact per-file line metrics; --base warnings/absorb/history/advisory separate verdict. Git base availability matters. Fold also unlinks folded history paths. |
| `reject-lint.mjs` | JS discarded known Promise API report. | Espree2022 matches bare/discarded logical-right/ternary/sequence member calls; qualified receivers + unambiguous method map. Assignment/return/await/chaining treated as owned without checking rejection handler. Dynamic receivers/computed methods unknown. CLI fails positive site count only; parse errors print but remain green and count() ignores them. |
| `scan-globals.mjs` | Manifest classic-script dependency scanner; --check --json. | Espree/eslint-scope distinguishes eval/call/typeof writes/reads and dynamic window sites. Writes artifacts/dep-graph.json even JSON. check compares derived ordering and classifies declared edges; unknown externals/underivable edges report only. Async IIFE conservative, eval callbacks false negatives, dynamic keys unscannable; lazy lists checked as one artificial order. --json returns before --check, so combined flags do not enforce toposort. |
| `shader-validate.mjs` | Offline GLSL/WGSL extraction+compiler wrapper; --require --strict-naga --json. | VM resolves GLX templates, AST inline ES300 suffix constants and scalar variant; WGSL namespace entrypoints excluding POST_VS fragment. Writes artifacts/shader-validate. Missing binaries default skip; naga advisory unless strict; GLSL fail1. TLX TSL excluded; successful reference compilation is not Dawn/driver evidence; header exit2 promise not implemented in CLI (all failed rows ->1). |
| `shell-ids.mjs` | Static shell/runtime DOM IDs; --json. | Regex js literal $/getElementById/#querySelector reads, index declarations and JS id writes, RUNTIME_IDS reasons + cockpit auxiliary shell. Missing/duplicate shell ids fail; dynamic IDs report and count feeds ratchet. Not scope-aware or complete syntax coverage; first read per ID only, runtime existence/order not established. |
| `skill-routing-eval.py` | Real claude -p routing runs --queries --out --model --root --only --alias --runs --grace --workers --timeout; --compare A B. | Thread pool subprocess per query/run, first tool Skill/Read strict score with optional grace; detects skill path in Read, majority ties first. Writes header/results incl model/version and compares only common source/query identities. Always returns0 after scored results, wrong/none not failing. Calls real model and kills only CLI process; cost/network/runtime beyond static audit. |
| `skill-smoke-recipes.json` | schemaVersion1 declarative skill recipe catalog. | 36 recipes, each canonical skill -> one Node fixture/pattern/minPass/maxFail0/<=15s/prereqs/browser+hardware unverified/evidenceScope. Data includes code-nav/debugger special >=5 expectations. Named fixture contract is not full skill or subsystem coverage. |
| `skill-smoke.mjs` | (--skill NAME\|--all) (--plan\|--check) [--progress]. | Validates complete canonical YAML/fixture catalog; plan only metadata, check serial Node TAP selected patterns timeout<=15s/max512KiB, deletes NODE_TEST_CONTEXT. Requires minimum pass/no fail/no exec error. stdout one JSON, stderr progress JSONL; domainVerified false; plan/pass0 failed1 config2. |
| `tolerance-diff.mjs` | Git --base REF or --diff-file FILE; --always --advisory. | U0 hunks pair removed/added by ordinal only, mask numbers/equal whitespace, detect loosened digits/bounds/named tolerances. Default failure needs production edit; exceptions substring+reason. Stale exceptions reported but do not affect fail. Semantic rewrites/reordered lines/multiline assertion can evade; --base is merge-base..HEAD, excludes dirty edits. |
| `track-oracle.mjs` | VM query grid --track --samples>=1 --out. | Uses physics-oracle bootPinned/header/stringify; samples uniform s and lateral fractions -1,-.5,0,.5,1; positions/bank/kerb/pit/walls. Writes track-ID.json with provenance; no reference diff or runtime rendering. |
| `tree-counts.mjs` | Tree counter report, --offenders. | CSS class tokens/shell nodes/catches/waits/sleeps/font/spacing/colors/ref-free modules; counters feed ratchets; not standalone gate. CSS declaration regex with comments stripped for token-adoption, classTokens not comment-stripped; bare catches brace scanner not JS parser; zeroRef uses textual mentions not execution coverage and omits some newer lazy rosters. |
| `trim-comments.mjs` | Mutating default [paths...] [--dry-run --headers --narrative]. | Removes dividers/pointers/labels/blank runs; optional 220-char header compression; narrative explicit paths required, keep-keywords/license protected. Default js scope, vendor/node_modules skipped. Line-based scanner can affect comment-like literal content; webgpu narrative always skipped despite header exception claim. No syntax/semantic postcheck. |
| `twin-fidelity.mjs` | Mutant test runner [IDs] [--list\|--dry\|--help]. | Loads mutants.json, all needles must exist exactly once. dry verifies needles only; run patches production file in place, invokes selected spec Node APEX_VM_PAGE=1, restores in finally. Catcher TAP pass/fail pattern must match declared affected/unaffected tests; missing output fails. Mutation detection does not prove browser parity or safety under process death; never run alongside source consumer. |
| `vm-filename-lint.mjs` | Static tests/unit+helpers vm filename checks. | Espree detects vm.runInContext/NewContext/ThisContext/new vm.Script, opts literal filename. Any call/ROOT mention accepted absolute, synthetic labels accepted; dynamic options skipped, fixtures dirs excluded. CLI fails relative/parse/source-load over absolute ceiling; missing snippets informational. PIN vmSrcLoads used diff-relative through ratchets elsewhere; scope name vm only. |
| `vm-portable.mjs` | Static specs eligibility --json --portable --blocked. | Espree top-level spec list; named page receivers/known API sets, inline evaluate DOM/rAF, locator matchers, raw viewport regex, direct Playwright imports. Reports only; parse becomes blocker; no nonzero eligibility verdict. By-reference callbacks/alias receivers not resolved, viewport regex can match prose; portable is not fidelity or permission to drop browser gate. |
| `vstd-lint.mjs` | Source report [file-or-dir...]; directories nonrecursive. | Manifest speed-reading files minus data; custom noncode stripper + regex raw .speed compared to numeric/UPPER_SNAKE/unique const threshold, normalized vStd exempt. Returns report/normal exit0; external invariant test allowlist gates. Whole templates blanked (incl expression code), no AST/alias/general dataflow; source read errors can still fail despite always-exits0 wording. |
| `wait-polling-lint.mjs` | Static waits tests+tools, manual tests excluded. | Espree module/script, inline async predicate, misplaced options, timeout without polling, optionless specs except reasoned exemption. CLI hard-fails async predicates only; parse errors printed but not fatal in main; count() throws parse failures, other kinds held by waitNoPolling ratchet. Checks polling key existence, not numeric value or raf setting; computed/aliased calls limited. |
| `workflow-lint.mjs` | Offline workflow linter --require --json --dir DIR; env APEX_REQUIRE_LINT_BINS. | lint-bins resolves pinned actionlint/shellcheck/zizmor; repo configs unless alternate dir. Missing binary skip0 unless require; findings1 tool error2. actionlint shellcheck absence gets own skip, zizmor offline excludes token/network audits. shellcheck clean row denotes availability; actual finding status in actionlint row. No Actions execution. |

## Verified stale wording and misleading guard boundaries

These are source-confirmed discrepancies, left unchanged in this documentation task:

- `extract-module.mjs:5` promises wrapping the range if needed; the actual parse fails immediately and asks for whole statements/functions (range parser below `let ast`).
- `trim-comments.mjs:22` promises a WebGPU exception when explicitly selected. `narrativeOkForFile` unconditionally rejects any `js/render/webgpu/` path; it also exempts governor/vantage/debris-world regardless of explicit selection.
- `twin-fidelity.mjs:23` says dry does patch/restore. Its current dry branch only runs needle inspection, and its printed help correctly says no patch/specs.
- `check-gctx.mjs:570` describes usage stopping at G.els. Current `collectUsage` and `emitShadow` implement nested els reads/writes/destructuring and aliases. This is historical explanation phrased as present behavior.
- `determinism-bisect` help calls seed-b default “same as seed-a,” but defaults independently initialize both to42 and parsing seed-a changes only the first.
- `scan-globals` header claims game last is asserted. `checkGraph` asserts derived dependency ordering; there is no direct FULL-last game assertion in this file. JSON mode returns before checkGraph, so `--check --json` writes/prints but does not enforce order.
- `offline-precache-check` opening comment describes browser vs Node comparison; current pass/fail compares cold offline props with a separate online browser reference, with Node informational. The adjacent detailed comment explains this correction.
- `html-sink-lint` prose says templates without substitutions; implementation recursively accepts constant substitutions and numeric literals too. The broader implementation is visible in `isConstantHtml`.
- `tolerance-diff` says stale/invalid exceptions are reported, which is accurate; they are not failed. `r.fail` contains only unexcepted loosenings and production/always condition.
- `shader-validate` header advertises tool-error exit2; its final process.exit expression only chooses0/1. `workflow-lint` separately implements2.
- `player-dyn` labels the finite scan “everywhere,” but calculates it before adding midCorner_brake/coast. Its CLI prints the result without failing on false.
- `check-physics` expresses intended POLL bounds, but passes the options object as argument2 throughout; Playwright options belong in argument3. Printed FAIL never becomes exit1 from the check functions.
- `wait-polling-lint` `count()` treats parsing as failure, but main only hard-rejects async predicates. `reject-lint` similarly displays parse errors while exit status counts sites alone. `evaluate-scope-lint --json` deliberately exits0 before its normal finding verdict.

## Read ledger

Each row gives the complete SHA-256 of the file bytes and full covered line ranges. Line counts use physical text lines (`splitlines`), agreeing with wc for these newline-terminated sources; ratchets intentionally uses split-newline and therefore usually counts one extra. An initial oversized output was truncated and was discarded as coverage evidence; all its files were subsequently re-read in bounded outputs or intact per-file sections. Ratchets used1–320,321–640,641–941; recipes1–500,501–977. No unread ranges remain.

| File | Bytes | Lines | SHA-256 | Fully read ranges |
|---|---:|---:|---|---|
| `tools/check/ai-band.mjs` | 8585 | 205 | `186672590799f6f65ccdba95f8638ddc3410910af5f97093fc2a70f87b2676bb` | 1–205 |
| `tools/check/ai-field.mjs` | 16623 | 272 | `cf4ad0bcdd052898f4d695084cebf692f094c65bc33f9a3a8bf6dabb38c47024` | 1–272 |
| `tools/check/ai-human.mjs` | 19190 | 308 | `188efcc7a60817f1c993f12691dbe917930b4834ac4ca04998f512ed85ad1ee4` | 1–308 |
| `tools/check/ai-line.mjs` | 7493 | 144 | `3b18b63f951fbd1e1bc2ace70384eb0406f59c0afa3653e540d8332d5ed2021e` | 1–144 |
| `tools/check/ai-pace.mjs` | 5985 | 123 | `fd1ec8cc25324bf622a265ed16c54daf39f1e8927e818cc48ead5f3f837ca04e` | 1–123 |
| `tools/check/ai-race.mjs` | 3487 | 78 | `4df45a0556e01dd7f9774d15f009fb8a6c2087eb9f434954328d287f14aad70d` | 1–78 |
| `tools/check/ai-ratings.mjs` | 4302 | 118 | `1823d77680a517732246dc4de117680cde499d61c5d7c69b9ed4272ef5129294` | 1–118 |
| `tools/check/ai-strategy-census.mjs` | 5580 | 93 | `4f5aae082fcc4a8f665095a93daea02b795010fca7b37b61a2fe92d2dbf3f347` | 1–93 |
| `tools/check/ai-stuck.mjs` | 4545 | 88 | `bd57e5aa090294ef442ab3089699f139c777c98e607280cc8105706f74c86433` | 1–88 |
| `tools/check/ai-tactics.mjs` | 24970 | 357 | `2a577384fa30b4e76143933fe8a4885410908d53d8f1b3ce4784fdb1cb07a14d` | 1–357 |
| `tools/check/audio-test.cjs` | 9967 | 179 | `81154fff1e86d6e96bb682ca967b542d5b370a27a101f963efa7085240989ca4` | 1–179 |
| `tools/check/bloat-scan.mjs` | 4308 | 119 | `0105d59e9660f31dd0f53eecb6b812e471f56392dc366bb2366836712344e823` | 1–119 |
| `tools/check/check-gctx.mjs` | 31726 | 612 | `337f129aa6508cb6e9877d90bbb9e6f1fd3d630aa820a79b5c011350bf403405` | 1–612 |
| `tools/check/check-js-types.mjs` | 1547 | 33 | `5dce85022149beea6863de12f25c1445b7cb52a6797a0948c3556ab495c409e5` | 1–33 |
| `tools/check/check-physics.mjs` | 7650 | 158 | `20f1e232585365158b0ae92c4eed2dff4994aec4103b88adf53ff1b43dbad7b2` | 1–158 |
| `tools/check/class-usage.mjs` | 12387 | 206 | `d68f052acb7c81b186742a8c6c9d238f2b809f8e8bdc8328adccc132e161ab24` | 1–206 |
| `tools/check/cross-file-paths.mjs` | 6236 | 143 | `ae19b6d5015b73751d45506dbc5e84e789f52d02ce14e0ed391782526a222a26` | 1–143 |
| `tools/check/defend-duel.mjs` | 8887 | 158 | `c36bd862ce5782e83a9778bd3018536269ff1ec48dd2216e183b6d3d865e526b` | 1–158 |
| `tools/check/destructure-usage.mjs` | 7067 | 152 | `9ff3ac80d263285ad8911b923a143a772603127479b3370cc20bb16eeb610e6f` | 1–152 |
| `tools/check/determinism-bisect.mjs` | 8064 | 228 | `e8e40d788dfd1d7649179ceb7ba633ec985501f7b224856a0c627457b975385a` | 1–228 |
| `tools/check/doctor.mjs` | 15187 | 221 | `336f523e6cb01700041a0b212cb5276f98bc37cb07ec05afbe551c4b2a30b57c` | 1–221 |
| `tools/check/dup-functions.mjs` | 4266 | 84 | `3ef1f0d251c85f8de0d265263f593da0ed7cbb56e42fc0b8b2e03762fec0a4af` | 1–84 |
| `tools/check/dup-keys.mjs` | 6215 | 122 | `5b8878e5f24a6d6a1c955edb5c8b91753d5266b7000f081598e89cfb54d86ff7` | 1–122 |
| `tools/check/episode-diff.mjs` | 9718 | 184 | `f2f565689593d03729e0ca75bebe6b31f2e833808a34a137032204b68f6e6fc9` | 1–184 |
| `tools/check/evaluate-scope-lint.mjs` | 7259 | 151 | `a9e512928db47033155eaded012c1989e262b69fac400e58e03bc7e1d5e2280d` | 1–151 |
| `tools/check/extract-module.mjs` | 4863 | 97 | `95e037d3190efca5d054abf691b5fccc681fbd2fffa3ff7628b69974d60cfd5f` | 1–97 |
| `tools/check/font-digits.py` | 5487 | 126 | `68b373c23da868ccd972f3b2c45d26bcd742bd51f7e92a16965f39d03ece6ee7` | 1–126 |
| `tools/check/html-sink-lint.mjs` | 7911 | 160 | `542d3287059fe79feead4f71ef581f25d378e7b9b4fe1a6df66421c567128e3e` | 1–160 |
| `tools/check/i18n-lint.mjs` | 19692 | 543 | `a19b63e8495f2f90ca246d292acdf4b181895f5327b1e64571bfa8d2dd5ca96b` | 1–543 |
| `tools/check/lifecycle-census.mjs` | 7017 | 102 | `4316efea4047c2452fcfad14725bf282d451fbd5b731655aa31c53dcd7c2819f` | 1–102 |
| `tools/check/lockup-bench.mjs` | 4402 | 136 | `7d9a09bdac4a306d856ad2ffd927591efe44a77172ae171e28f1e21914f3253e` | 1–136 |
| `tools/check/merge-hygiene.mjs` | 6881 | 187 | `a02e1d53424c89c749c287f209fac9be2adbc7c9744f1c0ba27c64a27e5c0bab` | 1–187 |
| `tools/check/occlusion-estimate.mjs` | 6869 | 123 | `061cd6ed52c7a5eea88e7bc6a834a47ce2a4df1530b02c500ffa788379a84041` | 1–123 |
| `tools/check/offline-precache-check.cjs` | 15368 | 250 | `6bbd3b56cce68f4184f5354d351594ae732f1fa0536456e0106ee30b38445369` | 1–250 |
| `tools/check/physics-oracle.mjs` | 14349 | 282 | `25d1f9ff284d1b6624ace1a0dab7653a1482e554b7a03fc1d2cc2e0ff5559581` | 1–282 |
| `tools/check/physics-tune-sweep.mjs` | 17959 | 366 | `2594bc636c11c809c13a954ea724698a9eba94b2a53424d1e1eb299f9e5b3b44` | 1–366 |
| `tools/check/player-dyn.mjs` | 12210 | 196 | `461ff3bc2b725b864982089fb5e2a28edab7266324609c8868448ba6610c3480` | 1–196 |
| `tools/check/quick-validate.mjs` | 7098 | 153 | `ca02dd6c965148e244bb3bf76898ac3f9477cedeb182a09bea4d707755c8f86b` | 1–153 |
| `tools/check/ratchets.mjs` | 57109 | 941 | `07b89ad6faab17e1f3e93e5761022db26307b35c16d6c57b12875a6baaab2b73` | 1–320; 321–640; 641–941 |
| `tools/check/reject-lint.mjs` | 7333 | 163 | `4f5fd1ce551a5f0af18149cdc329a17fea496d2c9a031b49ce7419cd2342c46c` | 1–163 |
| `tools/check/scan-globals.mjs` | 25856 | 509 | `ba96069b5ad1e2772c5f7d37125e2b317abc7079b1285186bcc1c990fd69f4e7` | 1–509 |
| `tools/check/shader-validate.mjs` | 9135 | 173 | `f54ae6144952d8d527e2bdcc2af855de90cbf3fb7ce23fd98883138672b59bff` | 1–173 |
| `tools/check/shell-ids.mjs` | 10902 | 180 | `2663a35718f0d61ef54bd61d96c097f13db69a4378296857ff400b609cf60df1` | 1–180 |
| `tools/check/skill-routing-eval.py` | 13186 | 276 | `48cd41102176dd9033b96d425c5b016d08e196c9b6a94706039b0c323fdd3e5e` | 1–276 |
| `tools/check/skill-smoke-recipes.json` | 35766 | 977 | `522eeac2eaab4cf9fb38dc1adab13f1a27ed17e84916e2ee75c7522d38223d96` | 1–500; 501–977 |
| `tools/check/skill-smoke.mjs` | 6476 | 77 | `d0377cc2be4148332ed0cff109e56473ca9e31417b81cadf75caa3912b7970e5` | 1–77 |
| `tools/check/tolerance-diff.mjs` | 8214 | 137 | `2a0519f6dc025d7b44888ad5d77602376a4b9397e5d7eb816b7357417159f8a3` | 1–137 |
| `tools/check/track-oracle.mjs` | 3675 | 76 | `237b1e396b10b58147c98ab4b4a5dd5e6a495af34f4684a422959975409acde8` | 1–76 |
| `tools/check/tree-counts.mjs` | 15461 | 329 | `e7010e3cbfbfafd7838e2e5071991ad9c1cd7973142fff959eeb6fd4b9cae762` | 1–329 |
| `tools/check/trim-comments.mjs` | 9076 | 242 | `38a21d9b7be701bc3de3dc63c66258d6a739a42570c077f9be78c2d1573712ae` | 1–242 |
| `tools/check/twin-fidelity.mjs` | 6407 | 137 | `9f50b1216e7b7c926ac291b4e1bce968725684c4366b4c25e9276ac7f8ce8aa1` | 1–137 |
| `tools/check/vm-filename-lint.mjs` | 7445 | 138 | `baf9cf26bfef479b878526b14bbf110b03cd3269e7d6f2f2a99e957bce66e9f0` | 1–138 |
| `tools/check/vm-portable.mjs` | 14624 | 275 | `3d6d0c29d60bacb06d04bde73b313b78c88bda04ab065a290e857c18ac0d6cc1` | 1–275 |
| `tools/check/vstd-lint.mjs` | 14547 | 296 | `3188ad4aaa48e08037f4ae3c853c5e09b938e40f875deb793e24779f7c8665e8` | 1–296 |
| `tools/check/wait-polling-lint.mjs` | 9980 | 189 | `e850e86307424387fe75d7ee615af0e8567dc03df057d1ffb3d91bb3099718e5` | 1–189 |
| `tools/check/workflow-lint.mjs` | 4788 | 81 | `c144813beaac28c74155e58c20ffa31d17894771defe388bb2b0687c90b8ed46` | 1–81 |

## Dependency and source-reference ledger

This ledger records literal dependency specifiers and tracked source files that mention each tool by full or relative filename. It excludes prose docs and this map; a reference is not necessarily an executable call (fixtures can embed source). Imports, CLI wrappers and test imports were distinguished in the contracts above. Exact line numbers make each edge reviewable. Dynamic ROOT+game-vm loads in the AI family/defend-duel/occlusion and manifest requires via path joins are explicitly included in the command descriptions; a literal-specifier extraction alone would omit them. No imports are executed by this inventory.

### ai-band.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `tests/unit/ai-ratings-math.test.mjs:96,97`; `tests/unit/tools-runnable.test.mjs:764`; `tools/check/ai-race.mjs:24,41`.

### ai-field.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `js/game.js:5779`; `tests/unit/game-tools-help.test.mjs:19`; `tests/unit/tools-runnable.test.mjs:764,793`; `tools/check/ai-human.mjs:8,57`; `tools/check/ai-line.mjs:9,34`; `tools/check/ai-race.mjs:23,36`; `tools/check/ai-stuck.mjs:6`.

### ai-human.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `js/physics/ai-drive.js:290,1687`; `tests/unit/game-tools-help.test.mjs:22`; `tests/unit/tools-runnable.test.mjs:764`; `tools/check/ai-race.mjs:24,39`; `tools/check/ai-tactics.mjs:21,83`.

### ai-line.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `tests/unit/game-tools-help.test.mjs:20`; `tests/unit/tools-runnable.test.mjs:764`; `tools/check/ai-race.mjs:23,38`.

### ai-pace.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `tests/unit/game-tools-help.test.mjs:18`; `tests/unit/tools-runnable.test.mjs:764,793`; `tools/check/ai-field.mjs:7`; `tools/check/ai-line.mjs:9`; `tools/check/ai-race.mjs:23,35`.

### ai-race.mjs

Dependencies: `node:child_process`, `node:path`, `node:url`.

Source references: `tests/unit/ai-ratings-math.test.mjs:83,84,89`; `tests/unit/stuck-census.test.mjs:1`; `tests/unit/tools-runnable.test.mjs:783`; `tools/check/ai-band.mjs:15`; `tools/check/ai-ratings.mjs:17`.

### ai-ratings.mjs

Dependencies: `node:fs`, `node:path`, `node:vm`, `node:url`, `../lib/ai-ratings-math.mjs`.

Source references: `tests/groups.json:40`; `tests/unit/ai-ratings-math.test.mjs:60,61`; `tests/unit/tools-runnable.test.mjs:762,779`; `tools/check/ai-race.mjs:24,40`; `tools/lib/ai-ratings-math.mjs:2,5`.

### ai-strategy-census.mjs

Dependencies: `node:path`, `node:url`, `node:module`.

Source references: `tests/unit/tyre-strategy-vm.test.mjs:184,222`.

### ai-stuck.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../lib/cli-args.mjs`, `../lib/stuck-census.mjs`.

Source references: `tests/unit/game-tools-help.test.mjs:21`; `tools/check/ai-race.mjs:42`; `tools/lib/stuck-census.mjs:2`.

### ai-tactics.mjs

Dependencies: `node:module`, `node:fs`, `node:path`, `node:url`, `../lib/cli-args.mjs`.

Source references: `js/physics/ai-drive.js:1644`; `tests/unit/tools-runnable.test.mjs:764,793`; `tools/check/ai-race.mjs:23,37`.

### audio-test.cjs

Dependencies: `playwright`, `node:path`, `../lib/harness.mjs`.

Source references: `index.html:1982`; `js/audio/engine.js:157,1758,3313`; `js/audio/tone-model.js:7,25`; `tests/unit/audio-sample-upgrade.test.mjs:238`; `tests/unit/audio-tune.test.mjs:12,2178,2181,2225,2231,2242`; `tools/manifest.cjs:1575`.

### bloat-scan.mjs

Dependencies: `node:fs`, `./ratchets.mjs`, `node:path`, `node:url`.

Source references: `tests/unit/skill-progressive.test.mjs:596`; `tests/unit/validation-cli.test.mjs:183,190,193`; `tools/manifest.cjs:1568`.

### check-gctx.mjs

Dependencies: `node:fs`, `node:path`, `node:child_process`, `node:module`, `node:url`, `espree`, `eslint-scope`, `../manifest.cjs`.

Source references: `.github/workflows/ratchets-fold.yml:65`; `package.json:69`; `tests/unit/game-ctx-surface.test.mjs:12,36,52`; `tools/check/destructure-usage.mjs:18`; `tools/check/ratchets.mjs:33,79`; `tools/gen/gen-hooks-table.mjs:20`; `tools/manifest.cjs:1561`; `types/game-ctx.d.ts:14,837`.

### check-js-types.mjs

Dependencies: `node:child_process`, `node:fs`, `node:path`, `node:url`.

Source references: `tests/unit/check-js-types.test.mjs:3,16`.

### check-physics.mjs

Dependencies: `../lib/harness.mjs`, `node:url`.

Source references: `tests/unit/game-tools-help.test.mjs:32`; `tests/unit/tools-runnable.test.mjs:461`; `tests/unit/wait-polling.test.mjs:138,141,143`; `tools/manifest.cjs:1573`.

### class-usage.mjs

Dependencies: `node:fs`, `node:path`, `node:url`.

Source references: `css/settings.css:50`; `tests/unit/class-usage.test.mjs:17,23,35`.

### cross-file-paths.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/unit/cross-file-paths.test.mjs:19`; `tools/ci/select-specs.mjs:36`; `tools/gen/gen-hooks-table.mjs:21`; `tools/manifest.cjs:1563`.

### defend-duel.mjs

Dependencies: `node:module`, `node:fs`, `node:url`, `../lib/cli-args.mjs`.

Source references: `tests/unit/ai-ratings-math.test.mjs:105,107,108`; `tests/unit/tools-runnable.test.mjs:360`.

### destructure-usage.mjs

Dependencies: `node:fs`, `node:path`, `node:module`, `node:url`, `espree`, `eslint-scope`, `../manifest.cjs`.

Source references: `tests/unit/destructure-usage.test.mjs:6`.

### determinism-bisect.mjs

Dependencies: `node:module`, `node:fs`, `node:path`, `node:crypto`, `node:url`, `../lib/game-vm.cjs`.

Source references: `tests/unit/determinism-bisect.test.mjs:15`.

### doctor.mjs

Dependencies: `node:fs`, `node:path`, `node:module`, `node:url`, `node:util`, `yaml`, `../lib/chromium-path.mjs`, `../lib/session-contracts.mjs`.

Source references: `tests/unit/apex-tools-mcp.test.mjs:1154`; `tests/unit/bootstrap-doctor.test.mjs:8,135`; `tools/mcp/apex-tools-mcp.mjs:1830`; `tools/mcp/doctor-catalog.mjs:25`.

### dup-functions.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`, `./dup-keys.mjs`.

Source references: `tests/unit/gfx-backend-canary.test.mjs:215,217,219`.

### dup-keys.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `.claude/workflows/code-survey.js:121`; `tests/groups.json:341`; `tests/unit/dup-keys.test.mjs:1,13,20`; `tests/unit/team-livery.test.mjs:24`; `tests/unit/tools-a12-guards.test.mjs:25,43`; `tools/check/dup-functions.mjs:12,24`.

### episode-diff.mjs

Dependencies: `node:module`, `node:path`, `node:url`, `../../tools/lib/game-vm.cjs`.

Source references: `js/agent/apex.js:86,2119`; `tests/unit/episode-transients.test.mjs:13,29`; `tests/unit/validation-cli.test.mjs:13,138`.

### evaluate-scope-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`, `eslint-scope`.

Source references: `tests/unit/evaluate-scope-lint.test.mjs:20`; `tools/manifest.cjs:1564`.

### extract-module.mjs

Dependencies: `node:fs`, `espree`, `eslint-scope`.

Source references: `tests/unit/tools-runnable.test.mjs:334,368`; `tests/unit/validation-cli.test.mjs:171,175,183,188,193,195,200,203`; `tools/manifest.cjs:1570`.

### font-digits.py

Dependencies: `stdlib json/pathlib/sys`, `fontTools.ttLib.TTFont`.

Source references: `tests/data/font-digits.json:2`; `tests/unit/font-digits.test.mjs:23,61`; `tests/unit/tools-runnable.test.mjs:333`.

### html-sink-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/data/html-sink-allowlist.json:4`; `tests/unit/html-sink-lint.test.mjs:15`.

### i18n-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/data/i18n-lint-allowlist.json:3`; `tests/data/i18n-migrated.json:4`; `tests/unit/i18n-lint.test.mjs:1,25`.

### lifecycle-census.mjs

Dependencies: `node:vm`, `node:fs`, `../shot/capture-contract.mjs`, `node:module`, `node:path`.

Source references: `tests/unit/bash-guard-hardening.test.mjs:1328`; `tests/unit/capture-tools-regressions.test.mjs:15`; `tools/perf/diagnostics.mjs:83`.

### lockup-bench.mjs

Dependencies: `node:url`, `node:module`, `../lib/game-vm.cjs`.

Source references: `tests/groups.json:594`; `tests/unit/lockup-bench-vm.test.mjs:6`.

### merge-hygiene.mjs

Dependencies: `node:fs`, `node:path`, `node:url`.

Source references: `.gitattributes:19`; `tests/unit/merge-hygiene.test.mjs:12,18`; `tests/unit/pre-commit-guards.test.mjs:612`; `tests/unit/ratchet-merge-hotspot.test.mjs:8,29`; `tests/unit/ratchets-fold-schedule.test.mjs:19`; `tools/check/ratchets.mjs:333,443,453,566,835`.

### occlusion-estimate.mjs

Dependencies: `node:module`, `node:path`, `node:url`.

Source references: `js/render/glx/chunked.js:161`; `tests/unit/tools-runnable.test.mjs:835,838`.

### offline-precache-check.cjs

Dependencies: `playwright`, `node:http`, `node:fs`, `node:path`, `node:child_process`, `../lib/harness.mjs`.

Source references: `sw.js:1137`; `tests/unit/offline-precache-nav.test.mjs:6`; `tests/unit/tools-runnable.test.mjs:380`; `tools/manifest.cjs:1572`.

### physics-oracle.mjs

Dependencies: `node:module`, `node:url`, `node:child_process`, `node:crypto`, `node:fs`, `node:path`, `espree`, `../lib/cli-args.mjs`, `../lib/game-vm.cjs`.

Source references: `tests/unit/physics-oracle.test.mjs:3,20,28`; `tools/check/track-oracle.mjs:6,27`.

### physics-tune-sweep.mjs

Dependencies: `../lib/harness.mjs`, `node:url`, `node:module`, `../lib/cli-args.mjs`, `node:fs`, `node:path`.

Source references: `tests/unit/game-tools-help.test.mjs:24`; `tests/unit/physics-tune-sweep.test.mjs:9`; `tests/unit/tools-runnable.test.mjs:359`; `tools/manifest.cjs:1574`.

### player-dyn.mjs

Dependencies: `node:module`, `node:url`, `../lib/cli-args.mjs`, `../lib/game-vm.cjs`.

Source references: `tests/unit/game-tools-help.test.mjs:23`; `tests/unit/player-dynamics-shipped-vm.test.mjs:2,9,28`; `tests/unit/player-dynamics-vm.test.mjs:3,19`; `tests/unit/tools-runnable.test.mjs:361`; `tests/unit/trail-brake-turnin.test.mjs:26`.

### quick-validate.mjs

Dependencies: `node:url`, `../lib/harness.mjs`.

Source references: `tests/unit/quick-validate.test.mjs:4,63`; `tests/unit/tools-runnable.test.mjs:463`; `tests/unit/tools-w13a-quick-validate.test.mjs:7,10`; `tools/manifest.cjs:1571`.

### ratchets.mjs

Dependencies: `node:fs`, `node:child_process`, `node:path`, `node:url`, `../hooks/ratchet-reason.mjs`, `../ci/pick-tests.mjs`, `./check-gctx.mjs`, `./tree-counts.mjs`, `./shell-ids.mjs`, `../ci/assert-audit.mjs`, `../ci/twinned-specs.mjs`, `./vm-filename-lint.mjs`, `./merge-hygiene.mjs`.

Source references: `.claude/hooks/bash-guard.sh:9,37,660,680`; `.claude/hooks/protect-files.py:71,130,364`; `.claude/hooks/protect-files.sh:9`; `.claude/hooks/shellparse.py:872,885,892,902,903,1578`; `.claude/workflows/code-survey.js:405`; `.cursor/rules/game-code.mdc:19`; `.githooks/pre-commit:95`; `.github/workflows/ci.yml:361,390,523,582`; `.github/workflows/ratchets-fold.yml:5,7,65,86,91`; `tests/data/ratchets.json:2`; `tests/unit/agent-config.test.mjs:627`; `tests/unit/assert-match-ratchet.test.mjs:6,16,22,43`; `tests/unit/bash-guard-hardening.test.mjs:381,879,921`; `tests/unit/ci-pr-base.test.mjs:81`; `tests/unit/cli-args.test.mjs:105`; `tests/unit/cross-tool-guards.test.mjs:210`; `tests/unit/css-token-adoption.test.mjs:70`; `tests/unit/deploy-tool.test.mjs:195`; `tests/unit/merge-gate.test.mjs:126,127,131,132,144`; `tests/unit/pick-tests.test.mjs:5,198,210`; `tests/unit/pre-commit-guards.test.mjs:213,301,492,612,624`; `tests/unit/ratchet-merge-hotspot.test.mjs:29,36`; `tests/unit/ratchet-reason.test.mjs:7,26`; `tests/unit/ratchets-fold-schedule.test.mjs:1,19,23`; `tests/unit/ratchets.test.mjs:2,3,9,54,59,145,159,176,188,358,375,395`; `tests/unit/safety-bans-hook.test.mjs:5,55,56,57,58,60,61,62,69,70,71,72,73,74,77`; `tests/unit/shell-ids.test.mjs:20`; `tests/unit/source-pin-hygiene.test.mjs:22,27,47`; `tests/unit/validation-cli.test.mjs:14`; `tests/unit/vm-filename-lint.test.mjs:9,56,58`; `tools/archive/ci/measure-guard-commit.mjs:49`; `tools/check/bloat-scan.mjs:13`; `tools/check/font-digits.py:22`; `tools/check/merge-hygiene.mjs:24`; `tools/check/vm-filename-lint.mjs:18,126,127`; `tools/ci/deploy.mjs:385,412`; `tools/ci/merge-gate.mjs:21,154,180,185,199`; `tools/docs/gen-agent-index.mjs:217`; `tools/hooks/ratchet-reason.mjs:5`; `tools/lib/changed-files.mjs:13`; `tools/manifest.cjs:1567`.

### reject-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/unit/reject-lint.test.mjs:34`.

### scan-globals.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `node:module`, `espree`, `eslint-scope`.

Source references: `.claude/workflows/code-survey.js:103,405`; `tests/unit/global-registry.test.mjs:8,41`; `tests/unit/tools-runnable.test.mjs:332,347`; `tools/gen/gen-slider-doc.mjs:104`; `tools/manifest.cjs:1562`.

### shader-validate.mjs

Dependencies: `node:child_process`, `node:fs`, `node:path`, `node:vm`, `node:url`, `espree`, `../lib/lint-bins.mjs`.

Source references: `.github/workflows/ci.yml:749,769`; `tests/groups.json:888`; `tests/unit/shader-validate.test.mjs:1,17`; `tools/env/install-lint-bins.sh:3`; `tools/environment/environment/validate-shaders.mjs:6`; `tools/environment/environment/verify.sh:15`; `tools/lib/lint-bins.mjs:3`.

### shell-ids.mjs

Dependencies: `node:fs`, `node:path`, `node:url`.

Source references: `.claude/workflows/code-survey.js:112`; `js/camera/flyby-editor.js:477`; `js/camera/free-cam.js:131`; `js/ui/hud-layout.js:1190`; `js/ui/scale.js:136`; `js/ui/survey-hud.js:97`; `js/ui/title-layout.js:211`; `tests/unit/audio-tune.test.mjs:496`; `tests/unit/shell-ids.test.mjs:25,34`; `tools/check/ratchets.mjs:95`.

### skill-routing-eval.py

Dependencies: `stdlib argparse/json/os/re/select/subprocess/sys/time/collections/concurrent.futures/pathlib`, `claude external CLI`.

Source references: `.claude/hooks/skill-hint.py:16`; `tests/groups.json:917`; `tests/unit/skill-routing-eval.test.mjs:1,13`.

### skill-smoke-recipes.json

Dependencies: declarative JSON; skill-smoke.mjs consumes it.

Source references: `tests/unit/skill-progressive.test.mjs:173`; `tools/check/skill-smoke.mjs:44`.

### skill-smoke.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `node:child_process`, `node:util`, `yaml`.

Source references: `tests/unit/skill-smoke.test.mjs:3,24`.

### tolerance-diff.mjs

Dependencies: `node:fs`, `node:path`, `node:child_process`, `node:url`, `../lib/cli-args.mjs`.

Source references: `.github/workflows/ci.yml:533`; `tests/data/tolerance-exceptions.json:2`; `tests/groups.json:1058`; `tests/unit/tolerance-diff.test.mjs:1,9,76`.

### track-oracle.mjs

Dependencies: `node:path`, `node:fs`, `node:url`, `node:module`, `../lib/cli-args.mjs`, `./physics-oracle.mjs`, `../lib/game-vm.cjs`.

Source references: `tests/unit/physics-oracle.test.mjs:3,29`.

### tree-counts.mjs

Dependencies: `node:fs`, `node:path`, `node:module`, `node:url`, `../lib/css-source.mjs`, `./wait-polling-lint.mjs`.

Source references: `.claude/workflows/code-survey.js:112`; `css/career.css:758`; `css/hud.css:1196`; `tests/data/ratchets.json:2`; `tests/unit/css-token-adoption.test.mjs:21,26,71`; `tests/unit/ratchet-merge-hotspot.test.mjs:183`; `tests/unit/ratchets.test.mjs:103`; `tests/unit/tree-counts-catch.test.mjs:3,10`; `tools/check/ratchets.mjs:39,86,87,88,89,90,91,92,93,94,101,922`.

### trim-comments.mjs

Dependencies: `node:fs`, `node:path`, `node:url`.

Source references: `tests/unit/trim-comments.test.mjs:10,12`; `tools/manifest.cjs:1569`.

### twin-fidelity.mjs

Dependencies: `node:fs`, `node:path`, `node:child_process`, `node:url`, `../lib/cli-args.mjs`.

Source references: `tests/data/mutants.json:3`; `tests/unit/agent-config.test.mjs:1012,1015`; `tests/unit/docs-integrity.test.mjs:671`; `tests/unit/twin-fidelity.test.mjs:10,59,121`; `tools/ci/twinned-specs.mjs:379`.

### vm-filename-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`, `./ratchets.mjs`.

Source references: `tests/unit/vm-filename-lint.test.mjs:8`; `tools/check/ratchets.mjs:200`.

### vm-portable.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/data/ratchets.json:2`; `tests/helpers/vm-page.js:50,97`; `tests/unit/agent-config.test.mjs:1012,1015`; `tests/unit/docs-integrity.test.mjs:413`; `tools/ci/twinned-specs.mjs:105,205,212`.

### vstd-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:module`, `node:url`, `../lib/cli-args.mjs`, `../manifest.cjs`.

Source references: `.cursor/rules/game-code.mdc:27`; `js/physics/body-attitude.js:163`; `js/race/wind.js:120`; `tests/unit/game-tools-help.test.mjs:33`; `tests/unit/pace-arming-vm.test.mjs:10`; `tests/unit/tools-a12-guards.test.mjs:32,39`; `tests/unit/vstd-invariant.test.mjs:20,40`; `tests/unit/wait-polling.test.mjs:97`; `tools/manifest.cjs:1566`.

### wait-polling-lint.mjs

Dependencies: `node:fs`, `node:path`, `node:url`, `espree`.

Source references: `tests/unit/tools-a12-guards.test.mjs:109`; `tests/unit/voice-pack.test.mjs:901`; `tests/unit/wait-polling.test.mjs:26`; `tools/check/tree-counts.mjs:85`; `tools/manifest.cjs:1565`; `tools/shot/agent.mjs:247`; `tools/shot/apex-capture.mjs:428`; `tools/shot/apex-eval.mjs:154`.

### workflow-lint.mjs

Dependencies: `node:child_process`, `node:fs`, `node:path`, `node:url`, `../lib/lint-bins.mjs`.

Source references: `.github/actionlint.yaml:1`; `.github/workflows/ci.yml:749,767`; `.github/zizmor.yml:1`; `tests/groups.json:1248`; `tests/unit/workflow-lint.test.mjs:1,16,105`; `tools/env/install-lint-bins.sh:3`; `tools/environment/environment/verify.sh:14`; `tools/lib/lint-bins.mjs:3`.

## Verification and continuation

Source/read coverage: complete for all56 tracked files at the listed hashes. Import/caller evidence: source references, with dynamic loading caveats above. Runtime/static-audit outcomes: not run by instruction. No source fixes, generated files, tests, ratchet fragments, external messages, workflows or commits were made. Only this documentation artifact was written. Parent should run the authorized docs integrity/config checks after all documentation edits are finished; any subsequent source change requires rehashing affected ledger rows and revisiting the corresponding contract.
