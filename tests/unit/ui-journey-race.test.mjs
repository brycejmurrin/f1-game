/* ui-journey-race.test.mjs — Step 5 race-layer CSS contract.
 *
 * HUD scaling stays --hud-scale / --hud-z, never --ui-scale. Pause owns paused
 * navigation (#campicker closes with the dim sheet). Photo-mode restore is
 * #pc-restore. Compact HUD keys on body[data-density], not orientation+max-height.
 *
 * Run: node --test tests/unit/ui-journey-race.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

function stripComments(src) {
  let out = "", i = 0;
  for (;;) {
    const open = src.indexOf("/*", i);
    if (open < 0) { out += src.slice(i); break; }
    out += src.slice(i, open);
    const close = src.indexOf("*/", open + 2);
    if (close < 0) break;
    out += "\n".repeat((src.slice(open, close).match(/\n/g) || []).length);
    i = close + 2;
  }
  return out;
}

/** Rule bodies whose prelude mentions `needle` (comment-stripped). */
function rulesMentioning(css, needle) {
  const stripped = stripComments(css);
  const out = [];
  let prev = 0;
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "{") {
      const prelude = stripped.slice(prev, i).trim();
      const end = stripped.indexOf("}", i);
      if (end < 0) break;
      if (prelude.includes(needle)) out.push({ prelude, body: stripped.slice(i + 1, end) });
      prev = end + 1;
      i = end;
    } else if (c === "}") prev = i + 1;
  }
  return out;
}

function zoomsFor(css, needle) {
  const zooms = [];
  for (const r of rulesMentioning(css, needle)) {
    for (const m of r.body.matchAll(/zoom:\s*([^;]+)/g)) zooms.push(m[1].trim());
  }
  return zooms;
}

test("HUD clusters zoom with --hud-z, never --ui-scale on #lights / .hud-bottom", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /#lights, #announce \{ --hud-z: var\(--hud-z-top, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/);
  assert.match(hud, /\.hud-bottom \{ --hud-z: var\(--hud-z-bot, var\(--hud-scale\)\); zoom: var\(--hud-z\); \}/);
  for (const sel of ["#lights", ".hud-bottom"]) {
    const zooms = zoomsFor(hud, sel);
    assert.ok(zooms.includes("var(--hud-z)"), `${sel} must declare zoom: var(--hud-z)`);
    assert.ok(!zooms.includes("var(--ui-scale)"), `${sel} must not use zoom: var(--ui-scale)`);
  }
});

