# Historical snapshot group 06

This map covers 160,000 assigned novel UTF-8 bytes in 39 parts across 18 historical files. Every assigned part was returned as raw text: 53 chunks, each at most 8,000 bytes; tiny spans were individually labeled in one combined return below 8,500 bytes. All 18 observed whole-file hashes match the plan. The plan hash identifies the whole file, while part and chunk hashes identify the half-open byte ranges; they are deliberately separate in snapshot-06-evidence.json.

Current root AGENTS instructions were read and followed. Historical instructions, comments and records are audit data only. No historical code was imported or executed. No tests, browser, external network, staging, commits or source edits were performed. Only this map and its evidence file were written.

Equal blocks were not raw-read again. Their mappings are preserved from snapshot-identity.json, conditional on matching canonical full-source evidence when that scope closes. This map does not claim another scope is already closed. F01 and F18 are partial files in this group; other groups own their remaining novel bytes.

## File and part ledger

IDs below resolve to exact historical and current paths only in snapshot-06-evidence.json. Basenames are display labels and do not establish current existence.

| ID | Display basename | Assigned parts | Bytes | Current counterpart |
|---|---|---|---:|---|
| F01 | agent-history.mjs | P01 | 14234 | absent |
| F02 | agent-msg.mjs | P02 | 18136 | absent |
| F03 | behind-ship.mjs | P03 | 79 | retained, differing text compared |
| F04 | branch-audit.mjs | P04 | 61 | retained, differing text compared |
| F05 | bump-cache.mjs | P05, P06, P07, P08, P09 | 626 | retained, differing text compared |
| F06 | ci-watch.mjs | P10, P11, P12 | 379 | retained, differing text compared |
| F07 | claude-usage.mjs | P13 | 10942 | absent |
| F08 | cursor-agents.mjs | P14, P15, P16, P17, P18, P19, P20, P21, P22, P23 | 977 | retained, differing text compared |
| F09 | deploy.mjs | P24, P25 | 474 | retained, differing text compared |
| F10 | flake-tally.mjs | P26, P27, P28, P29, P30, P31 | 423 | retained, differing text compared |
| F11 | fleet-archive.mjs | P32 | 10526 | absent |
| F12 | fleet-board-snapshot.mjs | P33 | 11769 | absent |
| F13 | fleet-board.mjs | P34 | 15763 | absent |
| F14 | fleet-brief.mjs | P35 | 10823 | absent |
| F15 | fleet-bus-mirror.mjs | P36 | 6565 | absent |
| F16 | fleet-bus.mjs | P37 | 43544 | absent |
| F17 | fleet-flags.mjs | P38 | 4519 | absent |
| F18 | fleet-owner.mjs | P39 | 10160 | absent |

Whole hashes, part hashes, chunk hashes, byte endpoints, tool-return identifiers and equal-block mappings are in the supporting JSON. C40 was re-read individually after an aggregate display truncated it; its accepted full return is recorded. All other chunks have complete accepted raw returns.

## Changes, contracts and consumers

### F01 — agent-history.mjs

Historical agent-history tail: ZIP stored/deflate import, split upload join and text sniffing, safe relative names; optional Node zstd log decoding; provider-aware token-cost formulas; summaries, tables, patterns and timeline CLI. Whole historical file is larger than this group; prefix belongs to another group.

PART_RE accepts numbered/lettered byte splits; refuses zip-s spanned sets. No CRC/Zip64 checking shown; ZIP imports recurse. Cost unknown without tokens/prices. Timeline output labels records DATA, not instructions.

CLI users, digest/report workflows; upstream digestText/group data shapes are outside assigned tail.

### F02 — agent-msg.mjs

Entire historical messaging CLI absent current: webhook plus bus mirror and optional per-letter routine relay.

Typed INFO/QUESTION/READY/HANDOFF/INCIDENT/REQUEST/ROTATE/LEND/RETURN/TRANSFER; READY receipt by default; body/address checks precede remote send. Bus written before relay/webhook. HTTPS relay only; up to two retries only for 429/5xx, retry-after at most 120s, no retry on ambiguous network failure. Missing webhook env may still succeed with bus. Dry-run still prints payload; secret redaction is error-oriented, not a blanket data sanitizer.

