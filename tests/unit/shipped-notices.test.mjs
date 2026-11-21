// Exact-set coverage of the third-party notices (audit W13 follow-up, issue #5317, 2026-11-18).
// notices.test.mjs proves the generated outputs match the generator and that each vendor/ package
// is credited; asset-credits.test.mjs proves each audio file has a row. This file closes the
// remaining one-way checks: each shipped font, asset-pack item, audio CREDITS row and Android
// runtime dependency maps to exactly one notice entry, and each notice entry to something that ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPONENTS, NOTICE_SOURCES, androidLine, buildCreditsHtml, buildNoticesText, noticeModel } from "../../desktop/scripts/notices.mjs";
import { writeAppNotices } from "../../mobile/scripts/sync-web.mjs";
import { STAGE_DIRS, STAGE_ROOT_FILES, stageExcluded } from "../../tools/desktop/stage-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ls = (rel) => fs.readdirSync(path.join(ROOT, rel));
const sorted = (xs) => [...new Set(xs)].sort();

test("every shipped font file maps to exactly one font row, and every font row to a shipped file", () => {
  const fonts = COMPONENTS.filter((c) => c.licence.startsWith("assets/fonts/"));
  // A font file's family is its licence file's stem: titillium-web-OFL.txt covers titillium-web-*.woff2.
  const stem = (c) => path.posix.basename(c.licence).replace(/-OFL\.txt$/, "");
  const files = ls("assets/fonts").filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  assert.ok(files.length >= 4, "the walk finds the shipped fonts (guards a vacuous pass)");
  const owner = (f) => fonts.filter((c) => f.startsWith(stem(c) + "-"));
  assert.deepEqual(files.filter((f) => owner(f).length !== 1), [], "font files without exactly one COMPONENTS row");
  assert.deepEqual(sorted(files.map((f) => owner(f)[0].name)), sorted(fonts.map((c) => c.name)), "font rows with no shipped file");
  // Nothing else sits in assets/fonts: every other file there is a licence text in NOTICE_SOURCES.
  const other = ls("assets/fonts").filter((f) => !files.includes(f));
  assert.deepEqual(other.filter((f) => !NOTICE_SOURCES.includes("assets/fonts/" + f)), []);
});

test("assets/pack: the files, the manifest and CREDITS.md name the same items", () => {
  const m = JSON.parse(read("assets/pack/manifest.json"));
  const credited = read("assets/pack/CREDITS.md").split("\n").map((l) => l.split("|").map((s) => s.trim()))
    .filter((c) => c.length >= 7 && c[1] !== "kind" && !/^-+$/.test(c[1]))
    .map((c) => `${c[1]}:${c.slice(2, c.length - 4).join("|")}`);
  const listed = [
    ...m.materials.layers.map((l) => `material:${l.id}`),
    ...Object.keys(m.models).map((id) => `model:${id}`),
    ...Object.keys(m.env).map((id) => `env:${id}`),
  ];
  assert.equal(credited.length, new Set(credited).size, "a CREDITS.md row is duplicated");
  assert.deepEqual(sorted(credited), sorted(listed), "CREDITS.md rows ≠ manifest materials/models/env");
  assert.deepEqual(sorted(m.credits.map((c) => `${c.kind}:${c.id}`)), sorted(listed), "manifest credits ≠ its items");
  // Every binary in the pack is a file the manifest names, and every named file exists.
  const named = [
    ...Object.values(m.models).map((x) => x.file),
    m.materials.albedo, m.materials.normal, m.materials.low.albedo, m.materials.low.normal,
    // The EXTREME packHd tier (512 px), when the manifest has one: named, so it must be on disk, and vice versa.
    ...(m.materials.hd ? [m.materials.hd.albedo, m.materials.hd.normal] : []),
  ];
  const onDisk = [...ls("assets/pack/models").map((f) => "models/" + f), ...ls("assets/pack").filter((f) => /\.(png|webp|ktx2|bin|glb)$/i.test(f))];
  assert.deepEqual(sorted(onDisk), sorted(named), "pack binaries ≠ the files the manifest names");
});

test("every audio CREDITS row names a file that ships (rows for deleted files are caught)", () => {
  const dead = [];
  for (const dir of ["assets/music", "assets/sfx", "assets/voice"]) {
    const files = ls(dir);
    for (const line of read(dir + "/CREDITS.txt").split("\n")) {
      const m = /^file: (\S+) \|/.exec(line.trim());
      if (!m) continue;
      const re = new RegExp("^" + m[1].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
      if (!files.some((f) => re.test(f))) dead.push(`${dir}/CREDITS.txt: ${m[1]}`);
    }
  }
  assert.deepEqual(dead, []);
});

test("the Android app's runtime dependencies are exactly the npm packages the notices credit", () => {
  const deps = Object.keys(JSON.parse(read("mobile/package.json")).dependencies || {});
  const credited = COMPONENTS.flatMap((c) => c.npm || []);
  assert.equal(credited.length, new Set(credited).size, "a package is credited twice");
  assert.deepEqual(sorted(credited), sorted(deps), "mobile/package.json dependencies ≠ COMPONENTS npm lists");
  // The web build and the Electron wrapper ship no npm runtime packages (their code is vendored).
  for (const rel of ["package.json", "desktop/package.json"]) {
    assert.deepEqual(Object.keys(JSON.parse(read(rel)).dependencies || {}), [], `${rel} gained a runtime dependency: credit it`);
  }
});

test("every top-level assets/ folder is credited, excluded from the stage, or the game's own renders", () => {
  // assets/stills are the track picker's renders of the game itself (tools/gen/track-stills.mjs).
  const OWN = ["assets/stills"];
  const credited = (dir) => NOTICE_SOURCES.some((s) => s.startsWith(dir + "/"));
  const loose = ls("assets").map((d) => "assets/" + d)
    .filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory())
    .filter((d) => !credited(d) && !stageExcluded(d) && !OWN.includes(d));
  assert.deepEqual(loose, [], "a new assets/ folder ships with no notice source");
  assert.ok(fs.existsSync(path.join(ROOT, "tools/gen/track-stills.mjs")), "the stills generator still exists");
});

test("every local link in ABOUT & CREDITS is a file the site stages", () => {
  const staged = (rel) => STAGE_ROOT_FILES.includes(rel) || STAGE_DIRS.some((d) => rel.startsWith(d + "/"));
  const local = [...buildCreditsHtml(ROOT).matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https:\/\//.test(h));
  assert.ok(local.length > 0, "the panel links local licence files");
  assert.deepEqual(local.filter((h) => !staged(h) || stageExcluded(h)), [], "a credits link would 404 on the live site");
  // A licence outside the staged dirs is an Android-only component, named in the panel's closing line.
  assert.deepEqual(COMPONENTS.filter((c) => !staged(c.licence)).map((c) => c.group), COMPONENTS.filter((c) => c.group === "android").map(() => "android"));
  assert.equal(androidLine(noticeModel(ROOT)), "The Android app also includes Capacitor 8.6.2 (MIT), Capacitor Filesystem 8.1.5 (MIT) and Capacitor Share 8.0.2 (MIT).");
  assert.ok(buildCreditsHtml(ROOT).includes(androidLine(noticeModel(ROOT))), "the panel names the Android-only components");
});

test("the Android web dir gets the full third-party notices", () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, "artifacts", "app-notices-"));
  try {
    const dest = writeAppNotices(tmp);
    assert.equal(dest, path.join(tmp, "THIRD-PARTY-NOTICES.txt"));
    assert.equal(fs.readFileSync(dest, "utf8"), buildNoticesText(ROOT));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
