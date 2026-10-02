/* screen-looks — the per-screen APPEARANCE folds (PAUSE MENU's extra knobs,
 * DATA HUB, TRACK SELECTOR, RACE SETTINGS, CAREER, GARAGE, POPUPS) and the
 * see-through PEEK every fold previews with. Runs the REAL module (with the
 * real SettingRow) in node:vm over the mini DOM, and holds css/ to the
 * registry: every non-default answer the engine can write has a rule.
 *
 * Run: node --test tests/unit/screen-looks.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const plain = (o) => JSON.parse(JSON.stringify(o));
const SHELL = read("index.html");
const EXPORT = read("js/ui/settings-export.js");
const MANIFEST = read("tools/manifest.cjs");
const RESP = read("css/responsive.css");
const CSS_ALL = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"))
  .map((f) => read("css/" + f).replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");

const TARGETS = { pausemenu: "dialog", datahub: "dialog", select: "div", "race-settings": "dialog",
  career: "div", carsetup: "div", standings: "dialog", pmsettings: "dialog", overlay: "div" };

function boot({ stored = {}, settingsOpen = true, withPause = false } = {}) {
  const dom = makeDom();
  const mk = (tag, id, parent) => { const e = dom.makeElement(tag, id); (parent || dom.body).appendChild(e); return e; };
  for (const [id, tag] of Object.entries(TARGETS)) mk(tag, id);
  dom.byId("pmsettings").hidden = !settingsOpen;
  for (const id of ["pausemenu", "datahub", "race-settings", "standings"]) dom.byId(id).hidden = true;
  for (const id of ["select", "career", "carsetup"]) dom.byId(id).hidden = true;
  const panel = mk("section", "pm-panel-appearance", dom.byId("pmsettings"));
  const general = mk("details", "pm-general", panel);
  const pause = mk("details", "pm-pausemenu", panel);
  mk("summary", "pm-pausemenu-sum", pause);
  const pauseBody = mk("div", "pm-pausemenu-body", pause);
  const ts = mk("details", "pm-titlescreen", panel);
  mk("summary", "pm-titlescreen-sum", ts);
  const tsBody = mk("div", "pm-titlescreen-body", ts);
  const replay = mk("button", "pm-replay-intro", tsBody);
  // The panes a stand-in fills when the screen was never built this session.
  mk("div", "sel-tracks", dom.byId("select"));
  mk("div", "cr-left", dom.byId("career"));
  mk("div", "cr-right", dom.byId("career"));
  mk("div", "cs-tabs", dom.byId("carsetup"));
  mk("div", "cs-options", dom.byId("carsetup"));
  mk("div", "standings-body", dom.byId("standings"));
  // A real miss on an unknown id (mini-dom creates on a miss).
  const get = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? get(id) : null);

  const data = Object.assign({}, stored);
  const store = { get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { if (v === null) delete data[k]; else data[k] = v; } };
  const timers = [];
  const observers = [];
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(target, opts) { this.target = target; this.opts = opts; }
  }
  const winL = new Map();
  let reclassified = 0;
  const sb = {
    document: dom.document, GameStore: { store }, Log: { info() {}, warn() {} }, MutationObserver,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    SheetShape: { reclassify: () => { reclassified++; } },
    Tracks: { LIST: [{ id: "monza", name: "Monza" }, { id: "spa", name: "Spa" }] },
    addEventListener: (t, fn, cap) => { if (!winL.has(t)) winL.set(t, []); winL.get(t).push({ fn, cap }); },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const files = ["js/ui/setting-row.js", ...(withPause ? ["js/ui/pause-opts.js"] : []), "js/ui/screen-looks.js"];
  for (const f of files) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const M = vm.runInContext("ScreenLooks", ctx);
  const P = withPause ? vm.runInContext("PauseOpts", ctx) : null;
  /** Fire a window CAPTURE listener the way the browser would, with spies. */
  const fire = (type, extra = {}) => {
    const ev = Object.assign({ type, defaultPrevented: false, stopped: false }, extra);
    ev.preventDefault = () => { ev.defaultPrevented = true; };
    ev.stopImmediatePropagation = () => { ev.stopped = true; };
    for (const { fn, cap } of winL.get(type) || []) if (cap) fn(ev);
    return ev;
  };
  return { dom, M, P, data, timers, observers, fire, html: dom.documentElement, panel, general, pauseBody, tsBody, replay,
    get reclassified() { return reclassified; } };
}

