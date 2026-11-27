/* Gardener css dedupes (#7051, plan #6548 items 1, 8, 4) stay folded.
   - Item 8: a 120ms duration is the --dur-1 token, never a literal, outside tokens.css (which defines it);
     the `var(--dur-1, 120ms)` fallback form is the one allowed spelling.
   - Item 4: the six Data Hub "selected chip" rules are ONE :is() rule, placed before .dh-onboard.dh-tplaying
     so the onboard PLAY button's blue still wins at the same (0,2,0) specificity.
   - Item 1: the #game-metrics panel block lives in fonts-hud.css, not hud.css. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("no 0.12s / 120ms duration literal outside tokens.css (use var(--dur-1))", () => {
  const hits = [];
  for (const f of fs.readdirSync(path.join(ROOT, "css")).filter((n) => n.endsWith(".css") && n !== "tokens.css")) {
    strip(read("css/" + f)).replace(/var\(--dur-1,\s*120ms\)/g, "").split("\n").forEach((l, i) => {
      if (/(?<![\d.])(?:0?\.12s|120ms)\b/.test(l)) hits.push(`css/${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "spell these var(--dur-1)");
  assert.match(read("css/tokens.css"), /--dur-1:\s*120ms;/, "the token they read");
});

test("the six Data Hub selected-chip rules are one :is() rule, before the onboard PLAY blue", () => {
  const css = strip(read("css/data.css"));
  const chips = [".dh-dchip.active", ".dh-tplay.dh-tplaying", ".dh-ratebtn.active", ".dh-livebtn.active", ".dh-sortbtn.active", ".dh-pill.active"];
  const body = "{ background: var(--plate-on); border-color: var(--red); color: var(--text); }";
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: "{" + m[2] + "}", at: m.index }));
  const shared = rules.filter((r) => r.body.replace(/\s+/g, " ") === body);
  assert.equal(shared.length, 1, "one rule carries the selected-chip paint");
  const list = /^:is\((.*)\)$/.exec(shared[0].sel);
  assert.ok(list, "it is an :is() list: " + shared[0].sel);
  assert.deepEqual(list[1].split(",").map((s) => s.trim()).sort(), [...chips].sort());
  for (const c of chips) assert.equal(rules.filter((r) => r.sel === c).length, 0, `${c} has no standalone rule left`);
  const onboard = rules.find((r) => r.sel === ".dh-onboard.dh-tplaying");
  assert.ok(onboard && shared[0].at < onboard.at, "the join sits before .dh-onboard.dh-tplaying, so the blue still wins");
});

test("the #game-metrics panel block lives in fonts-hud.css", () => {
  assert.match(strip(read("css/fonts-hud.css")), /^#game-metrics \{/m);
  assert.doesNotMatch(strip(read("css/hud.css")), /^#game-metrics(?:-bar|-body)?(?:\[[^\]]*\])? \{/m,
    "hud.css keeps only the hide rules that out-rank the panel");
});
