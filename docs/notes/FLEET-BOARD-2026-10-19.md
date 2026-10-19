# Fleet Board dashboard refresh (2026-10-19)

The Apex Fleet Board is a Dashboard Artifact (https://claude.ai/artifact/CnsX5UDkr1cpYKLH7yvX34).
Its PR, CI, bus, claims and deploy panels read **snapshot datasets** held in the
artifact's store; `sessions` is a live connector query and is never refreshed here.
The original script was lost, so `tools/ci/fleet-board-snapshot.mjs` replaces it.
Nothing in this flow merges, cancels a run or sends a bus line.

## Step 1 — gather (any session with the repo and a GitHub token)

```sh
node tools/ci/fleet-board-snapshot.mjs          # ~1 min; add --no-fetch to reuse local refs
```

Writes six files to `artifacts/fleet-board/` (ignored dir) and prints one `ok`/`ERR`
line per source plus `= snapshot ok|partial at=<UTC> pt=<Pacific>`. Exit 1 = a source
failed (its dataset is `[]` and its `snapshot.json` row says `ok: "error"`); refresh
the rest and say which failed.

| file | dataset id | content |
|---|---|---|
| `prs.json` | `prs` | open PRs into the deploy branch (newest 25): draft, mergeable, labels, game/non-game, CI verdict (`ci-watch` logic, REST) + `ci_detail`, fleet block + `fleet-status` |
| `bus.json` | `bus` | last 40 fleet-bus lines, newest first (`readBus`, no cursor, so no `fleet-bus read --as`) |
| `claims.json` | `claims` | live claims (<= 120 min) from the claims board |
| `deploy.json` | `deploy` | deploy tip, its CI verdict and pages.yml run |
| `derived.json` | `derived` | `game_slot` = newest bus HANDOFF starting `GAME-SLOT`; `last_done` = newest DONE |
| `snapshot.json` | `snapshot` | one row per source: `at`, `rows`, `ok`, `note` (the page's age stamp reads this) |

Display times carry a Pacific `*_pt` twin (`2026-10-19 11:45 PDT`); `at` fields stay UTC ISO.

## Step 2 — publish (Claude session with the `Artifact` and `ArtifactData` tools)

Per dataset `<id>`:

1. `Artifact` publish `url=<dashboard>`, `asset: true`, `file_path: artifacts/fleet-board/<id>.json` — the result gives `/_blob/<id>`.
2. `ArtifactData` `get` `datasets/<id>` for its `version`, then `update` with `if_version`:
   `{"source": {"kind": "file", "url": "/_blob/<new>", "name": "<id>.json"}, "updated": {"at": "<ISO now>", "by": "fleet-board-snapshot.mjs"}}`.
   Other fields (title, description, schedule, `staleAfterHours: 1`) stay.
3. After all six updates, `Artifact` `list` `scope: "assets"` and `delete` the previous blobs (the `url` each dataset held before step 2). Delete only those.

Never touch `datasets/sessions` or the page (`files/index.html`). One `batch` of six
`update` writes is fine once every asset is uploaded.

## Notes

- Why REST: `pr-board.mjs`/`ci-watch.mjs` use `curl` + the GitHub REST API with ETags; GraphQL is not used.
- The tool imports `ci-watch.mjs`, `pr-board.mjs`, `fleet-bus.mjs` and `who-is-on-it.mjs` dynamically (they read `process.argv` at load) and changes none of them.
- Tests: `node --test tests/unit/fleet-board-snapshot.test.mjs` (fixtures in `tests/fixtures/fleet-board/`, no network).