/* ── registry ─────────────────────────────────────────────────────────── */
test("registry: unique screens, keys and knobs; every default is a legal value", () => {
  const { M } = boot();
  const ids = M.SCREENS.map((s) => s.id);
  assert.deepEqual(plain(ids), ["pause", "datahub", "select", "race", "career", "garage", "popups"]);
  assert.equal(new Set(M.SCREENS.map((s) => s.key)).size, ids.length);
  for (const s of M.SCREENS) {
    assert.match(s.key, /^look[A-Z]\w+$/, s.key);
    assert.ok(s.title && s.help && typeof s.target === "function", s.id);
    const ks = s.knobs.map((n) => n.k);
    assert.equal(new Set(ks).size, ks.length, `${s.id}: unique knobs`);
    assert.ok(ks.length >= 4, `${s.id}: shared core + its own`);
    for (const n of s.knobs) {
      if (n.kind === "cycle") {
        assert.ok(n.values.length >= 2 && n.values.some(([v]) => v === n.def), `${s.id}.${n.k} default is a value`);
      } else {
        assert.equal(n.kind, "range");
        assert.ok(n.min <= n.def && n.def <= n.max, `${s.id}.${n.k} default in range`);
        assert.equal((n.def - n.min) % n.step, 0, `${s.id}.${n.k} default on a step`);
      }
    }
  }
  // Every per-screen fold (pause has its own extras) carries the shared core.
  for (const id of ["select", "race", "career", "popups"])
    for (const k of ["w", "density", "btn", "corners", "dim", "head"])
      assert.ok(M.SCREENS.find((s) => s.id === id).knobs.some((n) => n.k === k), `${id} has ${k}`);
});

test("export: every look key is a BACKUP & RESTORE appearance row with a null default", () => {
  const { M } = boot();
  for (const s of M.SCREENS)
    assert.match(EXPORT, new RegExp(`\\{ k: "${s.key}", lane: "json", group: "appearance", def: null, src: "js/ui/screen-looks\\.js`), s.key);
});

test("load order: after pause-opts.js, before js/game.js, with a GameStore HARD_EDGES pair", () => {
  const a = MANIFEST.indexOf('"js/ui/pause-opts.js"'), b = MANIFEST.indexOf('"js/ui/screen-looks.js"'), g = MANIFEST.indexOf('"js/game.js"');
  assert.ok(a > 0 && b > a && g > b, "pause-opts < screen-looks < game");
  assert.match(MANIFEST, /\["js\/core\/store\.js", "js\/ui\/screen-looks\.js"\]/);
  assert.match(SHELL, /<script defer[^>]*src="js\/ui\/screen-looks\.js\?v=dev"><\/script>/);
});

test("no first-paint copy: nothing these looks touch paints on the first frame", () => {
  const boot0 = SHELL.slice(SHELL.indexOf("<script>"), SHELL.indexOf("</script>"));
  assert.ok(!/apex26\.look/.test(boot0), "the inline boot script never reads apex26.look*");
});

/* ── store and stamping ───────────────────────────────────────────────── */
test("untouched: no data-look-* attribute, no --look-* token, nothing stored", () => {
  const { html, data, M } = boot();
  assert.deepEqual(Object.keys(html.dataset).filter((k) => k.startsWith("look")), []);
  assert.deepEqual(Object.keys(html.style._decls).filter((k) => k.startsWith("--look-")), []);
  assert.deepEqual(Object.keys(data), []);
  for (const s of M.SCREENS) assert.equal(M.isShipped(s.id), true, s.id);
});

test("set: enums stamp an attribute, ranges a token + presence; back to default removes both and stores null", () => {
  const { html, data, M } = boot();
  assert.equal(M.set("select", "rows", "2"), "2");
  assert.equal(html.dataset.lookSelectRows, "2");
  assert.deepEqual(plain(data.lookSelect), { rows: "2" }, "only the knob off its default");
  assert.equal(M.set("select", "tile", 130), 130);
  assert.equal(html.style.getPropertyValue("--look-select-tile"), "1.3");
  assert.equal(html.dataset.lookSelectTile, "130");
  assert.equal(M.set("career", "split", 40), 40);
  assert.equal(html.style.getPropertyValue("--look-career-split"), "40%", "token:pct writes a percent");
  assert.equal(M.isShipped("select"), false);
  M.set("select", "rows", "1"); M.set("select", "tile", 100);
  assert.equal(html.dataset.lookSelectRows, undefined);
  assert.equal(html.dataset.lookSelectTile, undefined);
  assert.equal(html.style.getPropertyValue("--look-select-tile"), "");
  assert.equal(data.lookSelect, undefined, "all-default stores null");
  M.reset("career");
  assert.equal(data.lookCareer, undefined);
  assert.equal(html.style.getPropertyValue("--look-career-split"), "");
});