test("free-cam pads match the steering-arrow diameter", () => {
  const hud = read("css/hud.css");
  const overlays = read("css/overlays.css");
  assert.match(overlays, /--steer:\s*84px/);
  assert.match(hud, /\.pc-btn\s*\{[^}]*width:\s*var\(--steer\)/);
  assert.match(hud, /\.pc-stick\s*\{[^}]*width:\s*118px/);
  assert.doesNotMatch(hud, /body\.lt-open:not\(\.pc-nopanel\) \.pc-stick \{ width: 84px/);
  assert.doesNotMatch(hud, /body\.lt-open:not\(\.pc-nopanel\) \.pc-btn \{ width: 46px/);
});

test("photo-mode restore eye is #pc-restore when controls are hidden", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /#pc-restore\s*\{/);
  assert.match(hud, /body\.pc-uihidden #photo-controls > :not\(#pc-restore\)/);
  assert.match(hud, /body\.pc-uihidden #pc-restore \{\s*display:\s*block/);
});

test("compact race HUD uses body density, not orientation + max-height queries", () => {
  const hud = read("css/hud.css");
  const overlays = read("css/overlays.css");
  const responsive = read("css/responsive.css");
  const added = hud + "\n" + overlays;
  assert.doesNotMatch(added, /orientation:\s*landscape\)\s*and\s*\(max-height:/,
    "race-layer hunks must not add orientation + max-height layout queries");
  assert.doesNotMatch(stripComments(responsive),
    /orientation:\s*landscape\)\s*and\s*\(max-height:\s*560px\)/,
    "short-landscape HUD shrink moved to body[data-density] in hud.css");
  assert.match(hud, /body\[data-density="compact"\] #minimap/);
  assert.match(hud, /body\[data-density="compact"\] \.hud-gaps \{[^}]*var\(--sal\) \/ var\(--hud-z\)/);
  assert.match(hud, /body\[data-density="compact"\] #hud-sectors/);
  assert.match(overlays, /body\[data-density="compact"\] #campicker/);
});

test("pause owns paused navigation: #campicker stands down with the dim sheet", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /body:has\(\.screen\.dim:not\(\[hidden\]\)\) #campicker \{\s*display:\s*none/);
});

test("sector box still clears unscaled #pausebtn via --tap / --hud-z", () => {
  const hud = read("css/hud.css");
  assert.match(hud,
    /#hud-sectors \{[\s\S]*?top:\s*calc\(\(8px \+ var\(--tap\) \+ 4px \+ var\(--sat\)\) \/ var\(--hud-z\)\)/);
});

/* THE TOUCH-CONTROL TRANSPARENCY LADDER, and the specificity trap under it.
 *
 * Reported from a live race, both in one message: the five action buttons did
 * not agree on transparency (pedals 0.42, OT/AERO 0.82, BOOST 0.9), and BRAKE
 * lit up under the thumb while GAS did not. The second one was not a missing
 * rule — `#btn-throttle:active` has always been there. `body.steer-buttons
 * #btn-throttle` is (1,1,1) and `#btn-throttle:active` is (1,1,0), so an idle
 * fill restated in the buttons-mode block won in EVERY state and the pressed
 * colour was unreachable. It shipped because BRAKE carried no such restatement,
 * so exactly one of the two pedals was broken and only in one steering mode. */
test("no layout-mode rule restates a pedal fill over its pressed colour", () => {
  const css = stripComments(read("css/overlays.css"));
  for (const id of ["btn-throttle", "btn-brake"]) {
    assert.match(css, new RegExp(`#${id}:active \\{[^}]*background:`),
      `#${id} must have a pressed fill at all`);
    for (const m of css.matchAll(new RegExp(`body\\.[a-z-]+ #${id}\\s*\\{([^}]*)\\}`, "g"))) {
      assert.doesNotMatch(m[1], /background/,
        `a body-class rule for #${id} sets a background; it outranks #${id}:active ` +
        "(1,1,1 vs 1,1,0) and silently deletes the pressed state. Position only here.");
    }
  }
});

test("the five action buttons share one transparency and the arrows keep theirs", () => {
  const css = stripComments(read("css/overlays.css"));
  assert.match(css, /--btn-a:\s*0?\.\d+/, "the shared idle transparency is one named number");
  const shared = css.match(/:where\(([^)]*)\)\s*\{\s*opacity:\s*var\(--btn-a\)/);
  assert.ok(shared, "one :where() rule carries the shared idle opacity — :where() so " +
    "every state rule below outranks it without restating an id");
  const ids = shared[1].split(",").map((s) => s.trim()).sort();
  assert.deepEqual(ids,
    ["#btn-aero", "#btn-boost", "#btn-brake", "#btn-ot", "#btn-throttle"],
    "exactly the five action buttons — the steering arrows are held for a whole " +
    "lap over the road, not glanced at over the cockpit, and stay as they are");
  assert.doesNotMatch(css, /\.steerbtn[^{]*\{[^}]*opacity/,
    ".steerbtn must not join the ladder");
  // The rungs that mean "this is live NOW" are the fully opaque ones — the
  // behaviour the reporter singled out as correct on OT, generalised.
  for (const sel of ["#btn-boost.on", "#btn-ot.armed", "#btn-ot.on",
    "#btn-aero.armed", "#btn-aero.on", "#btn-throttle:active", "#btn-brake:active"]) {
    const rule = css.match(new RegExp(`${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(rule && /opacity:\s*1\b/.test(rule[1]),
      `${sel} is a live state and must restore full opacity over --btn-a`);
  }
  assert.match(css, /\.touchbtn\.dead \{\s*opacity:\s*0\.3/,
    "dead stays the bottom rung, below idle");
});
