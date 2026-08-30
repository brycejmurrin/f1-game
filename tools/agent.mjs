#!/usr/bin/env node
// agent — the agent-facing toolbelt as a CLI. Boots the game headless and calls
// one of the world-view hooks, printing JSON.
//
//   node tools/agent.mjs help
//   node tools/agent.mjs monza world --detail brief
//   node tools/agent.mjs monza world --detail full --at 0.25 --speed 70
//   node tools/agent.mjs monaco track --what corners
//   node tools/agent.mjs monza scene --radius 120 --kinds tree,building --limit 8
//   node tools/agent.mjs spa    visible --limit 6
//   node tools/agent.mjs monza rollout --seconds 6 --steer 0.1 --throttle
//   node tools/agent.mjs monza  frame --cols 72 --rows 20
//   node tools/agent.mjs monza  car --team ferrari --detail parts
//   node tools/agent.mjs vegas  survey
//   node tools/agent.mjs suzuka model --detail sections
//   node tools/agent.mjs vegas  model --detail full --out artifacts/tmp/vegas.json
//
// WHY a CLI on top of __apex.world() and friends: an agent driving this game
// from a shell otherwise has to hand-roll the same Playwright boot, race/go/jump
// staging and page.evaluate() boilerplate for every question. That boilerplate is
// where the sharp edges live — a stale camera because no frame rendered, an
// obs() that returns null because player.px was never initialised. This does the
// staging correctly once.
//
// Sibling tools: apex-eval.mjs for an arbitrary __apex expression (the escape
// hatch), apex-capture.mjs for screenshots. Prefer this for "what is going on".

import { launchChromium, shutdown, sleep, startStaticServer } from "./harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

const COMMANDS = {
  help: "the agent surface manifest — no track needed",
  world: "egocentric snapshot   --detail brief|drive|full  --horizon <s>  --points <n>",
  track: "static track data     --what corners|sectors|profile|all",
  field: "the grid / standings  --detail brief|full",
  atmosphere: "the light as text  (day/night, sun, fog, wet road)",
  objective: "what the GAME is  (win condition, trade-offs, constraints)",
  describe: "ONE thing in full   --id prop:12|corner:T3|car:4|span:2",
  query: "a bounded slice     --kind pine --near <m> --from <m> --to <m> --limit <n>",
  scene: "named scenery nearby  --radius <m>  --kinds a,b  --limit <n>  (--visible = on-screen)",
  render: "the ONE raster aid  --what view|map|circuit|car  --cols <n>  --ss <1-6>  --camera <mode>  (APPROXIMATE)",
  rollout: "drive an interval   --seconds <s>  --steer <-1..1>  --throttle  --brake  --samples <n>",
  car: "the car as JSON      --team <id>  --detail parts",
  visible: "[deprecated] scene --visible",
  frame: "[deprecated] render --what view",
  plan: "[deprecated] render --what map",
  survey: "geometry DEFECTS    --stations <n>  --lats <n>  --reach <m>  --profile",
  model: "the WHOLE circuit    --detail summary|sections|full  --offset <n>  --limit <n>  --out <file>",
};

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === "-h" || argv[0] === "--help") {
  console.log("usage: node tools/agent.mjs <track> <command> [options]\n");
  for (const [k, v] of Object.entries(COMMANDS)) console.log(`  ${k.padEnd(9)} ${v}`);
  console.log("\nstaging:  --at <frac 0-1>  --speed <m/s>  --lateral <m>  "
            + "--weather dry|wet|rain|overcast|fog  --tod dawn|day|dusk|night");
  process.exit(0);
}

// `help` is the one command that needs no circuit, so allow it in either slot.
let track = argv[0], cmd = argv[1] || "world";
if (COMMANDS[argv[0]] && !COMMANDS[argv[1] || ""]) { cmd = argv[0]; track = "monza"; }
if (!COMMANDS[cmd]) {
  console.error(`unknown command "${cmd}" — one of: ${Object.keys(COMMANDS).join(", ")}`);
  process.exit(1);
}