test("normalize: unknown keys dropped, junk enums read as shipped, ranges clamp and snap", () => {
  const { M, html } = boot({ stored: { lookGarage: { side: "left", pw: 999, glass: "neon", bogus: 1 }, lookPause: { gap: 33 } } });
  const g = M.read("garage");
  assert.equal(g.side, "left");
  assert.equal(g.pw, 150, "clamped to max");
  assert.equal(g.glass, "shipped", "junk enum reads as shipped");
  assert.ok(!("bogus" in g));
  assert.equal(M.read("pause").gap, 30, "snapped to the step");
  assert.equal(html.dataset.lookGarageSide, "left", "applied at eval");
  assert.equal(html.style.getPropertyValue("--look-garage-pw"), "1.5");
  assert.deepEqual(plain(M.normalize("nope", {})), {});
});

test("density / columns knobs re-run SheetShape so the tier follows at once", () => {
  const b = boot();
  const n0 = b.reclassified;
  b.M.set("race", "density", "tight");
  b.M.set("career", "layout", "stacked");
  assert.equal(b.reclassified, n0 + 2);
  b.M.set("race", "corners", "pill");
  assert.equal(b.reclassified, n0 + 2, "a paint-only knob does not reflow");
});

/* ── folds ────────────────────────────────────────────────────────────── */
test("build: one fold per screen after TITLE SCREEN, in registry order; pause rows join PAUSE MENU; mount once", () => {
  const { dom, M, panel, pauseBody, tsBody, replay } = boot();
  const kids = panel.children;
  const ts = kids.indexOf(dom.byId("pm-titlescreen"));
  const folds = ["datahub", "select", "race", "career", "garage", "popups"].map((id) => dom.byId("pm-look-" + id));
  folds.forEach((f, i) => {
    assert.ok(f, "fold " + i);
    assert.equal(f.tagName, "DETAILS");
    assert.ok(f.classList.contains("pm-renderer-sub"));
    assert.equal(kids.indexOf(f), ts + 1 + i, "in order, after TITLE SCREEN");
  });
  assert.equal(dom.byId("pm-look-datahub-sum").textContent, "DATA HUB · SHIPPED");
  assert.ok(!dom.has("pm-look-pause"), "pause has no fold of its own");
  for (const k of ["btn", "w", "gap", "corners", "style", "align", "vpos", "music", "build"])
    assert.ok(dom.has("pm-look-pause-" + k), "pause knob row " + k);
  assert.ok(pauseBody.contains(dom.byId("pm-look-pause-style")), "inside PAUSE MENU's body");
  // TITLE SCREEN gains a PEEK button, after REPLAY INTRO.
  const peekBtn = tsBody.children.find((c) => c.tagName === "BUTTON" && c.textContent === "PEEK");
  assert.ok(peekBtn && tsBody.children.indexOf(peekBtn) > tsBody.children.indexOf(replay));
  const n = panel.children.length;
  M.build();
  assert.equal(panel.children.length, n, "mount once");
});

test("a row: stores, paints CUSTOM, peeks that screen; RESET puts it back", () => {
  const { dom, M, data, html, timers } = boot();
  const sel = dom.byId("pm-look-popups-vpos-sel");
  sel.value = "bottom"; dom.dispatch(sel, { type: "change" });
  assert.deepEqual(plain(data.lookPopups), { vpos: "bottom" });
  assert.equal(html.dataset.lookPopupsVpos, "bottom");
  assert.equal(dom.byId("pm-look-popups-sum").textContent, "POPUPS · CUSTOM");
  assert.equal(html.dataset.appearancePeek, "popups", "the real screen shows behind the page");
  assert.equal(M.peeking, "popups");
  timers.at(-1).fn();
  assert.equal(html.dataset.appearancePeek, undefined, "and the page comes back");
  const slider = dom.byId("pm-look-popups-w");
  dom.dispatch(slider, { type: "pointerdown" });
  assert.equal(html.dataset.appearancePeek, "popups", "holding a slider holds the peek");
  slider.value = "120"; dom.dispatch(slider, { type: "input" });
  assert.equal(html.style.getPropertyValue("--look-popups-w"), "1.2");
  const reset = dom.byId("pm-look-popups-body").children.find((c) => c.classList && c.classList.contains("balanced-row"))
    .children.find((c) => c.textContent === "RESET POPUPS");
  reset.click();
  assert.equal(data.lookPopups, undefined);
  assert.equal(html.style.getPropertyValue("--look-popups-w"), "");
  assert.equal(dom.byId("pm-look-popups-sum").textContent, "POPUPS · SHIPPED");
  assert.equal(slider.value, "100", "sliders repaint");
});

