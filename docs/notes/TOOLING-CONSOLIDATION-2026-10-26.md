# Tooling consolidation — 2026-10-26

System audit 2026-10-26 §7 ("Tooling and generated files") and "Remove or
simplify", implemented on PR #3785 (lane S6). This note says what changed, why,
and what was measured or read. It is the one home for these decisions; the tools'
headers link here.

## 1. One GitHub REST client

Before: four clients. `tools/ci/github-api.mjs` `api()` (GET, 5xx/429 backoff),
ci-watch's own (ETag, 5xx only), ready-gate's own (**no retry**, and ready-gate
writes the receipts the merge and ready hooks require, so one GitHub 502 refused
a gate), plus hand-rolled curl in deploy.mjs (`ghApi`, `advisoryGet`),
remote-group.mjs (JSON body through a temp file) and pr-body.mjs.

After: `github-api.mjs` exports `request()` (any status back) and `api()`
(`{json}|{error}`). Options: `method`, `body` (JSON on curl's stdin config, never
argv), `token` / `anonymous`, `etags` (a url → {etag, json} store),
`follow` (`-L`, for job-log redirects), `timeoutS`, `retries`. ready-gate and
ci-watch re-export or wrap it; deploy, remote-group and pr-body call it.

GitHub's rules, read 2026-10-26 at
https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api:

- Conditional requests: "Most endpoints return an `etag` header … On your next
  request to the same URL, send the saved value in the `if-none-match` header …
  If the response has not changed, you will receive a `304 Not Modified`
  response." and "Making a conditional request does not count against your
  primary rate limit if a `304` response is returned" (authorized requests only).
- Retry: "If the `retry-after` response header is present, you should not retry
  your request until after that many seconds has elapsed"; otherwise for a
  secondary limit "wait for an exponentially increasing amount of time between
  retries". The client now reads `Retry-After` (`-w … %header{retry-after}`):
  a 429 sleeps it when ≤ 10 s, and returns the 429 at once when longer (a CLI
  that blocks a minute reads as hung); without the header the 1/2/4 s backoff
  stands. 5xx keeps the backoff.
- "Make requests serially instead of concurrently": every caller here is serial.

Caching semantics: `Cache-Control: no-cache` stays on every request (revalidate,
RFC 9111 §5.2.1.4, https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.1.4);
the ETag store makes the revalidation a 304. ETags vary by token (GitHub sends
`Vary: Authorization`), so a store is per box, never shared across accounts.

## 2. One per-PR snapshot

`tools/lib/pr-snapshot.mjs` — open-PR list, `pulls/{n}`, files, check-runs,
ci.yml runs (per head, and one "newest 100" page), jobs, last comment page —
every read conditional, the ETag store persisted in
`artifacts/pr-snapshot/etags.json` (ignored) so the NEXT process on the box gets
the 304s, and memoised within a process. Readers: pr-board, needs-sync (default
transport), session-status `--pr`, queue-depth `--push`.

REST request sites, N open PRs (counted from the code, not measured live):

| tool | before | after |
|---|---|---|
| pr-board (board) | 1 list page + 3N (`pulls/{n}`, head runs, check-runs) + jobs for red / ready-green heads + a comment page per PR with comments; ≈133–220 at N = 44, every call unconditional | 1 list page + 1 recent-runs page + 2N (`pulls/{n}`, check-runs) + a head-runs read only for heads absent from the recent page + the same jobs / comment extras; ≈90–110 at N = 44, every call conditional, so an unchanged PR costs 304s that do not count against the 5,000/h limit |
| pr-board `--pr <n>` | list + 3 | list + 3 (no recent page: one head read is cheaper) |
| queue-depth | 5 run-status lists (queued, pending, requested, waiting, in_progress; up to 3 pages each) + ≤ 30 jobs + ≤ 60 counts = 5–105 | 2 lists (queued, in_progress) + the same = 2–92 |

