/* generated-docs.test.mjs — the generated docs cannot drift from their source.
 *
 * Three files claimed, in prose, to be derived from the code — tools/README.md
 * ("this index"), docs/LIGHTING-TUNER-SLIDERS.md ("Generated from TUNE_DEFS")
 * and docs/DEBUG-HOOKS.md ("the full reference") — and nothing derived them.
 * The slider doc carried ranges the registry had abandoned (lampLevel
 * 0.02…2.25 against a shipped 0…0.687), the tools index had 300-word rows that
 * nobody re-read when the tool changed, and the hook reference needed a
 * separate ratchet just to notice a missing name.
 *
 * Each has a generator now (tools/gen-*.mjs) and each generator has a
 * `--check` mode that exits 1 when the committed file is not byte-identical
 * to a fresh regeneration. This test runs that mode, so drift is a red test
 * rather than a stale doc: edit the SOURCE (a tool's `@doc` header line,
 * TUNE_DEFS, apex.js), run the generator, commit both.
 *
 * The sanity assertions guard the generators themselves: a generator that
 * quietly emitted an empty table would pass `--check` forever.
 *
 * Run: node --test tests/unit/generated-docs.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const GENERATORS = [
  { tool: "tools/gen-tools-readme.mjs", target: "tools/README.md" },
  { tool: "tools/gen-slider-doc.mjs", target: "docs/LIGHTING-TUNER-SLIDERS.md" },
  { tool: "tools/gen-hooks-table.mjs", target: "docs/DEBUG-HOOKS.md" },
];

function check(tool) {
  return spawnSync(process.execPath, [path.join(ROOT, tool), "--check"], { encoding: "utf8", cwd: ROOT, timeout: 60000 });
}

function block(doc, name) {
  const open = `<!-- GENERATED: ${name} -->`, close = "<!-- /GENERATED -->";
  const a = doc.indexOf(open), b = doc.indexOf(close, a);
  assert.ok(a >= 0 && b > a, `${name}: generated block markers missing`);
  return doc.slice(a, b);
}

for (const g of GENERATORS) {
  test(`${g.target} matches a fresh \`${g.tool} --check\``, () => {
    const r = check(g.tool);
    assert.equal(r.status, 0,
      `${g.target} is stale or the generator failed (exit ${r.status}).\n${r.stdout}${r.stderr}\n` +
      `Regenerate with: node ${g.tool}`);
  });
}

test("tools/README.md: one row per tool, every row within the @doc cap, no undefined", () => {
  const index = read("tools/README.md");
  // The data-files table is derived ("read by" lists), not @doc text — cap only the tool rows.
  const toolTables = index.split("### Data files")[0];
  const rows = toolTables.split("\n").filter((l) => /^\|\s*\*\*[^*]+\*\*\s*\|/.test(l));
  assert.ok(rows.length > 120, `expected > 120 tool rows, found ${rows.length}`);
  assert.doesNotMatch(index, /\bundefined\b/);
  // Second cell, split on UNESCAPED pipes, escapes folded back before measuring.
  const docCell = (l) => (l.split(/(?<!\\) \| /)[1] || "").replace(/\s*\|\s*$/, "").replace(/\\\|/g, "|");
  const long = rows.map(docCell).filter((c) => c.length > 120);
  assert.deepEqual(long, [], "an index row exceeds the 120-char @doc cap");
  // Every tool row cites a real file — the generator reads them from disk.
  for (const r of rows) {
    const rel = r.match(/^\|\s*\*\*([^*]+)\*\*/)[1];
    assert.ok(fs.existsSync(path.join(ROOT, "tools", rel)), `row names a missing tool: ${rel}`);
  }
});

