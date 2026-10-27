# Claude configuration and workflows — batch 03

This maps all 160,000 assigned bytes: 43 half-open TEXT spans, read in 50 individually returned chunks of at most 8,000 source bytes. `claude-03-evidence.json` records the plan digest, whole-file digests, assigned-part digests, chunk digests/ranges, source-line anchors, registration data, raw reference inventory and scope limits. Every whole-file digest matches its plan entry. The assigned boundary starts inside the shell parser's Git-write helper and ends inside the audio diagnosis layer table; neither neighboring span is claimed read.

This is a static source map. Audited instructions were treated as data. No tests, browser, network, runtime probes, staging or commits were performed. The root `AGENTS.md` was read; no nested `AGENTS.md` was found under `.claude` or `docs`. Supporting filenames below are navigation references, rather than claims of full reads.

## Entry points and consumers

`.claude/settings.json` is the host registration surface. Claude Code consumes its permissions, disabled plugins, environment, MCP server list and hook events. It enables auto memory, selects current HEAD for newly created worktrees and enables six project MCP servers. Broad Bash/tool allowances coexist with explicit denies for force/deploy pushes, asset baking, selected GitHub mutations and overlapping plugin workflows. This configuration does not establish that Codex runs Claude hooks; the root instructions expressly distinguish that host behavior.

The hook graph is:

| Event / matcher | Target | Timeout / failure contract |
|---|---|---|
| SessionStart / all | `session-start.sh` | 300s |
| PreToolUse / file editors | `protect-files.sh` | 30s, block on failure |
| PreToolUse / Bash | `bash-guard.sh`, `protect-files.sh` | 360s / 30s, block on failure |
| PreToolUse / selected browser MCP calls | `mcp-browser-guard.sh` | 10s, block on failure |
| PreToolUse / selected GitHub mutation calls | `github-mcp-guard.sh` | 10s, block on failure |
| PreToolUse / SubagentHandback | `subagent-contract.py` | 10s, block on failure; implementation advisory and fail open |
| PreToolUse / Agent or remote create_session | `context-cap.py` | 5s, block on failure |
| PreToolUse / remote create_session | `launch-gate.py` | 5s |
| PostToolUse / remote get_session | `launch-page.py` | 10s |
| PostToolUse / Grep or Bash | `lsp-hint.py` | 5s |
| PostToolUse / Write, Edit, MultiEdit | `post-edit.sh`, `memory-sync.sh save` | 90s / 10s |
| PostToolUse / all | `context-cap.py` | 5s |
| Stop / all | `stop-guard.sh`, `memory-sync.sh save` | 10s each |
| UserPromptSubmit / all | `skill-hint.py`, `ui-fixer-uncommitted.sh`, `context-cap.py` | 5s each |
| SubagentStop / seven named reporters | `subagent-contract.py` | 10s |

The complete matchers and permissions are preserved as structured JSON evidence. The table maps registration, without claiming the out-of-batch hook implementations were read.

## Hook implementation contracts

| Source and anchors | Inputs → output / consumer | Dependencies and limits |
|---|---|---|
| `shellparse.py`, assigned lines 1720–2075 | Parsed shell commands and cwd → absolute write-target records; CLI dispatch emits mode-specific JSON or agent-run leaves. `protect-files.py:441` imports `write_targets`; `bash-guard.sh:126,315` invokes other parser modes. | Earlier parser/tokenizer definitions are outside this span. The tail covers Git output/restore classification, sed scripts and write commands, curl output flags and CLI dispatch. |
| `skill-hint.py:53,58,81,104` | Prompt/event JSON → at most two skill names and a routing sentence on stdout; host adds prompt context. | First 4096 chars of each SKILL frontmatter, description/when_to_use and IDF overlap; threshold 4.5. Pinned phone verbs route check/ship/handoff. Blank/slash/system-envelope prompts are skipped. targeted/default, generic and off modes; errors silently allow. |
| `stop-guard.sh:18` | Stop JSON plus live-run helper → one stderr nudge, exit 2, then a stamp permits subsequent stop. | Current-checkout live browser run only; active stop continuation and allow-stop hatch pass. Writes a hashed-identity stamp under artifacts. It does not obtain a test verdict itself. |
| `subagent-contract.py:34,81,91,117,133` | Reporter identity and final message/handback → malformed report returned to agent with block/deny JSON. | Mirrored card contracts, row shapes/caps and required lines; unknown/empty/bad input and internal failures allow. Stop recursion is bypassed; handback uses a once-per-agent stamp. UNREAD skips required lines, preserving row-shape/cap checks. |
| `ui-fixer-uncommitted.sh:7` | Branch, tracked diff, last commit time → advisory WIP sentence and debounced stamp. | Only cursor branches; excludes memory/artifacts; default age greater than one hour, 30-minute debounce. The name suggests UI, but implementation checks any qualifying diff. |

