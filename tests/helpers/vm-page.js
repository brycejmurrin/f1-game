/* vm-page.js — a `page`-shaped adapter over tools/lib/game-vm.cjs, so an
 * UNMODIFIED browser spec can run under `node --test`.
 *
 *   APEX_VM_PAGE=1 node --test tests/specs/agent-determinism.spec.js
 *
 * WHY THIS IS POSSIBLE AT ALL. Playwright forbids closures in
 * `page.evaluate`: the callback is serialised to SOURCE and compiled inside
 * the page (https://playwright.dev/docs/evaluating). Every evaluate body in
 * this suite is therefore already a self-contained program whose only inputs
 * are `window`/`document` and one JSON-serialisable argument — which is
 * exactly what `vm.runInContext(…, handle.ctx)` can run. The adapter is the
 * missing 300 lines, not a transform: there is ONE copy of the spec.
 *
 * WHAT IS FAITHFUL
 *   evaluate(fn|src, arg)   source-compiled in the game's realm, arg JSON-
 *                           round-tripped, result deep-copied back into the
 *                           test realm (so `toEqual` compares same-realm
 *                           objects, as it does under Playwright).
 *   a returned Promise      awaited while the harness's rAF queue is pumped
 *                           and due timers fire — a browser does not stop the
 *                           world while an evaluate is pending, so neither
 *                           does this.
 *   waitForFunction         polls the predicate, flushing DUE timers between
 *                           turns; a throwing predicate propagates at once,
 *                           the same asymmetry docs/TESTING.md records.
 *   addInitScript           queued and run in the sandbox BEFORE the first
 *                           game script, via game-vm's `onSandbox` hook.
 *   on("pageerror")         record.rejections + failed script injections.
 *   on("console")           record.console, as { type(), text() }.
 *
 * WHAT IS NOT, and must be read before trusting a green run
 *   - No GLX and no real frames: `pumpFrame()` runs the rAF callbacks the game
 *     registered, but nothing rasterises, so a NaN that only throws inside
 *     render() stays invisible (the same blindness tools/ci/twinned-specs.mjs
 *     already records for the hand twins).
 *   - `goto()` is BOOT on the first call and a shallow re-entry afterwards.
 *     It is not a reload: a spec asserting first-load behaviour (service
 *     worker, shell version guard, localStorage migration) must not adapt.
 *   - THE BOOT CIRCUIT IS ALREADY THERE. createGame settles on the boot
 *     circuit's scenery, so the first `__apex` call completes the lazy track
 *     build synchronously. A browser at `/` has no track yet, so every
 *     "returns null before a track is loaded" assertion goes red here —
 *     measured: 6 of tests/specs/new-hooks.spec.js's 56 and 1 of
 *     tests/specs/headless-api.spec.js's 24, all the same single cause.
 *   - No network at all. game-vm's `fetch` rejects like an offline browser
 *     instead of returning the fixture's Jolpica/OpenF1 stubs, so a spec that
 *     asserts on stubbed API CONTENT is not portable.
 *   - Every DOM-shaped API (locator, screenshot, mouse, keyboard, route,
 *     clock, setViewportSize as a real resize) throws `vm-page: unsupported`.
 *     tools/check/vm-portable.mjs finds them statically, before the run.
 */

import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect } from "@playwright/test";

const require_ = createRequire(import.meta.url);
// node:test is required LAZILY, never imported. tests/helpers/fixtures.js
// imports this module on BOTH backends, and pulling node:test into every
// Playwright worker would install its root-suite exit hook in a process that
// has no tests to run. Under APEX_VM_PAGE=1 makeVmTest() asks for it; under
// Playwright nothing here loads beyond node:vm.
const nodeTest = () => require_("node:test");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Deep-copy a value out of the VM realm into the test realm, the way
 *  Playwright's serialiser hands back a page value. Preserves NaN/Infinity
 *  (JSON would not) and keeps cycles from hanging the copier. */
