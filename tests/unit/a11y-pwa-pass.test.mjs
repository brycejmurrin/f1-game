// THE 2026-09-27 A11Y / PWA PASS, as behaviour: each assertion EXECUTES the
// shipped source in a VM rather than grepping for it.
//   - Input.pickPad: the pad that drives is the one most recently USED (a
//     button down, an axis moved); among never-used pads a STANDARD mapping
//     first, then Gamepad.timestamp — never whichever holds slot 0.
//     https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
//   - Input.lockLandscape / unlockLandscape: touch-only, swallow a rejection,
//     and unlock only what they locked.
//     https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
//   - CamModes.refreshCamBtn: the CAM button's accessible name starts with its
//     visible word (WCAG 2.5.3 Label in Name).
//     https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
//   - manifest.json asks for fullscreen display before standalone.
// The service-worker half (navigation preload, the memoised cache order) lives
// in service-worker.test.mjs beside the harness it needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function bootInput({ coarse = false, orientation, pads = null, listeners = null } = {}) {
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp, Promise,
    performance: { now: () => 0 },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: listeners ? (t, f) => { (listeners[t] ||= []).push(f); } : () => {},
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: pads ? { getGamepads: () => pads } : {}, screen: orientation ? { orientation } : {},
    matchMedia: (q) => ({ matches: coarse && /coarse/.test(q), addEventListener() {} }),
    document: {
      addEventListener() {}, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      activeElement: null, dispatchEvent: () => true,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  return vm.runInContext("Input", ctx);
}

const pad = (id, mapping, timestamp, connected = true) => ({ id, mapping, timestamp, connected, axes: [], buttons: [] });

// THE RULE CHANGED (2026-10-04). It used to be "standard mapping first", and
// this file pinned it with a wheel (mapping "", used at t 900) losing to an
// Xbox pad (t 10). That pin was the bug: a wheel enumerates with mapping "",
// so any standard pad left on its dongle took the car and the wheel wizard
// away from the wheel actually being turned. USE ranks first now; the old
// order only breaks a tie between pads nobody has used yet.
const never = () => 0;
const usedAt = (table) => (p) => table[p.id] || 0;

test("pickPad: the pad being USED drives, even over an idle standard pad in an earlier slot", () => {
  const Input = bootInput();
  const wheel = pad("wheel", "", 900);
  const xbox = pad("xbox", "standard", 10);
  assert.equal(Input.pickPad([xbox, wheel], usedAt({ wheel: 900 })).id, "wheel", "the wheel being turned drives");
  assert.equal(Input.pickPad([wheel, xbox], usedAt({ wheel: 900, xbox: 950 })).id, "xbox", "picking the pad up hands it back");
  assert.equal(Input.pickPad([wheel, xbox], never).id, "xbox", "nobody has used either yet: standard mapping first");
  assert.equal(Input.pickPad([null, wheel], never).id, "wheel", "with no standard pad the non-standard one still drives");
});

test("pickPad: once a wheel is set up (or its wizard captures), the wheel outranks an idle pad", () => {
  const Input = bootInput();
  const wheel = pad("wheel", "", 99999), xbox = pad("xbox", "standard", 1000);
  assert.equal(Input.pickPad([xbox, wheel], true).id, "wheel", "a mapped wheel drives, not the idle pad beside it");
  assert.equal(Input.pickPad([xbox, null], true).id, "xbox", "with no wheel the pad still drives");
  // That preference is the never-used tie-break; a pad actually being USED still drives.
  assert.equal(Input.pickPad([xbox, wheel], usedAt({ xbox: 5 }), true).id, "xbox", "picking the pad up still hands it the car");
  // The live wiring: a non-default axis map flips the preference through activePad().
  Input.setPadAxisMap({ steer: 0, throttle: 2, brake: 3 });
  assert.equal(Input.padAxesAreDefault(), false);
});

