# Notes batch 10 — historical evidence map

Read 2026-10-27. Group `10` of [notes-batches.json](notes-batches.json): all 100,000 assigned bytes read in 11 individually returned, untruncated source results of at most 10,000 bytes. Offsets are half-open UTF-8 byte ranges. The Cursor probe begins in batch 09; the defect ledger continues in batch 11.

Historical provenance only. Current use means documentary navigation, not current implementation verification. Current [AGENTS.md](../../AGENTS.md), [WORKERS.md](../WORKERS.md), [TESTING.md](../TESTING.md) and owning source take precedence. Historical commands were read only; no note command, runtime, network, browser, tests, source edits or commits were executed.

## Per-note and section map

### P1: Cursor agents API probe continuation

- Date / producers: 2026-10-19 probe and transcript mining; 2026-10-20 launch measurements. Probe author unnamed; Bryce owns account settings.
- Sections covered: endpoint result table tail; Limits, cost, security; Integration map (findings only, not built); Full transcripts (follow-up, 2026-10-19); Recommended next step; Launch tools built and measured (2026-10-20).
- Semantics: separates successful reads from billing-blocked writes, user-scoped credential reach, sensitive conversations, proposed allow-list CLI and transcript cost findings. The later addendum records enabled billing, built write verbs, idempotent client-minted IDs, write retry policy, ownership refusal and measured lifecycle outcomes. Fleet bridge remained unbuilt in this account.
- Current use: trace the motivation for ownership checks and transcript output minimization; locate API-spec provenance and historical measurements.
- Limits: first 2,016 bytes belong batch 09. Early blocker and proposed tool text are superseded within the note by the later addendum. Historical API behavior and tool tests were not rechecked; the retired fleet-bus proposal is no coordination authority.

### P2: Pass-4 decisions

- Date / producers: 2026-10-26 18:30Z, amended 18:50Z; auditor Fable records calls on Bryce's request, with G3 worker evidence on reporter cards.
- Sections covered: title/provenance and all twelve numbered decisions.
- Semantics: quota warning policy; removal of train draining; rejection of ratchet slack; marbles from car state; shaped GripSteer input; owner tags versus holds; lending waiting READY PRs; skill ownership; read-only card enforcement; GitHub rules/settings/credentials; DAD brief compatibility; separation of process and game-code fixes.
- Current use: explains why pass-4 fixes were split and where each decision was intended to be encoded.
- Limits: historical decision record, with explicit 2026-10-27 retirement annotations for quota launch homes. Fleet merge/hold/bus claims must yield to current WORKERS and AGENTS. Administrative settings and implementation are recorded claims, not independently checked here.

### P3: Defect ledger opening and September evidence

- Date / producers: carved from architecture review on 2026-09-03; assigned portion includes 2026-09-26, 09-22, 09-14, 09-10, 09-09 and 09-08 investigations, plus August survey pointers. Multiple unnamed hunting, validation and integration sessions; player phone screenshot is explicitly distinguished from census evidence.
- Sections covered: title/provenance; §7 Open defects, from 09-26 bug hunt through partial 09-08 TLX road-decal entry. Entire assigned range read, including repeated/retracted findings.
- Semantics: race classification, latch input, caution AI, low-speed physics and wall ends; rebind/audio/flyby/weather; network arming/roster/pose validation; durable saves and season seeds; red flags/finishers/pit state; prop-query performance; lexical-global browser/VM mismatch; baked-model road guards and harness blindness; pit-wall sampling and unrecorded sweeps; corrupt imported state; debris reset; TT invalidation and remaining scoring decisions; applied CSS checks and HUD design retractions; rejected promises and rendering state cleanup; scenery vocabulary/geometry regression; delta resync and color-sign invariants; asynchronous race/ghost test setup; whole-tree audit, mutable test seams and real-GPU caveats; invisible liveries, instancing cache identity and duplicate glass; episode scratch/determinism consolidation; phone encoder transient and census soft-blit confounds.
- Current use: navigate measured failure shapes, fixes, test names and retractions before reopening an old symptom. Particularly useful for separating harness artifacts from player behavior, checking preconditions and measuring object identity or frame counts before inferring causes.
- Limits: the heading's “current tree” and OPEN/FIXED labels describe historical revisions, not today's status. Assigned range ends mid-entry at byte 88,109; remaining ledger is batch 11. Old paths, line numbers, performance counts and commands are provenance only. Repeated initial diagnoses must be read with their later corrections: Display margins rejected; hud-onboard fixed/deleted; TT ladder later fixed; career/ghost tests later repaired; governor starvation falsified; 600-vs-5 comparison confounded by presentation paths; scratch X-mode harness did not reproduce spec preconditions.

## Backlinks and cited destinations

