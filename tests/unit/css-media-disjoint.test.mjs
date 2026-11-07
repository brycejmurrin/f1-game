// R8 F1/F3: TWO MEDIA LADDERS WHOSE BRANCHES MUST STAY DISJOINT.
//
// F1 — css/track-detail.css lays the detail body out as a ROW in exactly two
// places: the landscape rail and its ≥900x600 upgrade. The upgrade used to
// judge only width and height, so LARGE PORTRAIT (an upright iPad Pro at
// 1024x1366, a rotated 1080x1920 monitor) matched it and got the side-by-side
// row on a screen whose spare axis is height. Every row-layout branch must
// therefore carry `(orientation: landscape)` in its condition.
//
// F3 — css/responsive.css grows the NON-compact main-menu composition in two
// sibling blocks (large landscape, large portrait). The landscape block guards
// every selector with `:where(body:not([data-density="compact"]))`; the
// portrait block shipped unguarded, so a compact-density body on a large
// portrait window got these widths and type sizes layered over the compact
// layout they contradict. Every selector in BOTH blocks must carry the guard.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function stripComments(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      let j = text.indexOf("*/", i + 2);
      j = j < 0 ? text.length : j + 2;
      out.push("\n".repeat((text.slice(i, j).match(/\n/g) || []).length));
      i = j;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
}

// Every @media block in `text` as { condition, body } — brace-matched, so a
// nested rule cannot end the block early.
function mediaBlocks(text) {
  const blocks = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    blocks.push({ condition: m[1].trim(), body: text.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

// Selector lists of the top-level rules in a block body.
function selectors(body) {
  const found = [];
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(body))) {
    let depth = 1, i = re.lastIndex;
    while (i < body.length && depth > 0) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      i++;
    }
    for (const sel of m[1].split(",")) {
      const s = sel.trim();
      if (s) found.push(s);
    }
    re.lastIndex = i;
  }
  return found;
}

test("track-detail.css keys its row layout on the sheet's own shape; the one media row branch requires landscape", () => {
  const css = stripComments(fs.readFileSync(path.join(ROOT, "css", "track-detail.css"), "utf8"));
  // UI scaling contract gap 24 (PR #5156): the phone rail is `#td-inner[data-shape="wide"]`
  // (SheetShape's zoom-aware aspect, in the sheet's own px), not `@media (orientation)`,
  // which read the raw window and could not see UI SIZE. Only the large-window upgrade
  // (a desktop or tablet) stays a media branch, and it still requires landscape.
  const rowBranches = mediaBlocks(css).filter((b) =>
    /#track-detail-body\s*\{[^}]*flex-direction:\s*row/.test(b.body));
  assert.equal(rowBranches.length, 1,
    `expected ONE media row branch (the ≥900×600 upgrade) — found ${rowBranches.length}; the layout moved, update this test`);
  for (const b of rowBranches) {
    assert.match(b.condition, /orientation:\s*landscape/,
      `a row-layout branch matches without landscape — large portrait gets the side-by-side squeeze back: @media ${b.condition}`);
    assert.match(b.condition, /min-width:\s*900px/);
    assert.match(b.body, /#td-inner\[data-shape="wide"\]\s+#track-detail-body\s*\{[^}]*flex-direction:\s*row/,
      "the upgrade carries the shape prefix, so it outranks the base wide rule instead of losing to its specificity");
  }
  const flat = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
  assert.match(flat, /#td-inner\[data-shape="wide"\]\s+#track-detail-body\s*\{[^}]*flex-direction:\s*row/,
    "the phone rail is keyed on the sheet's wide shape");
  assert.match(flat, /#td-inner\[data-shape="tall"\]\s+#track-detail-panel\s*\{[^}]*border-top/,
    "the stacked layout is keyed on the sheet's tall shape");
  for (const b of mediaBlocks(css)) {
    if (/orientation:\s*portrait/.test(b.condition)) {
      assert.doesNotMatch(b.body, /#track-detail-(body|panel|canvas-wrap|legend)/,
        `a portrait media branch still lays out the circuit detail sheet: @media ${b.condition}`);
    }
  }
});

test("both large-screen menu blocks in responsive.css guard every selector on density", () => {
  const css = stripComments(fs.readFileSync(path.join(ROOT, "css", "responsive.css"), "utf8"));
  const menuBlocks = mediaBlocks(css).filter((b) =>
    /#menu-hero|#menu-buttons/.test(b.body) && /min-width/.test(b.condition));
  assert.ok(menuBlocks.length >= 2,
    `expected the large-landscape and large-portrait siblings — found ${menuBlocks.length}; the layout moved, update this test`);
  const GUARD = ':where(body:not([data-density="compact"]))';
  for (const b of menuBlocks) {
    for (const sel of selectors(b.body)) {
      assert.ok(sel.startsWith(GUARD),
        `unguarded selector in @media ${b.condition} — it overrides the compact layout: "${sel}"`);
    }
  }
});
