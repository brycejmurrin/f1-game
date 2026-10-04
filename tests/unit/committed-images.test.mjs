// committed-images — keep screenshots from bloating every clone again.
// Measured 2026-10-01 on full history (.github/workflows/repo-size.yml):
// 1,077 MB packed, 90% of it PNG, and 780 MB of that under tests/ — almost all
// from ONE two-day burst (2026-06-20..21) in which a lap audit committed
// ~1,700 versions of tests/ui-screenshots/lap-audit/*.png. They were deleted
// later, but deleting a file does not shrink history: every clone still
// carries every version. Re-committing the same files barely changes the
// TREE's size, so a size ratchet would not have caught it; what does is the
// first commit that puts a screenshot where none belongs. So, over the tracked
// files (`git ls-files`):
//   * under tests/, an image may live only in a Playwright `*-snapshots/` dir
//     (the reviewed baselines; everything else a run writes belongs in
//     artifacts/, which is gitignored);
//   * outside assets/, no image may exceed MAX_MB — a docs screenshot that big
//     belongs in a PR comment, an artifact or a release asset, not in history.
// Under a second; on the guard ladder, so it fails at commit time.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const IMAGE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i;
const MAX_MB = 4;   // the largest docs image on 2026-10-01 was 3.0 MB

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\0").filter((f) => IMAGE.test(f));

test("the walk sees the committed images (a broken ls-files would pass everything)", () => {
  assert.ok(tracked.length >= 10, `expected the repo's images, found ${tracked.length}`);
  assert.ok(tracked.some((f) => f.startsWith("assets/")), "assets/ images missing from the walk");
});

test("images under tests/ live only in Playwright *-snapshots/ baselines", () => {
  const stray = tracked.filter((f) => f.startsWith("tests/") && !/(^|\/)[^/]+-snapshots\//.test(f));
  assert.deepEqual(stray, [],
    `screenshots committed outside a *-snapshots/ baseline dir:\n  ${stray.join("\n  ")}\n\n` +
    "Write run output to artifacts/ (gitignored). One June audit committed ~1,700 versions of\n" +
    "tests/ui-screenshots/*.png in two days; deleted since, they are still ~750 MB of every clone.");
});

test(`no image outside assets/ is over ${MAX_MB} MB`, () => {
  const big = tracked.filter((f) => !f.startsWith("assets/"))
    .map((f) => { let s = 0; try { s = fs.statSync(path.join(ROOT, f)).size; } catch (_) { /* deleted in the worktree */ } return [f, s]; })
    .filter(([, s]) => s > MAX_MB * 1048576)
    .map(([f, s]) => `${f} (${(s / 1048576).toFixed(1)} MB)`);
  assert.deepEqual(big, [],
    `images over ${MAX_MB} MB outside assets/:\n  ${big.join("\n  ")}\n\n` +
    "Every committed version stays in every clone forever. Downscale it, or keep it out of git\n" +
    "(a PR comment, a workflow artifact or a release asset).");
});