`write_targets` recognizes redirects, sed/perl in-place edits, sed write commands, tee, copy/move/install/rsync/link destinations, truncate, dd, deletion operands, awk inplace, npm package edits, Git output/path restores and curl outputs. Records carry a kind and sometimes source/cwd/simulation argv. The simulation argv is data; this mapping did not execute it. Sed script-file reads and merge-state inspection make this more than a pure string parser. Conflict-side or selected committed-source restores receive a distinct Git resolution kind, which downstream protection treats differently while preserving live-run and scope restrictions.

The reporter contract table checks code-hunter FINDING rows (12), finding-verifier CLAIM rows (15), prior-art-scout KNOWN rows (30), agent-surface-reviewer VERDICT (1), bloat-auditor BLOAT (8), physics-contract-auditor SITE (30), plus ci-red-triage red/base/next lines. Agent cards are the other half of that interface; unit pins named in the source protect agreement. A mapping discrepancy is visible for the surface reviewer: its row pattern accepts `VERDICT:` but its required-line pattern requires `VERDICT `.

## Memory transport and topic map

`MEMORY.md` is an index, not a second coordination rulebook. Its text assigns preference/correction scope, routes lessons to notes and enforceable rules to hooks/tests, and tells readers to retire stale contradictions. `memory-sync.sh` supplies cloud auto-memory transport through settings; `apex-memory.mjs` exposes list/show/retire, with the index and topic files as its store. Transport internals are outside this batch.

Each topic file has frontmatter with a name/description and dated user evidence. The entire assigned topic set is:

| Topic filename | Contract carried to readers |
|---|---|
| `ask-via-askuserquestion.md` | Explain choices for attended decisions; unattended workers use needs-decision; preference does not create an approval requirement. |
| `bryce-iphone-tlx-webgpu.md` | Owner's iPhone setup uses explicit TLX WebGPU; distinguish that from AUTO/WebKit selection. |
| `design-lanes-living-artifact.md` | Iterate one gallery URL with stable design IDs and round history. |
| `fan-out-with-subagents.md` | Dated preference to split independent fleet work into isolated worker tasks within load limits. |
| `one-subagent-per-skill.md` | Skill review walkthroughs have individual reviewers within host concurrency/delegation limits. |
| `parallel-survey-and-review.md` | Parent survey and bounded read-only review may proceed together; plan becomes a notes document. |
| `preview-must-look-different.md` | Visual design variants need visible image differences and useful close-up framing. |
| `rules-are-agent-written-drafts.md` | Agent-authored instructions are revisable at their canonical home; later user words govern. |
| `small-steps-for-api-analysis.md` | Inspect available data and query narrowly in visible increments. |
| `survey-then-fix.md` | Surveys should yield concrete, independently landable work. |
| `synced-plugins-not-in-child-sessions.md` | Dated inheritance limitation is followed by later non-reproduction; discover availability per session. |
| `train-ratchet-standing-ok.md` | Narrow dated grant for small tree-ratchet increases caused only by train combinations. |
| `user-plays-on-phone.md` | Reproduce UI reports with phone landscape/touch as the primary cell. |
| `user-timezone-pacific.md` | Owner-facing schedules and times use Pacific. |

These are mapped historical user-context records; they were not used to expand this mapping task into deployment, delegation, surveys or edits.

## Scoped rule surfaces

| Source | Frontmatter scope | Guidance / dependency boundary |
|---|---|---|
| `ci-tools.md` | CI tools and GitHub workflow files | Canonical coordination/merge policy, sync wrapper, CI-none interpretation. |
| `claude-config.md` | `.claude/**` | Hook/settings authorization, memory PR scope, mirrors, single rule homes, hook inventory and escape hatches. |
| `game-code.md` | JS/CSS/static shell/service worker | IIFE/load manifest, generated outputs/cache staging, ratchets, coordinate/curvature conventions, logging and physics boundaries. |
| `js-nav.md` | JS | LSP navigation/diagnostics, global impact queries, factory/alias/HTML caveats and bounded textual checks. |
| `render-tlx.md` | Three backend | Default/explicit backend and force-GL selection; opaque canvas; software vs hardware evidence, census and path labels. |
| `render-wgx.md` | WebGPU backend | Opt-in/fallback/software presentation, WGSL/pipeline validation, device listeners/private-memory restrictions and positive boot evidence. |
| `tests-specs.md` | Browser specs | Single serialized parent-owned browser run; official stop/verdict protocol. |

These files are path-scoped instructions, not runtime configuration modules. Their supporting CLI/test/workflow paths are captured in JSON. Renderer rules specify evidence procedures; no such evidence was produced by this task.

## Skill routing and progressive references

`skills/README.md` explains host discovery through descriptions or slash invocation, separates workflow from CLI ownership, and catalogs all workflow triggers. It requires references to expose input/procedure/verification/write ownership and warns that folded skills remain reachable only when the receiving description absorbs trigger vocabulary. Its smoke plan/check is explicitly offline contract evidence. Historical folded/deleted surfaces are retained only in the JSON inventory.

The assigned skill families are:

