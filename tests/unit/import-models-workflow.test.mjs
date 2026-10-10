import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/import-models.yml"), "utf8");

function executableShell() {
  const lines = workflow.split("\n");
  const scripts = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/^(\s*)run:\s*\|\s*$/);
    if (!start) continue;
    const indent = start[1].length;
    const body = [];
    for (i++; i < lines.length; i++) {
      const lineIndent = lines[i].match(/^(\s*)/)[1].length;
      if (lines[i].trim() && lineIndent <= indent) {
        i--;
        break;
      }
      body.push(lines[i]);
    }
    scripts.push(body.join("\n"));
  }
  return scripts.join("\n");
}

test("dispatch inputs enter shell only through environment variables", () => {
  for (const mapping of [
    "MODEL_URL: ${{ inputs.url }}",
    "MODEL_MAT: ${{ inputs.mat }}",
    "MODEL_HEIGHT: ${{ inputs.height }}",
    "MODEL_PREFIX: ${{ inputs.prefix }}",
    "MODEL_AUTHOR: ${{ inputs.author }}",
    "COMMIT_BRANCH: ${{ inputs.commit_branch }}",
  ]) {
    assert.match(workflow, new RegExp(`^\\s+${mapping.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
      `missing step-level environment mapping: ${mapping}`);
  }
  assert.doesNotMatch(executableShell(), /\${{\s*inputs\./,
    "workflow-dispatch expressions must never be expanded into executable shell");
});

test("the download step accepts only a quoted HTTPS URL", () => {
  assert.match(workflow, /case "\$MODEL_URL" in/);
  assert.match(workflow, /https:\/\/\*\)/);
  assert.match(workflow, /curl [^\n]* -- "\$MODEL_URL"/);
});

test("the commit step validates and quotes a non-deploy branch", () => {
  assert.match(workflow, /case "\$COMMIT_BRANCH" in/);
  assert.match(workflow, /claude\/f1-game-project-26h3ng\|""\|\[!a-z0-9\]\*\|\*\[!a-z0-9\._\/-\]\*/);
  assert.match(workflow, /git check-ref-format --branch "\$COMMIT_BRANCH"/);
  assert.match(workflow, /git checkout -B "\$COMMIT_BRANCH"/);
  assert.doesNotMatch(workflow, /git checkout -B "\${{\s*inputs\.commit_branch\s*}}"/);
});

test("model imports check the generated shell and commit without a bump", () => {
  const shell = executableShell();
  const changed = shell.indexOf("git diff --cached --quiet");
  const check = shell.indexOf("node tools/gen/gen-shell.mjs --check");
  const commit = shell.indexOf("git commit -m");
  assert.ok(changed >= 0 && check > changed && commit > check,
    "the generated shell is checked after a real model change and before the commit (no bump: the deploy stamps the generation)");
  assert.doesNotMatch(shell, /bump-cache\.mjs --apply/,
    "the bot never rewrites the committed shell; pages.yml stamps the generation at deploy");
  assert.doesNotMatch(shell, /git add index\.html version\.json/,
    "nothing in the shell changes on a model import, so nothing there is staged");
});

test("15-F9: the bot never force-pushes a branch it did not create", async () => {
  const cp = await import("node:child_process");
  const os = await import("node:os");
  const guard = /# BEGIN force-push guard[^\n]*\n([\s\S]*?)\n\s*# END force-push guard/.exec(workflow)?.[1]
    .replace(/^ {10}/gm, "");
  assert.ok(guard, "the force-push guard is present in the commit step");
  assert.doesNotMatch(workflow, /git push -f\b|git push --force(?!-with-lease)/, "no unconditional force push");
  assert.match(workflow, /git push \$\{PUSH_LEASE:\+"\$PUSH_LEASE"\} origin "\$COMMIT_BRANCH"/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-models-guard-"));
  const sh = (cwd, ...a) => cp.execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    const origin = path.join(dir, "origin.git"), work = path.join(dir, "work");
    cp.execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    sh(dir, "clone", "-q", origin, work);
    sh(work, "config", "user.email", "t@t");
    const commitAs = (name, branch) => {
      sh(work, "config", "user.name", name);
      sh(work, "checkout", "-q", "-B", branch);
      fs.writeFileSync(path.join(work, `${branch.replace(/\//g, "_")}.txt`), name);
      sh(work, "add", "-A"); sh(work, "commit", "-qm", `by ${name}`);
      sh(work, "push", "-q", "origin", branch);
    };
    commitAs("a human", "main");
    commitAs("a human", "cursor/someone-elses-live-head");
    commitAs("apex-model-bot", "bot/model-import");
    sh(work, "checkout", "-q", "main");
    const run = (branch) => cp.spawnSync("bash", ["-c", `set -euo pipefail\n${guard}\necho "LEASE=\${PUSH_LEASE}"`],
      { cwd: work, encoding: "utf8", env: { ...process.env, COMMIT_BRANCH: branch } });

    const live = run("cursor/someone-elses-live-head");
    assert.equal(live.status, 2, "another session's branch is refused");
    assert.match(live.stdout, /refusing to overwrite/);
    assert.equal(run("main").status, 2, "the repository default branch is refused");

    const fresh = run("bot/brand-new");
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.match(fresh.stdout, /LEASE=\n/, "a new branch is pushed plainly, no force at all");

    const mine = run("bot/model-import");
    assert.equal(mine.status, 0, mine.stderr);
    const tip = sh(origin, "rev-parse", "bot/model-import");
    assert.match(mine.stdout, new RegExp(`LEASE=--force-with-lease=bot/model-import:${tip}`), "the bot's own branch is replaced under a lease on its tip");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
