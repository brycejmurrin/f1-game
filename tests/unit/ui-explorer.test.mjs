import test from "node:test";
import assert from "node:assert/strict";
import { parseOptions, main } from "../../tools/ui/explorer.mjs";
import { MISSIONS, missionBrief, MODE_TITLES } from "../../tools/ui/explorer/catalog.mjs";
import { validateScenario } from "../../tools/ui/explorer/core.mjs";
import { matchesOracle, performAction, installFault, inspectUI, captureSceneDiagnostics } from "../../tools/ui/explorer/browser.mjs";
import vm from "node:vm";

test("explorer CLI rejects unbounded probes, typo modes and credential URLs before browser acquisition", () => {
  for (const args of [["all", "--max-shots", "26"], ["all", "--max-shots", "NaN"], ["all", "--max-attempts", "0"], ["all", "--frac", "1.1"], ["all", "--out"], ["all", "--modes", "typo"], ["all", "--url", "https://secret:password@example.com/"], ["all", "--unknown"], ["all", "extra"]]) assert.throws(() => parseOptions(args));
  assert.equal(parseOptions(["responsive", "--max-shots=0"]).maxShots, 0);
  assert.throws(() => parseOptions(["all", "--max-shots", "-1"]));
  assert.throws(() => parseOptions(["all", "--frac", "-0.1"]));
  assert.deepEqual(parseOptions(["scene", "--scene-views", "-45"]).sceneViews, [-45]);
  assert.deepEqual(parseOptions(["all"]).modes.sort(), Object.keys(MODE_TITLES).sort());
});

test("all three shipped missions are validated data with a real goal oracle", () => {
  for (const m of MISSIONS) { const v = validateScenario(m); assert(v.actions.length > 3); assert(v.oracle); }
  const b = missionBrief(MISSIONS[0], "https://preview.example/game/");
  assert(b.task.includes(MISSIONS[0].goal));
  assert(b.task.includes("visible controls only"));
  assert(!b.task.includes("#mb-race"), "blind brief must not leak the scripted solution");
  assert.throws(() => missionBrief(MISSIONS[0], "javascript:alert(1)"));
});

test("replay uses actionable Playwright controls instead of direct DOM click", async () => {
  const seen = [];
  const session = { page: { locator: (selector) => ({ click: async () => seen.push(selector), fill: async (v) => seen.push(v) }), keyboard: { press: async (k) => seen.push(k) } } };
  await performAction(session, { type: "click", selector: "#menu" });
  await performAction(session, { type: "fill", selector: "#name", value: "livery" });
  await performAction(session, { type: "press", key: "Escape" });
  assert.deepEqual(seen, ["#menu", "livery", "Escape"]);
});

test("minimizer oracle matches the same console finding rather than any error", async () => {
  const session = { logs: { errors: [{ kind: "pageerror", message: "Unrelated problem" }, { kind: "console", message: "Expected marker" }] } };
  assert.equal(await matchesOracle(session, { type: "console", kind: "pageerror", pattern: "Expected marker" }), false);
  assert.equal(await matchesOracle(session, { type: "console", kind: "console", pattern: "Expected marker" }), true);
});

test("race mission verifies actual track and weather instead of just a visible HUD", async () => {
  const oracle = validateScenario(MISSIONS[0]).oracle;
  assert.equal(oracle.type, "game");
  assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monza", weather: "wet" }) } }, oracle), false);
  assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monaco", weather: "dry" }) } }, oracle), false);
  assert.equal(await matchesOracle({ page: { evaluate: async () => ({ track: "monaco", weather: "wet" }) } }, oracle), true);
});

test("fault profiles leave ordinary scripts alone, intercept assets and restore routing", async () => {
  let handler, restored = false, aborted = false, continued = false;
  const context = { route: async (pattern, fn) => { handler = fn; }, unrouteAll: async ({ behavior }) => { restored = behavior === "wait"; } };
  const f = await installFault(context, "missing-assets");
  const route = (url) => ({ request: () => ({ url: () => url }), continue: async () => { continued = true; }, abort: async () => { aborted = true; } });
  await handler(route("http://localhost/js/probe-fixture.js")); assert(continued); assert(!aborted);
  await handler(route("http://localhost/assets/missing.glb")); assert(aborted); assert.equal(f.events.length, 1);
  await f.restore(); assert(restored);
});

