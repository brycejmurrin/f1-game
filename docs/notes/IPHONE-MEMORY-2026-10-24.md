# iPhone memory from the Device Farm syslogs (2026-10-24)

A·Y2 (Fleet A analyst), issue #3675, lever 5 of `DEVICE-FARM-ANALYSIS-2026-10-24.md` §4 (PR #3671). Bryce chose "All"
of A·Y1's levers in OrchA 31 (~00:22Z) and said "Yes" to pulling the logs with the session's AWS credentials.
Read-only: `list-runs`, `list-artifacts` and downloads. **0 device-minutes were spent.** Nothing here was run on a device.

## Answer

1. **Peak sampled footprint.** iPhone 14: 465 MB, taken before any race (the run wedged, ledger row 5). iPhone 18 Pro Max:
   698 MB, taken after a whole WebGPU leg of racing (ledger row 7). These are the only samples, because WebKit prints a
   footprint only when the main frame navigates (§Method). The in-race maximum on either phone is **not in these logs**.
2. **Headroom to the jetsam limit.** The limits are in the log: WebContent **1536 MB (soft)** on the iPhone 14 and
   **2048 MB (hard)** on the 18 Pro Max. At the sampled peaks the headroom is 1071 MB (iPhone 14, 30 % used) and
   1350 MB (18 Pro Max, 34 % used). Neither run logged a memory kill.
3. **PERF-KNOWN-WINS row 9 (about 54 MB of TLX CPU geometry copies): rank it low on this evidence.** 54 MB is 3.5 % of the
   iPhone 14 limit, 2.6 % of the 18 Pro Max limit and 7.7 % of the 698 MB sample. Nothing measured says WebContent is near
   its limit, and row 9 is rated HIGH risk with four failed attempts. It moves up only if a mid-race iPhone 14 sample
   reads above roughly 1.3 GB. Read §Row 9 for what the logs cannot say about the GPU process.

## Sources

