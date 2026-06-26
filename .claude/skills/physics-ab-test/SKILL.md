---
name: physics-ab-test
description: A/B test physics constants using two parallel headless pages with identical input sequences — compare obs() traces, lap times, and slipFactor histograms across setPhysics() sweeps. Use when tuning ROAD_FOLLOW, YAW_DAMP, PLAYER_GRIP, DRIFT, or any constant exposed by setPhysics(). Triggers - "tune physics", "compare grip", "A/B physics", "does this feel better", "test ROAD_FOLLOW", "physics sweep".
---

# A/B test physics constants headlessly

Run two configurations side-by-side on the same input sequence and compare the
`obs()` traces.  No subjective feel testing — the numbers tell you which constant
combination is faster and more stable.

## Which constants are safe to sweep at runtime

`setPhysics(o)` accepts these fields (all are `let` in game.js, hot-swappable):

| Key | Effect |
|---|---|
| `pace` | AI/player overall pace multiplier |
| `playerGrip` | Lateral grip for the player |
| `frontGrip` | Front axle grip (oversteer/understeer balance) |
| `drift` | Rear slip damping — higher = more rotation |
| `roadFollow` | Curvature-tracking assist strength |
| `yawDamp` | Rotational drag — higher = more stable |
| `yawInertia` | Resistance to yaw change — higher = lazier |
| `steerExpo` | Steering response curve (1 = linear) |
| `steerMaxSlip` | Maximum steer angle at low speed |

Constants that require a **page reload** (they're `const` in game.js and can't
be overridden at runtime): `WHEELBASE`, `LONG_GRIP`, `BRAKE`.

## Parallel A/B harness (copy-paste)

```js
// tools/ab-physics.mjs — run with: node tools/ab-physics.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const CONFIGS = [
  { label: "baseline",  physics: {} },                      // current defaults
  { label: "more-grip", physics: { playerGrip: 1.15, roadFollow: 0.9 } },
];
const TRACK = "monza";
const INPUT = { steer: -0.25, throttle: true, brake: false };
const TICKS = 300; // 5 seconds at 60 fps

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}
function pickChromium() {
  for (const p of ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"])
    if (existsSync(p)) return p;
}

const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));

const browser = await chromium.launch({ executablePath: pickChromium(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });

const results = await Promise.all(CONFIGS.map(async (cfg) => {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  await page.evaluate((t) => window.__apex.race(t), TRACK);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1600));

  return page.evaluate(async ({ cfg, inp, ticks }) => {
    window.__apex.headless(true);
    window.__apex.setPhysics(cfg.physics);
    let obs = window.__apex.reset(0.1, 55, 0);
    const slips = [];
    for (let i = 0; i < ticks; i++) {
      obs = window.__apex.act(inp, 1/60, 1);
      slips.push(obs.slipFactor ?? 1);
    }
    const avgSlip = slips.reduce((a, b) => a + b) / slips.length;
    return { label: cfg.label, finalSpeed: obs.speed, avgSlip, offT: obs.offT, done: obs.done };
  }, { cfg, inp: INPUT, ticks: TICKS });
}));

await browser.close();
server.kill();

console.log('\nA/B Results:');
console.table(results);
```

## Metrics to compare

| Metric | What it tells you |
|---|---|
| `finalSpeed` | Did the car carry more or less speed? |
| `avgSlip` | Average slipFactor < 1 = traction consumed (1 = fully on edge) |
| `offT` | Time spent off-track — stability indicator |
| `done` | Did it crash out? |

## 5-point sweep example

To find the optimal `ROAD_FOLLOW` value across a range:
```js
const CONFIGS = [0.4, 0.6, 0.8, 1.0, 1.2].map(v => ({
  label: `rf=${v}`, physics: { roadFollow: v }
}));
```

Run the harness and `console.table` will show the tradeoff between stability
(`offT`) and raw speed (`finalSpeed`).

## Autopilot lap-time comparison

For a harder test, use `tests/autopilot.spec.js` patterns — run the closed-loop
driving test under each config and compare lap times.  The autopilot is a better
stress test than a fixed input sequence because it adapts to the physics and
reveals whether grip changes destabilize the racing line.
