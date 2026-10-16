// @doc Eight UI exploration modes sharing bounded evidence, replay and a real navigation graph.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { validateScenario, addGraphStep, minimizeActions, stateKey } from "./core.mjs";
import { MODE_TITLES, MISSIONS, missionBrief } from "./catalog.mjs";
import { gotoGame, mutateCaptureScene } from "../../shot/probe-page.mjs";
import { inspectUI, openSession, performAction, matchesOracle, captureRecord, startPerformanceTrace, installFault, positionScene } from "./browser.mjs";

export async function explore(browser, url, options) {
  const { outDir, modes = Object.keys(MODE_TITLES), maxShots = 25 } = options;
  fs.mkdirSync(path.join(outDir, "evidence"), { recursive: true });
  const bundle = { version: 1, meta: { title: "Apex UI Explorer", url, gitHead: options.gitHead, startedAt: new Date().toISOString(), browser: browser.version(), viewport: { width: 1280, height: 800 },
    limitations: ["Passed means a probe completed, not that the UI has no defects. DOM findings are screening advisories requiring review.", "Menu background rendering is paused after boot; guided races omit rendered loading/flyby timing. Browser actions use visible controls. Scene investigations explicitly resume rendering.", "Fresh contexts block service workers for repeatable network faults; service-worker recovery is not covered.", "Touch emulation is Chromium, not proof of Safari/iOS behavior. Root text enlargement does not scale fixed-pixel text.", "Blind Browser Use missions are exported briefs, separate from deterministic guided recipes; no independent-agent verdict is invented."] },
    capabilities: Object.entries(MODE_TITLES).map(([id, title]) => ({ id, title, status: "not-run", reason: modes.includes(id) ? "Pending execution" : "Outside selected scope", records: [] })), graph: { nodes: [], edges: [] }, findings: [] };
  const budget = { used: 0, max: maxShots }, candidates = [];
  const cap = (id) => bundle.capabilities.find((c) => c.id === id);
  const saveJSON = (name, data) => { fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2)); return name; };
  const record = async (s, mode, id, label, actions = [], details = {}) => {
    if (id.length > 80) id = `${id.slice(0, 63)}-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
    const artifacts = {};
    if (mode !== "scene") artifacts.repro = saveJSON(`evidence/${id}.replay.json`, validateScenario({ version: 1, id, goal: label, actions }));
    const r = await captureRecord(s, outDir, id, label, budget, { mode, actions, artifacts, details });
    cap(mode).records.push(r);
    for (const issue of r.after.issues) {
      const identity = `${issue.kind}|${issue.selector || issue.message}`;
      if (!bundle.findings.some((f) => f.identity === identity)) bundle.findings.push({ id: `finding-${bundle.findings.length + 1}`, identity, severity: "advisory", ...issue, recordId: id, evidence: r.screenshot });
      if (issue.selector && mode === "responsive") candidates.push({ version: 1, id: `reduce-${id}`, goal: `Reproduce ${issue.kind} at ${issue.selector}`, actions, oracle: { type: "layout", kind: issue.kind, selector: issue.selector } });
    }
    for (const err of r.errors.filter((e) => e.kind === "pageerror" || e.level === "error")) {
      const identity = `${err.kind}|${err.message}`;
      if (!bundle.findings.some((f) => f.identity === identity)) bundle.findings.push({ id: `finding-${bundle.findings.length + 1}`, identity, kind: err.kind, severity: "error", message: err.message, recordId: id });
    }
    const node = bundle.graph.nodes.find((n) => n.key === stateKey(r.after));
    if (node && !node.recordId) { node.recordId = id; node.label = r.after.roots.join(" + ") || "No visible screen"; }
    return r;
  };
  const step = async (s, action) => {
    const before = await s.page.evaluate(inspectUI); const started = performance.now();
    await performAction(s, action);
    const after = await s.page.evaluate(inspectUI);
    addGraphStep(bundle.graph, before, after, action);
    return { before, after, durationMs: Math.round(performance.now() - started) };
  };
  const withSession = async (fn, opts) => {
    const s = await openSession(browser, url, opts); let timer;
    const work = Promise.resolve().then(() => fn(s));
    try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => { void s.context.close(); reject(new Error("Session exceeded 180-second evidence deadline")); }, 180000); })]); }
    finally { clearTimeout(timer); await s.context.close(); await work.catch(() => {}); }
  };
  const run = async (id, fn) => {
    if (!modes.includes(id)) return;
    console.log(`explorer start ${id}`);
    try { await fn(); const c = cap(id); if (c.status === "not-run" && c.records.length) { c.status = c.records.some((r) => r.status === "failed") ? "failed" : c.records.some((r) => r.status === "partial") ? "partial" : "passed"; delete c.reason; } }
    catch (e) { cap(id).status = "failed"; cap(id).reason = e.message; }
    finally { saveJSON("report.partial.json", bundle); console.log(`explorer ${id} ${cap(id).status}`); }
  };

  await run("missions", async () => {
    for (const raw of options.scenarios || MISSIONS) {
      const scenario = validateScenario(raw);
      saveJSON(`evidence/${scenario.id}.browser-use.json`, missionBrief(scenario, url));
      await withSession(async (s) => {
        const actions = [], timings = []; let err;
        await s.context.tracing.start({ screenshots: false, snapshots: true, sources: false });
        try {
          for (const a of scenario.actions) {
            actions.push(a); const timing = await step(s, a); timings.push({ action: a, durationMs: timing.durationMs });
            if (a.type === "checkpoint") await record(s, "missions", `${scenario.id}-${actions.length}`, a.label, [...actions], { execution: "guided player-route", timings: [...timings] });
          }
          if (scenario.oracle && !await matchesOracle(s, scenario.oracle)) throw new Error("Mission goal was not reached");
        } catch (e) { err = e; }
        const r = await record(s, "missions", `${scenario.id}-final`, scenario.goal, actions, { execution: "guided player-route", timings, oracle: scenario.oracle, goalReached: !err });
        const trace = `evidence/${scenario.id}.trace.zip`;
        await s.context.tracing.stop({ path: path.join(outDir, trace) }); r.artifacts.trace = trace;
        if (err) { r.status = "failed"; r.details.error = err.message; }
      });
    }
  });

  await run("atlas", async () => {
    // The graph is observed from actual actions, never inferred from direct DOM visibility writes.
    if (!bundle.graph.nodes.length) await withSession(async (s) => {
      const actions = [{ type: "click", selector: "#mb-settings" }, { type: "click", selector: "#pm-settings-close" }, { type: "click", selector: "#mb-race" }];
      for (const a of actions) await step(s, a);
      await record(s, "atlas", "atlas-routes", "Observed settings and circuit-picker routes", actions);
    });
    const catalog = options.catalog || [];
    const visited = new Set(bundle.graph.nodes.flatMap((n) => n.snapshot.roots || []));
    cap("atlas").records.push({ id: "atlas-coverage", label: "Observed navigation coverage", mode: "atlas", status: "passed", details: { observedStates: bundle.graph.nodes.length, observedEdges: bundle.graph.edges.length,
      catalog: catalog.map((s) => ({ id: s.id, root: s.root, visited: visited.has(s.root.replace(/^#/, "")) })), note: "Unvisited catalog screens are unexplored, not unreachable. Guided recipes do not prove discoverability." } });
  });

  await run("transitions", () => withSession(async (s) => {
    const finish = await startPerformanceTrace(s.page); let actionError;
    const actions = [{ type: "click", selector: "#mb-settings" }];
    try {
      await record(s, "transitions", "transition-before", "Settings transition: before", []);
      const action = step(s, actions[0]).catch((e) => { actionError = e; });
      const start = performance.now();
      for (let i = 0; i < 3; i++) {
        if (i) await new Promise((r) => setTimeout(r, 120));
        await record(s, "transitions", `transition-${i}`, `Settings transition: sample ${i + 1}`, actions, { elapsedMs: Math.round(performance.now() - start), timing: "Serial software-rendered sampling, not a fixed-FPS video" });
      }
      await action;
      if (actionError) throw actionError;
    } finally {
      const trace = "evidence/settings-performance.trace.json"; await finish(path.join(outDir, trace));
      for (const r of cap("transitions").records) r.artifacts.performance = trace;
    }
  }));

  await run("responsive", () => withSession(async (s) => {
    const actions = [{ type: "click", selector: "#mb-settings" }]; await step(s, actions[0]);
    const cells = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 844, height: 344 }, { width: 390, height: 844 }];
    for (const [i, vp] of cells.entries()) {
      const resize = { type: "viewport", ...vp }; actions.push(resize); await step(s, resize);
      if (i === 2) { const a = { type: "textScale", percent: 150 }; actions.push(a); await step(s, a); }
      const tab = { type: "press", key: "Tab" }; actions.push(tab); await step(s, tab);
      await record(s, "responsive", `responsive-${i}`, `${vp.width} × ${vp.height} touch${i === 2 ? ", enlarged root text" : ""}`, [...actions], { touch: true, focus: await s.page.evaluate(() => document.activeElement?.id) });
    }
  }, { touch: true }));

  await run("faults", async () => {
    for (const profile of ["missing-assets", "slow-assets", "offline"]) await withSession(async (s) => {
      const fault = await installFault(s.context, profile); let reloadError;
      try {
        await s.page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch((e) => { reloadError = e.message; });
        if (profile !== "offline") await s.page.locator("#mb-race").waitFor({ state: "visible", timeout: 30000 });
      } catch (e) { reloadError = e.message; }
      finally { await fault.restore(); }
      const injectionErrors = s.logs.errors.splice(0);
      await gotoGame(s.page, url, 90000);
      await s.page.evaluate(() => window.__apex.headless(true));
      await s.page.locator("#mb-settings").waitFor({ state: "visible", timeout: 60000 });
      await step(s, { type: "click", selector: "#mb-settings" });
      await s.page.locator("#pmsettings:not([hidden])").waitFor({ state: "visible" });
      const r = await record(s, "faults", `fault-${profile}`, `${profile}: restored network and reopened settings`, [{ type: "click", selector: "#mb-settings" }], { profile, events: fault.events, reloadError, injectionErrors, recovered: true, replayNote: "Replay file covers recovery clicks; repeat this faults mode to reinstall the network profile." });
      if (profile !== "offline" && !fault.events.length) { r.status = "partial"; r.details.notCovered = "No matching asset request occurred; injection not proven." }
    });
  });

  await run("accessibility", () => withSession(async (s) => {
    const focus = [];
    await step(s, { type: "click", selector: "#mb-settings" });
    for (let i = 0; i < 12; i++) { await step(s, { type: "press", key: "Tab" }); focus.push((await s.page.evaluate(inspectUI)).focus); }
    await record(s, "accessibility", "a11y-settings", "Settings accessible names and keyboard focus sample", [{ type: "click", selector: "#mb-settings" }, ...Array.from({ length: 12 }, () => ({ type: "press", key: "Tab" }))], { focus, note: "Bounded Tab walk and DOM screening, not WCAG conformance or full focus-graph proof." });
    await step(s, { type: "press", key: "Escape" });
    const r = await record(s, "accessibility", "a11y-escape", "Escape closes settings", [{ type: "click", selector: "#mb-settings" }, ...Array.from({ length: 12 }, () => ({ type: "press", key: "Tab" })), { type: "press", key: "Escape" }]);
    if (await s.page.locator("#pmsettings").isVisible()) { r.status = "failed"; r.details.error = "Settings remained open after Escape"; }
  }));

  await run("minimize", async () => {
    const raw = options.minimizeScenario || candidates[0];
    if (!raw) { cap("minimize").reason = "No reproducible finding supplied or discovered. Pass --scenario with an exact oracle."; return; }
    const scenario = validateScenario(raw);
    if (!scenario.oracle) throw new Error("Minimization requires a specific declarative oracle");
    const result = await minimizeActions(scenario.actions, async (actions) => withSession(async (s) => {
      for (const a of actions) await performAction(s, a);
      return matchesOracle(s, scenario.oracle);
    }, { touch: scenario.actions.some((a) => a.type === "viewport") }), { maxAttempts: options.maxAttempts || 8 });
    const replay = saveJSON("evidence/minimized.replay.json", { ...scenario, actions: result.actions });
    cap("minimize").records.push({ id: "minimized", label: "Same-oracle reproduction reduction", mode: "minimize", status: result.reproduced ? result.complete ? "passed" : "partial" : "failed", actions: result.actions, artifacts: { repro: replay }, details: { ...result, originalCount: scenario.actions.length, oracle: scenario.oracle, reset: "Fresh context and storage for every candidate", minimality: "Deletion-1-minimal only when complete; never a global shortest-path claim" } });
  });

  await run("scene", () => withSession(async (s) => {
    const source = options.sceneRepro;
    if (source) {
      await mutateCaptureScene(s.page, async (repro) => {
        const api = window.__apex;
        if (await api.race(repro.track, repro.tod || "day", repro.wx || "dry") === false) throw new Error("Reproduction circuit failed to load");
        api.go(); const r = api.repro(repro);
        if (!r?.restored || r.teamMatches === false || r.skipped > 0) throw new Error("Scene reproduction was rejected, skipped traffic or built the wrong team");
        api.headless(false);
      }, source);
    } else await positionScene(s.page, { track: options.track || "monaco", frac: options.frac ?? 0.4 });
    await s.page.evaluate(() => window.__apex.headless(true));
    const original = await s.page.evaluate(() => ({ repro: window.__apex.repro(), camera: window.__apex.camState(), scene: window.__apex.scene({ visible: true, limit: 30 }), frac: window.__apex.fieldState().find((c) => c.isPlayer)?.frac }));
    if (!Number.isFinite(original.frac)) throw new Error("Scene station could not be measured; refusing guessed review orbits");
    const evidence = saveJSON("evidence/scene.repro.json", original);
    for (const [i, az] of (options.sceneViews || [null, 45, 225]).entries()) {
      if (az !== null) await mutateCaptureScene(s.page, ({ az, frac }) => {
        const a = window.__apex; a.headless(false); a.hud(false); a.orbit(frac, az, 18, 45);
        const pose = a.camState(); a.view({ eye: pose.eye, target: pose.tgt, fov: pose.fov, far: 600 });
      }, { az, frac: original.frac });
      else await mutateCaptureScene(s.page, () => window.__apex.headless(false));
      const r = await record(s, "scene", `scene-${i}`, az === null ? "Original scene frame" : `Review orbit ${az}°`, [], { setup: source ? "Imported game reproduction" : "Explicit station, not inferred from an image", reviewFarPlane: az === null ? null : 600, camera: await s.page.evaluate(() => window.__apex.camState()), scene: original.scene, screenshotReference: options.referenceName || null });
      r.artifacts.scene = evidence;
      if (options.referenceName) r.artifacts.reference = options.referenceName;
    }
  }, { background: false, repro: options.sceneRepro, backend: options.sceneBackend || "webgl2", viewport: { width: 800, height: 500 } }));

  bundle.meta.finishedAt = new Date().toISOString(); bundle.meta.screenshots = budget.used;
  return bundle;
}
