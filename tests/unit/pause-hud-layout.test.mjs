import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("pause dialog hides bottom HUD chrome while open mid-race", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body\.in-race:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*:is\(/);
  assert.match(css, /\.hud-bottom/);
  assert.match(css, /\.hud-top/);
  assert.match(css, /#btn-cam/);
  assert.match(css, /\.dock/);
});

test("compact pause stack tightens without changing type tokens", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack/);
  // max(36px, --tap-min), not a bare 36px: the 36 floor is the compact tighten
  // this test guards; the --tap-min arm only wins below 100% UI SIZE, where a
  // flat 36 local px painted RESUME at 14-18px (2026-08-21 sweep, pause @40).
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack\s+button[^}]*min-height:\s*max\(36px,\s*var\(--tap-min\)\)/);
});
