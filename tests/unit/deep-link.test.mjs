// MANIFEST SHORTCUTS REACH THE TITLE DOORS. manifest.json `shortcuts` open `./?go=<door>`; js/ui/deep-link.js maps the four
// allowed doors to title buttons, clicks one once the bare title is live, and strips the param. Anything else is ignored.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = readFileSync(new URL("../../js/ui/deep-link.js", import.meta.url), "utf8");
const MANIFEST = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));

function boot({ search = "", overlayHidden = false, inRace = false, top = null, missing = [], unwired = false } = {}) {
  const clicks = [], replaced = [], logs = [];
  const timers = [];
  const buttons = new Map();
  const btn = (id) => {
    if (!buttons.has(id)) buttons.set(id, { id, hidden: false, disabled: false,
      onclick: unwired ? null : () => clicks.push(id), click() { if (this.onclick) this.onclick(); } });
    return buttons.get(id);
  };
  const ctx = vm.createContext({
    location: { search, pathname: "/f1-game/", hash: "#x" },
    history: { replaceState: (_s, _t, url) => replaced.push(url) },
    URLSearchParams,
    UiLayers: { inRace: () => inRace, top: () => top },
    Log: { info: (_c, m) => logs.push(m) },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
  });
  vm.runInContext(SRC + ";globalThis.DeepLink = DeepLink;", ctx, { filename: absSrc("js/ui/deep-link.js") });
  const hub = { id: "dh-tab-schedule", click() { clicks.push("dh-tab-schedule"); } };
  const state = { hubUp: false };
  const G = { els: { overlay: { hidden: overlayHidden } },
    $: (id) => (id === "dh-tab-schedule" ? (state.hubUp ? hub : null) : missing.includes(id) ? null : btn(id)) };
  const out = ctx.DeepLink.create(G);
  return { out, clicks, replaced, logs, timers, state, G, DeepLink: ctx.DeepLink };
}

test("the four doors map to title buttons; unknown, inherited and empty values parse to nothing", () => {
  const { DeepLink } = boot();
  for (const [go, id] of [["race", "mb-race"], ["daily", "mb-daily"], ["nextgp", "mb-data"], ["garage", "mb-garage"]]) {
    assert.equal(DeepLink.parse("?go=" + go), go);
    assert.equal(DeepLink.DOORS[go], id);
  }
  for (const bad of ["", "?go=", "?go=constructor", "?go=__proto__", "?go=javascript:1", "?go=RACE", "?x=race"]) {
    assert.equal(DeepLink.parse(bad), null, bad);
  }
});

test("on a live title the door button is clicked once and the param is stripped (other params and the hash survive)", () => {
  const r = boot({ search: "?go=race&seed=7" });
  assert.deepEqual(r.clicks, [], "boot wiring gets to finish first");
  r.timers.shift()();
  assert.deepEqual(r.clicks, ["mb-race"]);
  assert.equal(r.timers.length, 0);
  assert.deepEqual(r.replaced, ["/f1-game/?seed=7#x"]);
});

test("a link with no go param does nothing and leaves the URL alone", () => {
  const r = boot({ search: "?seed=7" });
  assert.deepEqual(r.clicks, []);
  assert.deepEqual(r.replaced, []);
  assert.equal(r.timers.length, 0);
});

test("shortcuts wait for handlers bound later in the same boot stack", () => {
  for (const [go, id] of [["race", "mb-race"], ["daily", "mb-daily"], ["nextgp", "mb-data"], ["garage", "mb-garage"]]) {
    const r = boot({ search: "?go=" + go, unwired: true });
    assert.equal(r.G.$(id).onclick, null, "the initial door has no handler yet");
    assert.deepEqual(r.clicks, []);
    assert.equal(r.timers.length, 1, "first dispatch waits for synchronous wiring");
    r.G.$(id).onclick = () => r.clicks.push(id);
    r.state.hubUp = true;
    r.timers.shift()();
    assert.deepEqual(r.clicks, go === "nextgp" ? [id, "dh-tab-schedule"] : [id]);
    assert.equal(r.timers.length, 0, "each wired shortcut is handled once");
  }
});

