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
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
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
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
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

test("trim-comments preserves KEEP keywords in narrative blocks", () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
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

test("trim-comments keeps whitespace-padded boxed prose in /* */", () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-box-"));
  const file = path.join(dir, "box.js");
  fs.writeFileSync(file, [
    "/*    parked cars, boundary planting, and a guarded set-back test.    */",
    "/*    the corners that need them, marshal posts and camera positions. */",
    "/* ======================================== */",
    "const x = 1;",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.match(out, /parked cars, boundary planting/);
  assert.match(out, /marshal posts and camera positions/);
  assert.doesNotMatch(out, /={10,}/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trim-comments keeps an open divider run followed by prose, removes closed banners", () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-open-"));
  const file = path.join(dir, "open.js");
  fs.writeFileSync(file, [
    "// ---- Photo mode: a free-fly camera launched from the tuner so the",
    "// prose continues on this line.",
    "// ------ FAR HORIZON",
    "// ---------- DOM ----------",
    "// ─────────────────────────",
    "const x = 1;",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.match(out, /Photo mode: a free-fly camera/);
  assert.match(out, /prose continues/);
  assert.match(out, /FAR HORIZON/);
  assert.doesNotMatch(out, /---------- DOM/);
  assert.doesNotMatch(out, /─{5,}/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trim-comments --narrative keeps licence / attribution blocks", () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-lic-"));
  const file = path.join(dir, "lic.js");
  fs.writeFileSync(file, [
    "// Outline data © OpenStreetMap contributors, available under the",
    "// Open Database Licence (ODbL) — see the project page.",
    "let a = 1;",
    "// Plain narrative that restates the code below it,",
    "// adding nothing a reader could not see.",
    "let b = 2;",
  ].join("\n"));

  const r = spawnSync(process.execPath, [TOOL, "--narrative", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(file, "utf8");
  assert.match(out, /OpenStreetMap contributors/);
  assert.match(out, /ODbL/);
  assert.doesNotMatch(out, /Plain narrative/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("trim-comments --narrative with no explicit path exits 2", () => {
  const r = spawnSync(process.execPath, [TOOL, "--dry-run", "--narrative"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--narrative needs explicit paths/);
});

test("trim-comments --dry-run --narrative lists candidates on stderr and writes nothing", () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "trim-list-"));
  const file = path.join(dir, "list.js");
  const src = [
    "let a = 1;",
    "// Plain narrative that restates the code below it,",
    "// adding nothing a reader could not see.",
    "let b = 2;",
  ].join("\n");
  fs.writeFileSync(file, src);

  const r = spawnSync(process.execPath, [TOOL, "--dry-run", "--narrative", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /list\.js:2 {2}\/\/ Plain narrative that restates/);
  assert.equal(fs.readFileSync(file, "utf8"), src);
  fs.rmSync(dir, { recursive: true, force: true });
});
