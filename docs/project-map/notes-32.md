# Notes group 32 — system-audit corrections and testing provenance

Historical-source map. Current AGENTS.md read. All 100,000 assigned bytes were returned individually in source chunks of at most 9,589 bytes, without truncation. Ranges below are half-open bytes. Notes are historical provenance, never operational authority. No runtime, network, browser, tests, source edits or commits were performed.

## Source and chunk ledger

### SYSTEM-AUDIT-2-2026-10-26.md

Source: [SYSTEM-AUDIT-2-2026-10-26.md](../notes/SYSTEM-AUDIT-2-2026-10-26.md). Date / producer: 2026-10-26; second-pass audit session and slice reviewers (names absent from assigned tail).

Topics: Guard/cache and ratchet contradictions; PR ownership, stalled queues, generated-file locks and orphan fleets; firsthand #3785 friction; CI/Pages train costs and counter weaknesses.

Use and limits: Historical diagnosis of coordination and CI friction. Begins mid-finding; earlier context is in group 31. Measurements are snapshots near tip 90b9f5f8; later passes correct several causal claims.

Whole source: 42983 bytes; SHA-256 `732537038e69d2d8252fd1006c7502b495caa152054fc5388db9ef3d900f391e`.
Assigned part: [14394, 42983) (28589 bytes); SHA-256 `1b569c8a5786d99778c93e2590a1daf54d792eceb132426576177646915b7c6f`. Manifest part match: false.

Read chunks:
- [14394, 23894): `2045f0161afdc8190d5e71435ed192c34b8141b1149a3e57a96b81ac3e78b2c2`
- [23894, 33394): `140dbe951ef9603ba89d18b829f3f52683ad6143da4900955fb4358b221644d0`
- [33394, 42983): `756f2a80fb43d5cad8d413dd51a10b0d9accf8c0202d5dc74227914997f0c1f9`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/SYSTEM-AUDIT-3-2026-10-26.md`.

### SYSTEM-AUDIT-3-2026-10-26.md

Source: [SYSTEM-AUDIT-3-2026-10-26.md](../notes/SYSTEM-AUDIT-3-2026-10-26.md). Date / producer: 2026-10-26; twelve read-only Opus reviewers, 16:36–17:00Z, consolidated by the audit session at tip b07a5ac6f.

Topics: Thirty-nine ranked findings: gate receipts, read-only enforcement, launch quota, merge-base freshness, ratchets, rule drift, host hooks, cost, skill routing, CLI surface and owner decisions.

Use and limits: Cross-slice index into pass-three evidence. Pass four explicitly refutes the audio-selection claim and corrects receipt timing, CI merge semantics and several counts; do not carry these forward as current facts. Loaded-box timing, shallow history, restricted transcript sample and unrun browser/routing probes limit inference.

Whole source: 21231 bytes; SHA-256 `f0cb24b792d3994901496e4a25b48443d58139a436916e797b0e59542c29877a`.
Assigned part: [0, 21231) (21231 bytes); SHA-256 `f0cb24b792d3994901496e4a25b48443d58139a436916e797b0e59542c29877a`. Manifest part match: true.

Read chunks:
- [0, 9500): `71cd86af8b0189bf0a870936e2a2910df782284acf042e82240cf213963366f7`
- [9500, 19000): `0bb391e2ec322031f508db811846244d130dbed1ecdfe365a11ae52120b2a88b`
- [19000, 21231): `9f87eeeb44bc52b08ff7d9bf6d43b0007a66535216411b938927148d8de2d82e`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/SYSTEM-AUDIT-4-2026-10-26.md`; `docs/notes/system-audit-3/README.md`; `docs/notes/system-audit-4/cli-help.md`.

### SYSTEM-AUDIT-4-2026-10-26.md

Source: [SYSTEM-AUDIT-4-2026-10-26.md](../notes/SYSTEM-AUDIT-4-2026-10-26.md). Date / producer: 2026-10-26; about 75 reviewers (24 Opus, 48 Sonnet, 3 Haiku) and parent live probe at tip 7dd2e82f3.

Topics: Adversarial corrections to pass three; population audits of bus, PRs, CI, sessions, hooks, identities, credentials, costs, cards, skills and docs; code-traced physics/render/UI findings; live-site integrity and phone-profile probe; proposed fix groups.