const flag = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const has = (name) => argv.includes("--" + name);
const num = (name, def) => {
  const v = flag(name, null);
  return v == null ? def : Number(v);
};

const opts = {
  cmd,
  // staging position as a lap fraction. A value >1 is not a fraction — it is a
  // stale `survey --at <count>` invocation, and passing it to jump() would wrap
  // to 0 and stage at the start line while looking deliberate. Fall back to the
  // default instead of silently teleporting somewhere the caller didn't ask for.
  at: num("at", 0.1) > 1 ? 0.1 : num("at", 0.1),
  speed: num("speed", 55),
  lateral: num("lateral", 0),
  weather: flag("weather", null),
  tod: flag("tod", null),
  detail: flag("detail", "drive"),
  horizonS: num("horizon", 4),
  points: num("points", 5),
  what: flag("what", "corners"),
  radius: num("radius", 150),
  // accept --kind and --kinds; a silently-unbound filter returned the whole
  // registry and looked like a working query
  kinds: flag("kinds", null) || flag("kind", null),
  limit: num("limit", 0),
  seconds: num("seconds", 5),
  steer: num("steer", 0),
  throttle: has("throttle"),
  brake: has("brake"),
  samples: num("samples", 8),
  modelDetail: flag("detail", "summary"),
  offset: num("offset", 0),
  cols: num("cols", 56),
  rows: num("rows", 16),
  ss: num("ss", 0),   // render({what:"car"}) supersampling override, 1-6 (0 = default)
  range: num("range", 500),
  team: flag("team", null),
  // survey samples N stations across the WHOLE lap — a count, not a position.
  // It used to read --at, which also means the staging frac 0-1, so
  // `survey --at 32` both asked for 32 stations AND fed jump(32) — and 32 % 1
  // is 0, silently staging at the start line. --stations is the flag; --at is
  // still honoured when >1 so old invocations keep working, but it no longer
  // doubles as staging (see the `at` guard below).
  stations: num("stations", 0) || (num("at", 0) > 1 ? num("at", 0) : 0),
  lats: num("lats", 0),
  profileFlag: has("profile"),
  reach: num("reach", 60),        // survey's lateral reach — distinct from frame's --range
  north: has("north"),
  edges: has("edges"),
  visibleFlag: has("visible"),
  cam: flag("camera", null),
  out: flag("out", null),
  id: flag("id", null),                 // describe: prop:12 | corner:T3 | car:4
  nearM: has("near") ? num("near", 150) : null,   // query: radius around the car
  fromS: has("from") ? num("from", 0) : null,     // query: arc window start (m)
  toS: has("to") ? num("to", 0) : null,           // query: arc window end (m)
};

