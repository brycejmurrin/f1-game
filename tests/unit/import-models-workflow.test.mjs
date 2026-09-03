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
  const check = shell.indexOf("node tools/gen-shell.mjs --check");
  const commit = shell.indexOf("git commit -m");
  assert.ok(changed >= 0 && check > changed && commit > check,
    "the generated shell is checked after a real model change and before the commit (no bump: the deploy stamps the generation)");
  assert.doesNotMatch(shell, /bump-cache\.mjs --apply/,
    "the bot never rewrites the committed shell; pages.yml stamps the generation at deploy");
  assert.doesNotMatch(shell, /git add index\.html version\.json/,
    "nothing in the shell changes on a model import, so nothing there is staged");
});
