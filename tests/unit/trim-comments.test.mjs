/* trim-comments.test.mjs — smoke the comment trim tool. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = path.join(ROOT, "tools", "check", "trim-comments.mjs");

test("trim-comments.mjs --help exits 0", () => {
  const r = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--dry-run/);
});

test("trim-comments removes dividers and loc pointers on a fixture", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-fix-"));
  const file = path.join(dir, "sample.js");
  fs.writeFileSync(file, [
    "/* Long header line one.",
    "   Line two restates the module.",
    "   Line three is more prose.",
    "*/",
    "// ---------- section ----------",
    "// The foo lives in js/core/log.js",
    "const x = 1;",
    "// keyboard",
    "let keyLeft = false;",
    "/* === helpers === */",
    "function f() { return x; }",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, "--headers", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(out, /---------- section/);
  assert.doesNotMatch(out, /lives in js\//);
  assert.doesNotMatch(out, /^\/\/ keyboard/m);
  assert.doesNotMatch(out, /=== helpers ===/);
  assert.match(out, /const x = 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trim-comments removes dividers embedded in // comment runs", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-embed-"));
  const file = path.join(dir, "embed.js");
  fs.writeFileSync(file, [
    "// prose block above",
    "// more context for the section",
    "// ---------- section end ----------",
    "const x = 1;",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(out, /---------- section/);
  assert.match(out, /prose block above/);
  assert.match(out, /const x = 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a CSS custom-property comment is not a divider", () => {
  // `/* --fs-2 (15px): ... */` opens with " --", three divider characters. The
  // pattern used to take the rest on trust and removed the comment; a banner
  // has a dash run on BOTH sides, a custom-property note only at the start.
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-cssvar-"));
  const file = path.join(dir, "vars.css");
  fs.writeFileSync(file, [
    "/* ---------- buttons ---------- */",
    "/* --fs-2 (15px): under .sheet zoom 0.9 paints 13.5px (visual floor 12). */",
    ".btn { font-size: var(--fs-2); }",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.match(out, /--fs-2 \(15px\)/, "the custom-property why-comment was eaten");
  assert.doesNotMatch(out, /-+ buttons -+/, "the banner should still go");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trim-comments preserves KEEP keywords in narrative blocks", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-keep-"));
  const file = path.join(dir, "keep.js");
  fs.writeFileSync(file, [
    "// measured on Bahrain: the governor must not oscillate.",
    "// Without it the ladder cannot be reached on a CPU-bound frame.",
    "let x = 1;",
  ].join("\n"));

  spawnSync(process.execPath, [TOOL, "--narrative", file], { encoding: "utf8" });
  const out = fs.readFileSync(file, "utf8");
  assert.match(out, /measured on Bahrain/);
  fs.rmSync(dir, { recursive: true, force: true });
});