The three statuses dropped from queue-depth hold no runner: a `pending` run waits
on a workflow concurrency group (the Pages train), `waiting` on an environment
gate (the one environment, github-pages, has no reviewers or wait timer), and
`requested` lasts seconds. `pending` JOBS inside live runs (the `queue: max`
lanes) are still counted apart as before.

`pr-board.mjs --alarm` is the audit's stall alarm (Top 10 #3: 39 h with zero
merges while 8 green PRs waited): a ready PR whose head is green (ci.yml success
and Structural guards passed), with no `MERGE-HOLD:`, and whose newest ci.yml run
on the head is ≥ 12 h old — a push or a draft→ready flip starts a run, so this
reads "nothing has happened for 12 h". `= alarm none|<n> stalled`, exit 1 on a hit.

## 3. Changed-file listing

deploy.mjs `changedPaths()` and verify-change.mjs now use
`tools/lib/changed-files.mjs` (`--name-status -M`, both ends of a rename);
pick-tests and pick-unit-slices already did. Still on `--name-only`:
`tools/check/ratchets.mjs:224` (lane X2's file), change-kind.mjs, ci.yml's shell
filters.

## 4. tooling-fast reads groups.json

`TOOLING_FAST_FILES` is `filesOnly(loadGroups().toolingFast)` at import time.
The 1,512-line generated copy inside tooling-fast.mjs is gone (5 real conflicts
and 228 two-sided merges in 7 days: `scratch/sysaudit/tools/merge-conflicts-7d.txt`);
gen-test-groups.mjs now writes package.json only. The module went from 2,513 to
~1,000 lines.

## 5. Merge cure

deploy.mjs `cureableConflicts()` also cures `tools/shot/scenery-locations.json`
(75 conflicts in 7 days, the tree's top hot spot): take ours, run
`node tools/shot/gen-scenery-locations.cjs` (~2 min, so cure path only, never
`npm run gen`). `docs/agent-output/policies.json` (hand-written) stays a real
conflict.

## 6. Dead weight

Deleted (zero references): gfx `readback-quit-menu-oracle-repeat.mjs`,
gfx `res-scale-ab.mjs`, lighting `pit-canopy-evidence.mjs`, the empty
`tools/moves/`, npm aliases `ab:light`, `physics:sweep`, `setup:browsers` (the
scripts they named stay). Moved to `tools/archive/` (see its README): seven
note-only probes. Kept live although listed as note-only: devicefarm-opus-probe
(imported by devicefarm-iphone), helmet-trace and track-stills (generators that
shipped `js/` cites), garage-census (routed by mcp-probe).

MCP: `apex_session_status` and `apex_ci_status` left `apex-tools-mcp` (the CLIs
`session-status.mjs --json` and `ci-watch.mjs --once` print the same). The
apex_cursor_agents description was NOT trimmed: `tools/list` already publishes
it compacted (< 800 bytes, pinned in apex-tools-mcp.test.mjs); the long text is
served only by `apex_help`, on demand.

## 7. Fleet bookkeeping

- fleet-archive.mjs: a retired orchestrator (`[Done → …]` title or COMPLETED),
  agent-created and idle ≥ 60 min, is ARCHIVE once the bus carries an
  `ORCH <L> LIVE` line for its fleet naming a different session.
- session-transcript.mjs `--digest`: ≤ 40 lines / 4 kB — summary, ctx, last
  prompts and replies, tool tally, failed calls with an 80-char excerpt; never
  tool output, never a raw page. (`--ctx` was already on the deploy tip.)
- merge-done.mjs: the DONE bus line from the merge commit (PR number from
  GitHub's "Merge pull request #n" subject, both parents, actor from
  `--actor` / a `Merged-by:` trailer / the author), idempotent against the bus;
  `--range before..after` for a push. A workflow on push to the deploy branch
  calls it (88 of 326 merges in a week had no DONE line).
