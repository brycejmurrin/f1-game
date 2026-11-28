// merge-path-6913.mjs — a synthetic merge-path input built to #6913's measured window
// (2026-11-23T06:00Z → 2026-11-26T06:30Z, 72.5 h). It is NOT the raw REST pages (those were not kept in the repo):
// every distribution is laid out so its nearest-rank p50 / p90 / max and every count equal the issue's table, and the
// red-tip intervals are the issue's five windows. tests/unit/process-dashboard.test.mjs pins the reducer on it.
//
// Counts from #6913 §2: 211 direct PRs, 103 train cars, 29 merged trains; 46 trains closed (29 merged, 7 red:
// #6229 #6241 #6346 #6473 #6510 #6669 #6801, 9 stale, 1 unknown); land.yml 4654 started, 1821 skipped, 2833 ran,
// 516 cancelled, 572 `Land retry` dispatches.

export const FROM = "2026-11-23T06:00:00Z";
export const TO = "2026-11-26T06:30:00Z";
const F = Date.parse(FROM), T = Date.parse(TO), SPAN = T - F;
const iso = (t) => new Date(t).toISOString();
const MIN = 60_000;

/** n values (minutes) through anchors [[index, value], …], linear between them. Index 0 and n-1 must be anchors. */
function ramp(n, anchors) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = anchors.findIndex(([j]) => j >= i);
    const [j1, v1] = anchors[k];
    if (j1 === i) { out.push(v1); continue; }
    const [j0, v0] = anchors[k - 1];
    out.push(Math.round((v0 + ((v1 - v0) * (i - j0)) / (j1 - j0)) * 10) / 10);
  }
  return out;
}

/** A fixed permutation, so wait length is not ordered by merge time. */
const shuffle = (a, step) => a.map((_, i) => a[(i * step) % a.length]);

// nearest-rank: p50 = sorted[ceil(n/2)-1], p90 = sorted[ceil(0.9 n)-1]
export const DIRECT = shuffle(ramp(211, [[0, 4], [105, 30.6], [189, 138], [210, 718]]), 37); // p50 30.6 p90 138 max 718
export const CAR = shuffle(ramp(103, [[0, 15], [51, 120], [92, 343], [102, 774]]), 29); // p50 120 p90 343 max 774
export const TRAIN = shuffle(ramp(29, [[0, 12], [14, 24], [26, 42], [28, 63]]), 7); // p50 24 p90 42 max 63
/** 29 merged trains carrying 103 cars, 1–12 a train (mean 3.55). */
export const TRAIN_SIZES = [12, 1, ...Array(9).fill(4), ...Array(18).fill(3)];

export const RED_WINDOWS = [
  ["2026-11-23T08:43:00Z", "2026-11-23T09:12:00Z"], // 29 min, 0ebe8e08 (Metal)
  ["2026-11-24T23:59:00Z", "2026-11-25T00:39:00Z"], // 40 min, 53e2dd50 then 54a8ffaa
  ["2026-11-25T02:10:00Z", "2026-11-25T03:07:00Z"], // 57 min, a9e75a2f
  ["2026-11-25T13:33:00Z", "2026-11-25T17:05:00Z"], // 212 min, four reds in a row
  ["2026-11-26T04:51:00Z", "2026-11-26T06:15:00Z"], // 84 min, 304697ed
];

