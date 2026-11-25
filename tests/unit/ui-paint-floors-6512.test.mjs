/* The #6434 follow-up (#6512): elements still under the 12 px text / 44 px tap floors at Bryce's UI SIZE 70
   (tests/data/settings-live-export-2026-11-10.json, 852x393) after PR #6468. Each fix is a max() arm, so every size at
   UI SIZE 75-80 % and up, and every mouse layout, is what it was. Measured with layout-audit `paint:` lines (PR body). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, declares } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rules = (f) => cssRules(fs.readFileSync(path.join(ROOT, f), "utf8"));
const has = (f, sel, prop, value, why) => assert.ok(declares(rules(f), sel, prop, value), `${f} ${sel} { ${prop} } — ${why}`);

test("text floors at UI SIZE 70 (#6512)", () => {
  has("css/tuner.css", ".editor-workspace :is(.ew-toolbar, .ew-tools > summary)", "font-size", "max(1em, var(--fs-floor))",
    "tuner title, Preview and tools summary 11.2 px");
  has("css/race-setup.css", "#cz-pvtext", "font-size", "max(1em, var(--fs-floor))", "Car Studio preview text 11.2 px");
  has("css/garage-experience.css", ".cs-inspection > strong", "font-size", "max(1em, var(--fs-floor))", "garage part name 11.2 px");
  // Text match, not the rule parser: the 15 px rung sits in a block css-rules.mjs does not descend into.
  const lr = [...fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8").matchAll(/\.dh-lr-name \{ font-size: ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(lr, ["max(16px, var(--fs-floor))", "max(15px, var(--fs-floor))"],
    "both rungs of the Data Hub race-name ladder keep their literal and gain the floor (10.5 px)");
});

test("tap floor: the Data Hub source links (#6512)", () => {
  const sel = ".dh-footnote + [data-feed] a:first-of-type";
  has("css/data.css", sel, "padding-inline-start", "calc(var(--tap-floor44) * 0.12)", "OpenF1 39.7 px wide at UI SIZE 70");
  has("css/data.css", sel, "margin-inline-start", "calc(var(--tap-floor44) * -0.12)",
    "an equal negative margin, so the text does not move");
  const r = cssRules(fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8"))
    .filter((x) => /\[data-feed\] a/.test(x.selector) && /tap-floor44/.test([...x.decls.values()].join(" ")));
  assert.ok(r.every((x) => ![...x.decls.keys()].some((k) => /^(padding|margin)-inline(-end)?$/.test(k))),
    "no END-side pad: the gap to the licence link is a ~4 own px \", \"; an end pad overlaps it and the later link wins the tap");
});