export function toHost(v, seen = new Map()) {
  if (v === null || typeof v !== "object") return typeof v === "function" ? undefined : v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) {
    const out = [];
    seen.set(v, out);
    for (const x of v) out.push(toHost(x, seen));
    return out;
  }
  const tag = Object.prototype.toString.call(v);
  if (tag === "[object Date]") return new Date(v.getTime());
  if (tag === "[object RegExp]") return new RegExp(v.source, v.flags);
  if (tag === "[object Error]") { const e = new Error(v.message); e.name = v.name; return e; }
  if (tag === "[object Map]") { const m = new Map(); seen.set(v, m); for (const [k, x] of v) m.set(toHost(k, seen), toHost(x, seen)); return m; }
  if (tag === "[object Set]") { const s = new Set(); seen.set(v, s); for (const x of v) s.add(toHost(x, seen)); return s; }
  if (ArrayBuffer.isView(v)) return Array.from(v);
  const out = {};
  seen.set(v, out);
  for (const k of Object.keys(v)) out[k] = toHost(v[k], seen);
  return out;
}

function unsupported(api) {
  return () => {
    throw new Error(
      `vm-page: unsupported API page.${api}(). This spec is not portable to the VM adapter — ` +
      `run it in a browser, or check it with: node tools/check/vm-portable.mjs`);
  };
}

/** Run a queued addInitScript body in the sandbox, before any game script. */
function runInit(ctx, entry) {
  const src = typeof entry.fn === "function" ? entry.fn.toString() : String(entry.fn);
  const runner = vm.runInContext(
    `(function(__src, __hasArg, __argJson){
       const v = (0, eval)("(" + __src + ")");
       return typeof v === "function" ? v(__hasArg ? JSON.parse(__argJson) : undefined) : v;
     })`, ctx, { filename: "vm-page:initScript" });
  runner(src, entry.arg !== undefined, entry.arg === undefined ? "" : JSON.stringify(entry.arg));
}

export class VmPage {
  constructor(opts = {}) {
    this._handle = null;
    this._init = [];
    this._storage = Object.assign({}, opts.storage);
    this._listeners = { pageerror: [], console: [] };
    this._seen = { console: 0, rejections: 0, scripts: 0 };
    this._viewport = opts.viewport || null;
    this._gotos = 0;
    // Same shape a Playwright page has, so a spec that reaches for them gets a
    // named refusal instead of `undefined is not a function`.
    for (const api of [
      "locator", "getByRole", "getByText", "getByTestId", "getByLabel", "getByPlaceholder",
      "screenshot", "click", "fill", "press", "hover", "type", "check", "uncheck",
      "selectOption", "dragAndDrop", "setInputFiles", "waitForSelector", "waitForEvent",
      "waitForRequest", "waitForResponse", "waitForNavigation", "waitForLoadState",
      "route", "unroute", "setContent", "content", "title", "frame", "frames",
      "exposeFunction", "exposeBinding", "evaluateHandle", "$", "$$", "pdf", "emulateMedia",
    ]) this[api] = unsupported(api);
    this.mouse = new Proxy({}, { get: (_, k) => unsupported(`mouse.${String(k)}`) });
    this.keyboard = new Proxy({}, { get: (_, k) => unsupported(`keyboard.${String(k)}`) });
    this.clock = new Proxy({}, { get: (_, k) => unsupported(`clock.${String(k)}`) });
  }

  /** The game-vm handle, for the fixtures that drive the harness directly. */
  get handle() { return this._handle; }

  async _boot() {
    const { createGame } = require_(path.join(ROOT, "tools/lib/game-vm.cjs"));
    const init = this._init;
    this._handle = await createGame({
      storage: this._storage,
      onSandbox: (sandbox, ctx) => { for (const e of init) runInit(ctx, e); },
    });
    this._drain();
    return this._handle;
  }

  async _need() {
    if (!this._handle) await this._boot();
    return this._handle;
  }