test("DOM screening ignores controls inside closed folds but preserves real offscreen findings", () => {
  const rect = { x: 1100, y: 0, width: 20, height: 20, right: 1120, bottom: 20 };
  const summary = { contains: () => false };
  const fold = { tagName: "DETAILS", open: false, querySelector: () => summary, parentElement: null, getBoundingClientRect: () => ({ x: 0, y: 0, right: 1000, bottom: 800 }) };
  const control = { id: "test-control", tagName: "BUTTON", textContent: "TEST", parentElement: fold, getAttribute: () => null,
    closest: () => null, getBoundingClientRect: () => rect };
  const root = { ...control, id: "overlay", parentElement: null };
  const document = { querySelectorAll: (selector) => selector.includes(".screen") ? [root] : selector.startsWith("button") ? [control] : [],
    documentElement: { scrollWidth: 1000, dataset: {} }, activeElement: null, getElementById: () => null };
  const ctx = vm.createContext({ document, window: {}, innerWidth: 1000, innerHeight: 800, location: { href: "http://localhost/" }, CSS: { escape: (s) => s },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }), matchMedia: () => ({ matches: false }) });
  const inspect = () => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, ctx)));
  assert.deepEqual(inspect().controls, []);
  fold.open = true;
  assert(inspect().issues.some((i) => i.kind === "offscreen" && i.selector === "#test-control"));
  assert(inspect().roots.includes("overlay"));
});

test("scene diagnostics read the presented state and pause before any DOM/ARIA work, including on failure", () => {
  const calls = [];
  const a = { scene: () => { calls.push("scene"); return { visible: true }; }, camState: () => { calls.push("camera"); return {}; }, headless: (on) => calls.push(on ? "pause" : "resume") };
  const ctx = vm.createContext({ window: { __apex: a } });
  vm.runInContext(`(${captureSceneDiagnostics.toString()})()`, ctx);
  assert.deepEqual(calls, ["scene", "camera", "pause"]);
  calls.length = 0; a.scene = () => { throw new Error("diagnostics failed"); };
  assert.throws(() => vm.runInContext(`(${captureSceneDiagnostics.toString()})()`, ctx));
  assert.deepEqual(calls, ["pause"]);
});

test("inspector resolves multi-ID labels, native roles and pressed state", () => {
  const attrs = { "aria-labelledby": "first second", "aria-pressed": "false" };
  const rect = { x: 10, y: 10, width: 150, height: 44, right: 160, bottom: 54 };
  const control = { id: "toggle", tagName: "BUTTON", textContent: "", parentElement: null, type: "button",
    getAttribute: k => attrs[k] ?? null, closest: () => null, getBoundingClientRect: () => rect };
  const document = { querySelectorAll: s => s.startsWith("button") ? [control] : [],
    documentElement: { scrollWidth: 1000, dataset: {} }, activeElement: null,
    getElementById: id => ({ first: { textContent: "Audio\n" }, second: { textContent: " layers" } })[id] };
  const ctx = vm.createContext({ document, window: {}, innerWidth: 1000, innerHeight: 800, location: { href: "http://localhost/" }, CSS: { escape: s => s },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }), matchMedia: () => ({ matches: false }) });
  const inspect = () => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, ctx)));
  assert.equal(inspect().controls[0].name, "Audio layers");
  document.documentElement.dataset = { uiTheme: "light", uiContrast: "high", menuAccent: "blue", hudAccent: "white", textSize: "large", cvd: "deuteranopia", menuHelp: "off", motion: "reduce" };
  assert.deepEqual(inspect().adaptive.preferences, document.documentElement.dataset);
  assert.equal(inspect().controls[0].pressed, "false");
  attrs["aria-pressed"] = "true";
  assert.equal(inspect().controls[0].pressed, "true");
  control.tagName = "INPUT"; control.type = "range"; control.value = "50";
  assert.equal(inspect().controls[0].role, "slider");
});

test("inspector ignores boxless contents ancestors but preserves an outer real clip", () => {
  const rect = { x: 20, y: 20, width: 160, height: 50, right: 180, bottom: 70 };
  const zero = { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
  const outer = { id: "outer", tagName: "DIV", parentElement: null, getBoundingClientRect: () => ({ ...rect, right: 100, width: 80 }) };
  const contents = { id: "contents", tagName: "DIV", parentElement: outer, getBoundingClientRect: () => zero };
  const control = { id: "target", tagName: "BUTTON", textContent: "Visible action", parentElement: contents,
    getAttribute: () => null, closest: () => null, getBoundingClientRect: () => rect };
  const document = { querySelectorAll: s => s.startsWith("button") ? [control] : [], elementFromPoint: () => control,
    documentElement: { scrollWidth: 1000, dataset: {} }, activeElement: null };
  let outerClips = false;
  const ctx = vm.createContext({ document, window: {}, innerWidth: 1000, innerHeight: 800, location: { href: "http://localhost/" }, CSS: { escape: s => s },
    getComputedStyle: e => ({ display: e === contents ? "contents" : "block", visibility: "visible", opacity: "1",
      overflowX: e === contents || e === outer && outerClips ? "hidden" : "visible", overflowY: "visible" }), matchMedia: () => ({ matches: false }) });
  const inspect = () => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, ctx)));
  assert.deepEqual(inspect().controls[0].reachability.clippedBy, []);
  assert.equal(inspect().controls[0].reachability.hit, "hits");
  outerClips = true;
  assert.deepEqual(inspect().controls[0].reachability.clippedBy, [{ selector: "#outer", axis: "x" }]);
});

