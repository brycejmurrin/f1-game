# Agent registries and output presentation — group 01

This map covers all 160,000 assigned bytes: the complete agent index, the complete output-level README, and the first 6,704 bytes of the generated output catalog. docs-other-01-evidence.json records whole-source and assigned-range SHA-256 values, individually returned reading intervals, parsed inventories, and the exact partial boundary. All three whole-source hashes match the assignment. No runtime, generator, test, browser, or network validation was performed.

## Agent index

The index is a generated discovery document, with API and physics versions both 1 and explicit units and coordinate conventions. Its complete JSON parses into 79 hook rows, 56 test-group rows, 52 circuit rows, and 559 module rows. Every collection was traversed; all module paths exist at inspection time. These are inventory counts, not counts of tests executed or proof of a working renderer.

| Collection | Row contract | Meaning |
|---|---|---|
| hooks | name, group, signature, summary | Eight fixed categories expose perception, detail, knowledge, actions, fields, read/control calls, and usage guidance. A name can recur in different groups or signatures. |
| groups | id, script, kind, files, twinned | npm test routes, literal file patterns and whether any referenced spec has a VM twin. Empty file arrays remain valid for command or aggregate groups. |
| circuits | id, file, order, classic | Circuit discovery with manifest order and a classic flag inferred from the first 5,000 source characters. |
| modules | path, global, order, roster | Script/module inventory; nullable globals are intentional. Original load order is retained separately from path sorting. Shared global names and lazy replacement modules are allowed. |

The producer gen-agent-index.mjs statically evaluates the literal agentHelp return object, reads the test-group registry and manifest, and derives globals and roster membership from module source. It also produces the hook page and impact map; their existence does not make this index the authority for test selection. Hook signatures and summaries are bounded discovery prose. The generator deliberately omits mutable ratchet ceilings and per-group test counts to avoid stale or conflict-heavy copies. Edit its inputs and regenerate through the established workflow; do not hand-edit the index.

The runtime symbol was checked through apex-lsp: AgentView.agentHelp resolves to the agentview.js declaration at line 1856 through a module-file fallback. The tool explicitly reported that export and caller coverage were unverified. The index describes hooks; this inspection did not invoke them.

Use metres, m/s, seconds and radians unless a key says otherwise. Positive lateral is right of the centreline; positive curvature is a left turn. Scene side is relative to the observer while trackSide remains centreline-relative, and rival lateral is relative to the player. Read constant track/car detail once; pull live world/field/scene detail for decisions. The approximate raster helps visualization and does not establish measurements.

## Output presentation contract

The README defines compact as the default, diagnostic as expanded failure context, and full as original output. Presentation must preserve the underlying action, checks, exit/error state, unknown/pending status, protocol notifications, approval and cancellation behavior. An omission is not evidence that omitted findings are absent. Native command flags continue to control the producer; gateway levels cannot recover upstream data never returned.

Terminal agent-run captures stdout/stderr separately before summarizing, accepts literal argv after the separator, and preserves exit status. Explicit timeout becomes 124 even when a child handles termination with exit 0; cleanup failure also fails. Deliberate background handoffs survive ordinary completion. Signal escalation owns only tracked processes; descendants can escape between scans, so repository supervisors remain necessary. Progress receipts and status cursors show observation, never completion by themselves.

The gateway wraps tools discovered across all listing pages of the six configured stdio servers. It adds outputLevel and output_read, prefixing collisions with underscores. Small results at most 1 KiB keep native content where cheaper and place receipts in metadata; larger envelopes expose an artifact. Full presentation preserves the original result object and adds no receipt to it. Retrieve saved evidence rather than repeat the original action merely to obtain a different presentation.

Exact collection retrieval uses RFC 6901 pointers, unchanged rows and nextOffset. It is distinct from advancing an upstream cursor. Collection requests allow 1–100 rows, at most 262,144 bytes per page and an 8 MiB source artifact; individual rows are not clipped. Original MCP restoration is bounded to 8 MiB and rejects offsets/limits. Larger evidence requires byte pages. Mixed logs expose a separate complete JSON report artifact where available.

Retained artifacts are local, regenerable evidence. Reads are confined to the output artifact directory and reject traversal and symlink escapes. Raw logs and transcripts should not be committed. Hosted tools outside configured servers keep host-controlled formats, and changed gateway entrypoints require host reload. None of these policies authorizes an action or substitutes for background execution, ownership or pre-push rules.

## Catalog prefix and boundary

The assigned prefix contains complete version-3 metadata and 25 complete tool rows; the next tool row ends midway through outputPolicy. The evidence file preserves all 25 decoded rows and the truncated tail. The remainder belongs to another group, so this map makes no claims about total catalog coverage, npm-script rows or configured-route rows from the unseen suffix.

The header specifies runner reconstruction from the shared runner, interpreter and path; npm aliases use npm run. Tool records classify executable candidates, ambiguous modules and data separately, with outputPolicy and optional native flag mentions. Protocol entrypoints preserve exact native stdout and are excluded from terminal-wrapper recommendations. Policy preservation prose lives in the separate reviewed policy registry via shared contract references, rather than being duplicated on catalog rows.

Supporting producer inspection confirms a static file/source inventory, package scripts and configured routes feed catalog generation. Classification uses syntax, argv/parser hints, npm references and shell/Python shebangs. Flag mentions can occur in comments or apply to one subcommand only; candidate classification is not execution or safety evidence. Complete policy bodies and the catalog suffix were outside this assignment. Historical inventory entries are documentary data; their raw paths are confined to the evidence JSON.
