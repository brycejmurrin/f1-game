/* hud-status-stack — phoneL broadcast @150%: announce / flag / LIMITS / TYRES /
   REL must stack instead of overlapping (HUD Desk queue item 1, 2026-10-14).
   Pins the CSS vars + strat-under-rel reflow, and locks the survey clash shapes
   that the before report measured on 844×390 (22 overlaps, all-on). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeOverlap, overlapArea } from "../../tools/lib/hud-geometry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
const HUD_JS = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");

const box = (key, role, x, y, w, h, round = false) => ({
  key, role, visible: true, exists: true,
  x, y, r: x + w, b: y + h, w, h,
  round, cx: x + w / 2, cy: y + h / 2, rr: w / 2, contains: [],
});

test("fitHud publishes gaps-bottom and tyre-stack for the left/centre columns", () => {
  assert.match(HUD_JS, /--hud-gaps-b/,
    "fitHud publishes --hud-gaps-b so the flag clears the broadcast gaps strip");
  assert.match(HUD_JS, /--hud-tyre-top/,
    "fitHud publishes --hud-tyre-top when dock-top TYRES would cover the map");
  assert.match(HUD_JS, /hud-tyre-stack|tyreStack|data-tyre-stack/,
    "a body marker opts the tyre into the left-column stack (keeps dock anchor otherwise)");
  assert.match(HUD_JS, /--hud-cluster-y/,
    "fitHud publishes the bottom-cluster top so the radio card can height-cap above it");
  assert.match(HUD_JS, /colBot/,
    "tyre stack anchors from the map/gaps edge (colBot), not a leftBot that already includes TYRES");
  assert.match(HUD_JS, /--hud-tyre-max-h/,
    "fitHud caps stacked TYRES above the left dock when the map→pedal gap is short");
  assert.match(HUD_JS, /hud-gearbox/,
    "radioPaintedCollapse clears announce when it still paints over the gearbox");
  assert.match(HUD_JS, /announceLaneTick[\s\S]{0,200}?radioPaintedCollapse/,
    "painted collapse re-runs after announceLaneTick so a lane re-pick cannot undo SPEED/GEAR clearance");
});

test("CSS: flag and announce clear the gaps strip; tyre stack; strat under REL", () => {
  assert.match(CSS, /--hud-gaps-b/,
    "flag/announce rules consume --hud-gaps-b");
  // Compact density overrides #hud-flag top — must still max() gaps-b (72×1.5=108
  // sat inside the gaps strip on phoneL broadcast @150%).
  assert.match(CSS,
    /body\[data-density="compact"\] #hud-flag\s*\{[^}]*--hud-gaps-b/,
    "compact #hud-flag clears --hud-gaps-b (not only the 72px floor)");
  assert.match(CSS, /body\.hud-tyre-stack[^{]*#hud-tyre:not\(\[data-hl-user\]\)/,
    "hud-tyre-stack parks TYRES under the left column without fighting MOVE & SIZE");
  assert.match(CSS, /--hud-tyre-top/,
    "tyre stack reads --hud-tyre-top");
  assert.match(CSS, /--flag-slot-top, 5\.5em\) - 40px/,
    "announce max-height budgets the caution step (flag-slot + 40), not a bare 5.5em");
  // STRATEGY used to sidestep by a literal 168px and sat on REL at HUD 150%.
  assert.match(CSS,
    /body:not\(\.desktop\):has\(#hud-rel:not\(\[hidden\]\)\) #hud-strat:not\(\[data-hl-user\]\)[\s\S]{0,200}?--rc-rel-h/,
    "with REL on, STRATEGY stacks under it via --rc-rel-h (not a 168px sidestep)");
  assert.doesNotMatch(CSS,
    /body:not\(\.desktop\):has\(#hud-rel:not\(\[hidden\]\)\) #hud-strat:not\(\[data-hl-user\]\)\s*\{\s*left:\s*calc\(168px/,
    "the 168px STRATEGY sidestep is gone — it overlapped REL at phoneL 150%");
  assert.match(CSS, /--hud-cluster-y/,
    "announce height-caps against --hud-cluster-y");
  assert.match(CSS,
    /:root:not\(\[data-limits-left\]\) \.hud-prof-broadcast\[data-density="compact"\]:has\(#hud-flag:not\(\[hidden\]\)\) #hud-limits:not\(\[data-hl-user\]\)/,
    "broadcast compact LIMITS stacks under the centred flag when the chip is still on the right (CI 96c3536 flag+limits)");
  assert.match(CSS,
    /max\(72px \+ var\(--sat\) \/ var\(--hud-z\), var\(--hud-gaps-b, 0px\) \+ 8px, var\(--mir-bot, 0px\) \+ 8px\) \+ 40px/,
    "LIMITS hangs from the same compact flag slot #1501 uses, plus a 40px chip+air budget");
});

test("analyzeOverlap: phoneL broadcast 150% before-shapes are the failure mode", () => {
  // Rects from artifacts/hud-survey/before phoneL-bcast-150-all (ship tip).
  const W = 844, H = 390, ins = { sal: 47, sar: 47, sat: 0, sab: 21 };
  const map = box("map", "hud", 62, 98.3, 165, 165);
  const tyre = box("tyre", "hud", 59, 208.6, 180.4, 63.6);
  const gaps = box("gaps", "hud", 239, 98.3, 127.4, 32.4);
  const flag = box("flag", "hud", 309.7, 108, 224.7, 40.4);
  const limits = box("limits", "hud", 491.1, 197.7, 134.8, 31.2);
  const announce = box("announce", "hud", 374.4, 159, 176.1, 151.9);
  const rel = box("rel", "hud", 205.9, 275.3, 201.7, 81.6);
  const strat = box("strat", "hud", 299, 275.3, 136.9, 100.5);
  const ot = box("btn-ot", "ctrl", 249.5, 315.1, 146.3, 43.9, true);

  const before = analyzeOverlap(
    [map, tyre, gaps, flag, limits, announce, rel, strat, ot], W, H, ins);
  assert.ok(overlapArea(map, tyre) > 5000, "map×tyre was material before the stack");
  assert.ok(overlapArea(gaps, flag) > 500, "gaps×flag was material before gaps-b");
  assert.ok(overlapArea(limits, announce) > 1000, "limits×announce was material");
  assert.ok(overlapArea(rel, strat) > 5000, "rel×strat was material before vertical stack");
  assert.ok(before.hudClash.some((p) => p.includes("rel") && p.includes("btn-ot"))
    || overlapArea(rel, ot) > 1000, "rel×OT was material");

  // After: tyre under map, flag under gaps, announce shortened/narrowed,
  // strat under rel, rel capped above OT.
  const tyre2 = box("tyre", "hud", 59, 271, 180, 50);
  const flag2 = box("flag", "hud", 310, 139, 225, 40);
  const announce2 = box("announce", "hud", 320, 187, 140, 70);
  const rel2 = box("rel", "hud", 59, 329, 180, 40);
  const strat2 = box("strat", "hud", 59, 372, 120, 16);
  const after = analyzeOverlap(
    [map, tyre2, gaps, flag2, limits, announce2, rel2, strat2, ot], W, H, ins);
  const goal = after.hudClash.filter((p) =>
    /announce|flag|limits|tyre|rel|strat/.test(p));
  assert.equal(goal.length, 0, "stacked geometry clears goal clashes: " + goal.join(","));
  assert.ok(overlapArea(map, tyre2) < 1, "tyre clears map after stack");
  assert.ok(overlapArea(gaps, flag2) < 1, "flag clears gaps after stack");
  assert.ok(overlapArea(rel2, strat2) < 1, "strat clears rel after stack");
});
