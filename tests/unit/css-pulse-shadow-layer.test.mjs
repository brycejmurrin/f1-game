/* css-pulse-shadow-layer — a rule that pairs a box-shadow with an `infinite`
   animation also declares will-change (perf hunt P5, #4586). #btn-ot.armed
   (css/touch-controls.css) pulsed opacity over a 20 px glow with no layer of its
   own, so the button and its shadow repainted every frame while OVERTAKE was
   armed; `will-change: opacity` promotes it and the compositor fades it instead.
   The scan is per declaration block (innermost braces), comments stripped. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILES = ["css/touch-controls.css", "css/hud.css"];

/** Every innermost `selector { declarations }` block of a stylesheet. */
function blocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  for (const m of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const decl = (body, prop) => {
  const m = body.match(new RegExp("(?:^|[;\\s])" + prop + "\\s*:\\s*([^;]*)", "i"));
  return m ? m[1].trim() : null;
};

test("a box-shadow pulsing on an infinite animation declares will-change", () => {
  const bad = [];
  let seen = 0;
  for (const f of FILES) {
    for (const { sel, body } of blocks(fs.readFileSync(path.join(ROOT, f), "utf8"))) {
      const shadow = decl(body, "box-shadow"), anim = decl(body, "animation");
      if (!shadow || /^none\b/i.test(shadow) || !anim || !/\binfinite\b/.test(anim)) continue;
      seen++;
      if (!decl(body, "will-change")) bad.push(f + " " + sel);
    }
  }
  assert.ok(seen > 0, "precondition: #btn-ot.armed pairs a box-shadow with an infinite pulse");
  assert.deepEqual(bad, [], "add will-change (the animated property) to: " + bad.join(", "));
});

test("#btn-ot.armed promotes the property its pulse animates (opacity)", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/touch-controls.css"), "utf8");
  const rule = blocks(css).find((b) => b.sel === "#btn-ot.armed");
  assert.ok(rule, "#btn-ot.armed rule present");
  assert.match(decl(rule.body, "will-change") || "", /\bopacity\b/);
});