test("docs/LIGHTING-TUNER-SLIDERS.md: the generated block lists every TUNE_DEFS knob", () => {
  const doc = read("docs/LIGHTING-TUNER-SLIDERS.md");
  const b = block(doc, "tune-defs");
  const rows = b.split("\n").filter((l) => /^\| `[a-zA-Z0-9_]+` \|/.test(l));
  assert.ok(rows.length >= 178, `expected ≥ 178 slider rows, found ${rows.length}`);
  assert.doesNotMatch(b, /\bundefined\b|\bNaN\b/);
  // The H1 count is derived from the same registry.
  const h1 = doc.match(/^# LIGHTING TUNER — the (\d+) sliders/m);
  assert.ok(h1, "H1 lost its slider count");
  assert.equal(Number(h1[1]), rows.length, "H1 count disagrees with the table");
  // Hand prose survived: the generator owns only the block.
  assert.match(doc, /## Every slider is wired/);
  assert.match(doc, /## Tools for exploring sliders/);
});

test("docs/DEBUG-HOOKS.md: the hook index names every __apex hook plus the agent-view surface", () => {
  const doc = read("docs/DEBUG-HOOKS.md");
  const b = block(doc, "hooks-table");
  // A CELL that is undefined is the generator bug; the word inside a quoted
  // source expression (`typeof F1API !== "undefined"`) is source, not a bug.
  assert.doesNotMatch(b, /\|\s*undefined\s*\||\(undefined[,)]|undefined\(/);
  const src = read("js/agent/apex.js");
  const body = src.slice(src.indexOf("const api = {"));
  const names = new Set();
  for (const m of body.matchAll(/^ {2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*[(:]/gm)) names.add(m[1]);
  assert.ok(names.size > 150, `regex saw only ${names.size} hooks`);
  const missing = [...names].filter((n) => !new RegExp("^\\| `(?:async )?" + n.replace(/\$/g, "\\$") + "(?:\\(|`)", "m").test(b));
  assert.deepEqual(missing, [], "a hook is in apex.js but not in the generated index");
  const agentRows = b.split("\n").filter((l) => /^\| (perceive|detail|know|act) \|/.test(l));
  assert.ok(agentRows.length >= 10, `expected the agentHelp() surface, found ${agentRows.length} rows`);
  // Hand sections survived around the block.
  assert.match(doc, /^## Catalog & meta/m);
  assert.match(doc, /^## Agent world view/m);
});

test("a slider's help text states ITS OWN ceiling, not a bound it no longer has", () => {
  // The repo's convention: "Ceiling is N" / "Tops out at N" in a slider's help
  // means that slider's `max`. It held for 8 of the 10 sliders that use the
  // phrase; the two exceptions were stale, and git says exactly how.
  //
  // 2fa6c88e "re-derive 40 slider bounds from measured consumer saturation"
  // lowered daySkyBlue 3 -> 2 and vignetteSoft 0.94 -> 0.69 and corrected
  // carGloss's help in the same commit, but left those two help strings quoting
  // the OLD ceiling. Player-facing text then promised range the control does
  // not have. This makes the whole class self-checking so the next bounds
  // re-derivation cannot leave a help string behind.
  //
  // Only the "Ceiling is" / "Tops out at" phrasing is checked. A help may name
  // other numbers about a CONSUMER (mistDensity's "caps the bank at 0.45",
  // vignetteSoft's own smoothstep constants) and those are not the slider's max.
  const src = fs.readFileSync(path.join(ROOT, "js/lighting/knobs.js"), "utf8");
  const bad = [];
  const defRe = /\{\s*id:\s*"(\w+)"[^}]*?max:\s*([\d.]+)[^}]*?help:\s*"((?:[^"\\]|\\.)*)"/g;
  let m, checked = 0;
  while ((m = defRe.exec(src))) {
    const [, id, max, help] = m;
    const c = /(?:Ceiling is|Tops out at)\s+([\d.]+)/.exec(help);
    if (!c) continue;
    checked++;
    if (Number(c[1]) !== Number(max)) bad.push(`${id}: help says ${c[1]}, max is ${max}`);
  }
  assert.ok(checked >= 8, `expected the convention on several sliders, saw ${checked}`);
  assert.deepEqual(bad, [],
    "a slider's stated ceiling must equal its max — re-derive the help when you re-derive the bound");
});