test("semantic state keys distinguish constant-label toggle changes", async () => {
  const { stateKey } = await import("../../tools/ui/explorer/core.mjs");
  const a = { viewport: { width: 1000, height: 800 }, controls: [{ selector: "#audio", role: "button", name: "Whine", pressed: "false" }] };
  const b = { ...a, controls: [{ ...a.controls[0], pressed: "true" }] };
  assert.notEqual(stateKey(a), stateKey(b));
});

test("inspect CLI validates routes and selector budgets before browser acquisition", () => {
  const opts = parseOptions(["inspect", "--screen", "settings", "--styles", "#pm-uiscale"]);
  assert.equal(opts.command, "inspect"); assert.equal(opts.styles, "#pm-uiscale");
  for (const args of [["inspect", "--screen", "missing"], ["inspect", "--styles", " "] , ["inspect", "--selector", "x".repeat(513)], ["missions", "--styles", "button"]]) assert.throws(() => parseOptions(args));
  assert.deepEqual(parseOptions(["inspect", "--viewports", "390x844,844x390"]).viewports, [{ width: 390, height: 844 }, { width: 844, height: 390 }]);
  for (const size of ["", "390x", "239x844", "390x2161", "Infinityx844", "390.5x844", Array(9).fill("390x844").join(",")]) assert.throws(() => parseOptions(["inspect", "--viewports=" + size]));
  assert.throws(() => parseOptions(["responsive", "--viewports", "390x844"]));
});

test("inspector diffs separate semantic changes from movement and include runtime bindings", async () => {
  const { diffInspections } = await import("../../tools/ui/explorer/inspector.mjs");
  const control = { selector: "#size", value: "100", box: { x: 0 }, binding: { runtime: 100 } };
  const before = { controls: [control], focus: null, issues: [] };
  const after = { ...before, controls: [{ ...control, box: { x: 12 } }] };
  assert.deepEqual(diffInspections(before, after).changed, []);
  assert.deepEqual(diffInspections(before, after).layout, ["#size"]);
  after.controls[0].binding = { runtime: 101 };
  assert.equal(diffInspections(before, after).changed.length, 1);
  const adapted = { ...before, controls: [{ ...control, layout: { "flex-wrap": "wrap" }, layoutAncestors: ["#sheet"] }],
    adaptive: { rootTokens: { "--ui-scale": "1.3" } }, layoutContexts: [{ selector: "#sheet", box: { width: 400 } }] };
  assert.deepEqual(diffInspections(before, adapted).changed, []);
  assert.deepEqual(diffInspections(before, adapted).layout, ["#size"]);
  assert.deepEqual(diffInspections(before, adapted).layoutContexts, ["#sheet"]);
  assert.equal(diffInspections(before, adapted).environmentChanged, true);
});

test("responsive inspection validates before mutation and restores viewport even on failure", async () => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  const changes = [], original = { width: 1280, height: 800 }; let current = original, fail = false;
  const page = { viewportSize: () => current, setViewportSize: async v => { changes.push(v); current = v; },
    evaluate: async (fn, args) => {
      if (!args) return;
      if (fail) throw new Error("Root disappeared during resize");
      return { controls: [], viewport: current, issues: [] };
    }, locator: () => ({ ariaSnapshot: async () => "Settings" }) };
  await assert.rejects(() => inspectResponsive(page, { viewports: [{ width: 200, height: 800 }] }), /viewports/);
  assert.deepEqual(changes, []);
  const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
  const report = await inspectResponsive(page, { viewports });
  assert.deepEqual(changes, [...viewports, original]);
  assert.equal(report.records[1].diff.viewportChanged, true);
  assert.equal(report.records[0].diff, null);
  fail = true;
  await assert.rejects(() => inspectResponsive(page, { viewports }), /Root disappeared/);
  assert.deepEqual(current, original);
  assert.deepEqual(changes.slice(-2), [viewports[0], original]);
  await assert.rejects(() => inspectResponsive({ viewportSize: () => null }, { viewports }), /restorable/);
});

test("CSS inspection detaches its CDP session when the selector is ambiguous", async () => {
  const { inspectPage } = await import("../../tools/ui/explorer/inspector.mjs");
  let detached = false;
  const cdp = { on() {}, async send(method) { return method === "DOM.getDocument" ? { root: { nodeId: 1 } } : method === "DOM.querySelectorAll" ? { nodeIds: [2, 3] } : {}; }, async detach() { detached = true; } };
  const page = { evaluate: async () => ({}), locator: () => ({ ariaSnapshot: async () => "button" }), context: () => ({ newCDPSession: async () => cdp }) };
  await assert.rejects(() => inspectPage(page, { styles: "button" }), /exactly one/);
  assert.equal(detached, true);
});