test("pickPad: among idle pads the newest timestamp wins, slot order breaks ties", () => {
  const Input = bootInput();
  assert.equal(Input.pickPad([pad("a", "standard", 100), pad("b", "standard", 250)], never).id, "b");
  assert.equal(Input.pickPad([pad("a", "standard", 300), pad("b", "standard", 250)], never).id, "a");
  assert.equal(Input.pickPad([pad("a", "standard", 5), pad("b", "standard", 5)], never).id, "a", "an idle pair is stable");
  assert.equal(Input.pickPad([pad("a", "standard", 999, false), pad("b", "standard", 1)], usedAt({ a: 999 })).id, "b", "a disconnected pad never drives");
  assert.equal(Input.pickPad([pad("a", "standard", undefined), pad("b", "standard", 1)], never).id, "b", "no timestamp counts as 0");
  assert.equal(Input.pickPad([]), null);
  assert.equal(Input.pickPad(null), null);
});

// The live path: poll() stamps use itself. An Xbox pad idles in slot 0 while
// the wheel in slot 1 is turned: the wheel steers; pot jitter is not use; and
// when the Xbox pad takes over again, a button already held on it is not read
// as a fresh press against the wheel's buttons (edges are per device).
function bootLive(pads) {
  const listeners = {};
  const Input = bootInput({ pads, listeners });
  Input.init({ addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }) });
  for (const f of listeners.gamepadconnected || []) f({ gamepad: pads[0] });
  return Input;
}
const btns = (n = 17) => Array.from({ length: n }, () => ({ pressed: false, value: 0 }));

test("poll(): turning a wheel takes the car from an idle standard pad; jitter does not; edges stay per device", () => {
  const xbox = { id: "xbox", index: 0, mapping: "standard", connected: true, timestamp: 1, axes: [0, 0, 0, 0], buttons: btns() };
  const wheel = { id: "wheel", index: 1, mapping: "", connected: true, timestamp: 1, axes: [0, -1, -1, 0], buttons: btns(24) };
  xbox.buttons[2] = { pressed: true, value: 1 };        // X (BOOST) already held when the page first sees the pad
  const Input = bootLive([xbox, wheel]);
  Input.poll();
  Input.consumeBoostToggle();                            // the press that woke the pad is a real one
  wheel.axes[0] = 0.2; Input.poll();
  assert.equal(Input.steer(), 0, "20 % pot jitter on the wheel is not use: the idle standard pad still drives");
  wheel.axes[0] = 0.6; Input.poll();
  assert.ok(Input.steer() > 0.5, "the wheel being turned drives: " + Input.steer());
  xbox.axes[0] = -0.7; Input.poll();
  assert.ok(Input.steer() < -0.5, "picking the pad up hands it back: " + Input.steer());
  assert.equal(Input.consumeBoostToggle(), false, "X held on the pad all along is not a new press against the wheel's buttons");
});

test("lockLandscape locks only on a touch device, and unlock releases only its own lock", async () => {
  const calls = [];
  const orientation = {
    lock: (o) => { calls.push("lock:" + o); return Promise.resolve(); },
    unlock: () => { calls.push("unlock"); },
  };
  const desktop = bootInput({ coarse: false, orientation });
  assert.equal(await desktop.lockLandscape(), false, "a mouse-driven desktop has no orientation to lock");
  desktop.unlockLandscape();
  assert.deepEqual(calls, [], "nothing locked, nothing unlocked");

  const phone = bootInput({ coarse: true, orientation });
  assert.equal(await phone.lockLandscape(), true);
  phone.unlockLandscape();
  phone.unlockLandscape();
  assert.deepEqual(calls, ["lock:landscape", "unlock"], "one lock, one unlock — the second unlock is a no-op");
});

test("lockLandscape swallows a rejection (not fullscreen, iPhone, unsupported) and never unlocks", async () => {
  const calls = [];
  const orientation = {
    lock: () => Promise.reject(Object.assign(new Error("not fullscreen"), { name: "NotSupportedError" })),
    unlock: () => calls.push("unlock"),
  };
  const phone = bootInput({ coarse: true, orientation });
  assert.equal(await phone.lockLandscape(), false);
  phone.unlockLandscape();
  assert.deepEqual(calls, []);
  const noApi = bootInput({ coarse: true });
  assert.equal(await noApi.lockLandscape(), false, "no screen.orientation at all");
});