  /** Dispatch record entries the page has produced since the last look. */
  _drain() {
    const r = this._handle && this._handle.record;
    if (!r) return;
    for (; this._seen.rejections < r.rejections.length; this._seen.rejections++) {
      const msg = r.rejections[this._seen.rejections];
      for (const fn of this._listeners.pageerror) fn({ message: msg, name: "Error", stack: msg });
    }
    for (; this._seen.scripts < r.scripts.length; this._seen.scripts++) {
      const s = r.scripts[this._seen.scripts];
      if (!s.error) continue;
      const msg = `${s.file}: ${s.error}`;
      for (const fn of this._listeners.pageerror) fn({ message: msg, name: "Error", stack: msg });
    }
    for (; this._seen.console < r.console.length; this._seen.console++) {
      const [type, text] = r.console[this._seen.console];
      for (const fn of this._listeners.console) fn({ type: () => type, text: () => text });
    }
  }

  on(event, fn) {
    if (!this._listeners[event]) {
      throw new Error(`vm-page: unsupported page event "${event}" (pageerror and console only)`);
    }
    this._listeners[event].push(fn);
    this._drain();
    return this;
  }
  off(event, fn) {
    const l = this._listeners[event];
    if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    return this;
  }

  async addInitScript(fn, arg) {
    if (this._handle) {
      throw new Error("vm-page: addInitScript after boot — the sandbox is already built. " +
                      "Register it before the first goto(), as Playwright requires too.");
    }
    this._init.push({ fn, arg });
  }

  /**
   * BOOT on the first call; a shallow re-entry on every later one.
   *
   * Playwright's `goto("/")` reloads. game-vm's boot is 4.8 MB of source per
   * `createGame`, so re-booting per goto would make a shared page pointless.
   * The re-entry mirrors what `sharedTest`'s reset already does in the browser
   * (clearInput / headless(false) / freeze(false)), and `reload()` below is
   * the honest full boot for a spec that needs a virgin page.
   */
  async goto(_url) {
    this._gotos++;
    if (!this._handle) { await this._boot(); return null; }
    await this.evaluate(() => {
      const a = window.__apex;
      if (!a) return;
      try { a.clearInput(); } catch (_) {}
      try { a.headless(false); } catch (_) {}
      try { a.freeze(false); } catch (_) {}
    });
    return null;
  }

  /** A real second boot — a fresh sandbox, init scripts replayed. */
  async reload() {
    if (this._handle) { try { this._handle.close(); } catch (_) {} }
    this._handle = null;
    this._seen = { console: 0, rejections: 0, scripts: 0 };
    await this._boot();
    return null;
  }

  /**
   * `page.evaluate(fnOrSource, arg)`.
   *
   * The function is stringified and compiled in the game's realm — the same
   * contract Playwright enforces, so a body that works there works here and a
   * body that closes over the test scope fails in BOTH.
   */
  async evaluate(fn, arg) {
    const h = await this._need();
    const src = typeof fn === "function" ? fn.toString() : String(fn);
    if (!this._runner) {
      this._runner = vm.runInContext(
        `(function(__src, __hasArg, __argJson){
           const v = (0, eval)("(" + __src + ")");
           return typeof v === "function" ? v(__hasArg ? JSON.parse(__argJson) : undefined) : v;
         })`, h.ctx, { filename: "vm-page:evaluate" });
    }
    let out;
    try {
      out = this._runner(src, arg !== undefined, arg === undefined ? "" : JSON.stringify(arg));
    } catch (e) {
      this._drain();
      throw e;
    }
    if (out && typeof out.then === "function") out = await this._awaitPumping(out);
    this._drain();
    return toHost(out);
  }

