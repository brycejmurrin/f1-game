/* metrics.test.mjs — GameMetrics toggle + snapshot, in a VM.
 *
 * The overlay is DOM; the contract that must not rot is the persist key, the
 * default-off, the URL override, and that snapshot() always returns a plain
 * object (never throws) even when __apex / PerfGov are missing.
 *
 * Run: node --test tests/unit/metrics.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedStore } from "../helpers/seed-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/metrics-overlay.js"), "utf8");

function load(opts) {
  const disk = new Map(Object.entries(opts.store || {}));
  const search = opts.search || "";
  const sandbox = {
    Math, JSON, Object, Array, String, Number, Map, isNaN, isFinite, console,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => { disk.set(k, String(v)); },
      removeItem: (k) => { disk.delete(k); },
    },
    location: { search },
    document: opts.document ? Object.assign({
      readyState: "loading",
      addEventListener() {},
      getElementById() { return null; },
    }, opts.document) : undefined,
    window: undefined,
    requestAnimationFrame: undefined,
    PerfGov: opts.PerfGov,
    __apex: opts.apex,
  };
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  seedStore(ctx);   // metrics.js persists through GameStore.store's raw lane, over the fake localStorage above
  vm.runInContext(SRC, ctx, { filename: "js/perf/metrics-overlay.js" });
  return { M: vm.runInContext("GameMetrics", ctx), disk, Log: vm.runInContext("Log", ctx) };
}

test("METRICS defaults off and persists on toggle", () => {
  const { M, disk } = load({});
  assert.equal(M.on(), false);
  assert.equal(M.KEY, "apex26.metrics");
  assert.equal(M.set(true), true);
  assert.equal(M.on(), true);
  assert.equal(disk.get("apex26.metrics"), "1");
  assert.equal(M.toggle(), false);
  assert.equal(disk.get("apex26.metrics"), "0");
});

test("?metrics=1 overrides storage for the session", () => {
  const { M, disk } = load({ store: { "apex26.metrics": "0" }, search: "?metrics=1" });
  assert.equal(M.on(), true);
  assert.equal(disk.get("apex26.metrics"), "0", "URL form must not write storage");
});

test("snapshot() is a plain object and never throws without __apex", () => {
  const { M } = load({});
  const s = M.snapshot();
  assert.equal(typeof s, "object");
  assert.equal(s.on, false);
  assert.ok(Array.isArray(s.logs));
});

test("turning metrics on raises the log buffer so the overlay tail fills", () => {
  const { M, Log } = load({});
  assert.equal(Log.level().buffer, "info");
  M.set(true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().console, "warn");
  M.set(false);
  assert.equal(Log.level().buffer, "info", "OFF restores the buffer it raised");
});

test("boot-ON (?metrics=1) raises the buffer without set()", () => {
  const { M, Log } = load({ search: "?metrics=1" });
  assert.equal(M.on(), true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().console, "warn");
});

test("metrics ON keeps per-namespace buffer overrides", () => {
  const { M, Log } = load({});
  Log.level("buffer:scenery:trace");
  M.set(true);
  assert.equal(Log.level().buffer, "debug");
  assert.equal(Log.level().bufferNs.scenery, "trace");
  M.set(false);
  assert.equal(Log.level().buffer, "info");
  assert.equal(Log.level().bufferNs.scenery, "trace");
});

test("snapshot keeps frame EMA off the governor budget", () => {
  const { M } = load({
    PerfGov: { fpsEMA: () => 16.7, floorMs: () => 22.2, tier: () => 2 },
  });
  const s = M.snapshot();
  assert.equal(s.ms, 16.7);
  assert.equal(s.budget, 22.2);
  assert.equal(s.fps, 59.9);
  assert.equal(s.tier, 2);
});

test("snapshot uses probe(), never obs()", () => {
  let obs = 0, probe = 0, field = 0;
  const { M } = load({
    apex: {
      obs() { obs++; return { speedKph: 99, s: 1, x: 2 }; },
      fieldState() { field++; return []; },
      probe() { probe++; return { speed: 20, s: 12.5, x: -0.4, angle: 0.1, k: 0.02, hw: 6 }; },
      timing() {
        return { lap: 3, pos: 4, total: 20, gear: 6, energy: 0.5, lapTime: 71.2,
          best: 70.1, gapAhead: 12.5, aeroX: 0.4, sector: 2 };
      },
      camera() { return { mode: "chase" }; },
      caution() { return { label: "GREEN" }; },
      info() { return { state: "race", track: "monza", flow: "gp", lapsTarget: 5, career: false }; },
    },
  });
  M.setPage("car");
  const s = M.snapshot();
  assert.equal(obs, 0);
  assert.equal(field, 0);
  assert.equal(probe, 1);
  assert.equal(s.speedKph, 72);
  assert.equal(s.s, 12.5);
  assert.equal(s.x, -0.4);
  assert.equal(s.lap, 3);
  assert.equal(s.cam, "chase");
  assert.equal(s.caution, "GREEN");
  assert.equal(s.gapAhead, 12.5);
  assert.equal(s.aeroX, 0.4);
  assert.equal(s.k, 0.02);
  assert.equal(s.track, "monza");
  assert.equal(s.logBuffer, "info");
});

test("overlay sits below the zoomed sector stack, not on the minimap", () => {
  const hud = readFileSync(join(ROOT, "css/hud.css"), "utf8");
  assert.match(hud, /#game-metrics[\s\S]*--hud-z-top/);
  assert.match(hud, /#game-metrics[\s\S]*--tap/);
  assert.match(hud, /#game-metrics[\s\S]*z-index:\s*11/);
  assert.doesNotMatch(hud, /#game-metrics[\s\S]*left:\s*8px/);
});

test("without a HUD digit, snapshot speed is ground km/h from probe()", () => {
  const { M } = load({
    apex: { probe() { return { speed: 20, s: 1, x: 0 }; } },
  });
  M.setPage("car");
  const gnd = M.snapshot();
  assert.equal(gnd.speedKph, 72);
  assert.equal(gnd.gndKph, 72);
  assert.equal(gnd.speedIsDash, false);
});

test("pages persist and URL metricsPage is session-only", () => {
  const { M, disk } = load({});
  assert.equal(M.page(), "gov");
  assert.equal(M.setPage("phys"), "phys");
  assert.equal(disk.get("apex26.metricsPage"), "phys");
  assert.equal(M.nextPage(1), "log");
  assert.equal(M.nextPage(1), "gov");
  const pinned = load({ store: { "apex26.metricsPage": "car" }, search: "?metricsPage=log" });
  assert.equal(pinned.M.page(), "log");
  pinned.M.setPage("gov");
  assert.equal(pinned.disk.get("apex26.metricsPage"), "car", "URL page must not write storage");
});

test("a painted HUD 0 does not wipe probe ground speed", () => {
  const { M } = load({
    document: { getElementById: (id) => id === "hud-speed-n" ? { textContent: "0" } : null },
    apex: { probe() { return { speed: 60, s: 10, x: 0 }; } },
  });
  M.setPage("car");
  const s = M.snapshot();
  assert.equal(s.dashKph, 0);
  assert.equal(s.speedKph, 0);
  assert.equal(s.speedIsDash, true);
  assert.equal(s.gndKph, 216);
});

test("snapshot reads physState() and still skips obs()/fieldState()", () => {
  let obs = 0, field = 0, phys = 0;
  const { M } = load({
    apex: {
      obs() { obs++; return {}; },
      fieldState() { field++; return []; },
      probe() { return { speed: 10, s: 1, x: 0 }; },
      physState() {
        phys++;
        return { slipDeg: 2.5, vLat: 0.4, yawRate: 0.1, slipFactor: 0.9, wrongWay: false };
      },
    },
  });
  M.setPage("phys");
  const s = M.snapshot();
  assert.equal(obs, 0);
  assert.equal(field, 0);
  assert.equal(phys, 1);
  assert.equal(s.slipDeg, 2.5);
  assert.equal(s.vLat, 0.4);
  assert.equal(s.wrongWay, false);
});

test("log page filters the tail by namespace and level", () => {
  const { M, Log } = load({});
  Log.info("car", "livery ferrari");
  Log.warn("scenery", "backdrop SUPPRESSED");
  Log.info("track", "build done monza total=1 n=1 night=false");
  M.setPage("log");
  M.setLogNs("*");
  M.setLogLvl("warn");
  const warn = M.snapshot();
  assert.equal(warn.logNs, "*");
  assert.equal(warn.logLvl, "warn");
  assert.ok(warn.logs.some((l) => l.startsWith("w scenery")));
  assert.ok(!warn.logs.some((l) => l.includes("livery")));
  M.setLogNs("track");
  M.setLogLvl("info");
  const tr = M.snapshot();
  assert.equal(tr.logs.length, 1);
  assert.match(tr.logs[0], /build done monza/);
});

test("page and log filters persist while metrics are off", () => {
  const { M, disk } = load({});
  assert.equal(M.on(), false);
  assert.equal(M.setPage("phys"), "phys");
  assert.equal(M.setLogNs("game"), "game");
  assert.equal(M.setLogLvl("debug"), "debug");
  assert.equal(disk.get("apex26.metricsPage"), "phys");
  assert.equal(disk.get("apex26.metricsLogNs"), "game");
  assert.equal(disk.get("apex26.metricsLogLvl"), "debug");
  M.set(true);
  assert.equal(M.page(), "phys");
  assert.equal(M.logNs(), "game");
  assert.equal(M.logLvl(), "debug");
});

test("GOV snapshot skips probe() and physState()", () => {
  let probe = 0, phys = 0;
  const { M } = load({
    apex: {
      probe() { probe++; return { speed: 10 }; },
      physState() { phys++; return { slipDeg: 1 }; },
    },
  });
  assert.equal(M.page(), "gov");
  M.snapshot();
  assert.equal(probe, 0);
  assert.equal(phys, 0);
});

test("?metrics=1 set() does not write storage", () => {
  const { M, disk } = load({ store: { "apex26.metrics": "0" }, search: "?metrics=1" });
  assert.equal(M.on(), true);
  M.set(false);
  assert.equal(M.on(), false);
  assert.equal(disk.get("apex26.metrics"), "0");
  M.set(true);
  assert.equal(disk.get("apex26.metrics"), "0", "URL pin must not write storage");
});

test("initUI injects separate metrics, page, and log settings buttons", () => {
  const host = { children: [], appendChild(el) { this.children.push(el); },
    insertBefore(el, ref) {
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(el);
      else this.children.splice(i, 0, el);
    } };
  const anchor = { parentNode: host, nextSibling: null };
  host.children.push(anchor);
  const { M } = load({
    document: {
      readyState: "complete",
      addEventListener() {},
      createElement(tag) {
        return { id: "", type: "button", tagName: tag.toUpperCase(), textContent: "",
          title: "", onclick: null, setAttribute() {}, style: {} };
      },
      getElementById(id) {
        if (id === "pm-hidehud") return anchor;
        if (id === "pm-metrics" || id === "pm-metrics-page" ||
            id === "pm-metrics-logns" || id === "pm-metrics-loglvl") return null;
        return null;
      },
    },
  });
  assert.ok(host.children.some((n) => n.id === "pm-metrics"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-page"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-logns"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-loglvl"));
  const metricsBtn = host.children.find((n) => n.id === "pm-metrics");
  assert.match(metricsBtn.textContent, /^METRICS: OFF$/);
  M.setPage("car");
  const pageBtn = host.children.find((n) => n.id === "pm-metrics-page");
  assert.match(pageBtn.textContent, /^PAGE: CAR$/);
});

test("HIDE HUD CSS leaves #game-metrics visible", () => {
  const css = readFileSync(join(ROOT, "css/overlays.css"), "utf8");
  assert.match(css, /body\.hud-hidden #hud/);
  assert.match(css, /body\.hud-hidden #lights/);
  assert.match(css, /body\.hud-hidden #announce/);
  assert.match(css, /body\.hud-hidden #campicker/);
  assert.doesNotMatch(css, /body\.hud-hidden #game-metrics/);
});

test("photo-mode HIDE HUD CSS hides #game-metrics", () => {
  const css = readFileSync(join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body\.pc-uihidden #game-metrics/);
});