Raw source/archive paths below are JSON data, not current Markdown references. Incoming mentions are textual matches within docs outside this generated project map; outgoing targets are Markdown targets from assigned bytes only.
Historical path records retained in [notes-10-provenance.json](notes-10-provenance.json).

## Coverage and hashes

Whole-file hashes authenticate provenance; part hashes authenticate assigned bytes, and chunk hashes match the actual source reads. Whole-file hashing does not claim the excluded bytes were read.

```json
[
  {
    "part": 1,
    "path": "docs/notes/CURSOR-AGENTS-API-PROBE-2026-10-19.md",
    "whole_bytes": 9044,
    "whole_sha256": "34f6c66606032d4b2e6a47196914647e46c6accb583d92de37a8491a324a39b1",
    "manifest_whole_sha256": "34f6c66606032d4b2e6a47196914647e46c6accb583d92de37a8491a324a39b1",
    "manifest_matches": true,
    "assigned_start": 2016,
    "assigned_end": 9044,
    "assigned_bytes": 7028,
    "assigned_sha256": "64d19f15e110c7524ce49f429edb81bca16d5162d3e3d3a09311de3f5730cd31",
    "read_chunks": [
      {
        "start": 2016,
        "end": 9044,
        "bytes": 7028,
        "sha256": "64d19f15e110c7524ce49f429edb81bca16d5162d3e3d3a09311de3f5730cd31"
      }
    ]
  },
  {
    "part": 2,
    "path": "docs/notes/DECISIONS-2026-10-26.md",
    "whole_bytes": 4863,
    "whole_sha256": "550bd1b322f95c8ff61ab16510fe33779be3f70575dfc11441f9878fccf73b0d",
    "manifest_whole_sha256": "550bd1b322f95c8ff61ab16510fe33779be3f70575dfc11441f9878fccf73b0d",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 4863,
    "assigned_bytes": 4863,
    "assigned_sha256": "550bd1b322f95c8ff61ab16510fe33779be3f70575dfc11441f9878fccf73b0d",
    "read_chunks": [
      {
        "start": 0,
        "end": 4863,
        "bytes": 4863,
        "sha256": "550bd1b322f95c8ff61ab16510fe33779be3f70575dfc11441f9878fccf73b0d"
      }
    ]
  },
  {
    "part": 3,
    "path": "docs/notes/DEFECT-LEDGER.md",
    "whole_bytes": 251354,
    "whole_sha256": "53f6d19863da9d78bb7f58619bb022d8d2dbfb1073a6a5eb6a7f06c7df8f5028",
    "manifest_whole_sha256": "53f6d19863da9d78bb7f58619bb022d8d2dbfb1073a6a5eb6a7f06c7df8f5028",
    "manifest_matches": true,
    "assigned_start": 0,
    "assigned_end": 88109,
    "assigned_bytes": 88109,
    "assigned_sha256": "29ae70deaa8b410d552023d2cee9d6e523bc8c3adf0f154a42870568b4d53e94",
    "read_chunks": [
      {
        "start": 0,
        "end": 10000,
        "bytes": 10000,
        "sha256": "17edc94ab8a14687dca74d5a06c7e1eeb0b9efd62837e7757d9ce7c432d856d5"
      },
      {
        "start": 10000,
        "end": 20000,
        "bytes": 10000,
        "sha256": "e676b53f7795725a1d0f23e46e32407b74f6da2f729144c48460c8cf38f2eaf2"
      },
      {
        "start": 20000,
        "end": 30000,
        "bytes": 10000,
        "sha256": "322a7e8a9f92ed5872bc0ca1f5d3d3620fb9fae64c478dea6c43a26535d94f69"
      },
      {
        "start": 30000,
        "end": 40000,
        "bytes": 10000,
        "sha256": "aac0d7c6a77d9b23398f7877303626b75887f17a662472cb5d12c55a7ab68920"
      },
      {
        "start": 40000,
        "end": 50000,
        "bytes": 10000,
        "sha256": "44f34e286de71c3ef310fc36ed1c47e726a19613314117339c552017aa6c310b"
      },
      {
        "start": 50000,
        "end": 60000,
        "bytes": 10000,
        "sha256": "4cbb787067c8c60d90138bbed190216fb838877362b0075f65a26ed2226d3bcb"
      },
      {
        "start": 60000,
        "end": 70000,
        "bytes": 10000,
        "sha256": "d87eac2752e773253a50f958886eee8e3a9d77954b5a98e86233ccf0d8564bd2"
      },
      {
        "start": 70000,
        "end": 80000,
        "bytes": 10000,
        "sha256": "2cd2324b04d7ea289ada9e6ad07be593851fabfc39f4b622d20288bd72211e5d"
      },
      {
        "start": 80000,
        "end": 88109,
        "bytes": 8109,
        "sha256": "c9237d317552b1399ebf1007c685a9ae504f6a90da018785b4d17ba980126ecc"
      }
    ]
  }
]
```