(async () => {
  const srv = await startStaticServer(ROOT);
  try {
    const browser = await launchChromium({
      args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu",
             "--disable-background-timer-throttling"],
    });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: 15000 });

    if (opts.cmd === "help") {
      console.log(JSON.stringify(await page.evaluate(() => window.__apex.agentHelp()), null, 2));
      return;
    }

    await page.evaluate(([t, w, tod]) => window.__apex.race(t, tod || undefined, w || undefined),
                        [track, opts.weather, opts.tod]);
    await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 20000 });
    await sleep(1600);                       // mesh build

    // Stage the car, then let frames actually draw. visible() reads the LAST
    // RENDERED frame, so skipping this reports a camera still at its pre-jump
    // position — plausible-looking and wrong.
    await page.evaluate(([at, speed, lateral]) => {
      window.__apex.go();
      window.__apex.jump(at, speed, lateral);
    }, [opts.at, opts.speed, opts.lateral]);
    await page.evaluate(() => new Promise((res) => {
      let i = 0;
      const tick = () => (++i > 10 ? res(0) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }));

    const result = await page.evaluate((o) => {
      const a = window.__apex;
      switch (o.cmd) {
        case "world":
          return a.world({ detail: o.detail, horizonS: o.horizonS, points: o.points });
        case "track":
          return a.trackInfo({ what: o.what });
        case "field":
          return a.field({ detail: o.modelDetail === "full" ? "full" : "brief" });
        case "atmosphere":
          return a.atmosphere();
        case "objective":
          return a.objective();
        case "describe":
          return a.describe(o.id);
        case "query":
          return a.query({ kind: o.kinds ? o.kinds.split(",") : undefined,
                           near: o.nearM != null ? o.nearM : undefined,
                           fromS: o.fromS != null ? o.fromS : undefined,
                           toS: o.toS != null ? o.toS : undefined,
                           limit: o.limit || undefined });
        case "scene":
          if (o.visibleFlag) return a.scene({ visible: true, limit: o.limit || undefined });
          return a.scene({ radius: o.radius, limit: o.limit || undefined,
                           kinds: o.kinds ? o.kinds.split(",") : undefined });
        case "render": {
          const w = (o.what && o.what !== "corners") ? o.what : "view";
          return a.render({
            what: w, cols: o.cols, rows: o.rows, rangeM: o.range,
            camera: o.cam || undefined, edges: o.edges, ss: o.ss || undefined,
            radiusM: o.radius !== 150 ? o.radius : undefined, northUp: o.north,
            detail: o.modelDetail, offset: o.offset, team: o.team || undefined,
            limit: o.limit || undefined });
        }
        case "visible":
          return a.scene({ visible: true, limit: o.limit || undefined });
        case "frame":
          return a.render({ what: "view", cols: o.cols, rows: o.rows, rangeM: o.range,
                           camera: o.cam || undefined, edges: o.edges,
                           limit: o.limit || undefined });
        case "plan":
          return a.render({ what: "map", radiusM: o.radius !== 150 ? o.radius : undefined,
                          cols: o.cols, northUp: o.north });
        case "car":
          return a.carView({ team: o.team || undefined, cols: o.cols || undefined,
                             detail: (o.modelDetail === "parts" || o.modelDetail === "render")
                               ? o.modelDetail : undefined });
        case "survey":
          return a.survey({ at: o.stations || undefined, lats: o.lats || undefined,
                            reachM: o.reach, limit: o.limit || undefined,
                            profile: o.profileFlag });
        case "model":
          return a.render({ what: "circuit", detail: o.modelDetail, offset: o.offset,
                                limit: o.limit || undefined });
        case "rollout":
          return a.rollout({ seconds: o.seconds, samples: o.samples,
                             input: { steer: o.steer, throttle: o.throttle, brake: o.brake } });
        default:
          return { ok: false, error: "UnknownCommand", command: o.cmd };
      }
    }, opts);

    if ((opts.cmd === "frame" || opts.cmd === "plan" || opts.cmd === "render")
        && result && result.grid && result.grid.lines && !opts.out) {
      // Printing the raster inside a JSON string array defeats the purpose —
      // the grid is meant to be looked at.
      console.log(result.grid.lines.join("\n"));
      console.log(JSON.stringify({ legend: result.legend, coveragePct: result.coveragePct,
                                   horizonRow: result.grid.horizonRow,
                                   camera: result.camera, lighting: result.lighting,
                                   objects: result.objects }, null, 2));
      return;
    }
    const json = JSON.stringify(result, null, 2);
    if (opts.out) {
      // A full world dump is megabytes on a street circuit — writing it beats
      // paging it through a terminal, and the caller can then read what it needs.
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, json);
      console.log(JSON.stringify({ wrote: opts.out, bytes: json.length,
                                   detail: opts.modelDetail }, null, 2));
    } else {
      console.log(json);
    }
    if (result && result.ok === false) process.exitCode = 2;
  } catch (e) {
    console.error("agent failed:", e.message);
    process.exitCode = 1;
  } finally {
    await shutdown();
  }
})();
