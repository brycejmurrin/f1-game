/* ui-journey-career.test.mjs — source canaries for leftover Career overlays.
 *
 * Step 4 of docs/research/UI-REDESIGN-2026-08-18.md: #career-offers,
 * #career-history, #career-guide and #quali wrap an anonymous .sheet, so
 * --fit-at is declared on the dialog and inherited. Compact packs rows and
 * wraps names; guide/history contents is a rail only on data-shape=wide.
 *
 * Run: node --test tests/unit/ui-journey-career.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const OVERLAYS = ["#career-offers", "#career-history", "#career-guide", "#quali"];

test("career overlay dialogs declare --fit-at for the anonymous .sheet", () => {
  const css = read("css/career.css");
  for (const id of OVERLAYS) {
    assert.match(css, new RegExp(id + "[^{]*\\{[^}]*--fit-at:\\s*300px"),
      `${id} must declare --fit-at: 300px so classifyFit can read it on .sheet`);
    assert.match(css, new RegExp(id + "[^{]*\\{[^}]*--fit-at:\\s*220px"),
      `${id} must drop to 220px in landscape, matching Settings`);
  }
  assert.match(css, /@media \(orientation:\s*landscape\)/);
  assert.match(css, /#cr-inner \{[^}]*--fit-at:\s*300px/,
    "hub --fit-at must stay on #cr-inner");
});

test("career.css does not reintroduce short-viewport height layout queries", () => {
  const css = read("css/career.css");
  assert.doesNotMatch(css, /max-height:\s*55svh/);
  assert.doesNotMatch(css, /orientation:\s*landscape\)\s*and\s*\(max-height/);
  assert.doesNotMatch(css, /orientation:\s*portrait\)\s*and\s*\(max-height/);
});

test("guide and history contents rail keys on wide sheet shape, strip when compact", () => {
  const css = read("css/career.css");
  const js = read("js/game/career-ui.js");
  const html = read("index.html");
  assert.match(js, /mountContentsNav\("cg-body", "cg-contents", "Career guide sections"\)/);
  assert.match(js, /mountContentsNav\("ch-body", "ch-contents", "Career history sections"\)/);
  assert.match(js, /setAttribute\("aria-label", label\)/);
  assert.match(js, /"cg-" \+ slug\(title\)/);
  assert.match(js, /head\("CAREER TOTALS", "ch-totals"\)/);
  assert.match(js, /head\("SEASON BY SEASON", "ch-seasons"\)/);
  assert.match(css, /#career-guide \.sheet\[data-shape="wide"\]:not\(\[data-density="compact"\]\):has\(> #cg-contents\)/);
  assert.match(css, /#career-history \.sheet\[data-shape="wide"\]:not\(\[data-density="compact"\]\):has\(> #ch-contents\)/);
  assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > #cg-contents/);
  assert.match(css, /#career-history \.sheet\[data-shape="wide"\] > #ch-contents/);
  assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > #cg-contents,[\s\S]*?min-height:\s*0/);
  assert.match(css, /#career-guide \.sheet\[data-shape="wide"\] > \.sheet-body,[\s\S]*?min-height:\s*0/);
  assert.match(css, /#career-guide \.sheet\[data-density="compact"\] > #cg-contents/);
  assert.match(css, /#career-history \.sheet\[data-density="compact"\] > #ch-contents/);
  assert.match(html, /class="sheet-body pane" id="cg-body"/);
  assert.match(html, /class="sheet-body pane" id="ch-body"/);
  assert.match(html, /class="sheet-body pane" id="co-body"/);
  assert.match(html, /class="sheet-body pane" id="q-body"/);
});

test("compact overlay rows wrap names instead of ellipsizing titles and points", () => {
  const css = read("css/career.css");
  assert.match(css,
    /#career-offers \.sheet\[data-density="compact"\] \.co-offer-team\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(css,
    /#career-history \.sheet\[data-density="compact"\] \.res-name\s*,[\s\S]*?white-space:\s*normal/);
  assert.match(css,
    /#quali \.sheet\[data-density="compact"\] \.res-name\s*,[\s\S]*?white-space:\s*normal/);
  assert.match(css,
    /#career-history \.sheet\[data-density="compact"\] \.res-pts[\s\S]*?white-space:\s*normal/);
  assert.match(css,
    /#quali \.sheet\[data-density="compact"\] \.res-pts[\s\S]*?white-space:\s*normal/);
});

test("compact qualifying foot keeps BACK except the existing .q-done rules", () => {
  const css = read("css/career.css");
  assert.match(css, /#quali\.q-done #q-drive, #quali\.q-done #q-sim, #quali\.q-done #q-back \{ display: none; \}/);
  assert.match(css, /#quali:not\(\.q-done\) #q-go \{ display: none; \}/);
  assert.match(css, /#quali \.sheet\[data-density="compact"\] #q-foot #q-drive/);
  assert.match(css, /#quali \.sheet\[data-density="compact"\] #q-foot #q-go/);
  const compactFoot = css.split("#quali .sheet[data-density=\"compact\"]")
    .slice(1).join("#quali .sheet[data-density=\"compact\"]");
  assert.doesNotMatch(compactFoot, /#q-back[^{]{0,80}\{\s*display:\s*none/,
    "compact CSS must not hide BACK; only .q-done does");
});
