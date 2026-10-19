# Garage angles, liveries and car parts

Read the checkout’s `garage-parts-livery` skill. Implementations remain in the game checkout. Inspect current MCP schemas and discover canonical IDs before applying a design; no browser starts for catalog lookup.

## Discovery

On checkouts that expose focused catalog sections, call:

```json
{"section":"parts","limit":25}
```

`apex_catalog` accepts `section:"parts"|"liveries"|"garage"`, optional `category`, `team`, `filter`, `offset` and `limit` (maximum 100). Follow `nextOffset` until the needed rows are found. Omitting `section` preserves the general catalog route. Parts expose canonical IDs/options/stats/cost/restrictions/available teams plus category summaries; liveries expose per-team IDs and canonical field values where exported; garage exposes station/alias/target metadata from the CLI. Availability caveats remain authoritative: a catalog option is not proof of a successful in-game purchase or a saved career entitlement.

Use exact discovered IDs rather than guessing category names, part values, team IDs or camera stations. Older checkouts without these sections use their documented CLI catalog routes.

## Persistent angle and part inspection

1. Close any existing browser-owning job/session first. Open a persistent `apex_garage` session using a persistent attached MCP connection (or the documented persistent CLI):

   ```json
   {"op":"open","team":"ferrari","backend":"webgl2","out":"artifacts/garage-review","target":"local"}
   ```

   Verify the current catalog includes the selected team and backend. A one-shot shell `call` ends its process/session; it cannot preserve a garage across separate calls.
2. Frame a discovered station or view with `op:"frame"`, then save a named `op:"shot"`. Design fields use current `Liveries.FIELDS`, `part.<category>` and documented lighting knobs. Keys apply in design → frame → shot order. Orbit azimuth/elevation are radians; distance is metres. Do not convert units by guesswork.
3. Capture baseline and candidate at matching backend, team, lighting, station, viewport and scale. Use `op:"diff"` on two shot names/PNG paths or `op:"sheet"` for a named contact sheet. Inspect the images; changed pixels alone do not identify a defect. Preserve the camera helpers/preset workflow for driving views rather than replacing them with garage-only framing.
4. Close with `op:"close"` in cleanup, including failed operations. The persistent session holds the shared browser lock until closed. Only then may another browser tool, suite, profiler or debugger session start.

## Audits and bounded sweeps

Use browser-free `apex_car_audit {"check":"ladder"}` to detect dominated parts, or `check:"crest"` with optional teams for legibility checks. Where the schema supports it, ladder accepts `categories` and canonical `team` to focus scope. These checks do not establish every geometry/view is visually correct.

For rendered parts coverage, use `apex_job_start` with `kind:"parts_sweep"` and discovered `categories`/`team` filters; inspect the current schema and preview a dry run first. Define a small category/team/view budget before starting. Follow the returned job via `apex_job_status`; use current cancellation operation and wait for process exit if stopping early. Livery contrast is another bounded job, not a reason to run the full sweep by default. Label skipped teams, parts, views, backends and entitlement cases explicitly.

Finish with evidence paths and Pass/Fail/Skip by audit/view. Use one disposable profile and preserve saved driving preferences. This workflow does not authorize persistence of a player’s design, career mutations, broad game changes, merging or deployment.

## Bounded garage matrix planning

If available, `apex_garage_plan` accepts a canonical `team`, up to four discovered `frames` (stations/aliases), one canonical livery enum `field`, up to four `options`, `maxShots` 1–16 and `budgetSeconds` 30–180, plus `dryRun`. Its default is `mclaren` / `spineTop`. The browser-free plan reports `withinBudget` and the complete estimated matrix; it does not capture frames or certify visual results. Reduce scope if the plan exceeds the budget. Arbitrary design objects, scenarios, URLs and flags are not accepted. Execute any approved capture through the existing serialized garage workflow.