/* ── peek ─────────────────────────────────────────────────────────────── */
function peekBtnOf(dom, id) {
  const body = dom.byId("pm-look-" + id + "-body");
  return body.children.find((c) => c.classList && c.classList.contains("balanced-row")).children.find((c) => c.getAttribute("aria-pressed") !== null);
}

test("PEEK button holds the view until dismissed; Esc ends it without closing SETTINGS", () => {
  const { dom, html, fire, M } = boot();
  const btn = peekBtnOf(dom, "race");
  btn.click();
  assert.equal(html.dataset.appearancePeek, "race");
  assert.equal(btn.getAttribute("aria-pressed"), "true");
  assert.equal(btn.textContent, "BACK TO SETTINGS");
  const ev = fire("keydown", { key: "Escape" });
  assert.ok(ev.defaultPrevented && ev.stopped, "Esc is consumed, so the settings page stays open");
  assert.equal(M.peeking, null);
  assert.equal(btn.getAttribute("aria-pressed"), "false");
  assert.equal(dom.byId("race-settings").hidden, true, "the target's hidden attribute was never touched");
  assert.equal(fire("keydown", { key: "Escape" }).defaultPrevented, false, "no peek, Esc passes through");
  btn.click(); btn.click();
  assert.equal(M.peeking, null, "the button toggles");
});

test("a peek ends on: the pad's cancel, a tap outside the fold (swallowed when held), the page hiding, the tab hiding", () => {
  const { dom, html, fire, M, observers } = boot();
  const btn = peekBtnOf(dom, "garage");
  btn.click();
  const c = fire("cancel");
  assert.ok(c.defaultPrevented && c.stopped && M.peeking === null, "cancel");
  btn.click();
  const p = fire("pointerdown", { target: dom.byId("overlay") });
  assert.ok(M.peeking === null && p.stopped, "outside tap ends a held peek and is swallowed");
  assert.ok(fire("click", { target: dom.byId("overlay") }).stopped, "with its click");
  assert.equal(fire("click", { target: dom.byId("overlay") }).stopped, false, "only that one");
  btn.click();
  fire("pointerdown", { target: dom.byId("pm-look-garage-side-sel") });
  assert.equal(M.peeking, "garage", "a tap inside the same fold keeps peeking");
  const ps = dom.byId("pmsettings");
  ps.hidden = true;
  for (const o of observers) if (o.target === ps) o.fn();
  assert.equal(html.dataset.appearancePeek, undefined, "SETTINGS closing ends it");
  ps.hidden = false;
  btn.click();
  dom.document.hidden = true;
  for (const fn of dom.document._listeners.get("visibilitychange") || []) fn();
  assert.equal(M.peeking, null, "tab hidden");
});

test("a key aimed outside the fold ends a timed peek before it acts; the peek refuses while SETTINGS is closed", () => {
  const b = boot();
  b.M.peek("datahub", 1800);
  b.dom.byId("overlay").focus();
  b.fire("keydown", { key: "Enter" });
  assert.equal(b.M.peeking, null);
  const closed = boot({ settingsOpen: false });
  assert.equal(closed.M.peek("datahub", 1800), false);
  assert.equal(closed.html.dataset.appearancePeek, undefined);
});

test("stand-ins: an empty screen is dressed while peeked and undressed after; a built one is left alone", () => {
  const { dom, M } = boot();
  const strip = dom.byId("sel-tracks");
  M.peek("select", 0);
  assert.ok(strip.children.length >= 6, "tiles");
  assert.ok(strip.children.every((t) => t.classList.contains("track-row") && t.getAttribute("aria-hidden") === "true" && t.hasAttribute("data-look-standin")));
  M.endPeek();
  assert.equal(strip.children.length, 0, "removed");
  const hub = dom.byId("datahub");
  M.peek("datahub", 0);
  assert.ok(hub.classList.contains("dh-overlay") && hub.querySelector(".dh-card"), "a stand-in card");
  M.endPeek();
  assert.ok(!hub.classList.contains("dh-overlay") && !hub.querySelector(".dh-card"), "and gone");
  const real = dom.makeElement("div"); real.className = "cr-slot";
  dom.byId("cr-left").appendChild(real);
  M.peek("career", 0);
  assert.equal(dom.byId("cr-left").children.length, 1, "a built pane is not touched");
  assert.ok(dom.byId("cr-right").children.length > 0, "the empty one is");
  M.endPeek();
  for (const id of ["garage", "popups"]) { M.peek(id, 0); M.endPeek(); }
  assert.equal(dom.byId("cs-tabs").children.length + dom.byId("standings-body").children.length, 0);
});

