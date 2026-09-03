/**
 * gen-lib.mjs — shared writer for the `gen-*.mjs` doc generators.
 * @doc Shared writer for the `gen-*.mjs` generators: `--check` vs write, marker-block replacement.
 * @skill check-changes
 *
 * Every generator is `node tools/gen-<x>.mjs [--check]`: without the flag it
 * writes the target; with it, it exits 1 (and prints the first differing line)
 * when the committed file is not byte-identical to a fresh regeneration. The
 * freshness test in tests/unit/generated-docs.test.mjs runs the `--check` form,
 * so drift between source and generated doc cannot land silently.
 *
 * Generators that own a BLOCK inside a hand-written doc use replaceBlock():
 * the text between `<!-- GENERATED: name -->` and `<!-- /GENERATED -->` is
 * replaced, everything outside it is kept verbatim. The markers must already
 * exist — a generator never guesses where in a hand-written file its table
 * belongs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** First line where two texts differ, for a --check message. */
export function firstDiff(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n  committed: ${JSON.stringify(la[i] ?? "<eof>").slice(0, 160)}\n  generated: ${JSON.stringify(lb[i] ?? "<eof>").slice(0, 160)}`;
    }
  }
  return "identical";
}

/**
 * Replace the marked block inside `doc`. Throws when the markers are missing
 * or malformed, because writing a table into the wrong place is worse than
 * writing nothing.
 */
export function replaceBlock(doc, name, body) {
  const open = `<!-- GENERATED: ${name} -->`;
  const close = "<!-- /GENERATED -->";
  const a = doc.indexOf(open);
  if (a < 0) throw new Error(`marker ${open} not found — add it to the doc where the generated block belongs`);
  const b = doc.indexOf(close, a);
  if (b < 0) throw new Error(`closing marker ${close} not found after ${open}`);
  return doc.slice(0, a) + open + "\n" + body.replace(/\s+$/, "") + "\n" + doc.slice(b);
}

/**
 * Write or check `rel`. Returns the process exit code: 0 clean/written, 1 the
 * committed file drifted (check mode only).
 */
export function emit(rel, content, argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const abs = path.join(ROOT, rel);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  const bytes = Buffer.byteLength(content, "utf8");
  if (check) {
    if (current === content) {
      process.stdout.write(`${rel}: up to date (${bytes} bytes)\n`);
      return 0;
    }
    process.stdout.write(`${rel}: STALE — regenerate with \`node tools/${path.basename(process.argv[1] || "gen")}\`\n${firstDiff(current || "", content)}\n`);
    return 1;
  }
  if (current === content) {
    process.stdout.write(`${rel}: unchanged (${bytes} bytes)\n`);
    return 0;
  }
  fs.writeFileSync(abs, content);
  process.stdout.write(`${rel}: written (${bytes} bytes)\n`);
  return 0;
}

export function isMain(metaUrl) {
  return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
