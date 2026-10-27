# Claude surface map — batch 01

Support: claude-01-evidence.json. Complete assigned coverage: 160,000 bytes across 22 source parts, read in 30 individually returned chunks of at most 8,500 bytes. Whole-file plan hashes and separate part/chunk hashes are recorded in support. The last source is deliberately a prefix; its remaining implementation belongs to batch 02.

This is a source contract map. Agent workflows and hook commands were read as data, not invoked. Current AGENTS.md and the Claude configuration area rule were read; neither .claude nor docs has a nested AGENTS.md. No tests, browser, network, runtime, source edits or git mutations were used.

## Registration and routing

Claude Code and Cursor discover the Markdown agent frontmatter in .claude/agents. The README supplies human routing, host-specific readonly/background fields, model tiers and output expectations. Eleven agents split eight readonly reporters, one scoped scratch reporter, and two worktree implementers. Frontmatter tool allowlists and protection hooks constrain capabilities differently across hosts; prose is not proof that every shell write is prevented. Two project memory files are parent-maintained evidence schemas, not independent agent instructions.

Hook registration was checked from .claude/settings.json. Bash and GitHub guards block on host-reported failure; context-cap registration also says block although its own exception handler fails open. Launch-gate lacks onFailure block; advisory/post-tool hooks remain nonblocking. live-run and foreign_push are helpers, not direct settings registrations.

## Agent contracts

| Surface | Trigger / inputs | Output / consumers | Limits |
|---|---|---|---|
| .claude/agents/agent-surface-reviewer.md | Edited skill/agent/hook/rule section; unit, task hint, scratch report path, optional retest | ≤60-line report and VERDICT/GAP1/GAP2 hand-back; parent session consumes | Only scratch Markdown report; no browser, tests or web; retest independently before old report |
| .claude/agents/bloat-auditor.md | One assigned scope and rejected-finding memory | ≤8 BLOAT rows plus COVERED; estimated removal cost and do-not rule; parent session consumes | Read-only; parent carves; no browser/web; rejection valid only at reviewed SHA |
| .claude/agents/ci-red-triage.md | Current red Actions run URL/id/SHA; resolve current heads if omitted | SHA/run/train/red, test/assertion/lane, base status, next action, located log evidence; parent session consumes | Read-only remote triage; no local rerun; distinguish Pages nested jobs and draft/full tiers |
| .claude/agents/code-hunter.md | One slice, focus and scout known list | ≤12 FINDING rows plus covered/not covered/measured; parent session consumes | Read-only; binding-aware tracing; bounded node checks; no browser; known items excluded |
| .claude/agents/deploy-research.md | Deploy liveness, changed markers, byte hashes or public research | OK/STALE-IN-TRAIN/STALE/MISMATCH/UNKNOWN and cited evidence/unverified list; parent session consumes | Read-only public bytes; SHA ancestry decides liveness; build number is evidence only; no local browser |
| .claude/agents/finding-verifier.md | Up to 15 file:line claims and optional original SHA | CLAIM statuses CONFIRMED/STALE/REFUTED/NEEDS-BROWSER/UNREAD plus tally; parent session consumes | Current-tree adversarial check; never fixes or adds findings; moved line alone is not stale |
| .claude/agents/physics-contract-auditor.md | Physics/curvature scope; optional speed-comparison scope | ≤30 SITE classifications, invariant/gate verdicts and coverage; parent session consumes | Read-only; approved column table first; node gates only; rendered uncertainty remains unverified |
| .claude/agents/prior-art-scout.md | Slice/topic before hunt or audit | ≤30 KNOWN rows, source statuses, sources read/not read; parent session consumes | Read-only local history/text; does not decide current truth; shallow-history gaps explicit |
| .claude/agents/track-surveyor.md | One circuit id, source pair, numerical baseline and parent captures | Branch/worktree, source/year, before/after measurements, deltas and required parent captures; parent session consumes | Worktree; edits assigned def/scenery pair only; node CLIs; commit without push; parent browser signoff |
| .claude/agents/verify-agent.md | Changed-tree plan, optional --base ref and frozen paths | Verbatim fast JSON, failed-phase logs, notRun batches, optional DELTA; parent session consumes | Read-only except artifacts/owned baseline worktree; no browser/--wait; no-op is not verification |
| .claude/agents/worker.md | Goal, OWNED/FORBIDDEN paths, verify command, peers, push ownership | WORKER status, branch/SHA/worktree, changed/verified/not run/next; parent session consumes | Worktree implementation; explicit tools; node verification; parent owns merge/readiness/local browser |

| Memory / index | Contract |
|---|---|
| .claude/agents/README.md | Routing and dual-host frontmatter guide; model/maxTurns/project-memory expectations are described as test-pinned. |
| .claude/agent-memory/bloat-auditor/MEMORY.md | Rejected carve plus reviewed full SHA; suppress only while reviewed code is unchanged. |
| .claude/agent-memory/verify-agent/MEMORY.md | Known-red spec, SHA and reason; stale baseline entries require re-verification. |

## Hook and helper contracts