test("mid-race, or with a layer over the title, the door waits instead of firing", () => {
  for (const state of [{ inRace: true }, { overlayHidden: true }, { top: { id: "career-hub" } }]) {
    const r = boot({ search: "?go=garage", ...state });
    r.timers.shift()();
    assert.deepEqual(r.clicks, []);
    assert.equal(r.timers.length, 1, "one retry is queued after dispatch checks the title");
  }
});

test("a missing door button is dropped with a log line, never a throw", () => {
  const r = boot({ search: "?go=daily", missing: ["mb-daily"] });
  r.timers.shift()();
  assert.deepEqual(r.clicks, []);
  assert.ok(r.logs.some((m) => /door unavailable/.test(m)), r.logs.join("|"));
});

test("NEXT GP opens the hub, then selects the schedule tab once it exists", () => {
  const r = boot({ search: "?go=nextgp" });
  r.timers.shift()();
  assert.deepEqual(r.clicks, ["mb-data"]);
  assert.equal(r.timers.length, 1, "waiting for the hub bundle");
  r.state.hubUp = true;
  r.timers.shift()();
  assert.deepEqual(r.clicks, ["mb-data", "dh-tab-schedule"]);
});

test("every manifest shortcut is in scope, has an icon on disk, and ?go= urls are exactly the consumer's allow-list", () => {
  const goUrls = [];
  assert.ok(MANIFEST.shortcuts.length >= 4);
  for (const s of MANIFEST.shortcuts) {
    const u = new URL(s.url, "https://x.test/f1-game/");
    assert.ok(u.pathname.startsWith("/f1-game/"), "in scope: " + s.url);
    if (u.searchParams.has("go")) goUrls.push(u.searchParams.get("go"));
    for (const i of s.icons) readFileSync(new URL("../../" + i.src, import.meta.url));
  }
  const ctx = vm.createContext({ location: { search: "" }, URLSearchParams });
  vm.runInContext(SRC + ";globalThis.D = DeepLink;", ctx);
  assert.deepEqual([...goUrls].sort(), Object.keys(ctx.D.DOORS).sort());
  assert.ok(MANIFEST.shortcuts.slice(0, 4).some((s) => /controller/.test(s.url)), "phone controller stays in the four Android shows");
});

// UI hunt 2026-10-29 #2: the Android back button / iOS edge swipe left the game from any screen, mid-race too.
test("BACK IS ESCAPE: one sentinel entry; a back closes the top layer or pauses the race, then re-arms", () => {
  const pushes = [], win = {}, clicks = [];
  const history = {
    state: null,
    pushState(s) { pushes.push(s); this.state = s; },
    replaceState(s) { this.state = s; },
  };
  const env = { escape: false, inRace: false };
  const ctx = vm.createContext({
    location: { search: "", pathname: "/f1-game/", hash: "" }, history, URLSearchParams,
    UiLayers: { inRace: () => env.inRace, top: () => null },
    TopModal: { escapeTop: () => { if (env.escape) clicks.push("door"); return env.escape; } },
    Log: { info() {} }, setTimeout() {},
    window: { addEventListener: (t, fn) => { win[t] = fn; } },
  });
  vm.runInContext(SRC + ";globalThis.DeepLink = DeepLink;", ctx, { filename: absSrc("js/ui/deep-link.js") });
  const G = { els: { overlay: { hidden: false } }, $: (id) => (id === "pausebtn" ? { click: () => clicks.push(id) } : null) };
  ctx.DeepLink.create(G);
  assert.equal(pushes.length, 1, "boot pushes ONE sentinel");
  assert.equal(history.state[ctx.DeepLink.MARK], 1);
  win.pointerdown();
  assert.equal(pushes.length, 1, "a tap while the sentinel is up pushes nothing");
  assert.equal(history.state[ctx.DeepLink.BASE], 1, "the sentinel sits on a BASE-stamped entry");
  const back = () => { history.state = { [ctx.DeepLink.BASE]: 1 }; win.popstate(); };   // the browser pops the sentinel onto its base
  env.escape = true; back();
  assert.deepEqual(clicks, ["door"], "a layer is up: its Escape door is pressed");
  assert.equal(pushes.length, 2, "…and the sentinel is re-armed");
  env.escape = false; env.inRace = true; back();
  assert.deepEqual(clicks, ["door", "pausebtn"], "mid-race with nothing open: pause");
  assert.equal(pushes.length, 3);
  env.inRace = false; back();
  assert.equal(pushes.length, 3, "the bare title lets the back stand: the next one leaves the game");
  win.popstate();
  assert.equal(pushes.length, 3, "no loop: a pop with nothing to do pushes nothing");
  win.keydown();
  assert.equal(pushes.length, 4, "the next tap or key re-arms it");
  win.popstate();
  assert.equal(pushes.length, 4, "a forward step onto the sentinel is ignored");
  // A HOW TO PLAY section link (#htp-driving) is a fragment navigation and
  // fires popstate with the URL changed: it must not close the open sheet.
  env.escape = true; clicks.length = 0;
  history.state = null; win.popstate();   // #htp-driving: a fresh entry, no state
  assert.deepEqual(clicks, [], "a fragment navigation is not a back");
  // HTP close rewrites the URL keeping history.state; the NEXT section jump
  // is again a fresh unstamped entry and must still be ignored.
  win.pointerdown(); history.replaceState(history.state, ""); history.state = null; win.popstate();
  assert.deepEqual(clicks, [], "a second section jump after a close is not a back either");
  back();
  assert.deepEqual(clicks, ["door"], "a real back off the re-armed sentinel still closes the top layer");
});