test("game.js locks landscape after race fullscreen succeeds and unlocks on exit and quit", () => {
  const g = read("js/ui/platform-session.js") + read("js/game.js");
  assert.match(g, /if \(fsElement\(\)\) \{\s*Input\.lockEscape\(\); if \(G.state === "race" \|\| G.state === "count"\) Input\.lockLandscape\(\);/);
  assert.match(g, /"fullscreenchange", syncFullscreen/);
  assert.match(g, /"webkitfullscreenchange", syncFullscreen/);
  const quit = g.slice(g.indexOf("function quitToMenu() {"), g.indexOf("function quitToMenu() {") + 600);
  assert.match(quit, /Input\.unlockLandscape\(\)/, "quitting the race releases the lock");
});

for (const prefixed of [false, true]) test(`fullscreen tracks entry, exit and external exit (${prefixed ? "WebKit" : "standard"})`, async () => {
  const events = new Map(), painted = [], locks = { escape: false, landscape: false };
  let controls, exits = 0;
  const field = prefixed ? "webkitFullscreenElement" : "fullscreenElement";
  const event = prefixed ? "webkitfullscreenchange" : "fullscreenchange";
  const element = {};
  const doc = {
    documentElement: element, [field]: null,
    addEventListener: (name, fn) => events.set(name, fn),
    [prefixed ? "webkitExitFullscreen" : "exitFullscreen"]() {
      exits++; this[field] = null; events.get(event)();
      return prefixed ? undefined : Promise.resolve();
    },
  };
  element[prefixed ? "webkitRequestFullscreen" : "requestFullscreen"] = () => {
    doc[field] = element; events.get(event)();
    return prefixed ? undefined : Promise.resolve();
  };
  const sb = {
    document: doc, G: { state: "race" }, $: () => ({}),
    SettingRow: { labels: (v) => v, wire: (_id, config) => { controls = config; }, paint: (_row, v) => painted.push(v) },
    Input: {
      lockEscape: () => { locks.escape = true; }, unlockEscape: () => { locks.escape = false; },
      lockLandscape: () => { locks.landscape = true; }, unlockLandscape: () => { locks.landscape = false; },
    },
  };
  const source = read("js/ui/platform-session.js");
  vm.runInNewContext(source.slice(source.indexOf("const fsOk ="), source.indexOf("/* ADD TO HOME SCREEN")), sb);
  controls.write("on");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controls.read(), "on");
  assert.equal(painted.at(-1), "on");
  assert.deepEqual(locks, { escape: true, landscape: true });
  controls.write("off");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(exits, 1, "the corresponding exit API was called");
  assert.equal(controls.read(), "off");
  assert.equal(painted.at(-1), "off");
  assert.deepEqual(locks, { escape: false, landscape: false });
  controls.write("on");
  await new Promise((resolve) => setImmediate(resolve));
  doc[field] = null; events.get(event)();
  assert.equal(painted.at(-1), "off");
  assert.deepEqual(locks, { escape: false, landscape: false });
});

test("manifest.json asks for fullscreen, then standalone", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.deepEqual(m.display_override, ["fullscreen", "standalone"]);
  assert.equal(m.display, "standalone", "display stays the fallback for browsers without display_override");
});