| Surface | Registration / inputs | Outputs / consumers | Boundaries |
|---|---|---|---|
| .claude/hooks/bash-guard.sh | PreToolUse Bash (360s, onFailure block); Hook stdin command/agent metadata, cwd/index/worktree, environment overrides | Exit 2 refusals; JSON permission decisions/additionalContext; commit logs, ratchet staging and guard cache | Parsed shell safety, pushes/API/merge/cancel, subagent browser ban and commit gate; malformed parse uses conservative fallback; some remote checks warn/fail open |
| .claude/hooks/context-cap.py | UserPromptSubmit; all PostToolUse; PreToolUse Agent/create_session (5s); Transcript newest main assistant usage; first user brief STOP AT; env cap/hatch | Once-per-level advisory under artifacts/ctx-cap; hard-cap spawn deny JSON | Soft brief/env cap, default hard=soft+50k; successor create_session allowed; internal exceptions fail open |
| .claude/hooks/foreign_push.py | Helper imported by shellparse push guard; optional CLI; Repo, remote, branch; tracking reflog; live remote tip; author/session identity | Refusal stderr/exit2 or allow; temporary private fetch ref cleaned | Baseline last update-by-push, first-parent foreign commits; first push and queue-state branch exemption; remote errors warn/allow |
| .claude/hooks/github-mcp-guard.sh | PreToolUse matching GitHub merge/update/action/file tools (10s, onFailure block); Hook JSON or Cursor bare tool/string tool_input; receipt/environment | PreToolUse ask/deny JSON; unrelated operations silent | Denies squash/rebase and direct file writes; ready needs receipt; cancellation denied absent override; dispatch/log deletion/rerun policy |
| .claude/hooks/launch-gate.py | PreToolUse create_session (5s); Tool payload outcome_branch; artifacts/launch-gate/receipt.json | Deny JSON on absent/bad/stale receipt or deploy outcome branch | Receipt kind launch, page SHA256, ok, timestamp max120s and future tolerance60s; own errors fail open |
| .claude/hooks/launch-page.py | PostToolUse get_session (10s); Tool response JSON/string, requesting/calling session ids | Atomic artifacts/launch/self.json with writer/time/content hash/response | No stdout; errors stderr/fail open; implementation records requested_session but does not enforce header self-only claim |
| .claude/hooks/live-run.py | CLI helper consumed by session-start.sh and stop-guard.sh; Checkout root; /proc cmdline/cwd/stat; test-bg registry | First live pid:starttime plus log or dash; empty when absent | Excludes shell wrappers and --list; scoped to checkout; registry log selected separately from matched process |
| .claude/hooks/lsp-hint.py | PostToolUse Grep/Bash (5s); Search symbol/pattern/path and environment; assigned prefix only | Documented additionalContext LSP suggestion (later implementation outside this batch) | Assigned bytes define symbol regex, non-JS exclusions, builtins, option sets and outside_js; remainder belongs next batch |

## Dependency paths

The scout feeds known items to code-hunter; finding-verifier adjudicates hunt/audit rows before parent edits. Bloat-auditor hands carves to the parent workflow. verify-agent returns fast-gate coverage, preserving unrun browser batches; deploy-research separately establishes published provenance. track-surveyor and worker return branch/worktree evidence for parent integration. Their declared runtime CLI dependencies are contracts only, not validation of those CLIs.

Bash guard normalizes through shellparse.py and shares merge_policy.py with the GitHub MCP guard. The parser calls foreign_push.check; its remote reads can warn and allow. Commit processing can link dependencies, unmark memory, raise/stage small ratchet changes, lock/cache guard verdicts and write artifacts before returning context. These side effects make it more than a simple allow/deny filter. launch-page writes the response envelope, launch-gate.mjs creates a receipt, and launch-gate.py checks the receipt before session creation. Context-cap reads transcript usage and writes per-level markers. session-start and stop-guard call live-run for checkout-scoped browser activity.

## Comment cleanup candidates and limits

- Bash guard contains a long incident-history preamble and repeated dated explanations. Extracting narrative while retaining concise invariants, parser fallback reasons, timeout semantics and override provenance is a possible cleanup; do not delete bug-explaining comments without proving their guards remain understandable. Its opening merge/ready summary still describes older ask/receipt behavior alongside the current no-session-merge statement: reconcile against shared policy before trimming.
- Several agent files repeat cap-loss incident narratives and the same final prohibition paragraph. A shared reference could reduce duplication, but retain each output schema, delivery deadline, denial behavior and scope-specific exception. Agent loading may omit shared project prose, so removal requires checking host loading behavior.
- launch-page header says only the calling session is recorded; the implementation records requested_session and response without that filter. Treat this as a documentation/implementation mismatch requiring downstream gate inspection before deciding which side to change.
- README claims about reporter Bash writes and flat prohibition enforcement deserve reconciliation with protect-files reporter-specific scope. Preserve the distinction between a live-run write ban and standing agent readonly capability.
- lsp-hint header and constants describe advisory behavior, but this batch ends mid-symbol_of. No conclusion about its full parser/output/error paths is supported by the assigned prefix.

No cleanup was applied. Hook/settings modifications require the explicit grant described by the current area rule. Historical or missing raw references are confined to the evidence JSON.