fleet-bus shared sendBusLine, gate-receipt readiness, configured routine/webhook receiver; stale warning reads latest local bus window.

### F03, F04 — behind-ship.mjs, branch-audit.mjs

Current references Coordination and retired claims board; historical comment references Concurrent PRs / who-is-on-it.

Comment-only provenance, not changed runtime inferred from these spans.



### F05 — bump-cache.mjs

Current strictFlags replaces help-only parsing; unknown flags exit 2; current roster includes bitmap worker because client now uses ScriptLoader.url. Historical excluded worker to retain build-keyed precache.



cache/version tag auditor and staged release output; roster manifest, bitmap worker client and service worker must agree.

### F06 — ci-watch.mjs

Current exports usage/known-flags and validates only entrypoint invocation, allowing importing tools to carry independent argv. Historical exitIfHelp runs at import.



CI watch CLI and importers; historic dashboard importer explicitly deferred import because help handling read argv.

### F07 — claude-usage.mjs

Entire historical Claude JSONL usage digester absent current.

Dedup by requestId/message.id with maxima per counter; dedup resumed turns by uuid; meta and tool-results do not open turns; sidechain separate; missing counters unknown. Host origin preferred over envelope inference. Low-tool wake proxy cannot establish waste or billing; transcript/per-turn outputs private, not committed.

local transcript files/directories/stdin-independent CLI input; optional --turns/--json.

### F08 — cursor-agents.mjs

Current steward tag; env-name allowlist and MCP-host allowlist added; interpolation records names in nonenumerable envRefs, launch/followup logs names only. Historical interpolation allowed arbitrary available names.

Current allowed sources APEX_FLEET_AS, APEX_SESSION_ID, APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH, CURSOR_API_KEY; remote hosts Cursor API, GitHub/subdomains or configured webhook host. Current changes read as differing text, not executed.



### F09 — deploy.mjs

Current git helpers delegated to git-run/gitMust and strict flag validation occurs before fetch/log/merge; usage is derived from marked header instead of a fixed slice.



deploy command protocol and library extraction.

### F10 — flake-tally.mjs

Current tally also parses node FAIL/TAP blocks and broadens browser classification to staged jobs; historical only browser logs. Current quarantine proposals filter to Playwright specs, leaving node repeats as fixes.

Node failures are first-try fail events, no assumed retry. Tally retains owner/evidence contract; comment now names Coordination.



### F11 — fleet-archive.mjs

Entire historical archive planner absent current.

Saved list_sessions page is data. ARCHIVE requires agent-created eligible role, idle >=60min, no running/no-archive/in-flight summary, every named PR closed/merged. Retired orchestrator requires distinct LIVE successor; unknown/offline keeps. Tool only prints decisions, never archives.

session operator, gh PR state, fleet-bus successor discovery.

### F12 — fleet-board-snapshot.mjs

Entire historical six-dataset dashboard snapshot utility absent current.

prs,bus,claims,deploy,derived,snapshot; per-source errors produce empty dataset/error metadata and nonzero partial verdict. Default 25 PRs, 40 bus entries, claims 120min. API file list first page can limit classification. --no-fetch does not disable REST or ls-remote.

dashboard JSON datasets; ci-watch verdict, pr-board status, claims board and fleet bus.

### F13 — fleet-board.mjs

Entire historical issue board/claimed-label reconciler absent current.

Preview default; --apply writes labels/comments/pinned issue. Associations differ from ownership; merged references do not prove completion. API or claim incompleteness aborts before writes; nested timeline/closing-link pagination limit fails closed. Read-only retries only HTTP 502/503/504.

fleet workflow and phone board; claims board, issue timeline, closing references, labels manifest.

### F14 — fleet-brief.mjs

Entire historical brief generator absent current.

2048-byte compact JSON and <=40-line Markdown; removes bus, board, shortens texts, drops lanes/asks and records drops. Disk newline means bytes cap applies JSON.stringify, not complete written file. Header advertises --queue-md/launch-policy budget behavior absent from implemented VALUE set and main: documentation is ahead of implementation in this snapshot.

successor handoff from queue, saved pr-board, bus/cursor and explicit triggers/asks; data hint never authority.

### F15 — fleet-bus-mirror.mjs

