# Coverage audit

Verdict: **Pass with the documented index identity exception and read-attestation limits** after final reconciliation. This audit checks the original Git tree `ae73c6766` independently of completion labels. It does not convert a pending read into a complete read because a report file exists. Detailed rosters, historical identities, unresolved path references and interval gaps live only in `coverage-audit-evidence.json`.

| Check | Result | Evidence and limit |
|---|---|---|
| Original path set | Pass | Exactly 5,109 rows, no duplicates, omissions or extras against recursive Git tree enumeration. |
| Entry kinds | Pass | 38 Git symlinks, 4,990 ordinary regular files and 81 executable regular files. All 38 aliases carry the symlink inspection status; link-target bytes are counted rather than followed-file content. |
| Original size and SHA-256 | Pass with explicit exception | All original blobs match except the documentation index, whose mapping link was intentionally added. Its coverage identity currently describes the edited index rather than the original blob. This exception must remain explicit. |
| Runtime/source immutability | Pass | The documentation index is the only original tracked entry whose current bytes differ from the original tree. New reports are outside that original path set. |
| Completion status | Pass | Coverage records 4,672 fully read, 366 binary metadata, 38 symlink metadata, 32 structured-data and one mixed wrapper/binary entry; no unread or partial rows. All 17 batch manifests mark their groups complete. |
| Batch source identities and bounds | Pass | Every available batch part carrying a whole-file hash matches its source; intervals stay within the source. Full family rosters and union gaps are retained in JSON. |
| Structured chunk hashes | Pass, bounded | 431 explicit source chunk records checked against source bytes; no mismatches. This count does not imply every family uses this schema. |
| Historical snapshot identity | Pass with explicit exception | All 463 whole-file identities match retained files. 2,289 equal blocks match current canonical bytes, including the deliberately edited index. Equal-block plus novel-range unions leave no snapshot byte gaps. Canonical-missing records without equal blocks are novel-source reads, not identity reuse. |
| Helpers closure | Pass | All 71 tracked helpers have matching bytes, SHA-256 and gap-free inclusive line rosters through EOF in `tests-helpers-complete.md`. |
| Unit continuation closure | Pass | `tests-unit-02a-complete.md`, `tests-unit-02b-complete.md`, `tests-unit-02c-complete.md` supply explicit continuation ledgers. All hashed raw continuation intervals in unit 21 match source exactly; their union with the nine original raw ranges covers all 7,648 lines. The unit 02 supplements close the named full-file and tail gaps, including the independently reread recovery tail. |
| Report references | Pass with notation limit | Every enumerated batch group has its expected report, including all 62 unit groups and all 31 historical groups. Coverage also uses shared-prefix/range abbreviations; JSON preserves regex candidates as notation requiring interpretation, not missing-file findings. Report existence is checked separately from source identity and read ledgers. |

Methods remain distinct: full prose/source reads, binary metadata inspection, structured table validation, mixed JavaScript wrapper plus embedded binary inspection, and symlink metadata inspection. The Rapier report explicitly reconciles 145,935 wrapper bytes with 2,092,784 encoded binary bytes; decoded WASM is a second representation and is not added to original-container totals. Its metadata inspection does not claim semantic review of binary instructions.

Generated and dependency content that belongs to the original tracked tree is included in the 5,109-entry scope; generated status does not excuse a missing row. Retained historical snapshots are outside that original tree and have separate identities and read ledgers. Untracked dependency installs, browser profiles and secret contents are excluded, so this report does not claim every filesystem byte was read.

The audit verifies identities and internal ledger consistency. Prior model-visible tool responses cannot be independently recovered here, so statements that chunks were actually returned untruncated remain the reading lanes' attestations. No tests, browser, network, generators, runtime edits, staging or commits were performed by this audit.