| Skill | Trigger and inputs | Outputs / ownership / consumers |
|---|---|---|
| `agent-config` | Agent instructions, descriptions, hook/agent config, routing or budget changes | Canonical edits with mirror/catalog/routing-query/smoke-recipe registration. Tests own live aggregate budgets; description cap 1024 chars, body below 500 lines. New queries include at least five hits and three near misses. Routing A/B spends model calls; body-only changes skip that experiment. |
| `agent-view` | Numeric world/field/telemetry/geometry, track+seed+staged API input | Read-only inspection or simulation episodes; structured state, digest, typed errors and optional rasters. Geometry fixes route to authoring workflows. VM handles numeric work; browser owns last-drawn/raster evidence. |
| `ai-racecraft` | Overtake/brake/ERS/lane/stuck behavior, track/seed/difficulty/car timers | AI-only behavior investigation/tuning, edit-specific VM/unit recipes and field instruments. Game update owns traffic scan, seeded rolls and integration; rules remain allocation-conscious and preserve same-tick ordering. |
| `asset-pack` | Pack load/upload/MAT/scale/backend material state or local interchange work | Offline validation, traced mismatch, browser blend A/B or exact bake handoff. Settings deny agent baking; loader and all render backends share MAT contract. Lighting and general render failures have separate routes. |
| `audio-debug` | Silence, first tap, device rebuild, engine pitch, bus/gear/music faults | Independent master/SFX/music diagnosis; source ownership table and focused smoke/offline recipes. Pitch probe launches Chromium; gear cue belongs GameAudio, not CarSfx. |

`agent-config` consumes the surface-reviewer report and relies on `agent-config.test.mjs`, `agent-surface.test.mjs`, `skill-progressive.test.mjs`, `mirror-skills.sh`, the smoke recipe catalog and routing query files. Their references are interface edges, not executed checks.

`agent-view` has four fully assigned references:

- `surface.md` is the API/staging/determinism contract: dynamic world/field, static track/car, scene radius and track-side semantics, typed failures, and seeded episode lifecycle. Rollout receives brief state, clamps intervals to 120 seconds and continues after terminal transitions; pedals are booleans and low-speed braking reverses. The starter policy is an example, not a portable lap guarantee.
- `state.md` distinguishes placement-dependent state, metre field gaps versus timing intervals, lap-one split initialization and Time Trial versus race lap history. Seed/start/policy/terminal metadata qualify numeric results.
- `track-geometry.md` distinguishes official turns from curvature peaks, racing from shifted authoring fractions, banked-road overRoad from the misleading raw gap, and sampled road grade from real-world elevation claims.
- `debug-tracks-sweeps.md` supplies narrow and multi-track VM recipes, half-width/barrier comparisons and optional parent captures. VM resources close in finally; scripts live in scratch; generated measurements replace stale examples.

The three `ai-racecraft` references separate scripted/catchup pace, stuck/dig-out/rescue timers, and pass/defend tactics. A caution level of zero with growing stuckT routes here; nonzero caution routes race control. Pit tests require wear enabled. Kerb drag and rescue qualification differ. Field dwell, stuck episodes and rescue teleports are separate instrument outputs. Permanent circuits and streets deliberately follow different tactic gates; RNG placement and human-pair curvature exclusion are preserved boundaries.

The `asset-pack` workflow maps the 17-slot MAT lockstep among geometry, generator, loader, manifest and shader allocation. It checks uploaded scales before changing textures; offline verification covers allowlisted licenses, hashes, PNG shape, tier consistency and total 8MB budget. Browser A/B requires supported/uploaded true. The one-backend trace follows layer interpolation, sampling state, pixel readback, then bake data. FLAT/GLASS/FLAG are no-bake slots; array pixel colors and decal flip behavior are separate paths.

The assigned `audio-debug` diagnosis prefix covers the contents and layer table through the opening brake row. It describes sample/synth engine paths, per-gear pitch distinction, gravel, limiter/top-gear fade, turbo/wastegate and ERS layers. The remainder of that reference, including the named diagnosis procedures, is outside this batch.

## Runtime symbol corroboration and cleanup limits

Read-only LSP queries corroborated the runtime endpoints named by the workflows:

| Symbol | Binding / consumer evidence |
|---|---|
| AiDrive | Definition at `js/physics/ai-drive.js:2`; 146 references across eight files, dominated by game update (108) and pit lane (23). |
| GameAudio | Definitions in engine and lazy stub; shift references include three game uses. LSP explicitly reports text-match/global reinjection ambiguity, so binding alone does not prove runtime winner. |
| Assets | Definition in shared asset loader; window alias exported at line 1011. |
| ApexApi / __apex | API factory in `js/agent/apex.js:2`; game boot assigns its created facade and teardown clears the global. |

These calls validate navigation edges; they do not establish live behavior or GPU/audio output.

Potential comment cleanup is confined to observed text: the stop hook's opening header describes an older log-name stamp while its newer comment/implementation use helper identity; the contract table retains a deleted-agent historical comment; memory keeps a superseded plugin-inheritance report alongside its re-verification; example timing/policy numbers carry dated qualifications. The asset skill says optional pack while linking the canonical ships-on facts. Preserve the operative input/ownership/error caveats when trimming. No cleanup was applied.
