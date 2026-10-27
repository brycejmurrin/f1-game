# Auxiliary map 01 — host configuration, team plugin and body review kit

This batch covers 62 assigned parts: 54 text parts read in 63 individually returned chunks of at most 8,500 bytes, plus eight JPEGs inspected through hashes and header metadata. The last measurement utility contributes only its assigned 358-byte prefix; the remainder belongs to the next batch. auxiliary-01-evidence.json records whole-source hashes separately from part and chunk hashes, half-open ranges, per-file semantics, binary provenance, supporting reads and limitations.

## Host configuration and guard flow

Codex configuration and Cursor MCP configuration declare the same six servers, routed through the output-level wrapper into repository shell entrypoints. The tool server receives a long verification timeout (900 seconds in Codex, 900,000 milliseconds in Cursor). Browser/debugger/LSP wrappers have their own startup or call budgets. BrowserStack credentials are environment inputs, with no credential values stored in the configuration. Cursor cloud environment configuration selects the install script and permits six named command patterns; optional browser-use has its separate plugin allowlist. These declarations do not establish that a host has registered, trusted or attached them.

Codex hook configuration dispatches Bash and selected GitHub MCP operations. Its shell adapter delegates to the Cursor shared shell adapter; its MCP adapter delegates directly to the shared GitHub guard. Both validate shared JSON and turn an unsupported ask into deny. A successful silent result passes. The shell adapter also preserves advice-only additionalContext output. Malformed output or delegate failure denies. These adapters emit host-specific JSON; host trust and actual invocation remain unverified.

Cursor hook configuration installs fail-closed shell, edit and MCP doors. The shell adapter normalizes flat and nested payloads, uses the requested working directory, avoids duplicate commit checks when Git hooks own that gate, then runs the Bash guard and file-protection guard. It collects stderr in an EXIT-cleaned temporary file. Its MCP adapter translates shared decisions into Cursor permissions and messages.

The edit adapter runs for all tool names and filters internally. Enumerated reads, Shell and MCP-prefixed tools pass through. Other path/body/edit shapes normalize to shared Write/Edit/MultiEdit. Deletion becomes a quoted removal command. Missing readable paths or malformed payloads deny. Unknown write bodies still receive path-only protection, while ratchet writes without readable content deny. This is a conservative adapter contract rather than a proof that every future host tool schema is recognized.

Git hooks provide a separate path once package prepare activates the hooks directory. Pre-commit checks dependencies and actual staged content, chooses docs-only versus full guards, verifies index/worktree equivalence except memory, consults the staged-tree verdict cache, and optionally bounds the guard suite. Ratchet auto-raise snapshots the before/after files and stages only changed generated outputs; incompatible partial/custom indexes and untracked ratchet inputs refuse. Consequently committing can change ratchet files and the index as well as write logs. Tree checks after verification prevent a changed index from borrowing a verdict. Pre-push reads ref tuples and refuses deploy-branch writes, deletion, absent remote ancestors and history rewriting, with the exact rolling timings bot exception in Actions.

Consumers found through configuration/text references include cross-tool-guards fixtures, pre-commit-guards fixtures, package prepare and agent-config mirror checks. These tests were inspected or located only; none ran.

## Rules and review surface

The always-applied Cursor entry routes back to root rules, shared skills and agent sources. The seven scoped twins cover CI tools, shared agent configuration, game coding, JS navigation, TLX, WGX and browser specs. Their generated markers identify the canonical source; the rule generator and package gen/gen:check own updates. Cursor frontmatter applies the path scopes, while agent-config checks enforce synchronization. They describe developer workflow and verification obligations; they do not form game runtime modules.

Bugbot configuration requests incremental draft/every-push review, branch-based autofix and comment summaries. Its prose review contract distinguishes hard contract violations from explicitly unrun evidence, with measured numbers or named commands for hot-path changes.

## Local team plugin

The local Cursor plugin packages identity/version/license metadata, seven skills, one requested lane rule and two commands. There is no executable MCP server in this manifest. Manual copy or symlink plus reload is the documented discovery mechanism; the README installation claim was not independently verified.

