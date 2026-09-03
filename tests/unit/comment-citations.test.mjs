/* comment-citations.test.mjs — line numbers cited in one file, about another.
 *
 * `js/` comments carry ~200 citations of the form `other-file.js:412` or
 * `other-file.js:405-422`. They are the most useful kind of comment in this
 * codebase — the WebGPU and three.js backends are PORTS, and saying which
 * GLSL a WGSL block mirrors is the whole reason a reader can check the port —
 * and they are also the least maintainable thing in it, because NOTHING edits
 * both files at once. A citation rots the first time the cited file grows.
 *
 * Measured during the 2026-08 cleanup: js/render/webgpu/wgsl-chunks.js cited
 * `js/render/glx/glx.js:39-896` for LIT_FS about thirty times. glx.js contains no
 * shader source at all — it destructures GLXShaders, and the GLSL lives in
 * js/render/glx/shaders/glsl-lit.js. Every one of those pointed a reader at uniform
 * upload code. Three more files had the same rot, and four separate numeric
 * claims elsewhere were simply wrong.
 *
 * Two assertions, matching what is actually checkable:
 *
 *   1. A cited line must EXIST. Pointing past end-of-file is objectively wrong
 *      and free to detect. It does not catch a citation that drifted to a
 *      different-but-valid line — nothing can, short of reading both files —
 *      but it catches the whole class that outlived a file shrinking.
 *
 *   2. A RATCHET on how many there are. Converting one to a SYMBOL name
 *      ("LIT_FS in js/render/glx/shaders/glsl-lit.js") makes it permanently true, and
 *      that is the direction this should move. Lowering the ceiling is the
 *      reward; raising it is a deliberate edit with a reason in the commit.
 *      Same idiom as tests/data/ratchets.json and tools/clip-baseline.json.
 *
 * Run: node --test tests/unit/comment-citations.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The citation population. LOWER it when you convert citations to symbol names.
// 148 after the 2026-08 WebGPU/TLX port rewrite; 0 after replacing the rest
// with file-path or symbol references (2026-08-12 full sweep).
const CITATION_CEILING = 0;
// A ceiling left far above the real count has stopped ratcheting — the same
// slack rule tools/check/ratchets.mjs carries, for the same reason.
const CITATION_SLACK = 15;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js") || e.name.endsWith(".css") ||
             e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

// vendor/ is third-party and not ours to annotate. css/ IS scanned: a comment in
// css/tokens.css cited line 8107 of a game.js that has ~8,000, and the first
// version of this guard walked only js/ — so the one citation pointing past a
// real end-of-file was the one it could not see. A guard scoped to where you
// expect the rot is a guard that misses it.
//
// (The example above is deliberately written WITHOUT the file:line form. Spelled
// literally it is itself a citation, and tests/unit/docs-integrity.test.mjs — which
// sweeps the whole repo — flagged this very line for it. Two guards, one
// correctly catching the other's paperwork.)
// types/ joined the walk after a round-6 audit found the whole surviving rot
// population there: four js/game.js line citations in game-ctx.d.ts had drifted
// by up to 140 lines while js/ itself was clean — the rot lives exactly where
// the ratchet does not reach.
const FILES = [...walk(path.join(ROOT, "js")), ...walk(path.join(ROOT, "css")),
               ...walk(path.join(ROOT, "types"))];

// Index every js/ file by full repo-relative path AND by basename, so both
// `js/render/glx/shaders/glsl-lit.js:344` and a bare `lit.js:344` resolve. A basename
// shared by two files is ambiguous and deliberately skipped rather than guessed.
const byPath = new Map(), byBase = new Map(), ambiguous = new Set();
for (const abs of FILES) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const n = fs.readFileSync(abs, "utf8").split("\n").length;
  byPath.set(rel, n);
  const base = path.basename(rel);
  if (byBase.has(base)) ambiguous.add(base); else byBase.set(base, { rel, n });
}

const CITE = /((?:[\w.-]+\/)*[\w.-]+\.js):(\d+)(?:-(\d+))?/g;

function citations() {
  const out = [];
  for (const abs of FILES) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      // Comments only. A URL or a stack-trace string is not a citation, and
      // `//` inside a string literal is not a comment — this is a heuristic on
      // purpose: over-matching here would make the ratchet meaningless.
      const c = line.indexOf("//") >= 0 ? line.slice(line.indexOf("//"))
        : (/^\s*\*/.test(line) || line.includes("/*") ? line : null);
      if (c == null || c.includes("http")) return;
      for (const m of c.matchAll(CITE)) {
        out.push({ from: rel, line: i + 1, target: m[1], a: +m[2], b: m[3] ? +m[3] : +m[2] });
      }
    });
  }
  return out;
}

const ALL = citations();

test("a cited line number exists in the file it names", () => {
  const bad = [];
  for (const c of ALL) {
    let n = byPath.get(c.target);
    if (n === undefined) {
      const base = path.basename(c.target);
      if (ambiguous.has(base)) continue;          // cannot resolve; not a failure
      const hit = byBase.get(base);
      if (!hit) continue;                          // not one of ours (a tool, a doc, a vendor file)
      n = hit.n;
    }
    if (c.b > n) bad.push(`${c.from}:${c.line} cites ${c.target}:${c.a}${c.b !== c.a ? "-" + c.b : ""} but that file has ${n} lines`);
  }
  assert.deepEqual(bad, [],
    "a comment cites a line past the end of the file it names — rewrite it to name the SYMBOL " +
    "instead of a line number, which is the only form that stays true");
});

test("cross-file line citations are not multiplying", () => {
  assert.ok(ALL.length <= CITATION_CEILING,
    `${ALL.length} cross-file line citations in js/, ceiling ${CITATION_CEILING}. ` +
    "A line number in another file cannot be kept true — nothing edits both. Cite the SYMBOL " +
    "(\"LIT_FS in js/render/glx/shaders/glsl-lit.js\") instead, or raise the ceiling here and say why.");
});

test("the citation ceiling has not been left far above the real count", (t) => {
  // At ceiling 0 this subtraction is always <= slack — the assertion only has
  // teeth once the ceiling is raised above zero, so skip instead of passing
  // vacuously (a round-6 audit flagged the always-true form).
  if (CITATION_CEILING === 0) { t.skip("ceiling is 0 — the anti-slack check is moot"); return; }
  assert.ok(CITATION_CEILING - ALL.length <= CITATION_SLACK,
    `${ALL.length} citations but the ceiling is ${CITATION_CEILING} — lower it, or the ratchet ` +
    "silently stops ratcheting and the next batch of rot lands under the gap.");
});
