import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("pause dialog hides bottom HUD chrome while open mid-race", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body\.in-race:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*\.hud-bottom/);
  assert.match(css, /body\.in-race:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*\.dock/);
});

test("compact pause stack tightens without changing type tokens", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack/);
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack\s+button[^}]*min-height:\s*36px/);
});
