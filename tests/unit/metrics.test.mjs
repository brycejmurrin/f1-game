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
    window: opts.window,
    requestAnimationFrame: undefined,
    PerfGov: opts.PerfGov,
    GLX: opts.GLX,
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
  assert.match(hud, /#game-metrics\[data-pos="left"\]/);
  assert.match(hud, /#game-metrics\[data-pos="right"\]/);
  assert.match(hud, /#game-metrics-bar/);
  assert.match(hud, /#game-metrics-bar > button[\s\S]*min-height:\s*var\(--tap-sm\)/);
  assert.match(hud, /#game-metrics\[data-size="m"\]/);
  assert.match(hud, /#game-metrics\[data-size="l"\]/);
  assert.match(hud, /#game-metrics[\s\S]*resize:\s*both/);
  // THE STEPS ARE SIZED IN THE UNITS THE CONTENT IS MEASURED IN, and this used
  // to pin the literal `min(22ch, 32vw)` — a number, not a mechanism, and the
  // number was wrong. MEASURED with a 20-char probe in the body's own font:
  // the narrow layout's longest line is 25 ch and the wide layout's is 52, but
  // the boxes held 19/25/37 ch on desktop and 15/18/25 on a 393 phone, so seven
  // of nine desktop cases and all nine phone cases CUT their text — lost, since
  // white-space:pre inside overflow:hidden does not scroll. Pin the SHAPE (a ch
  // step bounded by a vw cap) and the floor that makes it correct: S must hold
  // the narrow layout, L must be able to hold the wide one.
  const step = (sel) => {
    const at = sel ? hud.indexOf(sel) : hud.indexOf("#game-metrics {");
    assert.ok(at >= 0, `no rule for ${sel || "#game-metrics"}`);
    // To the rule's own closing brace, not a fixed window: these blocks carry
    // long measurement notes and a fixed slice silently stopped reaching the
    // declaration it was meant to check.
    const end = hud.indexOf("\n}", at);
    const m = /(?<!max-)width:\s*min\((\d+)ch,\s*(\d+)vw\)/.exec(hud.slice(at, end > 0 ? end : undefined));
    assert.ok(m, `no ch/vw max-width step for ${sel || "#game-metrics"}`);
    return { ch: +m[1], vw: +m[2] };
  };
  // Real widths, not caps — see the note on fitsWide() in the overlay.
  const S = step(null), M = step('#game-metrics[data-size="m"]'), L = step('#game-metrics[data-size="l"]');
  assert.ok(S.ch >= 26, `S must hold the narrow layout's 25-char line, got ${S.ch}ch`);
  assert.ok(L.ch >= 53, `L must be able to hold the wide layout's 52-char line, got ${L.ch}ch`);
  assert.ok(S.ch < M.ch && M.ch < L.ch, "the three steps must still be ordered");
  for (const [n, v] of [["S", S], ["M", M], ["L", L]])
    assert.ok(v.vw > 0 && v.vw <= 92, `${n} keeps a vw bound so a step cannot eat the display`);
  assert.match(hud, /max-height:\s*min\(28svh/);
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

test("overlay SIDE persists and AUTO docks left on a short viewport", () => {
  const { M, disk } = load({});
  assert.equal(M.POS_KEY, "apex26.metricsPos");
  assert.equal(M.POSITIONS.join(","), "auto,left,right");
  assert.equal(M.pos(), "auto");
  assert.equal(M.setPos("left"), "left");
  assert.equal(disk.get("apex26.metricsPos"), "left");
  assert.equal(M.nextPos(1), "right");
  const pinned = load({ store: { "apex26.metricsPos": "right" }, search: "?metricsPos=left" });
  assert.equal(pinned.M.pos(), "left");
  pinned.M.setPos("auto");
  assert.equal(pinned.disk.get("apex26.metricsPos"), "right", "URL side must not write storage");
  const short = load({ window: { innerHeight: 393, innerWidth: 852 } });
  assert.equal(short.M.pos(), "auto");
  assert.equal(short.M.resolvePos(), "left");
  const wide = load({ window: { innerHeight: 900, innerWidth: 1280 } });
  assert.equal(wide.M.resolvePos(), "right");
  const forced = load({
    window: { innerHeight: 393, innerWidth: 852 },
    store: { "apex26.metricsPos": "right" },
  });
  assert.equal(forced.M.resolvePos(), "right");
});

test("overlay SIZE persists, defaults to S, and URL is session-only", () => {
  const { M, disk } = load({});
  assert.equal(M.SIZE_KEY, "apex26.metricsSize");
  assert.equal(M.SIZES.join(","), "s,m,l");
  assert.equal(M.size(), "s");
  assert.equal(M.setSize("m"), "m");
  assert.equal(disk.get("apex26.metricsSize"), "m");
  assert.equal(M.nextSize(1), "l");
  assert.equal(M.nextSize(1), "s");
  const pinned = load({ store: { "apex26.metricsSize": "l" }, search: "?metricsSize=m" });
  assert.equal(pinned.M.size(), "m");
  pinned.M.setSize("s");
  assert.equal(pinned.disk.get("apex26.metricsSize"), "l", "URL size must not write storage");
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
        if (id === "pm-hud-details" || id === "pm-hidehud") return anchor;
        if (id === "pm-metrics" || id === "pm-metrics-page" ||
            id === "pm-metrics-pos" || id === "pm-metrics-size" ||
            id === "pm-metrics-logns" || id === "pm-metrics-loglvl") return null;
        return null;
      },
    },
  });
  assert.ok(host.children.some((n) => n.id === "pm-metrics"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-page"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-pos"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-size"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-logns"));
  assert.ok(host.children.some((n) => n.id === "pm-metrics-loglvl"));
  const metricsBtn = host.children.find((n) => n.id === "pm-metrics");
  assert.match(metricsBtn.textContent, /^OVERLAY: OFF$/);
  M.setPage("car");
  const pageBtn = host.children.find((n) => n.id === "pm-metrics-page");
  assert.match(pageBtn.textContent, /^PAGE: CAR$/);
  M.setPos("left");
  const posBtn = host.children.find((n) => n.id === "pm-metrics-pos");
  assert.match(posBtn.textContent, /^SIDE: LEFT$/);
  M.setSize("l");
  const sizeBtn = host.children.find((n) => n.id === "pm-metrics-size");
  assert.match(sizeBtn.textContent, /^SIZE: L$/);
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

// THE PANEL IS PLAYER-FACING AND ITS DATA SOURCE WAS NOT. window.__apex is
// LAZY_AGENT — js/game.js injects it for tests, localhost and ?apex=1, and
// never for a player on github.io. Every CAR and PHYS field in snapshot()
// reads through it, inside a try/catch against a NULL __apex, so on the
// shipped build PHYS painted "—" in all seventeen rows and CAR kept only the
// speed digit it scrapes from the HUD. MEASURED on the tree by diffing
// snapshot()'s populated fields with the surface present vs nulled.
//
// The test above ("never throws without __apex") pinned the graceful
// degradation and nobody noticed that degradation WAS the shipped panel, so
// these pin the REQUEST instead: the overlay asks game.js for the surface when
// a player opens it, exactly once, and never when it is already resident.
test("turning METRICS on asks game.js for the telemetry surface", () => {
  const { M } = load({ window: {} });
  let calls = 0;
  M.setTelemetryLoader(() => { calls++; return Promise.resolve(); });
  assert.equal(calls, 0, "installing the loader must not fetch while OFF");
  M.set(true);
  assert.equal(calls, 1);
  M.set(false); M.set(true);
  assert.equal(calls, 1, "one-shot: a failed or slow inject must not become a retry loop");
});

test("a resident __apex is never re-fetched, and a booted-ON panel still asks", () => {
  // localhost / ?apex=1 / a spec: the surface is already there.
  const live = load({ window: { __apex: { perf: () => ({}) } }, store: { "apex26.metrics": "1" } });
  let liveCalls = 0;
  live.M.setTelemetryLoader(() => { liveCalls++; return Promise.resolve(); });
  assert.equal(liveCalls, 0, "already resident — nothing to fetch");

  // A player who left METRICS on: initUI runs at DOMContentLoaded, BEFORE
  // game.js installs the loader, so the install itself has to ask.
  const cold = load({ window: {}, store: { "apex26.metrics": "1" } });
  let coldCalls = 0;
  cold.M.setTelemetryLoader(() => { coldCalls++; return Promise.resolve(); });
  assert.equal(coldCalls, 1, "booted ON with no loader yet must not silently stay degraded");
});

test("game.js hands the overlay the memoised loader, not a widened boot gate", () => {
  const game = readFileSync(join(ROOT, "js/game.js"), "utf8");
  // The gate stays exactly as narrow as it was: no metrics key in it.
  const gate = game.slice(game.indexOf("function wantAgentSurface()"),
                          game.indexOf("function preloadThreeVendor"));
  assert.equal(/metrics/i.test(gate), false,
    "METRICS must not put the agent surface on the player boot wall — it is fetched on demand");
  // The inject is split out and memoised, and the overlay gets it.
  assert.match(game, /function loadAgentSurface\(\)/);
  assert.match(game, /if \(!_agentLoad\) _agentLoad = \(async \(\) => \{/);
  assert.match(game, /GameMetrics\.setTelemetryLoader\(loadAgentSurface\)/);
  // Pages METRICS must not pull LAZY_NET. Net stays on the wantAgentSurface
  // (localhost / ?apex=1 / spec) path only.
  const loadAt = game.indexOf("function loadAgentSurface()");
  const loadFn = game.slice(loadAt, game.indexOf("function bootAgentSurface", loadAt));
  assert.match(loadFn, /if \(wantAgentSurface\(\)\) await ensureNet\(\)/);
  assert.equal(/^\s*await ensureNet\(\);/m.test(loadFn), false,
    "unconditional ensureNet() inside loadAgentSurface pulls WebRTC for every METRICS toggle");
  // bootAgentSurface still gates, and now defers to the shared loader.
  assert.match(game, /if \(!wantAgentSurface\(\)\) return;\s*\n\s*await loadAgentSurface\(\);/);
});

test("a phone METRICS toggle does not ask for the agent surface", () => {
  const { M } = load({ GLX: { isMobile: true, mobileTier: 2 } });
  let calls = 0;
  M.setTelemetryLoader(() => { calls++; return Promise.resolve(); });
  M.set(true);
  assert.equal(calls, 0, "phone overlay stays on PerfGov/GLX — no LAZY_AGENT fetch");
  const desk = load({ GLX: { isMobile: false, mobileTier: 0 } });
  let deskCalls = 0;
  desk.M.setTelemetryLoader(() => { deskCalls++; return Promise.resolve(); });
  desk.M.set(true);
  assert.equal(deskCalls, 1, "desktop Pages still asks once so CAR/PHYS can fill");
});

// THE LAYOUT PICKER MUST NOT MEASURE ITS OWN OUTPUT. Choosing wide/narrow from
// the panel's PAINTED width latched: the panel sizes to its content, so the
// narrow layout produced a small box, the small box failed the "can I afford
// wide?" test, and the layout could never climb back — a one-way door. It cost
// the S/M/L control too, since all three steps then painted the same width.
// MEASURED after the fix, boxW by size: desktop 221/339/457, phone 187/288/346,
// with desktop L reaching the wide layout (53 ch afforded, 52 needed) and the
// phone staying narrow (47 afforded) because 52-char rows do not fit 393 px.
// The granted width comes from the CSS step and does not depend on what was
// painted into it, which is what makes the decision stable.
test("the wide/narrow choice reads the granted width, never the painted one", () => {
  const src = readFileSync(join(ROOT, "js/perf/metrics-overlay.js"), "utf8");
  // To fitsWide()'s OWN closing brace: snapshot() is declared earlier in the
  // file, so anchoring the slice on it produced an empty string and every
  // assertion below passed vacuously.
  const at = src.indexOf("function fitsWide()");
  assert.ok(at >= 0, "fitsWide() must exist");
  const fn = src.slice(at, src.indexOf("\n}", at));
  assert.match(fn, /getComputedStyle\(_panel\)/);
  assert.match(fn, /parseFloat\(cs\.width\)/);
  assert.equal(/_body\s*&&\s*_body\.clientWidth/.test(fn), false,
    "reading the painted box width here latches the layout — use the granted width");
  // The chrome is subtracted, or the step's border box is mistaken for text room.
  assert.match(fn, /paddingLeft/);
  assert.match(fn, /borderLeftWidth/);
  // An unmeasurable box is UNKNOWN, not small: it must not force narrow.
  assert.match(fn, /metricsRatio\(\) >= 480/);
});

// physState() RETURNED THESE AND THE PANEL DROPPED THEM. Eight fields came back
// on every PHYS paint and none reached the screen: towing, xVmaxGain, xDfLoss,
// drain, regen, brakeBias, otTime, otCool. No new data path was needed — the
// fetch was already happening. MEASURED rendering, Monza at 72 m/s:
//   x cost:  vmax +0.096   df -0.567
//   tow:     0.00   brakeBias 0.560
//   ers:     drain 0.234   regen 0.105
//   ot:      3.6 s   cooldown 12.9 s
// Names match the __apex hook so a player's screenshot maps onto physState().
test("the PHYS page renders every physState field it fetches", () => {
  const src = readFileSync(join(ROOT, "js/perf/metrics-overlay.js"), "utf8");
  const carried = ["towing", "xVmaxGain", "xDfLoss", "drain", "regen", "brakeBias", "otTime", "otCool"];
  const snap = src.slice(src.indexOf("function snapshot()"), src.indexOf("function ensurePanel()"));
  for (const f of carried) {
    assert.match(snap, new RegExp(`if \\(p\\.${f} != null\\) out\\.${f} = p\\.${f};`),
      `snapshot() must carry ${f} — physState() already returns it`);
  }
  // And they must actually be PAINTED, in both densities: carrying a field into
  // the snapshot and never drawing it is the exact defect being fixed.
  const paint = src.slice(src.indexOf("function paintOverlay()"));
  for (const f of carried)
    assert.ok(paint.includes("s." + f), `the PHYS page must render s.${f}`);
});

// LINE LENGTH IS A HARD BUDGET, not a preference: white-space:pre inside
// overflow:hidden CUTS a long line. The width work measured the layouts at 25
// (narrow) and 52 (wide) characters and sized the CSS steps to hold exactly
// that, so a new row wider than its budget silently truncates on a phone.
test("new PHYS rows stay inside the measured line budgets", () => {
  const src = readFileSync(join(ROOT, "js/perf/metrics-overlay.js"), "utf8");
  // The widest value each new row can render, with every number at full width.
  const wide = [
    "x cost:  vmax +0.000   df -0.000",
    "tow:     0.00   brakeBias 0.000",
    "ers:     drain 0.000   regen 0.000",
    "ot:      0.0 s   cooldown 0.0 s",
  ];
  for (const line of wide)
    assert.ok(line.length <= 52, `wide row "${line}" is ${line.length} ch, budget 52`);
  const narrow = ["tow 0.00   bb 0.00", "xdv 0.000   xdf 0.000", "drn 0.000   rgn 0.000", "ot 0.0   cool 0.0"];
  for (const line of narrow)
    assert.ok(line.length <= 25, `narrow row "${line}" is ${line.length} ch, budget 25`);
  // The budgets themselves must still be the ones the CSS is sized for.
  assert.match(src, /const WIDE_CH = 53;/);
});
