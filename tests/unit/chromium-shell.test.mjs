import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChromium } from "../../tools/lib/chromium-path.mjs";

test("a headless shell answers when the full Chromium archive was never unpacked", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pw-shell-"));
  const exe = path.join(root, "chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
  mkdirSync(path.dirname(exe), { recursive: true });
  writeFileSync(exe, "#!/bin/sh\n");
  chmodSync(exe, 0o755);
  try {
    const found = resolveChromium({
      env: { PATH: path.join(root, "no-path") },
      roots: [root],
      systemPaths: [],
    });
    assert.equal(found.path, exe);
    assert.match(found.source, /headless-shell/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
