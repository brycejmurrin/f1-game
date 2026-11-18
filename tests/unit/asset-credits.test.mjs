// Every audio file under assets/ has a CREDITS row (source, author, licence), and the
// rows that still say "unknown" are exactly a named, shrink-only baseline
// (tests/data/asset-credits-unknown.json). Audit W13, 2026-11-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUDIO = /\.(mp3|wav|ogg|opus|m4a|flac|aac)$/i;
const ROW = /^file: (\S+) \| source: (.+?) \| author: (.+?) \| licence: (.+)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(path.relative(ROOT, p).split(path.sep).join("/"));
  }
  return out;
}
/** Encoded speech in assets/voice ships as .bin; it is audio too. */
const isAudio = (rel) => AUDIO.test(rel) || (rel.startsWith("assets/voice/") && rel.endsWith(".bin"));
const glob = (pat) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");

function rowsFor(dir) {
  const rows = [];
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/^CREDITS/i.test(name)) continue;
    for (const line of fs.readFileSync(path.join(ROOT, dir, name), "utf8").split("\n")) {
      const m = ROW.exec(line.trim());
      if (m) rows.push({ pat: glob(m[1]), source: m[2].trim(), author: m[3].trim(), licence: m[4].trim(), credits: dir + "/" + name });
    }
  }
  return rows;
}

const audio = walk(path.join(ROOT, "assets")).filter(isAudio).sort();
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/asset-credits-unknown.json"), "utf8")).unknown;

test("the walk finds the shipped audio (guards a vacuous pass)", () => {
  assert.equal(audio.filter((f) => f === "assets/sfx/f1_engine.mp3").length, 1, "engine sample found");
  assert.ok(audio.some((f) => f.startsWith("assets/music/")), "music found");
  assert.ok(audio.some((f) => f.startsWith("assets/voice/")), "voice packs found");
});

test("every audio file under assets/ has a CREDITS row with source, author and licence", () => {
  const missing = [], unknown = [];
  for (const rel of audio) {
    const dir = path.posix.dirname(rel), base = path.posix.basename(rel);
    const row = rowsFor(dir).find((r) => r.pat.test(base));
    if (!row) { missing.push(rel); continue; }
    for (const k of ["source", "author", "licence"]) assert.ok(row[k], `${rel}: empty ${k} in ${row.credits}`);
    if ([row.source, row.author, row.licence].some((v) => /^unknown$/i.test(v))) unknown.push(rel);
  }
  assert.deepEqual(missing, [], "audio files without a `file: … | source: … | author: … | licence: …` row in their folder's CREDITS file");
  const added = unknown.filter((f) => !baseline.includes(f));
  assert.deepEqual(added, [], "new audio with an unknown source or licence: credit it, do not grow the baseline");
  const stale = baseline.filter((f) => !unknown.includes(f));
  assert.deepEqual(stale, [], "these are credited (or gone) now: shrink tests/data/asset-credits-unknown.json");
});