// UI hunt 3: back pressed the door directly, skipping the handlers that take
// Escape first (circuit search clears, garage camera panel shuts, peek ends).
test("BACK asks Escape first: an inner handler that claims it keeps the screen; unclaimed falls to the door", () => {
  const pushes = [], win = {}, clicks = [], seen = [];
  const history = { state: null, pushState(s) { pushes.push(s); this.state = s; }, replaceState(s) { this.state = s; } };
  const env = { claim: false, layer: { id: "select" } };
  class KeyboardEvent { constructor(type, o) { Object.assign(this, o, { type, defaultPrevented: false }); } preventDefault() { this.defaultPrevented = true; } }
  const focused = { dispatchEvent(ev) { seen.push(ev.key); win.keydown(ev); if (env.claim) ev.preventDefault(); return !ev.defaultPrevented; } };
  const ctx = vm.createContext({
    location: { search: "", pathname: "/f1-game/", hash: "" }, history, URLSearchParams, KeyboardEvent,
    document: { activeElement: focused },
    UiLayers: { inRace: () => false, top: () => env.layer },
    TopModal: { escapeTop: () => { clicks.push("door"); return true; } },
    Log: { info() {} }, setTimeout() {},
    window: { addEventListener: (t, fn) => { win[t] = fn; } },
  });
  vm.runInContext(SRC + ";globalThis.DeepLink = DeepLink;", ctx, { filename: absSrc("js/ui/deep-link.js") });
  ctx.DeepLink.create({ els: { overlay: { hidden: false } }, $: () => null });
  const back = () => { history.state = { [ctx.DeepLink.BASE]: 1 }; win.popstate(); };
  env.claim = true; back();
  assert.deepEqual(seen, ["Escape"], "the focused element hears Escape");
  assert.deepEqual(clicks, [], "a claimed Escape does not press the door");
  assert.equal(pushes.length, 2, "…and still counts as taken: the sentinel re-arms once, not from our own key");
  env.claim = false; back();
  assert.deepEqual(clicks, ["door"], "unclaimed: the layer's door, as before");
  env.layer = null; clicks.length = 0; seen.length = 0; back();
  assert.deepEqual(seen, [], "no layer up: no synthetic key");
});

test("a ?go= link keeps the sentinel: the param strip preserves history.state", () => {
  const history = { state: null, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; } };
  const ctx = vm.createContext({
    location: { search: "?go=race", pathname: "/f1-game/", hash: "" }, history, URLSearchParams,
    UiLayers: { inRace: () => false, top: () => null }, Log: { info() {} }, setTimeout() {},
    window: { addEventListener() {} },
  });
  vm.runInContext(SRC + ";globalThis.DeepLink = DeepLink;", ctx, { filename: absSrc("js/ui/deep-link.js") });
  ctx.DeepLink.create({ els: { overlay: { hidden: false } }, $: () => null });
  assert.equal(history.state && history.state[ctx.DeepLink.MARK], 1);
});
