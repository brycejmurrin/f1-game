/* desktop-notices.test.mjs — every NOTICE_SOURCES path exists in the tree.
 *
 * Run: node --test tests/unit/desktop-notices.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTICE_SOURCES, buildNoticesText } from "../../desktop/scripts/notices.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every notices source path exists in the repo", () => {
  assert.ok(NOTICE_SOURCES.length >= 8);
  for (const rel of NOTICE_SOURCES) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `missing licence/credits file ${rel}`);
    assert.ok(fs.statSync(abs).size > 20, `${rel} looks empty`);
  }
});

test("buildNoticesText concatenates every source and names the UNLICENSED caveat", () => {
  const text = buildNoticesText(ROOT);
  assert.match(text, /UNLICENSED/);
  for (const rel of NOTICE_SOURCES) {
    assert.match(text, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("gitignore ignores generated THIRD-PARTY-NOTICES.txt not the entitlements", () => {
  const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  assert.match(gi, /desktop\/build\/THIRD-PARTY-NOTICES\.txt/);
  assert.ok(fs.existsSync(path.join(ROOT, "desktop/build/entitlements.mac.plist")));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-notices-"));
  try {
    assert.ok(buildNoticesText(ROOT).length > 1000);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
