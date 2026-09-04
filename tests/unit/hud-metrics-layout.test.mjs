import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

test("HUD metrics layout AUTO keeps every cluster and lets fitHud adapt", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(game, /HUD_MET_LAYOUTS\s*=\s*\["auto", "full", "timing", "driver", "compact"\]/);
  assert.match(game, /HUD_VIS_MODES\s*=\s*\["auto", "on", "off"\]/);
  assert.match(game, /store\.get\("hudMapVis", "on"\)/);
  assert.match(game, /store\.get\("hudGapsVis", "on"\)/);
  assert.match(game, /hud-met-\(\[a-z\]\+\)/);
  assert.match(game, /hudMapVisLabel/);
  assert.match(game, /return "LAYOUT: " \+ hudMetricsLayout\.toUpperCase\(\)/);
  assert.match(game, /LAYOUT: AUTO/);
  assert.match(hud, /function resolveMetricsLayout\(\)/);
  assert.match(hud, /return "full";/);
  assert.equal(hud.includes("bandCapped"), false);
  assert.match(hud, /function syncHudVisClasses\(/);
  const camSync = hud.slice(hud.indexOf("function syncHudCamClasses"), hud.indexOf("function flashSector"));
  assert.match(camSync, /syncHudVisClasses\(modeId\)/);
  assert.doesNotMatch(camSync, /if \(key === _hudCamKey\) return;/);
  assert.match(hud, /hud-hide-map/);
});

// A FORCED LAYOUT NAME HIDES; AUTO NEVER DOES, AND NOTHING TOUCHES MAP/GAPS.
// This assertion used to read "LAYOUT modes do not hide clusters" full stop —
// pinned while the hide rules were pulled out of AUTO, which had let a layout
// overrule the player's own MAP toggle. It pinned too much: with no rule behind
// ANY of the three forced names the control changed a body class and nothing
// else, and it was reported twice as doing nothing. resolveMetricsLayout()
// emits hud-met-timing / -driver / -compact ONLY for a name the player picked,
// so a rule keyed on one of them cannot fire from AUTO — which is what makes
// the hiding safe here and unsafe there.
test("a forced LAYOUT name hides; AUTO and MAP/GAPS are untouched", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-hide-gaps \.hud-gaps/);
  assert.match(css, /body\.hud-map-low #minimap/);
  // The three forced names each drop something.
  assert.match(css, /body\.hud-met-timing #hud-energy/);
  assert.match(css, /body\.hud-met-driver #hud-sectors/);
  assert.match(css, /body\.hud-met-compact #hud-sectors/);
  assert.match(css, /body\.hud-met-compact #hud-energy/);
  // AUTO resolves to `full`, and `full` is the base state: no rule may key on it.
  assert.equal(/body\.hud-met-full\b/.test(css), false);
  // And no layout may reach the two clusters that have their own controls.
  for (const sel of ["#minimap", ".hud-gaps"])
    for (const name of ["timing", "driver", "compact"])
      assert.equal(css.includes("body.hud-met-" + name + " " + sel), false,
        `LAYOUT ${name} must not touch ${sel} — MAP and GAPS are the player's`);
});

// MINIMAL MEANS FEWER WIDGETS, NOT SMALLER ONES. The profile used to hide the
// sector box and stop, while a fit-maths defect (a hidden #hud-sectors made
// fitHud read the right safe-area inset as the whole viewport) floored every
// cluster to the 0.4 zoom guard — reported as "the simple HUD just makes things
// tiny". Both halves are pinned: the profile drops real widgets, and fitHud
// never derives an inset from an element that has no box.
test("MINIMAL drops widgets, and a hidden anchor cannot poison the fit", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  for (const sel of ["#hud-sectors", ".hud-box:nth-child(4)", "#hud-energy", "#hud-ot", "#hud-aero"])
    assert.match(css, new RegExp("body\\.hud-prof-minimal " + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // The inset reads are guarded on the rect having a WIDTH, and each falls back
  // to the other side rather than to a viewport-wide number.
  assert.match(hud, /mmR && mmR\.width \? Math\.max\(0, mmR\.left - 10 \* mz\) : null/);
  assert.match(hud, /scR && scR\.width \? Math\.max\(0, window\.innerWidth - scR\.right - 10 \* sz\) : null/);
  assert.match(hud, /const sal = salM != null \? salM : \(sarM != null \? sarM : 0\);/);
  assert.match(hud, /const sar = sarM != null \? sarM : \(salM != null \? salM : 0\);/);
});

// THE TWO MEASURED OFFSETS THE HUD CHROME HANGS OFF. Both replaced a literal
// that was only ever right for one layout: the dropped gap strip parked 62px
// down whatever the band's real height, and the track-limits chip hung 4.8em
// below a sector box that three configurations hide outright.
test("dropped gaps and the limits chip ride measured offsets", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(css, /:root\[data-gap-drop\] \.hud-gaps \{\s*\n\s*top: calc\(8px \+ var\(--sat\) \/ var\(--hud-z\) \+ var\(--hud-top-h, 54px\) \+ 4px\);/);
  assert.match(css, /var\(--hud-sec-h, 4\.8em\)/);
  assert.match(hud, /setProperty\("--hud-top-h"/);
  assert.match(hud, /setProperty\("--hud-sec-h"/);
  // The dock stand-off is CONDITIONAL: an unconditional one dragged a top-right
  // chip into the middle of the screen on every viewport tall enough for the
  // two never to meet.
  assert.match(hud, /limBot > dockR\.top/);
  // And when the right column really is full the chip crosses to the LEFT one
  // rather than walking into the middle — the stand-off is the last resort, not
  // the first answer, so the two are mutually exclusive.
  assert.match(css, /:root\[data-limits-left\] #hud-limits/);
  assert.match(css, /top: calc\(var\(--hud-left-h, 112px\) \+ 8px\)/);
  assert.match(hud, /setProperty\("--hud-left-h"/);
  assert.match(hud, /const limLeft = hitsRight && leftRoom;/);
  assert.match(hud, /hitsRight && !limLeft \? dockR\.width \/ chromeZ : 0/);
});

test("HUD layout options live in a full-width pause submenu", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/components.css"), "utf8");
  assert.match(html, /id="pm-hud-details"/);
  assert.match(html, /id="pm-hud-details"[\s\S]*id="pm-hidehud"/);
  assert.match(html, /id="pm-hud-details"[\s\S]*id="pm-hudscale"/);
  assert.match(html, /HUD: ON/);
  assert.match(html, /STYLE: STANDARD/);
  assert.match(html, /LAYOUT: AUTO/);
  assert.match(css, /#pm-hud-details \[role="group"\]/);
  assert.match(css, /grid-area:\s*hudopts/);
});
