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

const ROOT = new URL("..", import.meta.url).pathname;

const COMMANDS = {
  help: "the agent surface manifest — no track needed",
  world: "egocentric snapshot   --detail brief|drive|full  --horizon <s>  --points <n>",
  track: "static track data     --what corners|sectors|profile|all",
  scene: "named scenery nearby  --radius <m>  --kinds a,b  --limit <n>",
  visible: "what is on screen   --limit <n>",
  rollout: "drive an interval   --seconds <s>  --steer <-1..1>  --throttle  --brake  --samples <n>",
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
  at: num("at", 0.1),
  speed: num("speed", 55),
  lateral: num("lateral", 0),
  weather: flag("weather", null),
  tod: flag("tod", null),
  detail: flag("detail", "drive"),
  horizonS: num("horizon", 4),
  points: num("points", 5),
  what: flag("what", "corners"),
  radius: num("radius", 150),
  kinds: flag("kinds", null),
  limit: num("limit", 0),
  seconds: num("seconds", 5),
  steer: num("steer", 0),
  throttle: has("throttle"),
  brake: has("brake"),
  samples: num("samples", 8),
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });

    if (opts.cmd === "help") {
      console.log(JSON.stringify(await page.evaluate(() => window.__apex.agentHelp()), null, 2));
      return;
    }

    await page.evaluate(([t, w, tod]) => window.__apex.race(t, tod || undefined, w || undefined),
                        [track, opts.weather, opts.tod]);
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20000 });
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
        case "scene":
          return a.scene({ radius: o.radius, limit: o.limit || undefined,
                           kinds: o.kinds ? o.kinds.split(",") : undefined });
        case "visible":
          return a.visible({ limit: o.limit || undefined });
        case "rollout":
          return a.rollout({ seconds: o.seconds, samples: o.samples,
                             input: { steer: o.steer, throttle: o.throttle, brake: o.brake } });
        default:
          return { ok: false, error: "UnknownCommand", command: o.cmd };
      }
    }, opts);

    console.log(JSON.stringify(result, null, 2));
    if (result && result.ok === false) process.exitCode = 2;
  } catch (e) {
    console.error("agent failed:", e.message);
    process.exitCode = 1;
  } finally {
    await shutdown();
  }
})();
