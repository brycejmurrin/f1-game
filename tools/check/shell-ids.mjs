#!/usr/bin/env node
// @doc Every element id the JS looks up must exist: shell, runtime-created, or reported as dynamic. `--json`.
// @skill check-changes
/**
 * shell-ids.mjs — the shell<->JS id contract.
 *
 *   node tools/check/shell-ids.mjs          # report; exit 1 on a missing id
 *   node tools/check/shell-ids.mjs --json   # {ok, missing, dynamic, counts}
 *
 * WHY THIS EXISTS. `js/game.js` defines `const $ = (id) =>
 * document.getElementById(id)` and hands it out on the G facade, so most
 * modules reach the DOM through `$("some-id")`. `$` returns null for an id
 * that is not there, and the overwhelming majority of call sites immediately
 * dereference — `$("mb-race").onclick = ...` — so a renamed or deleted shell
 * id is a TypeError, not a no-op. Script tags are `defer`, so the DOM is
 * always parsed by then: this can only fire on a rename, never on a race.
 *
 * The project had already found this. `js/game.js` guards ONE such call with
 * the comment "Optional markup must not turn one missing screen into a
 * whole-app boot failure" — and the primary menu buttons beside it are
 * unguarded. This tool finishes that thought.
 *
 * WHY IT IS STATIC. tools/lib/game-vm.cjs cannot catch this: its
 * `getElementById` MANUFACTURES an element for any id on demand (it has to, or
 * game.js could not boot headlessly), so all 248 VM tests are blind to the
 * whole class by construction. The check has to read the shell instead.
 *
 * DYNAMIC READS ARE REPORTED, NOT GUESSED. `$(domId + "-none")` takes a
 * function parameter; its id set is not statically knowable. Those are listed
 * and counted — the same report-don't-guess contract tools/gen/move-tree.mjs
 * uses for paths built from separate segments — and the count is ratcheted
 * (`dynamicIdReads` in tests/data/ratchets.json) so the unknowable set can
 * shrink but not grow.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Lookup helpers that take an id. `el(` is deliberately NOT here: several
 *  files use `el("div")` as a createElement wrapper, which would read as a
 *  lookup of an id called "div". */
const READ_RE = /(?:document\.getElementById|(?<![.\w$])\$)\(\s*"([^"]+)"\s*\)/g;
const QS_RE = /querySelector(?:All)?\(\s*"#([A-Za-z0-9_-]+)"/g;
/** A lookup whose argument is not a string literal — unknowable statically. */
const DYNAMIC_RE = /(?:document\.getElementById|(?<![.\w$])\$)\(\s*(?!["'])([^)]{1,60})\)/g;

/** Ids that exist at runtime but are declared by neither the shell nor a plain
 *  `.id =` assignment — each is built by a helper that takes the id as an
 *  ARGUMENT, so no static scan can see the declaration. Same contract as
 *  KNOWN_EXTERNAL_READS in tests/unit/global-registry.test.mjs: every entry is a
 *  decision with its reason, and the list may only shrink without a note here. */
export const RUNTIME_IDS = {
  "pm-three-path":     "renderer-picker addBtn(), and only when the backend files exist — the read at paintPresent() is null-guarded",
  "pm-screenshots":    "renderer-picker addBtn(), same condition and same null-guarded read",
  "pm-save-shot":      "renderer-picker addBtn()",
  "pm-metrics":        "metrics-overlay makeMetricsBtn(), guarded by its own getElementById check",
  "pm-metrics-page":   "metrics-overlay makeMetricsBtn()",
  "pm-metrics-pos":    "metrics-overlay makeMetricsBtn()",
  "pm-metrics-size":   "metrics-overlay makeMetricsBtn()",
  "pm-metrics-logns":  "metrics-overlay makeMetricsBtn()",
  "pm-metrics-loglvl": "metrics-overlay makeMetricsBtn()",
  "pm-halo":           "cockpit-opts builds its rows from a table whose entries carry `id`",
  // NOT runtime-created any more: #game-soft was TLX's separate 2D blit canvas
  // and TLX left the shipped tree in the 2026-09-03 spike-out. The read is
  // null-guarded and its else branch ("say so plainly when there is not") is
  // the documented answer, so this is correct-but-dead rather than a defect.
  // It comes back with the backend; delete both together if it does not.
  "game-soft":         "js/render/three/tlx.js only — null-guarded, else-branch is the documented answer",
};

const jsFiles = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith(".") && e.name !== "node_modules") jsFiles(p, out); }
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
};

export function scan(root = ROOT) {
  const shell = fs.readFileSync(path.join(root, "index.html"), "utf8");
  // Declared: the shell, plus every id JS creates at runtime — an `.id = "x"`
  // assignment or an id="" inside an HTML string it injects.
  const declared = new Set([...shell.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const files = jsFiles(path.join(root, "js"));
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\.id\s*=\s*["'`]([A-Za-z0-9_-]+)["'`]/g)) declared.add(m[1]);
    for (const m of src.matchAll(/\bid=\\?["']([A-Za-z0-9_-]+)\\?["']/g)) declared.add(m[1]);
  }

  const read = new Map();      // id -> first site
  const dynamic = [];          // { file, line, expr }
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, "/");
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      for (const re of [READ_RE, QS_RE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) if (!read.has(m[1])) read.set(m[1], `${rel}:${i + 1}`);
      }
      DYNAMIC_RE.lastIndex = 0;
      let d;
      while ((d = DYNAMIC_RE.exec(line))) dynamic.push({ file: rel, line: i + 1, expr: d[1].trim() });
    });
  }

  const missing = [...read.keys()].filter((id) => !declared.has(id) && !(id in RUNTIME_IDS)).sort()
    .map((id) => ({ id, site: read.get(id) }));
  return { declared, read, missing, dynamic,
    counts: { declared: declared.size, read: read.size, missing: missing.length, dynamic: dynamic.length } };
}

/** The ratcheted number: lookups whose id cannot be known without running the code. */
export const dynamicIdReads = (root = ROOT) => scan(root).dynamic.length;

function main() {
  const r = scan();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: !r.missing.length, missing: r.missing, dynamic: r.dynamic, counts: r.counts }, null, 2));
    process.exitCode = r.missing.length ? 1 : 0;
    return;
  }
  for (const { id, site } of r.missing) {
    console.log(`MISSING  "${id}" is looked up at ${site} but no element declares it`);
  }
  console.log(`shell-ids: ${r.counts.read} ids looked up by literal, ${r.counts.declared} declared, ` +
    `${r.counts.dynamic} built from variables (reported, not checked)`);
  if (r.missing.length) console.log(`\n${r.missing.length} MISSING — a lookup that returns null, and most call sites dereference immediately.`);
  process.exitCode = r.missing.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