export function buildMergePath6913() {
  let n = 10_000;
  const prs = [];
  // 240 merge commits (211 direct + 29 trains), evenly spaced; every 8th-ish slot is a train.
  const slots = 240;
  const trainSlot = new Set(Array.from({ length: 29 }, (_, k) => Math.floor(((k + 0.5) * slots) / 29)));
  let d = 0, t = 0, c = 0;
  for (let s = 0; s < slots; s++) {
    const at = F + Math.round(((s + 0.5) * SPAN) / slots / MIN) * MIN;
    if (trainSlot.has(s)) {
      const cars = [];
      for (let k = 0; k < TRAIN_SIZES[t]; k++, c++) {
        const num = n++;
        cars.push(num);
        prs.push({ number: num, head_ref: `claude/car-${num}`, created_at: iso(at - 900 * MIN), merged_at: iso(at), closed_at: iso(at), land_at: iso(at - CAR[c] * MIN) });
      }
      const num = n++;
      prs.push({ number: num, head_ref: `train/${num}`, created_at: iso(at - TRAIN[t] * MIN), merged_at: iso(at), closed_at: iso(at), land_at: null, cars, outcome: null });
      t++;
    } else {
      const num = n++;
      prs.push({ number: num, head_ref: `claude/direct-${num}`, created_at: iso(at - 900 * MIN), merged_at: iso(at), closed_at: iso(at), land_at: iso(at - DIRECT[d] * MIN) });
      d++;
    }
  }
  // 17 trains closed unmerged: 7 red (the issue's numbers), 9 stale, 1 unknown (#6682). Their cars rode later trains.
  const closedAt = (k) => iso(F + Math.round(((k + 0.3) * SPAN) / 17 / MIN) * MIN);
  const unmerged = [
    ...[6229, 6241, 6346, 6473, 6510, 6669, 6801].map((num) => ({ num, outcome: "red" })),
    ...Array.from({ length: 9 }, () => ({ num: n++, outcome: "stale" })),
    { num: 6682, outcome: null },
  ];
  unmerged.forEach(({ num, outcome }, k) => {
    prs.push({ number: num, head_ref: `train/${num}`, created_at: iso(Date.parse(closedAt(k)) - 30 * MIN), merged_at: null, closed_at: closedAt(k), land_at: null, cars: [10_000 + k], outcome });
  });
  // A direct PR merged before the window and a train closed after it: outside, not counted.
  prs.push({ number: n++, head_ref: "claude/old", created_at: iso(F - 600 * MIN), merged_at: iso(F - MIN), closed_at: iso(F - MIN), land_at: iso(F - 60 * MIN) });

  const landRuns = [];
  const runs = 4654;
  for (let i = 0; i < runs; i++) {
    const created = F + Math.floor(((i + 0.5) * SPAN) / runs);
    let conclusion = "success", title = "Land";
    if (i < 1821) conclusion = "skipped";
    else if (i < 1821 + 516) conclusion = "cancelled";
    else if (i < 1821 + 516 + 572) title = `Land retry pr=${6000 + (i % 500)} head=- attempt=1`;
    landRuns.push({ id: 45_000_000_000 + i, created_at: iso(created), updated_at: iso(created + 5 * MIN), conclusion, title, event: title.startsWith("Land retry") ? "workflow_dispatch" : "pull_request_target" });
  }

  const pagesRuns = [];
  let id = 45_100_000_000;
  const run = (at, conclusion, jobs) => pagesRuns.push({ id: id++, head_sha: id.toString(16).split("").reverse().join("").padEnd(40, "0"), created_at: iso(Date.parse(at) - 8 * MIN), updated_at: at, conclusion, ...(jobs ? { jobs } : {}) });
  const codeRed = [{ name: "ci / Selected specs (change-aware gate) (selected-1)", conclusion: "failure", steps: [] }, { name: "deploy", conclusion: "skipped", steps: [] }];
  const platform = [{ name: "ci / Smoke", conclusion: "success", steps: [] }, { name: "deploy", conclusion: "failure", steps: [{ name: "Pages publish failed (platform)", conclusion: "failure" }] }];
  run("2026-11-23T04:00:00Z", "success");
  for (const [a, b] of RED_WINDOWS) {
    run(a, "failure", codeRed);
    if (Date.parse(b) - Date.parse(a) > 120 * MIN) {
      // the four-in-a-row window: more reds and a cancelled train inside it change nothing
      run(iso(Date.parse(a) + 60 * MIN), "failure", codeRed);
      run(iso(Date.parse(a) + 90 * MIN), "cancelled");
      run(iso(Date.parse(a) + 150 * MIN), "failure", codeRed);
    }
    run(b, "success");
  }
  // A Pages-side publish failure is not a code red (the `base` row's exclusion): no interval.
  run("2026-11-24T10:00:00Z", "failure", platform);
  run("2026-11-24T10:30:00Z", "success");
  pagesRuns.sort((x, y) => Date.parse(x.updated_at) - Date.parse(y.updated_at));
  return { window: { from: FROM, to: TO }, prs, landRuns, pagesRuns };
}