// L8-f: identity, richer install UI, a shortcut, and an install door outside iOS.
// `id` resolves against start_url's ORIGIN, and an app installed before it had
// one is identified by its start_url (https://brycejmurrin.github.io/f1-game/),
// so "/f1-game/" keeps every existing install the same app.
// https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id
test("manifest.json: id keeps the installed identity, screenshots and shortcuts point at shipped files", () => {
  const m = JSON.parse(read("manifest.json"));
  assert.equal(m.id, "/f1-game/");
  assert.ok(m.screenshots.length >= 1);
  for (const sh of m.screenshots) {
    assert.ok(fs.existsSync(path.join(ROOT, sh.src)), sh.src + " exists");
    assert.match(sh.sizes, /^\d+x\d+$/);
    assert.equal(sh.form_factor, "wide");
    assert.ok(sh.label, "a screenshot is labelled for assistive tech");
  }
  for (const sc of m.shortcuts) {
    assert.ok(sc.name && sc.url, "name + url");
    assert.ok(fs.existsSync(path.join(ROOT, sc.url.split(/[?#]/)[0])), sc.url + " is a page that ships");
    for (const ic of sc.icons || []) assert.ok(fs.existsSync(path.join(ROOT, ic.src)));
  }
});

test("INSTALL APP: beforeinstallprompt is stashed, prompt() only from the tap, once; appinstalled hides it", async () => {
  const ps = read("js/ui/platform-session.js");
  const body = ps.slice(ps.indexOf("(function installChip()"), ps.indexOf("})();", ps.indexOf("(function installChip()")) + 5);
  const win = new Map(), stored = new Map();
  const chip = { hidden: true, listeners: new Map(), addEventListener(t, fn) { this.listeners.set(t, fn); } };
  const sb = {
    window: { addEventListener: (t, fn) => win.set(t, fn) },
    $: (id) => (id === "install-chip" ? chip : null),
    store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
    UiLayers: { inRace: () => false },
    Log: { info() {}, warn() {} },
    setTimeout: () => 0,
  };
  vm.createContext(sb);
  vm.runInContext(body, sb);
  let prevented = 0, prompted = 0;
  const ev = { preventDefault: () => prevented++, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: "accepted" }) };
  win.get("beforeinstallprompt")(ev);
  assert.equal(prevented, 1, "no mini-infobar: our chip instead");
  assert.equal(chip.hidden, false);
  assert.equal(prompted, 0, "never prompted without a tap");
  await chip.listeners.get("click")();
  assert.equal(prompted, 1);
  assert.equal(chip.hidden, true);
  assert.equal(stored.get("installChipSeen"), true);
  await chip.listeners.get("click")();
  assert.equal(prompted, 1, "the event is single-use");
  win.get("beforeinstallprompt")(ev);
  assert.equal(chip.hidden, true, "a player who has seen it is not asked again");
  assert.match(read("index.html"), /<button id="install-chip" type="button" hidden>INSTALL APP<\/button>/);
  // UI-12 (hunt2): a launch where the chip only times out still counts as
  // seen — it used to come back for 20 s on every launch until tapped.
  const boot = () => { const w = new Map(), c = { hidden: true, addEventListener() {} };
    vm.runInContext(body, vm.createContext({ ...sb, window: { addEventListener: (t, fn) => w.set(t, fn) }, $: (id) => (id === "install-chip" ? c : null) }));
    w.get("beforeinstallprompt")({ preventDefault() {} }); return c; };
  stored.clear();
  assert.equal(boot().hidden, false, "first launch: shown");
  assert.equal(stored.get("installChipSeen"), true, "and remembered without a tap");
  assert.equal(boot().hidden, true, "the next launch does not nag again");
});

test("the CAM button's accessible name starts with the word it shows", () => {
  const attrs = {};
  const btn = {
    textContent: "", setAttribute: (k, v) => { attrs[k] = v; }, addEventListener() {},
  };
  const sb = {
    Log: { info() {} }, setTimeout, clearTimeout,
    document: { body: { classList: { toggle() {}, contains: () => false }, toggleAttribute() {} }, addEventListener() {} },
    CamTunerPanel: { refresh() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/camera/mode-switch.js"), ctx, { filename: "js/camera/mode-switch.js" });
  const G = { $: (id) => (id === "btn-cam" ? btn : null), camMode: 0, store: { set() {} } };
  const cams = vm.runInContext("CamModes", ctx).create(G);
  assert.equal(btn.textContent, "CHASE");
  assert.equal(attrs["aria-label"], "CHASE camera");
  cams.setCamMode(3);
  assert.equal(btn.textContent, "COCKPIT");
  assert.ok(attrs["aria-label"].toLowerCase().startsWith(btn.textContent.toLowerCase()), "label in name, after every change");
});

// ── L8-d: UPDATE READY (js/ui/update-check.js) ─────────────────────────────
// The shell guard reads version.json once, at boot; an installed PWA then never
// learned a deploy happened. UpdateCheck re-reads it on return to the tab
// (≤ 1 per 10 min), shows #update-chip outside races, and its tap persists
// state, then reloads the way the boot guard does (?b=, query + hash kept).
// https://developer.chrome.com/docs/workbox/handling-service-worker-updates
function bootUpdateCheck({ booted = 100, build = 101, controller = 0, racing = false, persist, fetchImpl } = {}) {
  let t = 1_000_000, fetches = 0, replaced = null, persisted = 0;
  const said = [];
  const chip = { hidden: true, textContent: "UPDATE READY · RELOAD", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const store = new Map();
  const sb = {
    Math, Object, Number, JSON, Promise, RegExp, String, URLSearchParams,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    Log: { info() {}, warn() {} },
    LiveRegion: { say: (text, kind) => said.push([text, kind]) },
    sessionStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null },
    document: { hidden: false, querySelector: () => ({ content: String(booted) }) },
    navigator: { serviceWorker: { controller: controller ? { scriptURL: "https://x.test/sw.js?v=" + controller } : null } },
  };
  vm.createContext(sb);
  vm.runInContext(read("js/ui/update-check.js"), sb, { filename: "js/ui/update-check.js" });
  const UC = vm.runInContext("UpdateCheck", sb);
  const u = UC.create({
    now: () => t, inRace: () => racing, chip: () => chip,
    fetch: async (url, init) => { fetches++; assert.equal(init.cache, "no-store"); assert.match(url, /^version\.json\?_=\d+$/); if (fetchImpl) return fetchImpl(fetches); return { ok: true, json: async () => ({ build }) }; },
    persist: () => { persisted++; return persist && persist(); },
    location: { pathname: "/f1-game/", search: "?log=net", hash: "#vs=CODE", replace: (u2) => { replaced = u2; } },
  });
  return { UC, u, chip, store, said, advance: (ms) => { t += ms; }, race: (v) => { racing = v; },
    get fetches() { return fetches; }, get replaced() { return replaced; }, get persisted() { return persisted; } };
}

test("update check: throttled to one version.json read per 10 min, starting from boot", async () => {
  const h = bootUpdateCheck({ build: 100 });
  h.u.onVisible(); await h.u.check(false);
  assert.equal(h.fetches, 0, "the boot guard just checked — nothing for 10 minutes");
  h.advance(h.UC.THROTTLE_MS);
  h.u.onVisible(); await Promise.resolve(); await h.u.check(false);
  assert.equal(h.fetches, 1, "one read once the throttle has passed");
  h.advance(60_000); await h.u.check(false);
  assert.equal(h.fetches, 1, "and not again a minute later");
  assert.equal(h.chip.hidden, true, "same build: no chip");
});

test("update check: a newer build shows the chip outside races only, and the tap persists then reloads", async () => {
  const h = bootUpdateCheck({ build: 105 });
  assert.equal(await h.u.check(true), true);
  assert.equal(h.chip.hidden, false, "UPDATE READY in the menus");
  assert.match(h.chip.attrs["aria-label"], /build 105/);
  h.race(true); h.u.render();
  assert.equal(h.chip.hidden, true, "never over a race");
  assert.equal(await h.u.apply(), false, "and a race is never reloaded out from under the player");
  h.race(false);
  assert.equal(await h.u.apply(), true);
  assert.equal(h.persisted, 1, "transient state is persisted BEFORE the reload");
  assert.equal(h.replaced, "/f1-game/?log=net&b=105#vs=CODE", "the boot guard's URL shape: ?b=, query and hash kept");
  assert.equal(h.store.get("apex26.shellReloadedTo"), "105", "so the guard does not reload the new shell again");
});

test("update check: a race starting during persistence cancels navigation and keeps the update available", async () => {
  let finish;
  const h = bootUpdateCheck({ persist: () => new Promise((resolve) => { finish = resolve; }) });
  h.u.markReady(105);
  const applying = h.u.apply();
  await Promise.resolve();
  h.race(true); finish();
  assert.equal(await applying, false);
  assert.equal(h.replaced, null);
  assert.equal(h.store.has("apex26.shellReloadedTo"), false, "no reload marker until navigation is safe");
  assert.equal(h.chip.hidden, true);
  h.race(false); h.u.render();
  assert.equal(h.chip.hidden, false, "update remains available after the race");
  const retry = h.u.apply(); await Promise.resolve(); finish();
  assert.equal(await retry, true);
});

test("update check: an older or unreadable version.json never shows the chip", async () => {
  const h = bootUpdateCheck({ build: 99 });
  assert.equal(await h.u.check(true), false);
  assert.equal(h.chip.hidden, true);
});

test("a newer CONTROLLING worker blocks lazy loads once the session is wired, and raises the chip", () => {
  const h = bootUpdateCheck({ build: 100, controller: 104 });
  assert.equal(h.UC.controllerBuild(), 104, "the controller's build comes from its sw.js?v=");
  assert.equal(h.UC.blocksLazyLoad(), true, "a ?v=100 lazy file would be answered by build 104");
  assert.equal(h.chip.hidden, false);
  const same = bootUpdateCheck({ build: 100, controller: 100 });
  assert.equal(same.UC.blocksLazyLoad(), false, "same build: load as usual");
});

// 06-F4: lastCheck was stamped BEFORE the fetch, so a version.json read that
// failed (offline, a deploy window, a non-200) blocked every retry for the full
// 10-minute throttle. A failure now backs off ~30 s; a success still holds 10 min.
test("update check: a failed version.json read is retried after the short backoff, not the full throttle", async () => {
  const h = bootUpdateCheck({ build: 105, fetchImpl: (n) => (n === 1 ? Promise.reject(new Error("offline")) : n === 2 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ build: 105 }) }) });
  h.advance(h.UC.THROTTLE_MS);
  assert.equal(await h.u.check(false), false, "the read failed");
  assert.equal(h.fetches, 1);
  h.advance(10_000); await h.u.check(false);
  assert.equal(h.fetches, 1, "too soon after a failure: still backed off");
  h.advance(25_000); await h.u.check(false);
  assert.equal(h.fetches, 2, "~30 s later it asks again (and gets a 503: a failure too)");
  h.advance(31_000);
  assert.equal(await h.u.check(false), true, "the next read lands");
  assert.equal(h.fetches, 3);
  assert.equal(h.chip.hidden, false);
  h.advance(60_000); await h.u.check(false);
  assert.equal(h.fetches, 3, "a SUCCESS holds the full throttle");
});

// 14-F3: once UPDATE READY is raised every lazy load is refused (a file asked for
// as the old build would be answered with the new one). The refusal stays; it is
// no longer silent: the chip says what is happening and a screen reader is told,
// once per pending build.
test("a refused lazy load explains itself once: chip text and a spoken line, then quiet", async () => {
  const h = bootUpdateCheck({ build: 105, controller: 105 });
  assert.equal(h.UC.blocksLazyLoad(), true, "refused");
  assert.equal(h.chip.textContent, "UPDATE READY · RELOAD TO CONTINUE");
  assert.deepEqual(h.said, [["UPDATE READY — RELOAD TO CONTINUE", "save"]]);
  assert.equal(h.UC.blocksLazyLoad(), true);
  assert.equal(await h.UC.prepareLazyLoad({}), false, "every further refusal stays refused…");
  assert.equal(h.said.length, 1, "…but says nothing more");
  h.u.markReady(106);
  assert.equal(h.UC.blocksLazyLoad(), true);
  assert.equal(h.said.length, 2, "a newer pending build is a new explanation");
});

// 3-F5 (round-3 hunt): on a FIRST visit no service worker controls the tab, so
// neither the controller probe nor controllerchange can learn of a deploy that
// lands while the tab stays visible; Pages then answers a lazy `?v=<booted>`
// request with the NEW file for the OLD core. A lazy load re-reads version.json
// first when the last read is over a minute old (once per loader call, capped).
test("with no controlling worker, a lazy load re-reads a stale version.json and refuses a newer build (3-F5)", async () => {
  const h = bootUpdateCheck({ build: 101, controller: 0 });
  assert.equal(await h.UC.prepareLazyLoad({}), true, "fresh from boot: no extra read, the load goes ahead");
  assert.equal(h.fetches, 0);
  h.advance(61_000);
  const scope = {};
  const [a, b] = await Promise.all([h.UC.prepareLazyLoad(scope), h.UC.prepareLazyLoad(scope)]);
  assert.equal(h.fetches, 1, "one read for the whole loader call, its parallel files included");
  assert.equal(a, false, "build 101 is live: the old core's lazy file is refused");
  assert.equal(b, false, "…for every file of the call");
  assert.equal(h.chip.hidden, false, "and UPDATE READY explains it");

  const same = bootUpdateCheck({ build: 100, controller: 0 });
  same.advance(61_000);
  assert.equal(await same.UC.prepareLazyLoad({}), true, "same build: the load goes ahead after the read");
  assert.equal(same.fetches, 1);
  assert.equal(await same.UC.prepareLazyLoad({}), true);
  assert.equal(same.fetches, 1, "that read is fresh for the next minute");

  const hung = bootUpdateCheck({ build: 101, controller: 0, fetchImpl: () => new Promise(() => {}) });
  hung.advance(61_000);
  const t0 = Date.now();
  assert.equal(await hung.UC.prepareLazyLoad({}), true, "a version.json that never answers does not hold the load");
  assert.ok(Date.now() - t0 < 5000, "the wait is capped");
});

test("a refusal during a race is spoken at the next menu, not over the race", () => {
  const h = bootUpdateCheck({ build: 105, controller: 105, racing: true });
  assert.equal(h.UC.blocksLazyLoad(), true);
  assert.equal(h.said.length, 0, "nothing spoken mid-race");
  assert.equal(h.chip.hidden, true);
  h.race(false); h.u.render();
  assert.equal(h.said.length, 1);
  assert.equal(h.chip.hidden, false);
});

test("a sound load with no newer build is never explained as an update", () => {
  const h = bootUpdateCheck({ build: 100, controller: 100 });
  assert.equal(h.UC.blocksLazyLoad(), false);
  assert.equal(h.said.length, 0);
  assert.equal(h.chip.textContent, "UPDATE READY · RELOAD");
});

test("UpdateCheck is wired: #update-chip in the shell, the visibility hook, the loader guard", () => {
  assert.match(read("index.html"), /<button id="update-chip" type="button" hidden>/);
  const ps = read("js/ui/platform-session.js");
  assert.match(ps, /UpdateCheck\.create\(\{/);
  assert.match(ps, /updates\.onVisible\(\)/);
  assert.match(ps, /controllerchange/);
  assert.match(read("js/core/script-loader.js"), /UpdateCheck\.blocksLazyLoad\(\)/);
});

// UI-09 (hunt2): a modal dialog.screen is in the top layer and makes the rest
// of the document inert, so UPDATE READY sat under RESULTS' backdrop, visible
// and unpressable. It stands down under a modal, as #save-warning does.
test("UPDATE READY and the save warning stand down under a modal dialog", () => {
  const css = read("css/overlays.css");
  assert.match(css, /body:has\(dialog:modal\) #update-chip \{ display: none; \}/);
  assert.match(css, /body:has\(dialog\[open\]\) #save-warning \{ display: none; \}/);
  assert.doesNotMatch(css, /Above every\s+menu sheet/, "the comment no longer promises what the top layer forbids");
});

// Ports are private to the queried controller; replacements and a worker that
// restarts at the same URL cannot reuse an earlier generation answer.
function generationHarness() {
  const replies = [], timers = [];
  const sw = { controller: null };
  class Channel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = { postMessage: (data) => this.port1.onmessage({ data }), close() {} };
    }
  }
  const makeWorker = () => ({ scriptURL: "https://x.test/sw.js?v=100", postMessage(_data, ports) { replies.push(ports[0]); } });
  sw.controller = makeWorker();
  const sb = vm.createContext({
    navigator: { serviceWorker: sw }, MessageChannel: Channel,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, Log: { info() {} },
  });
  vm.runInContext(read("js/ui/update-check.js"), sb);
  const UC = vm.runInContext("UpdateCheck", sb), u = UC.create({ booted: 100 });
  return { UC, u, sw, makeWorker, replies, timers, sb };
}

test("generation handshakes coalesce and recheck the same controller for the next lazy batch", async () => {
  const h = generationHarness();
  const scope = {};
  const a = h.UC.prepareLazyLoad(scope), b = h.UC.prepareLazyLoad(scope);
  assert.equal(h.replies.length, 1);
  h.replies[0].postMessage({ type: "apex-cache-generation", build: 100 });
  assert.equal(await a, true); assert.equal(await b, true);
  const next = h.UC.prepareLazyLoad(scope);
  assert.equal(h.replies.length, 2);
  h.replies[1].postMessage({ type: "apex-cache-generation", build: 101 });
  assert.equal(await next, false);
  assert.equal(h.u.state().ready, 101);
});

test("a replaced controller's late answer cannot authorize a lazy injection", async () => {
  const h = generationHarness(), first = h.UC.prepareLazyLoad();
  h.sw.controller = h.makeWorker();
  h.replies[0].postMessage({ type: "apex-cache-generation", build: 100 });
  assert.equal(await first, false);
  const next = h.UC.prepareLazyLoad();
  h.replies[1].postMessage({ type: "apex-cache-generation", build: 102 });
  assert.equal(await next, false);
  assert.equal(h.u.state().ready, 102);
});

test("old worker handshake timeout permits ordinary boot but refuses a known newer build", async () => {
  const h = generationHarness(), old = h.UC.prepareLazyLoad();
  h.timers[0]();
  assert.equal(await old, true, "older deployed workers have no message protocol");
  h.u.markReady(101);
  const newer = h.UC.prepareLazyLoad();
  h.timers[1]();
  assert.equal(await newer, false, "timeout cannot erase the known update");
  assert.equal(h.UC.blocksLazyLoad(), true);
});

function generationLoader(h, appended) {
  h.sb.ApexRoster = { DEFERRED_EDGES: [] };
  h.sb.window = { __APEX_BUILD: 100 };
  h.sb.Log.warn = () => {};
  h.sb.document = {
    createElement: () => ({ dataset: {} }),
    head: { appendChild(node) { appended.push(node.src); queueMicrotask(() => node.onload()); } },
  };
  vm.runInContext(read("js/core/script-loader.js"), h.sb);
  return vm.runInContext("ScriptLoader.create()", h.sb);
}

test("a serial lazy chain pays the legacy-worker timeout once per load invocation", async () => {
  const h = generationHarness(), appended = [], loader = generationLoader(h, appended);
  const files = ["a.js", "b.js", "c.js"], edges = [["a.js", "b.js"], ["b.js", "c.js"]];
  const first = loader.load(files, edges);
  assert.equal(h.timers.length, 1);
  h.timers[0]();
  assert.equal(await first, true);
  assert.equal(appended.length, 3);
  assert.equal(h.replies.length, 1, "serial dependencies reuse only this call's legacy fallback");
  const second = loader.load(files, edges);
  assert.equal(h.timers.length, 2, "a new call asks the worker again");
  h.timers[1]();
  assert.equal(await second, true);
  assert.equal(h.replies.length, 2);
});

test("a serial chain rechecks a replacement controller after its legacy fallback", async () => {
  const h = generationHarness(), appended = [], loader = generationLoader(h, appended);
  const append = h.sb.document.head.appendChild;
  h.sb.document.head.appendChild = (node) => { append(node); h.sw.controller = h.makeWorker(); };
  const pending = loader.load(["a.js", "b.js"], [["a.js", "b.js"]]);
  h.timers[0]();
  await new Promise(setImmediate);
  assert.equal(h.replies.length, 2);
  h.replies[1].postMessage({ type: "apex-cache-generation", build: 101 });
  assert.equal(await pending, false);
  assert.deepEqual(appended, ["a.js?v=100"]);
});

test("a known newer build still blocks a serial chain using legacy fallback", async () => {
  const h = generationHarness(), appended = [], loader = generationLoader(h, appended);
  const append = h.sb.document.head.appendChild;
  h.sb.document.head.appendChild = (node) => { append(node); h.u.markReady(101); };
  const pending = loader.load(["a.js", "b.js"], [["a.js", "b.js"]]);
  h.timers[0]();
  assert.equal(await pending, false);
  assert.equal(h.replies.length, 1);
  assert.deepEqual(appended, ["a.js?v=100"]);
});

for (const broken of ["constructor", "postMessage", "close"]) test(`generation channel ${broken} errors settle the loader`, async () => {
  const h = generationHarness(), appended = [], loader = generationLoader(h, appended);
  if (broken === "constructor") h.sb.MessageChannel = class { constructor() { throw new Error("channel unavailable"); } };
  if (broken === "postMessage") h.sw.controller.postMessage = () => { throw new Error("transfer failed"); };
  const pending = loader.load(["a.js"], []);
  if (broken === "close") {
    h.replies[0].close = () => { throw new Error("closed"); };
    h.replies[0].postMessage({ type: "apex-cache-generation", build: 100 });
  }
  assert.equal(await pending, broken === "close");
  assert.equal(appended.length, broken === "close" ? 1 : 0);
});
