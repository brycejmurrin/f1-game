# Historical snapshot group 04

Read all 66 assigned novel spans (160,000 bytes) in 24 bounded raw batches. snapshot-04-evidence.json holds the exact file identities, half-open offsets, whole/part/chunk hashes, path registry, and read ledger. Whole-file identity hashes do not assert whole-file reading. Equal blocks inherit only matching canonical full-source evidence after its scope closes.

The current root instructions governed this audit. Restored instructions and test comments are historical data. No tests, application execution, browser, network, staging or commits were performed.

| ID | Historical contract and current comparison |
|---|---|
| F01 | Transcript digest tests distinguish missing usage from zero, host vs inferred triggers, duplicate requests/copies and sidechains; low-tool wakes are a proxy, never billing evidence. Canonical file absent. |
| F02 | Historic import exposes makeFlags/parseFlags/exitIfHelp/CliArgError; current also imports strictFlags and git-run helpers. |
| F03 | Historic role-table default worker soft/hard caps 150k/200k, STOP AT/env precedence, once-per-level advisory, spawn deny with successor handoff exemption, fail-open malformed input and settings wiring. Current retires role-table defaults: only explicit brief/env caps. |
| F04 | Historic arbitrary environment placeholder forwarding, stdio/http MCP configuration and masked launch logs. Current adds environment/host allowlists and logs forwarded names/references without values; historical acceptance is not a safe current forwarding contract. |
| F05 | Historic immediate intro when no daily or records already hydrated; current adds OPEN-class daily exemption. |
| F06 | Historic bitmap decoder fixture was outside lazy list; current stamps it alongside other lazy workers. |
| F07 | Historic prose-only classifier names a coordination note; current relocates that note. Other current additions lie beyond assigned spans. |
| F08 | Historic fictional-path allowlist belongs to fleet-owner test fixtures, not real files. Current substitutes landing-gate fixtures and adds CI-planner fixture exceptions. |
| F09 | RaceFacts feeds RaceRadio onEvents into EventJournal. Fresh field resets log; first tick preserves start/caution. CAP 256 FIFO, chronological pass/retire/fastest/caution, penalty/wheel-lock/contact/pile-up edges without mutating cars. Canonical test absent; registry deltas also remove EventJournal. |
| F10 | Historic live-run reference points to verify-change; current names live-run-check, where that imported behavior resides. |
| F11 | Historic exact-suite title/spec uniqueness and one row per spec; current permits root tests and multiple policies per spec keyed by title, requires anchored failure signatures for newer rows. |
| F12 | Archive only agent-created idle eligible roles with every named PR done; preserve no-archive/in-flight work. Retired orchestrator requires different LIVE successor and idle threshold. merge-done requires two-parent PR merge and dedupes PR/sha. Canonical test absent. |
| F13 | Fixture dashboard composes PR/CI/fleet, live claims, deploy, bus and derived GAME-SLOT/DONE datasets; Pacific timestamps; source failures isolate empty affected datasets. Canonical test absent. |
| F14 | Derived issue ownership from live claims/open closing PRs, two-hour claim expiry, explicit partial scope guards; references show progress without ownership. Paginated coverage refuses incomplete evidence; bounded gateway retry. Canonical test absent. |
| F15 | Queue/board/bus handoff fits 2048 JSON bytes and 40 Markdown lines; drops bus then board/text/lanes while retaining trigger IDs and warning about omissions. Canonical test absent. |
| F16 | Only PR-addressed messages become comments; per-sha dedupe, one lookup per PR, skip closed/merged/non-PR and cursorless old rows; dry mode sends nothing and failures surface. Canonical test absent. |
| F17 | Git CAS lease race, expiry/renew/release and user-granted break; validated send addresses but permissive historic parsing. Typed 20–600 protocol bodies, LEND merger letter, ready receipt tied to PR/head, idempotency and strict at-least-once cursor; authoritative ROTATE/self LIVE and own-line liveness (45 min). DONE dedupe crosses senders; READY is per sender/head. Watch starts at tip, filters chatter, retries read errors. Canonical test absent. |
| F18 | Session metadata flags model drift, cost/context caps, stale working/disconnected sessions; context-window suffix ignored and explicit cost wins metadata. Canonical test absent. |
| F19 | Open PR diff HELD outranks live CLAIMED; glob/session parsing and generated-output exemption; release request lapse never releases open diff. Paginated incomplete/capped API evidence fails closed; head+base caching and batched first pages. Canonical test absent. |
| F20 | Committed PR rows serialize sorted, merge defined fields only, validate state and live owner/next, reassign all old-owner rows; injected in-memory CLI tests. Canonical test absent. |
| F21 | Compact board state diffs surface changed/new/gone rows and new session flags; bounded first baseline, separate ship/Pages verdicts, escaped sorted summary table. Canonical test absent. |
| F22 | Historic freeze harness omits raceRestarting; current explicitly sets false, aligning restart-aware render state. |
| F23 | Historic expected globals and reference counts include EventJournal twice; current removes it. |
| F24 | Historic handback emits SWEEP/DONE/checkin cleanup only after green CI/gate; post-merge verifies two parents then releases claim and prints trigger cleanup. Canonical test absent. |
| F25 | Historic saved rate-limit page and receipt rely on allowed/warning override/age; current binds receipt to page SHA/timestamp and lane/PR, rejects deploy outcome branch. |
| F26 | Quota→revision→twin→CAS claim order before receipt/launch JSON; warning needs quote, rejection never overridden; saved page max age 120s; full sha or branch, orchestrator deploy-source requirement. Tags identify fleet/lane/role/PR; holder-only tombstone release preserves claim history. Canonical test absent. |
| F27 | Historic harness counts rect/style only and returns no modal elements; current counts queries and models pause layer for top() memo invalidation tests. |
| F28 | Historic race render lowers wait plate unconditionally; current excludes raceRestarting. |
| F29 | Merge trailers identify actor/fleet/role/head (unknown identity fallback); classify missing attribution, idempotent comment/bus flags with independent channel controls, dry-run leaves cursor untouched. Assigned portion ends mid-test; trailing bytes belong to another group. Canonical test absent. |

The fleet tests preserve a previous multi-host orchestration design: queue and claims state, typed bus messages, merge leases, dashboards, handoffs and lifecycle cleanup. Current root instructions place coordination in GitHub issues, PR bodies, labels, checks and comments. The absent canonical files above therefore supply provenance, not an executable current workflow. Existing context and launch tests show explicit-cap and stronger receipt/security boundaries replacing historical assumptions.

Consumers of this map are maintainers comparing retired orchestration to the current coordination contract and tracing surviving regression fixtures. The imported tooling and helper names in the evidence identify historical dependencies; this audit did not execute or validate them. EventJournal is a separate retired race-observation contract, not a fleet facility.

Cleanup candidates are stale references to removed fleet helpers and obsolete acceptance expectations (arbitrary environment forwarding, role-derived caps, unspecific quarantine rows). Keep these snapshots as provenance until the broader canonical evidence closes; do not restore them as current instructions or runtime tests. Historic missing/source paths remain solely in the JSON registry.

Coverage limits: F01 starts mid-file; F29 ends mid-test because group ownership stops there. The 160,000-byte claim covers assigned spans only. Structural current comparisons inspected replacement excerpts and existence, not full current implementations. Historical assertions are intended contracts, not passing-test evidence.