The status command routes to the open-PR/checks matrix skill; the insights command routes to transcript/survey digest authoring. The remaining skills describe cloud launch prerequisites, specialty handoffs, garage ownership boundaries, systematic screenshot capture and CI/Pages/live-site observation. Their potential side effects include creating local reports, launching or steering external agents, writing status messages and triggering workflows when separately invoked with authorization. None was invoked during this audit. Packaged skills refer back to canonical repository coordination; historical issue numbers, environment/workflow identifiers, freeze language and caps deserve revalidation before reuse.

## Concept-body authoring pipeline

The review kit is an offline authoring surface. The envelope report loads actual runtime car modules through the parts-sweep VM loader and dimension helper, excludes NEW styles from the shipped population, computes rounded interpolated quartiles and compares registered new rows with the lower of current p75 and frozen limits. The lowerEnvelope helper rejects missing/nonfinite counterparts for current keys. Overage is report data; the report itself does not explicitly exit red on an overage.

The fit probe patches process-global file reads to expose section ranges in loaded car source. ROUND truthiness selects shaded geometry. Its build function uses a team's factory visual tiers and requested body style in measurement mode. Axis ray casts intersect projected triangles with barycentric tolerances, map hits to part ranges, round to four decimals and deduplicate crossings. The file-read patch persists for the process and relies on an exact source-text replacement. The assigned measure prefix imports these bindings and starts a millimetre-rounding helper; this batch cannot describe its later dimension implementation.

The fit-diff CLI reads audit JSON and optional baseline JSON, groups unordered part pairs by check/team, and labels new failures beyond check threshold plus noise or worse baseline values/counts. Count regressions require at least 25 percent and three additional hits. It prints totals and a bounded sample, assumes team baselines exist and does not turn reported findings into a failing exit status.

The identity CLI hashes positions, colors and indices for square/rounded, normal/field factory and selected body builds. SKIP controls exclusions. HEAD_REF replaces JS reads through git show with silent working-tree fallback on failure; the reference is interpolated into a shell command, so it is a trusted-author input. The CLI prints a signature for an external comparison rather than comparing or enforcing one itself.

The gallery builder reads envelope data and JPEGs, applies the same ceiling helper and writes one static HTML gallery. Environment inputs choose images, round, revision and supplied fit/side/status text. Images are embedded; typography refers to an external font stylesheet. Interpolated inputs are unescaped authoring data. The comparison-image CLI uses sharp to stack fixed reference crops and optional shot crops; it validates lexical and canonical output directories, rejects symlink outputs and prevents source overwrite through realpath/inode checks. Inputs are relative to the caller's working directory, while output resolves against the repository root.

LSP located the runtime builder, visual-tier function and team list. The builder definition/references result explicitly used a module-file fallback and did not establish auxiliary caller coverage. Fully read authoring scripts plus the inspected VM loader span establish those calls. Text references identify the frozen-envelope and comparison-output unit-test consumers.

## Captured evidence and cleanup limits

Historical menu findings describe viewport/scroll clipping and screenshot coverage; they are historical observations rather than reproduced current defects. Eight paired night captures have matching JSON receipts with requested frame/browser data, observed software TLX/WebGPU soft blit, healthy renderer markers and scene-content classification. All eight report zero GPU errors. Lamp glow counts rise from 12 to 16, 12 to 13, 13 to 13 and 5 to 9 across the four track pairs. These receipts lack source commit identification and newer source/version/frame fields. One after-image is 1,152 by 648 while its before-image is 1,280 by 720 despite equal requested viewports. No image pixels were reviewed, and no visual or performance comparison is claimed.

Cleanup candidates are comment/documentation alignment: the Cursor MCP header still describes person-confirmed merges; the root hook summary and pre-push header imply hosts never load adapters despite tracked wiring; prototype comments/gallery footer retain earlier locations; packaged runbooks contain dated operational assumptions. Change canonical rule sources and regenerate twins when needed. Raw historical, archived, external-machine and unresolved paths are retained only in auxiliary-01-evidence.json. No cleanup was performed.

No tests, browser, network, game runtime, source edits, staging or commits were performed. This map and auxiliary-01-evidence.json are the only outputs from this assignment.
