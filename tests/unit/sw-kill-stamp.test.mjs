/* sw-kill-stamp.test.mjs — the service worker's kill switch is a version.json
 * key (`"swKill": true`, sw.js isKillFlag). The deploy stamp rewrites
 * version.json; it must carry the flag through, or the switch could never ship.
 *
 * Run: node --test tests/unit/sw-kill-stamp.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageSite, stampStaged } from "../../tools/desktop/stage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fakeGit = (args) => {
  const k = args.join(" ");
  if (k === "rev-parse --is-shallow-repository") return "false";
  if (k === "rev-list --count HEAD") return "100";
  if (k === "rev-parse HEAD") return "0123456789abcdef0123456789abcdef01234567";
  throw new Error(`unexpected git ${k}`);
};

for (const [label, committed, want] of [
  ["keeps swKill: true", '{ "build": 1695, "swKill": true }\n', '{ "build": 2100, "swKill": true }\n'],
  ["writes only the build without the flag", '{ "build": 1695 }\n', '{ "build": 2100 }\n'],
  ["drops a non-true swKill", '{ "build": 1695, "swKill": "yes" }\n', '{ "build": 2100 }\n'],
]) {
  test(`the deploy stamp ${label}`, (t) => {
    const base = path.join(ROOT, "artifacts", "tmp");
    fs.mkdirSync(base, { recursive: true });
    const dir = fs.mkdtempSync(path.join(base, "sw-kill-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dest = path.join(dir, "site");
    stageSite(dest, { root: ROOT });
    fs.writeFileSync(path.join(dest, "version.json"), committed);
    assert.equal(stampStaged(dest, { git: fakeGit }), 2100);
    assert.equal(fs.readFileSync(path.join(dest, "version.json"), "utf8"), want);
  });
}
