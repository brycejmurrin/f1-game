/* phone-touch-surface.test.mjs — the phone DRIVING surface, pinned as rules.
 *
 * 2026-09-02 phone audit (390x844 portrait / 844x390 landscape, HUD SIZE
 * 100/150/200 %). Everything here is what a mini-DOM or a css-rules read can
 * DEMONSTRATE; the cells that need a device screenshot are listed at the end
 * of this comment and in docs/TESTING.md §Field notes, not asserted.
 *
 * CONFIRMED and fixed in the same change:
 *   - the portrait blocker's three pills (#rotate-race / -controls / -exit)
 *     sat on `--tap-min`, the 24px WCAG floor, on a layer that is gated to
 *     coarse-pointer phones — 24px tall buttons at the one moment a player
 *     has to hit one. Now `--tap` (52px on touch).
 *   - the portrait buttons-mode `.hud-bottom` anchor added `var(--sab)` raw
 *     inside a `zoom: var(--hud-z)` subtree, so the home-indicator inset was
 *     multiplied by HUD SIZE. Now divided like every other anchor in the list.
 *   - `Input.requestGyro()` latched `gyroDenied` on any rejection and never
 *     cleared it on a later grant, so STEER read "(NO GYRO)" while tilt drove.
 *
 * CONFIRMED-OK and pinned so they stay that way: every `:hover` in css/ is
 * gated on `(hover: hover)`; every scroll container contains its overscroll;
 * the dock's tap rungs clear 44px at both width tiers; the tallest dock
 * column fits a 390px-tall landscape phone at HUD SIZE 200 % before fitHud's
 * `--hud-z-dock` cap even has to act; double-tap zoom is refused on every
 * layer; in-race chrome and the blocker are anchored inside the safe area.
 *
 * PLAUSIBLE (device screenshot needed — arithmetic from the CSS, not a
 * measurement; the numbers are in the dock test below):
 *   - 844x390 landscape, STEER TILT + GEARS AUTO (pedals LEFT), HUD SIZE
 *     ≥ ~160 %: the pedal column's top edge rises under #minimap. fitHud's
 *     dock cap reserves 3 x FIT_AIR of viewport height, not the corner
 *     clusters. Pedals RIGHT (buttons / tilt+manual) meet #pausebtn from
 *     ~185 %. Owner: js/game/hud.js fitHud — not touched here.
 *   - 390x844 portrait after RACE IN PORTRAIT: fitHud's top-band cap assumes
 *     the landscape geometry (map beside the POS row), so on a 390px-wide
 *     screen `--hud-z-top` computes to ~0.5 at EVERY HUD SIZE — the POS/LAP/
 *     TIME/BEST row and the map paint at half size. Owner: hud.js.
 *   - iOS + Bluetooth pad in TILT: the A press is a synthesised `.click()`,
 *     which carries no user activation, so `requestPermission()` rejects and
 *     the store flips to BUTTONS. The label fix above makes the next real tap
 *     on STEER recover cleanly; the auto-flip itself is unchanged.
 *   - the index.html double-tap killer cancels the CLICK of a second tap on
 *     the same spot within 350 ms (preventDefault on touchend), so a fast
 *     double press of one menu stepper registers once. Out of this change's
 *     territory; a device check is listed in docs/TESTING.md.
 *
 * Run: node --test tests/unit/phone-touch-surface.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl, declares, rulesFor, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const cssCache = new Map();
const css = (name) => { if (!cssCache.has(name)) cssCache.set(name, cssRules(read(name))); return cssCache.get(name); };
const CSS_FILES = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css")).map((f) => "css/" + f);
const px = (v, what) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v).trim()); assert.ok(m, `${what}: expected a px literal, got ${v}`); return +m[1]; };
/** First argument of `max(<n>px, …)` — the literal rung a ladder token stands on. */
const rung = (v, what) => { const m = /^max\((\d+(?:\.\d+)?)px,/.exec(String(v).trim()); assert.ok(m, `${what}: expected max(<n>px, …), got ${v}`); return +m[1]; };

/* ── tap targets ─────────────────────────────────────────────────────────── */

test("the portrait blocker's buttons sit on the touch rung, not the 24px WCAG floor", () => {
  const rules = css("css/responsive.css");
  const sel = /^#rotate-race, #rotate-controls, #rotate-exit$/;
  assert.equal(decl(rules, sel, "min-height"), "var(--tap)",
    "#rotate-* min-height must be --tap: --tap-min is the 24px floor, and this layer only ever shows on a phone");
  // The layer is coarse-pointer-only, so the rung that applies is the touch one.
  const gate = rulesFor(rules, /#rotate-device$/).find((r) => r.context.some((c) => /pointer: coarse/.test(c)));
  assert.ok(gate, "#rotate-device is shown by a (pointer: coarse) media query");
  const touch = rung(decl(css("css/tokens.css"), "body:not(.desktop)", "--tap"), "touch --tap");
  assert.ok(touch >= 44, `the touch --tap rung (${touch}px) clears Apple's 44pt`);
  const floor = rung(decl(css("css/tokens.css"), ":root", "--tap-min"), "--tap-min");
  assert.ok(floor < 44, `sanity: --tap-min (${floor}px) is the floor the blocker used to sit on`);
});

test("the dock's tap rungs clear 44px at both width tiers", () => {
  const docks = rulesFor(css("css/overlays.css"), "body:not(.desktop) .dock").filter((r) => r.decls.has("--tap"));
  assert.equal(docks.length, 2, "one base landscape dock rule and one <=700px tier");
  for (const r of docks) {
    const tap = rung(r.decls.get("--tap"), "dock --tap"), hold = rung(r.decls.get("--hold"), "dock --hold");
    assert.ok(tap >= 44, `${r.context.join(" ")} --tap ${tap}px >= 44`);
    assert.ok(hold >= tap, `held controls (${hold}px) are never smaller than tapped ones (${tap}px)`);
    // The 24px painted floor survives HUD SIZE below 100 % (2026-08 axis audit).
    assert.match(r.decls.get("--tap"), /calc\(24px \/ var\(--hud-scale\)\)/);
    assert.match(r.decls.get("--hold"), /calc\(24px \/ var\(--hud-scale\)\)/);
  }
  const ov = css("css/overlays.css");
  assert.equal(decl(ov, "body:not(.desktop) .dock .touchbtn", "width"), "var(--tap)");
  assert.equal(decl(ov, /^body:not\(\.desktop\) \.dock \.pedal,/, "width"), "var(--hold)");
  for (const id of ["#pausebtn", "#btn-cam", "#hud-restore"]) {
    assert.equal(decl(ov, id, "height"), "var(--tap)", `${id} rides the --tap ladder`);
  }
});

/* ── the dock at 390px tall ──────────────────────────────────────────────── */

test("the tallest dock column fits a 390px landscape phone at HUD SIZE 200 %, and fitHud's cap is wired as the net", () => {
  const ov = css("css/overlays.css");
  const tk = css("css/tokens.css");
  const dock = rulesFor(ov, "body:not(.desktop) .dock").find((r) => r.decls.has("--tap") && !r.context.some((c) => /max-width/.test(c)));
  const tap = rung(dock.decls.get("--tap"), "--tap"), hold = rung(dock.decls.get("--hold"), "--hold");
  // --gap on a landscape phone is the density switch's 8px, not :root's 12.
  const dense = rulesFor(tk, ":root", { context: /orientation: landscape\) and \(max-height: 560px/ })[0];
  assert.ok(dense, "tokens.css keeps the landscape/max-height density switch");
  const gap = px(dense.decls.get("--gap"), "dense --gap");
  // The dock's own spacing: gap * 2/3 between buttons, gap * 7/6 under held groups.
  assert.equal(decl(ov, "body:not(.desktop) .dock", "gap"), "calc(var(--gap) * 2 / 3)");
  const held = ruleFor(ov, /^body:not\(\.desktop\) #grp-pedals,/, "padding-bottom");
  assert.equal(held.decls.get("padding-bottom"), "calc(var(--gap) * 7 / 6)");
  const dockGap = gap * 2 / 3, heldPad = gap * 7 / 6;
  const taps = 3 * tap + 2 * dockGap;                 // BOOST / OT / AERO, a 3-high column, no pad
  const pedals = 2 * hold + dockGap + heldPad;        // BRAKE over GAS, padded up from the edge
  const tallest = Math.max(taps, pedals);
  // The bar sits 10px + the home-indicator inset (21px on a notched iPhone) up.
  const hudDock = ruleFor(ov, "#hud-dock", "bottom");
  assert.match(hudDock.decls.get("bottom"), /^calc\(10px \+ var\(--sab\)\)$/);
  const H = 390, SAB = 21;
  for (const scale of [1, 1.5, 2]) {
    const painted = tallest * scale;
    assert.ok(painted + 10 + SAB <= H,
      `HUD SIZE ${scale * 100}%: tallest column ${painted.toFixed(0)}px + ${10 + SAB}px stays inside ${H}px`);
  }
  // fitHud's cap: (innerHeight - 3 * FIT_AIR) / intrinsic height, written as --hud-z-dock.
  const hud = read("js/game/hud.js");
  const air = +(/const FIT_AIR = (\d+)/.exec(hud) || [])[1];
  assert.ok(air > 0, "hud.js declares FIT_AIR");
  assert.match(hud, /set\("--hud-z-dock", capDock\)/, "fitHud writes --hud-z-dock");
  assert.equal(dock.decls.get("zoom"), "var(--hud-z-dock, var(--hud-scale))", "the dock zooms by the capped value, slider as fallback");
  const cap = (H - 3 * air) / tallest;
  assert.ok(cap >= 2, `the cap (${cap.toFixed(2)}) only bites past 200 % on 390px — the raw slider fits every setting`);
  // NOT asserted, recorded: the corner clusters are outside that budget. At
  // 200 % the pedal column's top edge is at y = 390 - 31 - pedals*2 ≈ 23px,
  // level with #pausebtn (8..60) and #minimap (8..~124) — see the header.
});

/* ── zoom-compensated anchors ────────────────────────────────────────────── */

test("every anchor inside a --hud-z zoom divides its safe-area inset by --hud-z", () => {
  const hud = css("css/hud.css");
  const zoomed = hud.filter((r) => r.decls.get("zoom") === "var(--hud-z)");
  assert.ok(zoomed.length >= 2, "hud.css zooms the clusters by --hud-z");
  const tokens = zoomed.flatMap((r) => r.selector.split(",").map((s) => s.trim()));
  assert.ok(tokens.includes(".hud-bottom") && tokens.includes("#minimap"), "the zoom list names the bottom cluster and the map");
  const last = (sel) => sel.trim().split(/\s*[>+~]\s*|\s+/).pop();
  const offenders = [];
  for (const file of ["css/hud.css", "css/overlays.css", "css/responsive.css"]) {
    for (const r of css(file)) {
      const hits = r.selector.split(",").map(last).filter((c) => tokens.some((t) => c === t || c.startsWith(t + ":") || c.startsWith(t + "[")));
      if (!hits.length) continue;
      for (const prop of ["top", "right", "bottom", "left"]) {
        const v = r.decls.get(prop);
        if (!v || !/var\(--sa[tlrb]\)/.test(v)) continue;
        if (!/\/ var\(--hud-z\)/.test(v)) offenders.push(`${file} ${r.selector} { ${prop}: ${v} }`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a safe-area inset encodes hardware and must not grow with HUD SIZE");
});

/* ── touch policy across css/ ────────────────────────────────────────────── */

test("every :hover rule in css/ is gated on (hover: hover) — a tap sticks :hover on iOS", () => {
  const ungated = [];
  for (const file of CSS_FILES) {
    for (const r of css(file)) {
      if (!/:hover/.test(r.selector)) continue;
      if (!r.context.some((c) => /hover\s*:\s*hover/.test(c))) ungated.push(`${file} ${r.selector}`);
    }
  }
  assert.deepEqual(ungated, [], "wrap it in @media (hover: hover) and give touch an :active twin (css/tokens.css policy)");
});

test("every scroll container contains its overscroll (no chaining into the page behind)", () => {
  const missing = [];
  for (const file of CSS_FILES) {
    for (const r of css(file)) {
      const ov = ["overflow", "overflow-y", "overflow-x"].map((p) => r.decls.get(p)).filter(Boolean);
      if (!ov.some((v) => /auto|scroll/.test(v))) continue;
      if (![...r.decls.keys()].some((k) => k.startsWith("overscroll-behavior"))) missing.push(`${file} ${r.selector}`);
    }
  }
  assert.deepEqual(missing, [], "declare overscroll-behavior(-x/-y) beside the overflow that scrolls");
});

test("double-tap zoom is refused on every layer, and driving owns its gestures", () => {
  const html = read("index.html");
  const meta = /<meta name="viewport" content="([^"]+)">/.exec(html);
  assert.ok(meta, "index.html has a viewport meta");
  for (const part of ["maximum-scale=1", "user-scalable=no", "viewport-fit=cover"]) assert.ok(meta[1].includes(part), `viewport meta carries ${part}`);
  assert.match(html, /addEventListener\("gesturestart"/, "iOS pinch GestureEvents are cancelled");
  assert.match(html, /addEventListener\("touchend", function/, "the same-spot second tap is cancelled");
  const tk = css("css/tokens.css");
  assert.equal(decl(tk, "*", "touch-action"), "manipulation", "the reset drops double-tap-to-zoom everywhere");
  assert.equal(decl(tk, "html, body", "touch-action"), "manipulation");
  assert.equal(decl(tk, "html, body", "overscroll-behavior"), "none", "no root rubber-band");
  assert.equal(decl(tk, "#game", "touch-action"), "none", "the canvas owns every gesture while driving");
  assert.equal(decl(css("css/overlays.css"), ".touchbtn", "touch-action"), "none");
  assert.equal(decl(css("css/components.css"), ".pane", "touch-action"), "pan-y", "menus keep native pan");
});

test("in-race chrome and the blocker are anchored inside the safe area", () => {
  const ov = css("css/overlays.css");
  const bar = ruleFor(ov, "#hud-dock", "left", { context: /orientation: landscape/ });
  assert.ok(bar, "#hud-dock is positioned in landscape");
  assert.match(bar.decls.get("left"), /var\(--sal\)/); assert.match(bar.decls.get("right"), /var\(--sar\)/); assert.match(bar.decls.get("bottom"), /var\(--sab\)/);
  for (const id of ["#pausebtn", "#btn-cam", "#hud-restore"]) {
    assert.match(decl(ov, id, "top"), /var\(--sat\)/, `${id} top clears the notch`);
    assert.match(decl(ov, id, "right"), /var\(--sar\)/, `${id} right clears the notch`);
  }
  // The portrait ladder (RACE IN PORTRAIT) anchors on the same insets.
  assert.match(decl(ov, "#btn-throttle", "left"), /var\(--sal\)/); assert.match(decl(ov, "#btn-throttle", "bottom"), /var\(--sab\)/);
  assert.match(decl(ov, "#btn-boost", "right"), /var\(--sar\)/);
  const blocker = decl(css("css/responsive.css"), "#rotate-device", "padding");
  for (const t of ["--safe-t", "--safe-r", "--safe-b", "--safe-l"]) assert.ok(blocker.includes(`var(${t})`), `#rotate-device padding uses ${t}`);
  // The insets themselves are env() reads with a 0px fallback, declared once.
  const tk = css("css/tokens.css");
  for (const [t, side] of [["--sat", "top"], ["--sar", "right"], ["--sab", "bottom"], ["--sal", "left"]]) {
    assert.equal(decl(tk, ":root", t), `env(safe-area-inset-${side}, 0px)`);
  }
});

/* ── the tilt prompt and the input.js fixes it must keep ─────────────────── */

const src = (p) => read(p).replace(/^const\b/gm, "var");
function bootInput({ DeviceOrientationEvent, pads }) {
  const listeners = new Map();
  const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); };
  const off = (type, fn) => { const l = listeners.get(type); if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, Error, parseFloat, parseInt, isFinite,
    performance: { now: () => 0 },
    document: {
      addEventListener() {}, removeEventListener() {}, getElementById: () => null, activeElement: null, readyState: "complete",
      body: { classList: { contains: () => false }, appendChild() {} }, createElement: () => ({ style: {} }),
    },
    navigator: { getGamepads: () => pads(), maxTouchPoints: 5, userAgent: "node" },
    addEventListener: on, removeEventListener: off,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0,
    screen: { orientation: { type: "landscape-primary", angle: 0, addEventListener() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "" },
  };
  if (DeviceOrientationEvent) sb.DeviceOrientationEvent = DeviceOrientationEvent;
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/log.js", "js/mat4.js", "js/game/input.js"]) vm.runInContext(src(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  Input.init({ addEventListener() {} }, {});
  const count = (type) => (listeners.get(type) || []).length;
  const fire = (type, e) => { for (const fn of [...(listeners.get(type) || [])]) fn(e); };
  return { Input, count, fire };
}

test("requestGyro: a grant clears an earlier refusal, and leaving tilt detaches the sensor", async () => {
  let answer = () => Promise.reject(new Error("NotAllowedError: requires a user gesture"));
  const h = bootInput({ DeviceOrientationEvent: { requestPermission: () => answer() }, pads: () => [] });
  h.Input.setSteerMode("tilt");
  // A request outside a user gesture (a synthesised gamepad .click()) rejects.
  assert.equal(await h.Input.requestGyro(), false);
  assert.equal(h.Input.gyroDenied, true, "a rejection is recorded so game.js can fall back to BUTTONS");
  assert.equal(h.count("deviceorientation"), 0, "nothing attached on refusal");
  // The next request comes from a real tap on STEER and is granted.
  answer = () => Promise.resolve("granted");
  assert.equal(await h.Input.requestGyro(), true);
  assert.equal(h.Input.gyroDenied, false, "the grant must clear the stale refusal, or STEER keeps reading (NO GYRO)");
  assert.equal(h.count("deviceorientation"), 1, "the sensor is attached once");
  assert.equal(await h.Input.requestGyro(), true);
  assert.equal(h.count("deviceorientation"), 1, "attach is idempotent");
  // 2026-09-01 gyro-detach fix: leaving tilt stops the sensor stream.
  h.Input.setSteerMode("buttons");
  assert.equal(h.count("deviceorientation"), 0, "buttons mode detaches the deviceorientation listener");
  assert.equal(h.Input.gyroSeen, false, "and forgets the last reading");
  h.Input.setSteerMode("tilt");
  assert.equal(h.count("deviceorientation"), 0, "re-entering tilt does not attach by itself — the prompt is game.js's gesture-bound job");
  assert.equal(await h.Input.requestGyro(), true);
  assert.equal(h.count("deviceorientation"), 1, "…and the next prompt re-attaches");
});

test("requestGyro: an explicit iOS \"denied\" is a refusal with nothing attached", async () => {
  const h = bootInput({ DeviceOrientationEvent: { requestPermission: () => Promise.resolve("denied") }, pads: () => [] });
  h.Input.setSteerMode("tilt");
  assert.equal(await h.Input.requestGyro(), false);
  assert.equal(h.Input.gyroDenied, true);
  assert.equal(h.count("deviceorientation"), 0);
});

test("requestGyro without the iOS permission API attaches straight away; without the sensor it refuses", async () => {
  const h = bootInput({ DeviceOrientationEvent: {}, pads: () => [] });
  h.Input.setSteerMode("tilt");
  assert.equal(await h.Input.requestGyro(), true);
  assert.equal(h.Input.gyroDenied, false);
  assert.equal(h.count("deviceorientation"), 1);
  const none = bootInput({ pads: () => [] });
  assert.equal(await none.Input.requestGyro(), false);
  assert.equal(none.Input.gyroDenied, true, "no DeviceOrientationEvent at all is a refusal");
});

test("gamepaddisconnected re-reads the live list: a second pad keeps the pad path connected", () => {
  const padA = { index: 0, connected: true, id: "A", axes: [0, 0, 0, 0], buttons: [] };
  const padB = { index: 1, connected: true, id: "B", axes: [0, 0, 0, 0], buttons: [] };
  let live = [padA, padB];
  const h = bootInput({ DeviceOrientationEvent: {}, pads: () => live });
  h.fire("gamepadconnected", { gamepad: padA });
  assert.equal(h.Input.padConnected, true);
  live = [null, padB];
  h.fire("gamepaddisconnected", { gamepad: padA });
  assert.equal(h.Input.padConnected, true, "pad B is still there — the 2026-09-01 disconnect fix");
  live = [];
  h.fire("gamepaddisconnected", { gamepad: padB });
  assert.equal(h.Input.padConnected, false, "the last pad leaving disconnects");
});
