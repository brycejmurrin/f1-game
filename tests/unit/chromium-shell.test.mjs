import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChromium, normalizeBrowserFlavor } from "../../tools/lib/chromium-path.mjs";

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

test("explicit browser flavor selects only its archive while executable environment overrides win", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pw-flavors-"));
  const full = path.join(root, "chromium-999999/chrome-linux64/chrome");
  const shell = path.join(root, "chromium_headless_shell-999999/chrome-headless-shell-linux64/chrome-headless-shell");
  for (const file of [full, shell]) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, "#!/bin/sh\n"); chmodSync(file, 0o755); }
  const opts = { env: { PATH: "" }, roots: [root], systemPaths: [] };
  try {
    assert.equal(resolveChromium(opts).path, full);
    assert.equal(resolveChromium({ ...opts, browserFlavor: "shell" }).path, shell);
    assert.equal(resolveChromium({ ...opts, browserFlavor: "full" }).path, full);
    assert.equal(normalizeBrowserFlavor("headless-shell"), "shell");
    assert.throws(() => resolveChromium({ ...opts, browserFlavor: "invalid" }), /browserFlavor/);
    assert.equal(resolveChromium({ ...opts, env: { PW_CHROMIUM: "/explicit/browser" }, browserFlavor: "shell" }).path, "/explicit/browser");
    rmSync(path.join(root, "chromium_headless_shell-999999"), { recursive: true });
    assert.equal(resolveChromium({ ...opts, browserFlavor: "shell" }), undefined, "never substitute full Chromium for requested shell");
    rmSync(path.join(root, "chromium-999999"), { recursive: true });
    assert.equal(resolveChromium({ ...opts, browserFlavor: "chromium" }), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