  /**
   * Await a page promise the way a browser does: the frame loop keeps running
   * underneath it. game-vm captures rAF callbacks and never pumps them, so a
   * spec whose evaluate resolves on `requestAnimationFrame` would hang here
   * forever without this — and hanging is exactly the wrong answer, because
   * the spec is asserting something ABOUT frames.
   */
  async _awaitPumping(p, ms = 60_000) {
    const h = this._handle;
    let done = false, val, err, bad = false;
    p.then((v) => { done = true; val = v; }, (e) => { done = true; bad = true; err = e; });
    const t0 = Date.now();
    while (!done) {
      h.flushTimers(true);
      try {
        h.pumpFrame();
      } catch (e) {
        // The game's own rAF callback reached render(), and there is no
        // renderer here — game-vm skips GLX by construction. A spec that
        // resolves an evaluate on requestAnimationFrame is asserting something
        // ABOUT frames and is NOT portable; say so instead of letting a
        // renderer-shaped TypeError look like a physics bug.
        e.message = `vm-page: the page's frame loop threw with no renderer attached ` +
                    `(game-vm skips GLX). This spec needs a browser. Original: ${e.message}`;
        throw e;
      }
      await new Promise((r) => setImmediate(r));
      if (Date.now() - t0 > ms) {
        throw new Error(`vm-page: evaluate's promise did not settle in ${ms}ms ` +
                        `(pumped ${h.record.meshes} meshes / rAF queue is drained each turn)`);
      }
    }
    if (bad) throw err;
    return val;
  }

  /** `page.waitForFunction(pred, arg, { polling, timeout })`. */
  async waitForFunction(pred, arg = null, opts = {}) {
    const timeout = opts.timeout == null ? 30_000 : opts.timeout;
    const h = await this._need();
    const t0 = Date.now();
    for (;;) {
      const v = await this.evaluate(pred, arg === null ? undefined : arg);
      if (v) return v;
      if (Date.now() - t0 > timeout) {
        throw new Error(`vm-page: waitForFunction timed out ${timeout}ms — the predicate stayed falsy. ` +
                        `Unlike the browser this bound is REAL (docs/notes/TESTING-FIELD-NOTES.md).`);
      }
      h.flushTimers(true);
      await new Promise((r) => setImmediate(r));
    }
  }

  /** There is no wall clock to wait on: fire due timers and yield instead. */
  async waitForTimeout(_ms) {
    const h = await this._need();
    h.flushTimers(true);
    await new Promise((r) => setImmediate(r));
  }

  /** Recorded, not applied — game-vm's canvas is a fixed 1280x720 stub. */
  async setViewportSize(v) { this._viewport = v; }
  viewportSize() { return this._viewport; }

  url() { return "http://localhost:3456/"; }
  isClosed() { return this._handle == null; }
  async close() {
    if (this._handle) { try { this._handle.close(); } catch (_) {} }
    this._handle = null;
  }
}

/* ───────────────────────────── the test runner ───────────────────────────── */

/** Playwright decides which fixtures to build by reading the destructuring
 *  pattern of the test body. So does this. */
export function requestedFixtures(fn) {
  const src = String(fn);
  const m = /^[^(]*\(\s*\{([^}]*)\}/.exec(src);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.split(":")[0].split("=")[0].trim())
    .filter(Boolean);
}

const BUILDERS = {
  page: (s) => s.page(),
  racePage: async (s) => {
    const page = await s.page();
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 45_000 });
    return page;
  },
  loadTrack: async (s) => {
    const page = await s.page();
    return async (id = "monza", tod = "day", wx = "dry", opts = {}) => {
      await page.goto("/");
      if (opts.headless) await page.evaluate(() => window.__apex.headless(true));
      // handle.race() is game-vm's own build wait: it settles on info().track
      // AND on a fresh G.cars identity, which is the only tell that startRace()
      // ran to completion for THIS call on a page that already raced.
      await page.handle.race(id, tod, wx);
      return page;
    };
  },
  pageErrors: async (s) => {
    const page = await s.page();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return errors;
  },
  consoleLines: async (s) => {
    const page = await s.page();
    const lines = [];
    page.on("console", (m) => { const t = m.text(); if (!/favicon/i.test(t)) lines.push(`${m.type()}: ${t}`); });
    return lines;
  },
  context: async (s) => {
    await s.page();
    return { route: unsupported("context.route"), addInitScript: unsupported("context.addInitScript") };
  },
  browserName: () => "vm",
  viewport: (s) => s.options.viewport || null,
};

