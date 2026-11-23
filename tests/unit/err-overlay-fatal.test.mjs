/* err-overlay-fatal.test.mjs — the shell's error card must offer a way out (#4994).
 *
 * A frame fault that repeats stops the loop at LoopHealth's cap. The card that
 * reports it was dismiss-only, and an installed iPhone PWA has no reload button
 * and no pull-to-refresh, so the only exit was force-quitting the app. This
 * EXECUTES index.html's inline error-catcher script on a small DOM and drives
 * the real js/perf/loop-health.js beside it: nothing here quotes source text.
 *
 * Run: node --test tests/unit/err-overlay-fatal.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SHELL = /<script>\s*\/\/ ── ON-SCREEN ERROR CATCHER[\s\S]*?<\/script>/.exec(HTML);
assert.ok(SHELL, "index.html still carries the inline error-catcher script");
const SHELL_SRC = SHELL[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
const LOOP_SRC = fs.readFileSync(path.join(ROOT, "js/perf/loop-health.js"), "utf8").replace(/^const\b/gm, "var");

function makeDom() {
  const byId = {};
  const text = (n) => (n.nodeType === 3 ? n.data : n.childNodes.map(text).join(""));
  const makeEl = (tag) => {
    const el = { nodeType: 1, tagName: String(tag).toUpperCase(), childNodes: [], style: { cssText: "", display: "" }, onclick: null, type: "",
      appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; },
      click() { if (this.onclick) this.onclick({ stopPropagation() { el._stopped = true; } }); },
    };
    Object.defineProperty(el, "textContent", { get() { return text(this); }, set(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = [{ nodeType: 3, data: String(v) }]; } });
    Object.defineProperty(el, "id", { get() { return this._id || ""; }, set(v) { this._id = v; byId[v] = this; } });
    return el;
  };
  const body = makeEl("body");
  const document = {
    body, documentElement: body,
    createElement: makeEl,
    createTextNode: (data) => ({ nodeType: 3, data: String(data) }),
    // Only nodes still attached answer: a repaint drops the old buttons.
    getElementById(id) { const el = byId[id]; for (let p = el; p; p = p.parentNode) if (p === body) return el; return null; },
    querySelector: () => ({ content: "5099" }),
  };
  return { document, body, makeEl };
}

/** The shell script + the real LoopHealth in one VM; `quit` is #pm-quit's handler. */
function boot({ quit = () => {}, chain = () => true } = {}) {
  const { document, body, makeEl } = makeDom();
  const listeners = {};
  let reloads = 0, chained = 0, quits = 0;
  const ctx = vm.createContext({
    document, console, Math, JSON, Object, String, Date, Error, parseInt,
    performance: { now: () => 0 },
    location: { origin: "https://x.test", reload() { reloads++; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: true },
    XrBoot: { chainWindowRaf() { chained++; return chain(); } },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
  });
  ctx.window = ctx;
  seedLog(ctx);
  vm.runInContext(LOOP_SRC, ctx, { filename: absSrc("js/perf/loop-health.js") });
  vm.runInContext(SHELL_SRC, ctx, { filename: absSrc("index.html") });
  const pmQuit = makeEl("button"); pmQuit.id = "pm-quit"; body.appendChild(pmQuit);
  pmQuit.onclick = () => { quits++; quit(ctx); };
  const fire = (type, ev) => { for (const fn of listeners[type] || []) fn(ev); };
  /** What game.js's tick() does at the cap: report, then rethrow into window.onerror. */
  const killLoop = () => {
    const e = new Error("boom every frame");
    for (let i = 0; i < 8; i++) ctx.LoopHealth.fault(e);
    ctx.__apexReportError("tick", e);
    fire("error", { message: e.message, error: e });
  };
  const overlay = () => document.getElementById("__err_overlay");
  return { ctx, document, fire, killLoop, overlay, counts: () => ({ reloads, chained, quits }) };
}
const px = (el, prop) => +new RegExp(prop + ":(\\d+)px").exec(el.style.cssText)[1];

test("an ordinary error card stays dismiss-only: no buttons, tap hides it", () => {
  const h = boot();
  h.fire("error", { message: "one-off", error: new Error("one-off") });
  const d = h.overlay();
  assert.equal(d.style.display, "block");
  assert.match(d.textContent, /^⚠ JS error\n\none-off/);
  assert.match(d.textContent, /tap to dismiss · build 5099/);
  assert.equal(h.document.getElementById("__err_reload"), null);
  assert.equal(h.document.getElementById("__err_menu"), null);
  d.onclick();
  assert.equal(d.style.display, "none");
});

test("a stopped loop's card offers RELOAD and BACK TO MENU, and cannot be tapped away (#4994)", () => {
  const h = boot();
  h.killLoop();
  assert.equal(h.ctx.LoopHealth.state().stopped, true);
  const d = h.overlay();
  // The error listener repainted the card after the tick report: the buttons must survive that.
  assert.match(d.textContent, /^⚠ JS error\n\nRELOADBACK TO MENUThe game loop has stopped\.\n\nboom every frame/,
    "title first (tools read the first 160 chars), then the buttons, above the stack");
  assert.doesNotMatch(d.textContent, /tap to dismiss/);
  const reload = h.document.getElementById("__err_reload"), menu = h.document.getElementById("__err_menu");
  for (const b of [reload, menu]) {
    assert.equal(b.tagName, "BUTTON");
    assert.ok(px(b, "min-height") >= 44 && px(b, "min-width") >= 44, "a touch target, 44 px or more");
  }
  d.onclick();
  assert.equal(d.style.display, "block", "dismissing left a frozen canvas and no way back to the buttons");
  reload.click();
  assert.equal(reload._stopped, true, "a button tap is not a tap on the card");
  assert.deepEqual(h.counts(), { reloads: 1, chained: 0, quits: 0 });
});

test("BACK TO MENU presses QUIT TO MENU, re-arms the loop and hides the card (#4994)", () => {
  const h = boot();
  h.killLoop();
  h.document.getElementById("__err_menu").click();
  assert.deepEqual(h.counts(), { reloads: 0, chained: 1, quits: 1 }, "quit first, then exactly one frame scheduled");
  assert.equal(h.ctx.LoopHealth.state().stopped, false);
  assert.equal(h.overlay().style.display, "none");
  // The loop runs again; a later one-off error is an ordinary, dismissable card.
  h.fire("error", { message: "later", error: new Error("later") });
  assert.equal(h.document.getElementById("__err_reload"), null);
  assert.match(h.overlay().textContent, /tap to dismiss/);
});

test("BACK TO MENU keeps the card when the quit throws or no frame can be scheduled", () => {
  // A listener that throws is reported to window.onerror, not to click()'s caller.
  const viaOnerror = boot({ quit: (ctx) => ctx.__apexReportError("quit", new Error("quit failed")) });
  viaOnerror.killLoop();
  viaOnerror.document.getElementById("__err_menu").click();
  assert.equal(viaOnerror.ctx.LoopHealth.state().stopped, true, "a failed quit must not restart the loop inside the broken race");
  assert.equal(viaOnerror.counts().chained, 0);
  assert.equal(viaOnerror.overlay().style.display, "block");
  assert.match(viaOnerror.overlay().textContent, /quit failed/);
  assert.ok(viaOnerror.document.getElementById("__err_reload"), "RELOAD is still there");

  const noRaf = boot({ chain: () => false });
  noRaf.killLoop();
  noRaf.document.getElementById("__err_menu").click();
  assert.equal(noRaf.ctx.LoopHealth.state().stopped, true);
  assert.equal(noRaf.overlay().style.display, "block");
});

test("the pinned \"Module failed to load\" card gets RELOAD and no BACK TO MENU", () => {
  const h = boot();
  // Second failure of the same tab session: the cache-swept reload was already spent.
  h.ctx.sessionStorage.getItem = () => "1";
  h.fire("error", { target: { tagName: "SCRIPT", src: "https://x.test/js/gone.js" } });
  const d = h.overlay();
  assert.match(d.textContent, /^⚠ Module failed to load\n\nRELOADhttps:\/\/x\.test\/js\/gone\.js/);
  assert.equal(h.document.getElementById("__err_menu"), null);
  h.document.getElementById("__err_reload").click();
  assert.equal(h.counts().reloads, 1);
});
