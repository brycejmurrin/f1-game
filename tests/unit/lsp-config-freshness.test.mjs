import "../helpers/git-fixture-env.mjs"; // FIRST: isolate fixture Git commands from hook state.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TSC = path.join(ROOT, "node_modules/.bin/tsc");

test("diagnostics reload changed config graphs and never subtract against changed config", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-config-"));
  const write = (file, text) => { const p = path.join(dir, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, stdio: "ignore" });
  // The comma/bracket sequence catches trailing-comma stripping that mutates
  // string contents while parsing JSONC.
  write("config/base,}.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "legacy" } }));
  write("jsconfig.json", JSON.stringify({ extends: "./config/base,}.json", include: ["src/**/*.js"] }));
  write("src/dep.js", "const Api = { ping(x) { return x; } };\n");
  write("src/main.js", "const old = oldMissing;\nconst value = Api.ping(1);\n");
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "baseline");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/main.js", cmd: TSC, idleMs: 0 });
  const diag = async all => {
    const r = await callTool(lsp, "lsp_diagnostics", { file: "src/main.js", all });
    assert.equal(r.isError, false, r.content[0].text);
    return r.content[0].text;
  };
  try {
    assert.match(await diag(false), /^0 new since HEAD.*1 pre-existing hidden/);

    // Root config graph edit: excluding the script-global dependency must be
    // visible in this same persistent LSP process and disables HEAD subtraction.
    write("jsconfig.json", JSON.stringify({ extends: "./config/base,}.json", include: ["src/main.js"] }));
    let out = await diag(false);
    assert.match(out, /HEAD subtraction skipped: configuration,/);
    assert.match(out, /TS2304 Cannot find name 'Api'/);

    // Restore, then change only an extended config. `force` makes each JS file
    // a module, so Api disappears again without touching jsconfig.json itself.
    write("jsconfig.json", JSON.stringify({ extends: "./config/base,}.json", include: ["src/**/*.js"] }));
    assert.match(await diag(false), /^0 new since HEAD.*1 pre-existing hidden/);
    write("config/base,}.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "force" } }));
    out = await diag(false);
    assert.match(out, /HEAD subtraction skipped: configuration,/);
    assert.match(out, /TS2304 Cannot find name 'Api'/);

    write("config/base,}.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "legacy" } }));
    assert.match(await diag(false), /^0 new since HEAD.*1 pre-existing hidden/, "restoring the extends file recovers the cached project");
  } finally {
    lsp.stop(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("package-based extends reload and disable an unprovable HEAD baseline", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-package-config-"));
  const write = (file, text) => { const p = path.join(dir, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: dir, stdio: "ignore" });
  const packageConfig = "node_modules/@fixture/config/tsconfig.json";
  write(packageConfig, JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "legacy" } }));
  write("node_modules/@fixture/config/package.json", JSON.stringify({ name: "@fixture/config", exports: { "./tsconfig.json": "./tsconfig.json" } }));
  write("jsconfig.json", JSON.stringify({ extends: "@fixture/config/tsconfig.json", include: ["src/**/*.js"] }));
  write("src/dep.js", "const Api = { ping(x) { return x; } };\n");
  write("src/main.js", "const old = oldMissing;\nconst value = Api.ping(1);\n");
  git("init", "-q"); git("add", "-A"); git("add", "-f", "node_modules"); git("commit", "-qm", "baseline");
  const lsp = new Lsp({ root: dir, src: "src", anchor: "src/main.js", cmd: TSC, idleMs: 0 });
  const diag = async all => {
    const r = await callTool(lsp, "lsp_diagnostics", { file: "src/main.js", all });
    assert.equal(r.isError, false, r.content[0].text);
    return r.content[0].text;
  };
  try {
    assert.match(await diag(true), /^1 high-signal diagnostic/);
    assert.match(await diag(false), /HEAD subtraction skipped: configuration,/, "package config has no trustworthy per-file HEAD overlay");
    write(packageConfig, JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "force" } }));
    const out = await diag(false);
    assert.match(out, /TS2304 Cannot find name 'Api'/, "same persistent process reloads the changed package config");
    write(packageConfig, JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true, moduleDetection: "legacy" } }));
    assert.match(await diag(true), /^1 high-signal diagnostic/, "restoring package config recovers the project");
  } finally {
    lsp.stop(); fs.rmSync(dir, { recursive: true, force: true });
  }
});