/**
 * Build the `test` object the specs import: a node:test runner wearing
 * Playwright's declaration surface.
 *
 * @param {{shared?: boolean}} cfg  shared: one game-vm handle for the whole
 *   file (the `sharedTest` contract) instead of one boot per test.
 */
export function makeVmTest(cfg = {}) {
  const { it: nodeIt, describe: nodeDescribe } = nodeTest();
  const suites = [{ use: {}, beforeEach: [], afterEach: [], timeout: 120_000 }];
  const top = () => suites[suites.length - 1];
  const merged = (k) => suites.flatMap((s) => s[k]);
  const options = () => Object.assign({}, ...suites.map((s) => s.use));

  let sharedPage = null;

  async function runOne(fn, extraTimeout) {
    const opts = options();
    const state = { options: opts, _page: null };
    state.page = async () => {
      if (state._page) return state._page;
      if (cfg.shared) {
        if (!sharedPage) sharedPage = new VmPage({ viewport: opts.viewport });
        state._page = sharedPage;
        await sharedPage.goto("/");
      } else {
        state._page = new VmPage({ viewport: opts.viewport });
      }
      return state._page;
    };
    const names = requestedFixtures(fn);
    const bag = {};
    for (const n of names) {
      const b = BUILDERS[n];
      if (!b) throw new Error(`vm-page: no VM fixture named "${n}" — it exists only in the browser fixture set`);
      bag[n] = await b(state);
    }
    try {
      for (const h of merged("beforeEach")) await h(bag);
      await fn(bag, { timeout: extraTimeout, setTimeout() {} });
    } finally {
      for (const h of merged("afterEach")) { try { await h(bag); } catch (_) {} }
      if (state._page && !cfg.shared) await state._page.close();
    }
  }

  const declare = (mode) => (name, fnOrOpts, maybeFn) => {
    const fn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn;
    const timeout = top().timeout;
    const opts = { timeout };
    if (mode === "skip") opts.skip = true;
    if (mode === "fixme") opts.skip = true;
    if (mode === "only") opts.only = true;
    if (mode === "fail") opts.todo = true;
    nodeIt(name, opts, () => runOne(fn, timeout));
  };

  const test = declare(null);
  test.skip = (...a) => (typeof a[0] === "string" ? declare("skip")(...a) : undefined);
  test.fixme = (...a) => (typeof a[0] === "string" ? declare("fixme")(...a) : undefined);
  test.only = declare("only");
  test.fail = declare("fail");
  test.slow = () => {};
  test.setTimeout = (ms) => { top().timeout = ms; };
  test.step = async (_name, body) => body();
  test.info = () => ({ title: "", timeout: top().timeout, attach: async () => {}, annotations: [] });
  test.use = (o) => { Object.assign(top().use, o); };
  test.beforeEach = (fn) => { top().beforeEach.push(fn); };
  test.afterEach = (fn) => { top().afterEach.push(fn); };
  test.beforeAll = (fn) => { top().beforeEach.push(onceWrap(fn)); };
  test.afterAll = (_fn) => {};
  test.expect = expect;
  test.extend = () => test;   // the VM fixture set is fixed; extend is a no-op

  function onceWrap(fn) {
    let ran = false;
    return async (bag) => { if (ran) return; ran = true; await fn(bag); };
  }

  function describe(name, body) {
    const parent = top();
    suites.push({ use: {}, beforeEach: [], afterEach: [], timeout: parent.timeout });
    try { nodeDescribe(name, body); } finally { suites.pop(); }
  }
  describe.configure = (o) => { if (o && o.timeout) top().timeout = o.timeout; };
  describe.skip = (name, _body) => { nodeDescribe(name, { skip: true }, () => {}); };
  describe.only = describe;
  describe.serial = describe;
  describe.parallel = describe;
  describe.fixme = describe.skip;
  test.describe = describe;

  return test;
}

export { expect };