test("TITLE SCREEN peeks only while the title screen is up", () => {
  const { dom, M } = boot();
  assert.equal(M.peek("title", 900), true);
  M.endPeek();
  dom.byId("overlay").hidden = true;
  assert.equal(M.peek("title", 900), false);
});

test("PAUSE MENU: SHIPPED only while PauseOpts' four and these extras are all shipped", () => {
  const { M, P } = boot({ withPause: true });
  assert.equal(P.shipped(), true);
  M.set("pause", "music", "hide");
  assert.equal(P.shipped(), false, "an extra knob makes it CUSTOM");
  M.reset("pause");
  assert.equal(P.shipped(), true);
});

/* ── the CSS contract ─────────────────────────────────────────────────── */
test("CSS: every non-default answer and every range token has a rule; every peek target is revealed", () => {
  const { M } = boot();
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const s of M.SCREENS) {
    for (const n of s.knobs) {
      const attr = `data-look-${s.id}-${n.k}`;
      if (n.kind === "cycle") {
        for (const [v] of n.values) {
          if (v === n.def) continue;
          assert.match(CSS_ALL, new RegExp(`\\[${esc(attr)}="${esc(v)}"\\]`), `${attr}="${v}" has a rule`);
        }
        assert.ok(!new RegExp(`\\[${esc(attr)}="${esc(n.def)}"\\]`).test(CSS_ALL), `${attr}: the default never needs a rule (it writes nothing)`);
      } else {
        assert.match(CSS_ALL, new RegExp(`\\[${esc(attr)}\\]`), `${attr} gates a rule`);
        assert.match(CSS_ALL, new RegExp(`var\\(--look-${s.id}-${n.k}\\b`), `--look-${s.id}-${n.k} is read`);
      }
    }
  }
  const layer = RESP.slice(0, RESP.indexOf("} /* @layer overlays */"));
  for (const id of [...M.SCREENS.map((s) => s.id), "title"])
    assert.match(layer, new RegExp(`\\[data-appearance-peek="${id}"\\]`), `${id} is revealed in @layer overlays`);
  assert.match(layer, /:root\[data-appearance-peek\] #pmsettings > \* \{ opacity: 0\.14;/, "the page ghosts");
  assert.match(read("css/tokens.css"), /--tap-0: var\(--tap\);/, "BUTTON HEIGHT scales the shipped tap size");
});

/* ── the GENERAL fold ─────────────────────────────────────────────────── */
test("shell: GENERAL wraps the preview, COLOURS, READABILITY and MOTION, before PAUSE MENU", () => {
  const a = SHELL.indexOf('<section id="pm-panel-appearance"');
  const look = SHELL.slice(a, SHELL.indexOf("</section>", a));
  const g = look.indexOf('<details id="pm-general"');
  assert.ok(g > 0, "the fold");
  assert.match(look, /<summary class="adv-more-btn" id="pm-general-sum">GENERAL · /);
  const end = look.indexOf("</details>", g);
  const fold = look.slice(g, end);
  for (const id of ["pm-appearance-preview", "pm-uitheme", "pm-menuaccent", "pm-hudaccent", "pm-uiscale", "pm-textsize", "pm-contrast", "pm-units", "pm-helptext", "pm-motion"])
    assert.ok(fold.includes(`id="${id}"`), `${id} inside GENERAL`);
  assert.ok(end < look.indexOf('<details id="pm-pausemenu"'), "before PAUSE MENU");
});

test("a peek swallows only the dismissing click, not the next one", () => {
  const src = read("js/ui/screen-looks.js");
  const fn = src.slice(src.indexOf("function onPointer"), src.indexOf("function onClick"));
  assert.doesNotMatch(fn, /700/);
  assert.match(fn, /pk\.swallowGen/);
  assert.match(fn, /setTimeout\(\(\) => \{ if \(pk\.swallowGen === gen\) pk\.swallowClick = false; \}, 0\)/);
  assert.match(fn, /pointerup/);
  assert.match(fn, /pointercancel/);
  assert.match(fn, /f\.contains\(t\)\) return/, "a click inside the fold still does not end the peek");
});