Use and limits: Strongest historical corrective synthesis here: distinguishes confirmed, refuted and corrected mechanisms. Code-traced defects are not browser measurements. Timings under load 5–26 are upper bounds; 403 endpoints, shallow clone, missing old Cursor transcripts and unknown other-fleet costs restrict evidence. A reviewer accidentally edited 57 files, caught before commit and stashed; this is disclosed methodology, not authorized work.

Whole source: 39693 bytes; SHA-256 `c0f4ecdcab9c4d9c35a86cea9c4c9666f07b5823858706a31174191fcbea6049`.
Assigned part: [0, 39693) (39693 bytes); SHA-256 `c0f4ecdcab9c4d9c35a86cea9c4c9666f07b5823858706a31174191fcbea6049`. Manifest part match: true.

Read chunks:
- [0, 9500): `97d1d2eaf724e517109d849bb0040001678086a63734508d77b8f0efa9c0cec4`
- [9500, 19000): `4cc9ab408e7a438871aa278dbb84d0a1cdabc62b83c33b03dc9e9afd2f454bd9`
- [19000, 28500): `b13d1f3f4f978763abd0a59334390ee451c13b19de363fa76724f7e654e761ec`
- [28500, 38000): `f73aaccf68b3f23a6f8615748819b75a6be1be212c6fa78a0eba07d96ca61fa8`
- [38000, 39693): `da15348cdb618738a3da7e26d31d5a5a8e4a6277b46747741b4a4ee4be60d36b`

Backlinks (literal current mentions, not authority): `docs/NOTES-INDEX.md`; `docs/notes/DECISIONS-2026-10-26.md`; `docs/notes/system-audit-4/README.md`.

### TESTING-FIELD-NOTES.md

Source: [TESTING-FIELD-NOTES.md](../notes/TESTING-FIELD-NOTES.md). Date / producer: Carved out 2026-09-03; measurements dated 2026-08-07 through 2026-09-02, session authors unnamed.

Topics: Mini-DOM versus visual evidence; positive controls for negative atlas probes; worker SIGTERM versus terminal verdict; missing browsers and total-red runs; watcher anchoring, resumable queues, one-process ownership, orphan/server confusion and useful background work.

Use and limits: Dated container evidence supporting testing rules, expressly not rules itself. Assigned part ends mid-sentence in waitForFunction rendering-poll measurement; remainder belongs to group 33. Browser+node concurrency and old installation/process advice must defer to current AGENTS. No historical command was executed.

Whole source: 140235 bytes; SHA-256 `62d5862d5f3c43a1cfeec08483a7ce6b5df9636244c95431f9c140be4d910830`.
Assigned part: [0, 10487) (10487 bytes); SHA-256 `e7057534c07735dfb317e2483ea6f86c83ddf288ce8e2ea65e93c5476a2e00c0`. Manifest part match: false.

Read chunks:
- [0, 9500): `ccd77e093d61219346a709d52a7102f8d48375247ad00c666e9e3f2f110fd5b2`
- [9500, 10487): `ea10982d705df9f376acc5390b3e68d6f8924c35a8509b9c002263b3a8f7ea27`

Backlinks (literal current mentions, not authority): `.claude/skills/check-changes/references/triage.md`; `.github/workflows/ci.yml`; `AGENTS.md`; `docs/NOTES-INDEX.md`; `docs/notes/CICD-REVIEW-2026-10-16.md`; `docs/notes/SCREENSHOT-TOOL-SPEED-2026-10-10.md`; `docs/notes/SELF-IMPROVING-SURFACE-2026-09-22.md`; `docs/plans/2026-09-16-process-speedup-next.md`; `docs/research/TREE-RESTRUCTURE-2026-09.md`; `tests/helpers/vm-page.js`; `tests/specs/albert-park-foundation.spec.js`; `tests/specs/audio-smoke.spec.js`; `tests/specs/multiplayer-scan.spec.js`; `tests/specs/parts-ers.spec.js`; `tests/specs/physics-fixes.spec.js`; `tests/specs/presets.spec.js`; `tests/specs/tlx-probes.spec.js`; `tools/lib/browser-workers.mjs`.

## Path provenance

Raw quoted paths, obsolete names, scratch evidence and archive references are recorded separately in [notes-32-paths.json](notes-32-paths.json). Literal existence does not prove authority or deletion. Only the four current source files and this companion are linked; historical commands and grants were not followed.