| ledger row | run (Device Farm project `apex-profiler`) | device | what ran | device-min |
|---|---|---|---|---|
| 5 | `apex-auto-1792722347879` (`b0bdfba3`) | iPhone 14, iOS 27.0 | `auto` + Instruments, 2 legs; Safari debugger wedged after xctrace disconnected | 33.66 |
| 7 | `apex-auto-1792723971555` (`5275a269`) | iPhone 18 Pro Max, iOS 27.0 | `auto` + Activity Monitor, 2 legs (WebGPU, then WebGL2), build 20849 (pre-#3603) | 18.47 |

Each run has three `DEVICE_LOG` artifacts named `Syslog` (setup, test, teardown). The test one is the large file
(351 MB and 290 MB); the three together are 407 MB and 319 MB. The `Customer Artifacts` zip holds the host script's
`report.json` (row 7 only; row 5 never wrote one), `appium.log` and the Safari console.

Fetch (the AWS CLI was not installed here; `pip install awscli` gave aws-cli 1.46, credentials from the environment):

```sh
aws devicefarm list-runs --arn <project-arn> --region us-west-2
aws devicefarm list-artifacts --arn <run-arn> --type FILE --region us-west-2 \
  --query "artifacts[?type=='DEVICE_LOG'].url"        # presigned S3 URLs: never print or commit them
```

Keep the files under ignored `artifacts/`. Device Farm retains them 400 days.

## Method

`node tools/perf/devicefarm-syslog.mjs <syslog>... [--json]` (unit test `tests/unit/devicefarm-syslog.test.mjs`) reads the
files in order and keeps four kinds of line. The device prints local time with no year, so it assumes PDT (UTC-7) and
2026; both are options.

| signal | where it comes from |
|---|---|
| WebContent footprint | `MobileSafari(WebKit)` prints `WebContent[pid]: Memory usage info dump at MainFrameLoadStarted:` or `…Completed:` and then `phys_footprint_mb`, `internal_mb`, `compressed_mb`, `resident_size_mb`, `javascript_gc_heap_capacity_mb`, `document_count`, one field per line, other daemons' lines in between |
| process limits | `runningboardd` prints `Memory Limits: active N inactive M` and `set Memory Limits to Hard\|Soft Active (N)` when it launches each WebKit extension |
| kills | a memory kill would name itself in a kernel `memorystatus:` line or a `JetsamEvent`; a bare `SIGKILL` exit context is counted apart because the harness force-quits Safari the same way |
| buffer failures | `Unable to create buffer`, `present failed` |

`phys_footprint_mb` is the number iOS compares with the jetsam limit. A footprint exists only at a main-frame load, so
**a per-minute table is impossible from these logs**: row 7 has 11 samples in 17 minutes and none inside a race. The GPU
process (`com.apple.WebKit.GPU`) never prints a footprint. The syslog has no thermal-state field (the `thermalmonitord`
lines are an unrelated sensor error); the host script's `report.json` polls thermal and read 0 (nominal) at 7 polls on row 7.

## Footprint by phase

WebContent process, MB, UTC on 2026-10-23. "Blank" loads (about 11 MB) are Safari's own pages and are left out.

### iPhone 18 Pro Max (row 7, WebContent limit 2048 MB hard, GPU 600 MB soft, Safari app 3376 MB)

| UTC | phase (from `report.json` and the harness) | footprint | internal | resident | JS heap | docs |
|---|---|---|---|---|---|---|
| 02:53:53 | boot: game page loaded | 285 | 120 | 205 | 23 | 2 |
| 02:54:16 | title/menu after about 23 s, leaving for the bench page | 442 | 314 | 517 | 193 | 3 |
| 02:54:18 | bench harness page loaded | 487 | 315 | 537 | 197 | 5 |
| 02:57:32 | **end of the WebGPU leg** (cold race entry 31.6 s, warm entry, six 25 s measured phases): leaving the page | **682** | 444 | 1050 | 365 | 5 |
| 02:57:34 | WebGL2 leg page loaded | **698** (peak) | 442 | 1061 | 184 | 6 |
| 03:00:24 | end of the WebGL2 leg | 555 | 339 | 1186 | 379 | 6 |
| 03:00:24 → 03:00:25 | harness reloads | 534, 497, 460 | 341, 342, 285 | 1191, 1192, 1217 | 379, 100, 25 | 7, 7, 8 |

Peak 698 MB = 34.1 % of the limit, headroom 1350 MB. The 02:57:34 sample is a freshly loaded page that still holds the
previous document, so the clean "end of leg" reading is the 682 MB at 02:57:32.

### iPhone 14 (row 5, WebContent limit 1536 MB soft, GPU 300 MB soft, Safari app 3072 MB)

| UTC | phase | footprint | internal | resident | JS heap | docs |
|---|---|---|---|---|---|---|
| 02:26:51 | boot: game page loaded | 227 | 94 | 169 | 14 | 2 |
| 02:27:15 | menu, leaving for the bench page | 386 | 288 | 476 | 154 | 3 |
| 02:27:16 | bench harness page loaded | **465** (peak) | 301 | 488 | 157 | 5 |

Peak 465 MB = 30.3 % of the limit, headroom 1071 MB. Then nothing: the run wedged on the Instruments disconnect
(ledger row 5, §7 of the AWS note) and the next dumps, from 02:55:53, are 11 MB blank pages. **No iPhone 14 footprint
exists for a race, a garage or a restart.** The same applies to "garage" on both phones: the harness never enters it.

### Kills, restarts and errors

- **Memory kills: none in either run.** No `memorystatus` kill line, no `JetsamEvent`, no `per-process-limit` line.
  Both runs end with every Safari process receiving SIGKILL (status `2, 9, 9`): on the iPhone 14 four processes at
  02:55:44Z together with `testmanagerd` tearing the session down, on the 18 Pro Max the two WebContent processes at
  03:00:28Z, four seconds after the bench finished. That is the harness force-quitting Safari between steps, not
  memory pressure. This is an inference from timing and the absence of any memory line; the log has no explicit "killed by harness" text.
- **`Unable to create buffer` / `present failed`: 0 lines** in both syslogs. The one occurrence the ledger mentions
  (iPhone 14, WebGPU) is in a different raw artifact, so it is not tied to a footprint here.
- Restarts: each harness reload makes a new WebContent process (pids 608 → 613, and 600 earlier on the 18 Pro Max;
  1364, 1367 and 1356 on the iPhone 14). The footprint of the old process is its last dump above.

## Row 9: does releasing the TLX CPU copies matter?

`PERF-KNOWN-WINS-2026-10-23.md` row 9: release about 54 MB of CPU geometry copies on phones (`tlx.js:201` warns about it
and the row-7 Safari console logged that warning six times).

| quantity | iPhone 14 | 18 Pro Max |
|---|---|---|
| WebContent limit | 1536 MB soft | 2048 MB hard |
| 54 MB as a share of the limit | 3.5 % | 2.6 % |
| highest sample | 465 MB (pre-race) | 698 MB |
| 54 MB as a share of that sample | 11.6 % | 7.7 % |
| headroom at that sample | 1071 MB | 1350 MB |

What the data supports:

- The copies are small against the WebContent limit, and the only race-side sample (18 Pro Max, 682 MB) leaves two thirds
  of the limit free. A 54 MB cut there changes nothing that a player would see.
- It cannot be ruled out for the **iPhone 14 in a race**, where the footprint was never sampled. The 18 Pro Max grew
  from 487 MB at the bench page to 682 MB at the end of a WebGPU leg (+195 MB, +40 %). Scaling the same +195 MB onto the
  iPhone 14's 465 MB gives about 660 MB, still well under 1536 MB, but that is arithmetic, not a measurement.
- **The failure the ledger saw is not a WebContent failure.** `GPUDevice.createBuffer: Unable to create buffer` comes from
  the GPU process, which has its own limit: 300 MB (soft) on the iPhone 14 and 600 MB (soft) on the 18 Pro Max. The CPU
  geometry copies row 9 would free live in WebContent, so they cannot relieve that limit. GPU-resident bytes (render
  targets, the sky cache, #2649's target trims) are the candidates, and no footprint is logged for that process. This is
  a hypothesis from where the limits sit; the logs neither confirm nor refute it.
- Ranking against the measured cost of the alternatives: row 9 stays below the sky-cache and render-target trims (they act on
  the process that has the smaller budget) and below anything that shortens the 18–24 s iPhone 14 cold entry. Its risk
  rating (HIGH, four failed attempts, one shipped road loss) is not paid for by 3.5 % of a limit that is 70 % free.

## Caveats

- Two runs, one device each, build 20849 (pre-#3603; AUTO picked WebGL2 at boot and the bench pinned each leg). The
  live build is WebGPU-first with the #3604 warm-up changes, so absolute numbers are a floor to re-measure, not a current value.
- Samples exist only at navigations, so every figure is a "level at a moment", never a peak. The true in-race maximum is higher.
- Row 5 has no race sample at all; the iPhone 14 numbers are pre-race and the headroom there is an upper bound.
- The two legs share one Safari session, so the WebGL2 numbers carry what the WebGPU leg left behind (document count rises
  5 → 8). Do not read 555 vs 682 MB as a renderer difference.
- Device Farm units are iOS 27.0; no iOS 26 unit exists, so the limits are the ones for that OS and those two models.

## Next steps (not done here)

1. **Sample the footprint where it matters, for free.** WebKit dumps on any main-frame load, so a scenario that ends with
   `location.reload()` right after the race window gives the footprint at the end of that race, which is how the 682 MB
   above was taken. Do that once per phase (menu, garage, race end) in an `auto` run on the iPhone 14.
   `performance.measureUserAgentSpecificMemory` does not exist in Safari, and Instruments is unusable on Device Farm.
2. **Print the table at the end of every `auto` run.** `devicefarm-iphone.mjs auto` already downloads the syslogs; calling
   `parseFiles` + `table` from `devicefarm-syslog.mjs` on the `DEVICE_LOG` files is a small change in a file this note's
   lane does not own (`tools/perf/devicefarm-iphone.mjs`), so it is left to A·D1's lane.
3. **Get a GPU-process number** before ranking #2649 or the sky-cache trim by memory: the log has none, so it needs a
   different probe (for example the `TLX` render-target byte counts the game already reports, read against the 300 MB limit).