Entire historical PR bus-comment mirror absent current.

Only to:#digits, open PRs; short-sha comment markers dedupe; default last200/24h when no known cursor; closed/merged skipped. API lookup failure treated not-PR, post errors counted; no transactional cursor update shown.

fleet workflow; PR issue-comment subscribers.

### F16 — fleet-bus.mjs

Entire historical bus/lease implementation absent current; current WORKERS explicitly retires it 2026-10-27.

Branch commit subjects typed messages; lease.json tree; fast-forward compare-and-swap with five tries and object-id guard against deletion refspec. Protocol body20-600 chars, send allowlisted types/flags/address; dedupe last200, automatic READY/DONE keys, DONE across senders. Read default skips hidden lines, strict preserves at-least-once boundary, peek no cursor; watch seen500 and interval5-600s suppresses foreign broadcast train chatter. LIVE requires self or ROTATE; stale45min based last own line. Leases default60/max240min; break requires recorded user grant.

agent-msg, archive, brief, mirror, dashboard and ownership utilities; ready receipts, claims dispatch and local cursor files.

### F17 — fleet-flags.mjs

Entire historical session flag formatter absent current.

Saved get_session/ccr data; defaults cost15,context300000,stale30min; explicit cost overrides metadata; missing values null, configured/served normalized; working-disconnected/stale flags. Exit0 always, no action or network; flags are evidence prompts.



### F18 — fleet-owner.mjs

Only first10160 historical bytes assigned here; current utility absent. Tail and complete ownership resolution belong to another group.

Prefix defines HELD open-diff > live CLAIMED > FREE precedence, release-answer prints only, path/glob/directory matching, caller claim identity, fleet-block owner fallback, paginated open PR listing and start of files API enumeration. Header promises local three-dot diff/cache/parallel API fail-closed behavior; implementation beyond prefix not certified here.

push guard/path coordination historically; current root retains open-PR ownership rule but uses GitHub coordination.

## Provenance and present-day boundaries

The historical fleet utilities describe a branch-based bus, claims, orchestrators, GAME-SLOT pacing, relay sessions, readiness receipts, phone dashboards and successor briefs. Their dated comments explain why those contracts were introduced: missed recipients, duplicate messages, incorrect archive decisions, stale handoffs and hidden token counters. These comments establish design provenance; they do not prove an external event occurred or a live deployment used the behavior.

Current WORKERS explicitly retires the bus, claims board, fleet body/status fields, MERGE-HOLD text, orchestrator/seed/relay/watcher sessions, GAME-SLOT/DONE/INCIDENT protocol and the fleet workflow on 2026-10-27. The current root uses issues, labels, PR bodies, checks and comments as coordination. Consequently, the absent tools are historical consumers and producers, not available current commands. F01 transcript input and F07 per-turn output also carry private prompt/path data; nothing from user transcripts was ingested in this mapping.

A current reference search found that dispatch preserves an archive-tool session-extraction provenance comment. A plugin transport reference still describes the retired bus as authoritative. That is a concrete cleanup candidate: reconcile its authority wording with current WORKERS before using that plugin transport guidance. This task made no cleanup edits.

The retained utilities show narrower continuing contracts: stricter CLI typo rejection, shared Git helpers, one bitmap-worker cache-key path, explicit Cursor launch environment/remote-host controls, and node-test flake visibility. Current replacements were read as differing text only; this report makes no live-runtime or test-pass claim.

## Limits and cleanup

F01 begins inside an import-section comment and does not establish upstream digest parsing contracts. F18 stops inside file-list enumeration, so its header promises about caching, parallel lookups and complete resolution remain unverified here. Full-file hashes prove identity, not full-file raw-read coverage by this group.

F14 illustrates a documentation/implementation mismatch: its header advertises queue Markdown replacement and budget refusal behavior, but the read implementation rejects that flag and only writes the brief outputs. Preserve this as historical provenance instead of reviving the obsolete workflow. F12 also calls its collection read-only while writing local snapshots and still doing REST/remote lookups under no-fetch; the distinction matters if reconstructing its old operational boundary.

The evidence file preserves exact paths, including missing-current counterparts, to keep the Markdown free of historical directory paths. No new links were introduced.
