# Complete project mapping goal — complete

## User goal

Read the project from scratch with fresh GPT-6.1 Sol agents, map source relationships using LSP, identify evidence-backed comment cleanup candidates and commit each report. Runtime source fixes are separate from this mapping.

## Source and navigation

Original source snapshot: ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb. Branch: cursor/project-map-a84f. First report checkpoint: c4dc493d9. Runtime source is unchanged. The original documentation index received one intentional mapping link; its current identity is the explicit audit exception.

Start at [INDEX.md](INDEX.md), then [PROJECT.md](PROJECT.md) for directory ownership and runtime flow. [coverage.tsv](coverage.tsv) contains the exact original tracked-entry roster, SHA-256, method and evidence. [coverage-audit.md](coverage-audit.md) records independent reconciliation and limits.

## Completed original scope

All 5,109 original Git entries are accounted for, with no unread or partial rows:

| Method | Entries |
|---|---:|
| Fully raw-read source, prose and small data | 4,672 |
| Binary metadata/provenance inspected | 366 |
| Symlink metadata inspected | 38 |
| Large structured data completely traversed/validated | 32 |
| Raw JavaScript wrapper plus embedded binary inspection | 1 |

Every tracked runtime JavaScript file under js/ is fully read (561 files), as are all 34 stylesheets and 582 tooling paths. All platform, asset/vendor, test, documentation, instruction/workflow, example and prototype scopes are mapped. Unit reports cover all 1,056 files and 305,161 source lines; browser-spec byte groups cover the entire tracked spec scope with image metadata kept separate. Per-family manifests and complete reports preserve exact rosters and boundaries.

Full source reading requires nontruncated visible chunks; outlines and AST metadata alone are partial evidence. Binary, structured-data and alias methods are never relabelled as manual source reads. LSP fallback/text matches and unresolved dynamic properties retain their limits. Source inspection does not establish browser, GPU, device or deployment behavior.

## Completed retained scope

The separate frozen retained census classifies 5,776 entries. All 70 planned novel retained source/prose inputs are read (507,826 bytes across four groups). Eight snapshot groups read all differing historical ranges, including the cached shell. All 463 retained source identities and 2,289 equal blocks are verified; equal plus novel ranges cover every source byte. All 4,750 canonical duplicate identities resolve, preserving their original read/inspection methods.

See [retained-output-catalog.md](retained-output-catalog.md) and [retained-identity-closure.json](retained-identity-closure.json). Generated diagnostics/logs receive explicit structural or provenance treatment. Installed dependencies, caches, browser profiles, secret contents and own mapping outputs retain their documented exclusion boundaries; this is not a claim to have manually read every filesystem byte. No retained files were deleted or historical commands activated.

## Findings and verification

[comment-cleanup.md](comment-cleanup.md) contains 29 independently corroborated current comment/title candidates with exact source quotes/ranges, behavior evidence, suggested wording and limits. Two unsupported earlier candidates were rejected; the original incorrect test-count sentence was corrected. The broader domain reports retain additional observations and historical distinctions.

The independent coverage audit passed with the explicit documentation-index identity exception and reader-attestation limits. All mapping JSON documents parse. Documentation and agent-configuration checks passed 74/74, and per-report commit guards passed. Draft fast CI passed at the published checkpoints; the PR hand-off records the final pushed head and remote verdict. Browser, GPU, native-build and deployment suites were outside this documentation-only change.

## Persistence and hand-off

Every completed report and supporting ledger is committed. Global navigation and the final verification record are included in the completion commit. Draft PR: https://github.com/brycejmurrin/f1-game/pull/3922. The PR remains a reviewable documentation change; runtime fixes and landing are separate actions.

- [x] Complete all original tracked source/data/binary/symlink mapping.
- [x] Close source-read continuations and canonical identity inheritance.
- [x] Catalog relevant retained outputs and explicit exclusions.
- [x] Independently audit coverage and corroborate comment candidates.
- [x] Commit reports, publish navigation and run documentation checks.
