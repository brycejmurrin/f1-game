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

test("shipped missions are validated data with a real goal oracle", () => {
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

test("inspect CLI bounds round-trip and audit inputs before browser acquisition", () => {
  const options = parseOptions(["inspect", "--viewports", "390x844,844x390", "--roundtrip", "--audit", "artifacts/audit.json"]);
  assert.equal(options.roundTrip, true); assert.equal(options.audit, "artifacts/audit.json");
  for (const args of [["inspect", "--roundtrip"], ["inspect", "--viewports", "390x844", "--roundtrip=false"], ["inspect", "--audit="], ["missions", "--audit", "x.json"], ["inspect", "--audit"]]) assert.throws(() => parseOptions(args));
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
  const roundTrip = await inspectResponsive(page, { viewports, roundTrip: true });
  assert.deepEqual(roundTrip.records.map(r => r.phase), ["forward", "forward", "reverse"]);
  assert.deepEqual(roundTrip.records.map(r => r.sourceIndex), [0, 1, 0]);
  assert.deepEqual(changes.slice(-4), [...viewports, viewports[0], original]);
  assert.ok(roundTrip.paths);

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

test("inspect CLI bounds touch, boot, safe-area and summary flags before browser acquisition", () => {
  const o = parseOptions(["inspect", "--screen", "settings", "--touch", "--boot", "932x430", "--safe", "0,59,21,59", "--summary"]);
  assert.equal(o.touch, true); assert.equal(o.summary, true);
  assert.deepEqual(o.boot, { width: 932, height: 430 });
  assert.deepEqual(o.safe, { top: 0, right: 59, bottom: 21, left: 59 });
  const plain = parseOptions(["inspect"]);
  assert.equal(plain.touch, false); assert.equal(plain.boot, null); assert.equal(plain.safe, null);
  for (const args of [["inspect", "--safe", "1,2,3"], ["inspect", "--safe", "0,59,21,-1"], ["inspect", "--safe", "0,59,21,201"], ["inspect", "--safe", "a,b,c,d"],
    ["inspect", "--boot", "932"], ["inspect", "--boot", "100x100"], ["inspect", "--touch=yes"], ["inspect", "--summary=1"],
    ["missions", "--touch"], ["responsive", "--safe", "0,0,0,0"], ["all", "--boot", "932x430"]]) assert.throws(() => parseOptions(args), String(args));
});

test("busy box and held lock defer with exit 75, distinct from a failed probe", async () => {
  const { loadDeferral, deferral } = await import("../../tools/ui/explorer.mjs");
  assert.equal(loadDeferral(2.9), null);
  assert.equal(loadDeferral(3).exitCode, 75);
  assert.match(loadDeferral(4.2).message, /deferred/);
  assert.equal(deferral("Browser occupied").exitCode, 75);
});

test("inspect summary prints one line per issue and marks provisional records", async () => {
  const { summarizeInspection } = await import("../../tools/ui/explorer.mjs");
  const report = { records: [
    { requestedViewport: { width: 932, height: 430 }, inspection: { issues: [{ kind: "blocked", selector: "#a", message: "A covered", provisional: true }] } },
    { requestedViewport: { width: 844, height: 390 }, inspection: { issues: [] } }] };
  const summary = summarizeInspection(report, "select");
  assert(summary.includes("select\t932x430\tblocked (provisional)\t#a\tA covered"));
  assert(summary.includes("select\t844x390\tno-findings\tcoverage"));
  assert(summary.includes("bindings=unknown"));
  const single = summarizeInspection({ viewport: { width: 1280, height: 800 }, issues: [], settlement: { stable: true, truncated: true } }, "settings");
  assert(single.includes("settlement=stable; truncated=settlement"));
  assert(single.includes("behavior=not-tested; persistence=not-tested"));
  assert(!single.includes("clean"));
});

test("binding assertions require live agreement and the exact saved value, never an unmapped pass", async () => {
  const { checkBinding } = await import("../../tools/ui/explorer/browser.mjs");
  let binding = { status: "matches", runtime: "light", saved: { status: "read", value: "light" } };
  const session = { page: { evaluate: async () => ({ controls: [{ binding }] }) } };
  const oracle = { type: "binding", selector: "#theme", runtime: "light", saved: "light" };
  assert.equal((await checkBinding(session, oracle)).matches, true);
  for (const change of [{ status: "unmapped" }, { status: "unavailable" }, { status: "mismatch" },
    { saved: { status: "unavailable", value: "light" } }, { saved: { status: "read", value: null } }, { runtime: "dark" }]) {
    binding = { status: "matches", runtime: "light", saved: { status: "read", value: "light" }, ...change };
    assert.equal((await checkBinding(session, oracle)).matches, false);
    await assert.rejects(() => performAction(session, { type: "assert", oracle }), /Replay assertion failed:.*actual/);
  }
});

test("inspector scopes include the control itself, reject ambiguity and expose bounded coverage", () => {
  const rect = { x: 5, y: 5, width: 120, height: 44, right: 125, bottom: 49 };
  let runtime = "dark", ambiguous = false;
  const group = { id: "as-uiTheme", tagName: "DIV", parentElement: null, getBoundingClientRect: () => rect, children: [] };
  const buttons = ["Dark", "Light", "System"].map((textContent, index) => ({ id: `theme-${index}`, tagName: "BUTTON", type: "button", textContent,
    parentElement: group, getAttribute: k => k === "aria-pressed" ? String(index === 0) : null,
    closest: () => null, contains: () => false, matches: s => s !== ":disabled", querySelectorAll: () => [], getBoundingClientRect: () => rect }));
  group.children = buttons;
  const document = { querySelectorAll: s => s === "#scope" ? ambiguous ? [group, group] : [group] : s === "#theme-0" ? [buttons[0]] : [],
    elementFromPoint: () => buttons[0], documentElement: { scrollWidth: 1000, dataset: {} }, activeElement: null };
  group.querySelectorAll = () => buttons;
  const context = vm.createContext({ document, window: {}, AppearanceOpts: { theme: () => runtime }, GameStore: { store: { get: () => "dark" } },
    innerWidth: 1000, innerHeight: 800, location: { href: "http://localhost/" }, CSS: { escape: s => s },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }), matchMedia: () => ({ matches: false }) });
  const inspect = options => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})(${JSON.stringify(options)})`, context)));
  const single = inspect({ root: "#theme-0" });
  assert.equal(single.controls.length, 1);
  assert.equal(single.controls[0].binding.status, "matches");
  assert.equal(single.coverage.bindings.matches, 1);
  runtime = "light";
  assert.equal(inspect({ root: "#theme-0" }).controls[0].binding.status, "mismatch");
  const limited = inspect({ root: "#scope", limit: 1 });
  assert.deepEqual(limited.coverage.controls, { total: 3, inspected: 1, omitted: 2 });
  assert.equal(limited.truncated, true);
  assert.equal(limited.coverage.persistence, "not-tested");
  ambiguous = true;
  assert.throws(() => inspect({ root: "#scope" }), /exactly one.*matched 2/);
  assert.throws(() => inspect({ root: "#missing" }), /exactly one.*matched 0/);
});

test("inspector counts a native label as the tap target and the bare root as not hit-testable", () => {
  const rect = (x, y, w, h) => ({ x, y, width: w, height: h, right: x + w, bottom: y + h });
  const row = { tagName: "LABEL", parentElement: null, textContent: "BRAKING CUES", getBoundingClientRect: () => rect(0, 0, 400, 56), contains: () => false };
  const box = { id: "cues", tagName: "INPUT", type: "checkbox", checked: false, textContent: "", parentElement: row, labels: [row],
    getAttribute: () => null, closest: () => null, contains: () => false, getBoundingClientRect: () => rect(4, 21, 14, 14) };
  const html = { tagName: "HTML" };
  let hit = row;
  const document = { querySelectorAll: s => s.startsWith("button") ? [box] : [], elementFromPoint: () => hit,
    documentElement: html, body: { tagName: "BODY" }, activeElement: null, getElementById: () => null };
  html.scrollWidth = 1000; html.dataset = {};
  const ctx = vm.createContext({ document, window: {}, innerWidth: 1000, innerHeight: 800, location: { href: "http://localhost/" }, CSS: { escape: s => s },
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1", overflowX: "visible", overflowY: "visible" }), matchMedia: () => ({ matches: true }) });
  const inspect = () => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, ctx)));
  const labelled = inspect();
  assert.equal(labelled.controls[0].reachability.hit, "hits");
  assert.equal(labelled.issues.some(i => i.kind === "tiny-target"), false, "the 400x56 label row is the target, not the 14px box");
  box.labels = [];
  assert.match(inspect().issues.find(i => i.kind === "tiny-target").message, /14\.0 × 14\.0/);
  hit = html;
  const bare = inspect();
  assert.equal(bare.controls[0].reachability.hit, "not-hit-testable");
  assert.deepEqual(bare.issues.filter(i => i.kind === "blocked"), []);
  assert(bare.issues.some(i => i.kind === "not-hit-testable"));
  hit = { tagName: "DIV", id: "cover", parentElement: null };
  assert(inspect().issues.some(i => i.kind === "blocked" && /#cover/.test(i.message)));
});

test("responsive inspection resamples an unsettled record once, then marks its issues provisional", async () => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  let settles = 0, settleScript = [false, false, true, true];
  let current = { width: 1280, height: 800 };
  const page = { viewportSize: () => current, setViewportSize: async v => { current = v; },
    evaluate: async (fn, args) => {
      if (fn.name === "settleLayout") return { stable: settleScript[settles++] ?? true, frames: 3 };
      if (fn.name === "captureAuditEnvironment") return {};
      return { controls: [], viewport: current, issues: [{ kind: "blocked", selector: "#x", message: "x" }] };
    }, locator: () => ({ ariaSnapshot: async () => "" }) };
  const report = await inspectResponsive(page, { viewports: [{ width: 932, height: 430 }, { width: 844, height: 390 }] });
  assert.equal(settles, 3, "first record settles twice, second once");
  assert.equal(report.records[0].settlement.retried, true);
  assert.equal(report.records[0].inspection.provisional, true);
  assert.equal(report.records[0].inspection.issues[0].provisional, true);
  assert.equal(report.records[1].inspection.provisional, undefined);
  assert.equal(report.records[1].inspection.issues[0].provisional, undefined);
});

test("single-size inspect settles before reading and keeps the settlement record", async () => {
  const { inspectSettled } = await import("../../tools/ui/explorer/inspector.mjs");
  const calls = [];
  const page = { evaluate: async (fn) => {
      calls.push(fn.name);
      if (fn.name === "settleLayout") return { stable: calls.filter(n => n === "settleLayout").length > 1, frames: 3 };
      if (fn.name === "captureAuditEnvironment") return {};
      return { controls: [], issues: [{ kind: "blocked", selector: "#x", message: "x" }] };
    }, locator: () => ({ ariaSnapshot: async () => "" }) };
  const { settlement, inspection } = await inspectSettled(page, { root: "#pmsettings" });
  assert.equal(calls[0], "settleLayout", "settles before the DOM read");
  assert.equal(settlement.retried, true); assert.equal(settlement.stable, true);
  assert.equal(inspection.provisional, undefined);
  assert.equal(inspection.issues[0].provisional, undefined);
});

test("an unsettled record with no animation frames is not retried (more time cannot help)", async () => {
  const { inspectSettled } = await import("../../tools/ui/explorer/inspector.mjs");
  let settles = 0;
  const page = { evaluate: async (fn) => {
      if (fn.name === "settleLayout") { settles++; return { stable: false, frames: 0 }; }
      if (fn.name === "captureAuditEnvironment") return {};
      return { controls: [], issues: [{ kind: "offscreen", selector: "#x", message: "x" }] };
    }, locator: () => ({ ariaSnapshot: async () => "" }) };
  const { settlement, inspection } = await inspectSettled(page, {});
  assert.equal(settles, 1); assert.equal(settlement.retried, undefined);
  assert.equal(inspection.provisional, true); assert.equal(inspection.issues[0].provisional, true);
});

test("inspector: a control whose centre is under a sibling past a scroller edge reads needs-scroll, not blocked (T11)", () => {
  const rect = (x, y, w, h) => ({ x, y, width: w, height: h, right: x + w, bottom: y + h });
  const scroller = { tagName: "DIV", id: "body", parentElement: null, scrollHeight: 500, clientHeight: 200, getBoundingClientRect: () => rect(0, 0, 400, 200) };
  const input = { id: "name", tagName: "INPUT", type: "text", value: "", textContent: "", parentElement: scroller, labels: [],
    getAttribute: () => null, closest: () => null, contains: () => false, getBoundingClientRect: () => rect(10, 199, 300, 40) };
  const overlay = { tagName: "DIV", id: "footer", parentElement: null };
  const document = { querySelectorAll: s => s.startsWith("button") ? [input] : [], documentElement: { tagName: "HTML", scrollWidth: 400, dataset: {} },
    body: { tagName: "BODY" }, activeElement: null, getElementById: () => null, elementFromPoint: () => overlay };
  const ctx = vm.createContext({ document, window: {}, innerWidth: 400, innerHeight: 200, location: { href: "http://localhost/" }, CSS: { escape: s => s },
    getComputedStyle: p => ({ display: "block", visibility: "visible", opacity: "1", overflowX: "visible", overflowY: p === scroller ? "auto" : "visible" }), matchMedia: () => ({ matches: true }) });
  const inspect = () => JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, ctx)));
  const sliver = inspect();
  assert.equal(sliver.controls[0].reachability.hit, "needs-scroll");
  assert.deepEqual(sliver.issues.filter(i => i.kind === "blocked"), []);
  input.getBoundingClientRect = () => rect(10, 100, 300, 40); // fully inside the scroller: a real overlay stays blocked
  assert.equal(inspect().controls[0].reachability.hit, "blocked");
});


test('binding assertions tolerate finite numeric serialization without coercing other types', async () => {
  const { checkBinding } = await import('../../tools/ui/explorer/browser.mjs');
  let runtime = 109.00000000000001, saved = runtime;
  const session = { page: { evaluate: async () => ({ controls: [{ binding: {
    status: 'matches', runtime, saved: { status: 'read', value: saved },
  } }] }) } };
  const oracle = { type: 'binding', selector: '#scale', runtime: 109, saved: 109 };
  assert.equal((await checkBinding(session, oracle)).matches, true);
  for (const wrong of [109.001, '109', true, NaN, Infinity]) {
    runtime = wrong;
    assert.equal((await checkBinding(session, oracle)).matches, false);
  }
  runtime = 109; saved = '109';
  assert.equal((await checkBinding(session, oracle)).matches, false);
  runtime = 'light'; saved = 'light';
  assert.equal((await checkBinding(session, { ...oracle, runtime: 'light', saved: 'light' })).matches, true);
});

test('inspector includes pointer-only controls, named canvases and bounded select options in boxless regions', () => {
  const rect = { x: 10, y: 10, width: 100, height: 44, right: 110, bottom: 54 };
  const element = (id, tagName, attrs = {}) => ({ id, tagName, parentElement: null, textContent: '', tabIndex: 0,
    getAttribute: k => attrs[k] ?? null, closest: () => null, contains: () => false, matches: () => false,
    querySelectorAll: () => [], getBoundingClientRect: () => rect });
  const pointer = element('next', 'BUTTON', { 'aria-hidden': 'true' });
  pointer.closest = s => s.includes('aria-hidden') ? pointer : null;
  const canvas = element('editor', 'CANVAS', { 'aria-label': 'Track drawing' });
  const decorative = element('decorative', 'CANVAS');
  const select = element('theme', 'SELECT', { 'aria-label': 'Theme' });
  select.value = 'dark';
  select.options = Array.from({ length: 70 }, (_, i) => ({ label: i === 0 ? 'x'.repeat(170) : `Choice ${i}`,
    value: String(i), selected: i === 0, disabled: false, closest: () => i === 1 ? {} : null }));
  const region = element('sheet', 'DIV');
  region.getBoundingClientRect = () => ({ ...rect, width: 0, height: 0 });
  region.querySelectorAll = () => [pointer];
  const unfocusable = element('inactive-canvas', 'CANVAS', { 'aria-label': 'Inactive' }); unfocusable.tabIndex = -1;
  const hidden = element('hidden', 'BUTTON'); hidden.closest = s => s.includes('[hidden]') ? hidden : null;
  let activeView = canvas;
  const controls = [pointer, canvas, decorative, select, unfocusable, hidden];
  const document = { querySelectorAll: s => s.includes('.screen') ? [region] : s.startsWith('button') ? controls : s.startsWith('[role=') ? [activeView] : [],
    documentElement: { scrollWidth: 1000, dataset: {} }, activeElement: null, elementFromPoint: () => pointer };
  const context = vm.createContext({ document, window: {}, innerWidth: 1000, innerHeight: 800,
    location: { href: 'http://localhost/' }, CSS: { escape: s => s }, matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) });
  const report = JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, context)));
  assert.deepEqual(report.roots, ['sheet']);
  assert.deepEqual(report.views, ['#editor']);
  activeView = element('dh-panel', 'DIV', { 'aria-labelledby': 'dh-tab-export' });
  const exportView = JSON.parse(JSON.stringify(vm.runInContext(`(${inspectUI.toString()})()`, context)));
  assert.deepEqual(exportView.views, ['#dh-panel[aria-labelledby=\"dh-tab-export\"]']);
  assert.deepEqual(report.controls.map(c => c.selector), ['#next', '#editor', '#theme']);
  assert.equal(report.controls[0].interactionKind, 'pointer-only');
  assert.equal(report.controls[0].ariaHidden, true);
  assert.equal(report.controls[1].interactionKind, 'custom-surface');
  assert(!report.issues.some(i => i.kind === 'unnamed' && i.selector === '#next'));
  const choices = report.controls[2];
  assert.equal(choices.options.length, 64);
  assert.equal(choices.options[0].name.length, 160);
  assert.equal(choices.options[0].truncated, true);
  assert.equal(choices.options[1].disabled, true);
  assert.deepEqual(choices.optionCoverage, { total: 70, inspected: 64, omitted: 6, truncated: true });
});

test('garage routes stop when deferred content never becomes ready', async () => {
  const { openGarageTab } = await import('../../tools/ui/menu-screens.mjs');
  const clicks = [];
  const page = { click: async s => clicks.push(s), waitForSelector: async s => {
    if (s.includes('aria-busy')) throw new Error('Garage content remained busy');
  } };
  await assert.rejects(() => openGarageTab(page, 'team'), /remained busy/);
  assert.deepEqual(clicks, ['#mb-garage'], 'never silently skip a missing tab or click stale content');
});

test('theme persistence recipe exercises the current native control on both sides of reload', () => {
  const mission = MISSIONS.find(m => m.id === 'settings-persistence');
  const reload = mission.actions.findIndex(a => a.type === 'reload');
  assert(mission.actions.some(a => a.type === 'select' && a.selector === '#pm-uitheme-sel' && a.value === 'light'));
  for (const actions of [mission.actions.slice(0, reload), mission.actions.slice(reload + 1)]) {
    assert(actions.some(a => a.type === 'assert' && a.oracle.selector === '#pm-uitheme-sel' && a.oracle.saved === 'light'));
  }
});

test('reload blocks subsequent replay actions until the game boot boundary', async () => {
  const seen = []; let releaseBoot;
  const page = { reload: async () => seen.push('document'),
    waitForFunction: async () => { seen.push('boot-pending'); await new Promise(resolve => { releaseBoot = resolve; }); },
    evaluate: async () => seen.push('pause-menu-rendering') };
  let finished = false;
  const work = performAction({ page }, { type: 'reload' }).then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'DOMContentLoaded alone cannot authorize a replay click');
  assert.deepEqual(seen, ['document', 'boot-pending']);
  releaseBoot(); await work;
  assert.deepEqual(seen, ['document', 'boot-pending', 'pause-menu-rendering']);
});

// Device resolution is independent of CSS layout size; mobile identity must be complete.
test("UI profiles preserve descriptor browser chrome, DPR and touch while labeling custom sizes", async () => {
  const { resolveUIProfile, uiTestOptions } = await import("../../tools/lib/ui-device-profile.mjs");
  const { devices } = await import("playwright");
  const phone = resolveUIProfile({ touch: true });
  assert.equal(phone.contextOptions.userAgent, devices['iPhone 13'].userAgent);
  assert.equal(phone.contextOptions.deviceScaleFactor, 3);
  assert.equal(phone.contextOptions.isMobile, true);
  assert.equal(phone.contextOptions.hasTouch, true);
  assert.deepEqual(phone.contextOptions.viewport, devices['iPhone 13'].viewport);
  assert.deepEqual(phone.contextOptions.screen, devices['iPhone 13'].screen);
  assert.equal(phone.profile.kind, 'device-emulation');
  const tablet = uiTestOptions({ device: 'iPad Mini' });
  assert.deepEqual(tablet.contextOptions.screen, { width: 768, height: 1024 });
  assert(!Object.hasOwn(tablet, 'screen'), 'screen must use the Playwright Test contextOptions channel');
  assert.equal(tablet.isMobile, true);
  const desktop = uiTestOptions({ device: 'Desktop Chrome' });
  assert.deepEqual(desktop.contextOptions.screen, devices['Desktop Chrome'].screen);
  assert.notDeepEqual(desktop.contextOptions.screen, desktop.viewport, 'desktop monitor and browser window are independent');
  assert(!Object.hasOwn(phone.contextOptions, 'defaultBrowserType'));
  const stress = resolveUIProfile({ touch: true, viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  assert.equal(stress.profile.kind, 'custom-css-viewport');
  assert.equal(stress.profile.raster, 'geometry-override');
  assert.deepEqual(stress.contextOptions.screen, { width: 844, height: 390 });
  assert.equal(stress.contextOptions.isMobile, true);
  assert.equal(resolveUIProfile({ viewport: { width: 390, height: 844 } }).contextOptions.hasTouch, false);
  assert.throws(() => resolveUIProfile({ device: 'made-up phone' }));
  assert.throws(() => resolveUIProfile({ viewport: { width: NaN, height: 390 } }));
  assert.throws(() => resolveUIProfile({ deviceScaleFactor: 0 }));
  const opts = parseOptions(['inspect', '--device', 'iPhone 13', '--settings', 'appearance.json']);
  assert.equal(opts.device, 'iPhone 13'); assert.equal(opts.settingsFile, 'appearance.json');
  assert.throws(() => parseOptions(['inspect', '--device', 'made-up phone']));
});

test("full-screen catalog cells stay full-screen when Playwright's browser-chrome descriptors change", async () => {
  const { VIEWPORTS } = await import('../../tools/ui/menu-screens.mjs');
  for (const [id, width, height] of [['ios-iphone-portrait',393,852],['ios-iphone-landscape',852,393],['ios-iphone-landscape-844',844,390]]) {
    const [, options] = VIEWPORTS.find(([name]) => name === id);
    assert.deepEqual(options.viewport, { width, height });
    assert.deepEqual(options.screen, { width, height });
    assert(options.isMobile && options.hasTouch);
  }
});

test("replay emits native taps for mobile profiles and clicks for desktop", async () => {
  const calls = [];
  const page = { locator: () => ({ tap: async () => calls.push('tap'), click: async () => calls.push('click') }) };
  await performAction({ page, profile: { hasTouch: true } }, { type: 'click', selector: '#mb-garage' });
  await performAction({ page, profile: { hasTouch: false } }, { type: 'click', selector: '#mb-garage' });
  assert.deepEqual(calls, ['tap', 'click']);
});

test("invalid supplied settings never silently become shipped defaults or acquire a browser", async () => {
  const fs = await import('node:fs');
  fs.mkdirSync('scratch', { recursive: true });
  const dir = fs.mkdtempSync('scratch/invalid-ui-settings-');
  try {
    for (const value of [null, false, 0, [], {}, { format: 'other' }]) {
      const file = dir + '/settings.json'; fs.writeFileSync(file, JSON.stringify(value));
      await assert.rejects(main(['inspect', '--settings', file]), /requires an Apex settings export/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test("MCP UI summary retains bounded console and request evidence without claiming a pass", async () => {
  const { summarizeUIInspection } = await import("../../tools/mcp/ui-tools.mjs");
  const empty = summarizeUIInspection({ controls: [], issues: [] });
  assert.equal(empty.diagnostics.consoleErrors, null, "missing logs remain unknown");
  const errors = Array.from({ length: 12 }, (_, n) => ({ kind: "console", level: n ? "warning" : "error", message: "x".repeat(5000) }));
  errors.push({ kind: "pageerror", message: "failed callback" });
  const result = summarizeUIInspection({ controls: [], issues: [], errors, requests: [{ url: "http://127.0.0.1/missing.glb", error: "net::ERR_FAILED" }] });
  assert.equal(result.diagnostics.pageErrors, 1);
  assert.equal(result.diagnostics.consoleErrors, 1);
  assert.equal(result.diagnostics.consoleWarnings, 11);
  assert.equal(result.diagnostics.failedRequests, 1);
  assert.equal(result.diagnostics.errorSamples.length, 10);
  assert.ok(result.diagnostics.errorSamples[0].message.length < 600);
  assert.equal(result.diagnostics.requestSamples[0].error, "net::ERR_FAILED");
  assert.equal(result.diagnostics.truncated, true);
  assert.match(result.limitation, /not a UI pass/);
  assert.equal(summarizeUIInspection({ controls: [], errors: [], requests: [] }).diagnostics.consoleErrors, 0);
});
