// Shared scratch-workspace builder for the apex-lsp fixture tests
// (tests/unit/lsp-mcp-fixture.test.mjs): a temp dir, a `w(file, text)` writer
// that makes parent dirs, and a `git(...)` runner with a throwaway identity.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// The jsconfig every fixture workspace shares; `include` and `typeAcquisition` vary per test.
export const jsconfig = (opts = {}) => JSON.stringify({
  compilerOptions: { allowJs: true, checkJs: false, noEmit: true },
  ...(opts.typeAcquisition === false ? {} : { typeAcquisition: { enable: false } }),
  include: opts.include || ["src/**/*.js"],
});

export function lspFixture(prefix, base = os.tmpdir()) {
  const dir = fs.mkdtempSync(path.join(base, prefix));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, stdio: "ignore" });
  return { dir, w, git };
}
