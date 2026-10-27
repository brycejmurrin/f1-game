# Documentation registries: batch 03

This batch maps 160,000 assigned bytes across two JSON registries. Both whole-file SHA-256 identities match the assignment plan. All assigned bytes were returned in 21 separate, untruncated reads of at most 8,000 bytes. Neither source was assigned in full; this report claims complete records only where their complete serialized extent falls within the assigned span. Exact ranges, chunk hashes, record payloads and historical locations are retained in docs-other-03-evidence.json.

## Output preservation policies

The policies.json assignment covers bytes 11,844–111,100: a leading fragment followed by 522 complete tool policy records and the closing registry delimiters. The header, defaults, shared contract definitions and earlier tool rows belong to another batch. Each mapped record carries its exact path key, action, presentation and preserve value. Alias values refer to shared contracts outside this assignment; they are retained literally rather than guessed.

This is a hand-authored decision registry consumed by the output-surface generator. The generated catalog stores the action as outputPolicy and leaves preservation prose here. Supporting text in gen-output-surface.mjs resolves alias references and rejects a missing contract. output-surface.test.mjs requires parity between policy keys and the discovered tool inventory, verifies the generated action and excludes protocol-only entries from terminal-wrapper recommendations. These are inspected contracts, not test results from this audit.

| Action | Complete assigned records | Contract |
|---|---:|---|
| keep-native | 205 | Keep native output and status semantics. |
| no-direct-output | 151 | Imported libraries, assets and data retain their actual interface; no invented command verbosity. |
| targeted-summary | 54 | Bound presentation while retaining complete diagnostics and exact evidence. |
| artifact-first | 43 | Keep originals retrievable, including images, reports and precision. |
| protocol-only | 38 | Preserve exact control-stream stdout, schemas, IDs and lifecycle behavior. |
| page-results | 18 | Preserve collection totals, omissions, pagination and per-item outcomes. |
| job-status | 13 | Distinguish dispatch/running/background state from a terminal verdict. |

The rows span checking, CI, generators, graphics diagnostics, shared libraries, lighting, MCP/debugger transports, networking, performance, capture/publication, tracks, transcripts, UI, viewers and environment/plugin packaging. Specific preservation obligations include native machine bytes and stdout/stderr separation; exact shell-substitution output; pending/unknown/cancelled/skipped states; inherited child exits and cleanup ownership; credentials redaction; complete images/resources; hardware versus software qualification; measurement units and denominators; and dry-run versus mutation receipts. Publication retrieval must never repeat the publish action. Successful execution cannot supply a missing approval or prove hosted readiness.

The registry classifies output, rather than proving that each referenced file runs or remains behaviorally correct. Evidence JSON records local path existence separately. Cleanup should preserve hand-written contracts and let the owner regenerate dependent catalog output; an output classification is no basis for deleting a module. No policy instructions or referenced commands were executed.

## Historical evidence inventory

The historical-catalog.json assignment covers bytes 0–60,744 of an 84,115-byte source. It includes the complete schema header and first 18 complete entries, ending after the scenery snapshot; later entries and final limitations are outside scope. Schema version 1 identifies the repository and a 2026-10-19 inventory date.

Each entry identifies a selected stored commit, source selections and recovery refs, retention reason, byte/file totals and optional gallery entry points. Its publication receipt identifies the publishing workflow and revision, release/tag, archive identity and size, checksum and manifest assets, historical download verification, and a separate inspection record. Inspection records include timestamp, method, page title, image-element versus loaded-image counts and page errors; optional media-reference totals provide a different coverage claim. Exact historical paths, refs, release URLs and identities appear only in the evidence JSON.

The mapped selections cover dedicated circuit reports, an aggregated track gallery, four gallery partitions and focused UI/rendering/replay captures. The shared retention rule excludes inherited unrelated captures. These records describe a recovery and migration evidence chain: selected Git bytes → archive and manifest → checksum/download verification → restored gallery or representative-image inspection. Evidence-storage prose requires that chain before replacing links.

The policy explicitly prohibits purging recovery refs or historical commits based on the catalog. A stored commit proves byte origin, while rendered revision stays unverified unless producer metadata establishes it. A decoded representative image does not prove all gallery media or external historical links work. Some pages report fewer loaded images than image elements; retain those counts and any separate full-reference audit rather than converting them into an unconditional gallery pass.

All remote download and inspection results remain dated source assertions. This audit performed no network retrieval, restoration, browser inspection or capture verification. Preserve the catalog and its provenance for future review; no cleanup or history-removal authority follows from this map.

## Audit boundaries

Supporting references were inspected as text in README.md, EVIDENCE-STORAGE.md, gen-output-surface.mjs and output-surface.test.mjs. Assigned content is JSON configuration/evidence rather than runtime symbols, so runtime LSP navigation was unnecessary. No tests, generators, browser sessions, runtime commands, source edits, staging or commits were performed. The two map deliverables are the only authored files for this batch.
