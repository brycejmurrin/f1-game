// launch-steward — full Cloud Agent onto an existing PR head; never a Task child.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_URL, API_URL, MODEL_ID, prUrl, buildPayload, parseArgs, postAgent,
} from "../../tools/ci/launch-steward.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = path.join(ROOT, "tools/ci/launch-steward.mjs");
const PROMPT = [
  "OWNED: js/ui/**",
  "FORBIDDEN: js/game.js",
  "Do not merge.",
  "Do not disable squash auto-merge if it is already armed.",
].join("\n");

test("constants pin the ship repo, create URL, and Auto model", () => {
  assert.equal(REPO_URL, "https://github.com/brycejmurrin/f1-game");
  assert.equal(API_URL, "https://api.cursor.com/v1/agents");
  assert.equal(MODEL_ID, "default");
  assert.equal(prUrl(1024), "https://github.com/brycejmurrin/f1-game/pull/1024");
});

test("buildPayload attaches to the existing PR head (not a Task fork)", () => {
  const p = buildPayload({ pr: 1024, prompt: PROMPT, name: "Steward HUD #1024" });
  assert.equal(p.workOnCurrentBranch, true);
  assert.equal(p.autoCreatePR, false);
  assert.deepEqual(p.model, { id: "default" });
  assert.equal(p.name, "Steward HUD #1024");
  assert.deepEqual(p.repos, [{
    url: REPO_URL,
    prUrl: "https://github.com/brycejmurrin/f1-game/pull/1024",
  }]);
  assert.match(p.prompt.text, /Do not merge/);
  assert.match(p.prompt.text, /full Cursor Cloud Agent/);
  assert.match(p.prompt.text, /subscribe_github_pr/);
  assert.match(p.prompt.text, /subscribe_github_ci/);
  assert.match(p.prompt.text, /not a Task subagent/);
});

test("buildPayload refuses a missing PR, empty prompt, or missing Do not merge", () => {
  assert.throws(() => buildPayload({ prompt: PROMPT }), /need --pr/);
  assert.throws(() => buildPayload({ pr: 0, prompt: PROMPT }), /need --pr/);
  assert.throws(() => buildPayload({ pr: 12, prompt: "  " }), /need --prompt/);
  assert.throws(
    () => buildPayload({ pr: 12, prompt: "OWNED: js/**\nStay on the branch." }),
    /Do not merge/,
  );
});

test("parseArgs reads --pr / --prompt / --dry-run / --name", () => {
  const a = parseArgs(["--pr", "1012", "--prompt", PROMPT, "--dry-run", "--name", "X"]);
  assert.equal(a.pr, "1012");
  assert.equal(a.prompt, PROMPT);
  assert.equal(a.dryRun, true);
  assert.equal(a.name, "X");
});

test("CLI --dry-run prints the payload and does not need CURSOR_API_KEY", () => {
  const out = execFileSync(process.execPath, [
    TOOL, "--pr", "1101", "--prompt", PROMPT, "--dry-run",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, CURSOR_API_KEY: "" },
  });
  const json = JSON.parse(out);
  assert.equal(json.workOnCurrentBranch, true);
  assert.equal(json.autoCreatePR, false);
  assert.equal(json.repos[0].prUrl, "https://github.com/brycejmurrin/f1-game/pull/1101");
  assert.equal(json.model.id, "default");
});

test("CLI --help exits 0 and names the Cloud Agents attach", () => {
  const out = execFileSync(process.execPath, [TOOL, "--help"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.match(out, /workOnCurrentBranch/);
  assert.match(out, /Do not use Task environment:cloud/);
});

test("postAgent Basic-auths CURSOR_API_KEY and POSTs the payload", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "bc-test", target: { url: "https://cursor.com/agents/bc-test" } }),
    };
  };
  const payload = buildPayload({ pr: 7, prompt: PROMPT });
  const json = await postAgent(payload, { fetchImpl, apiKey: "secret-key", apiUrl: "https://example.test/v1/agents" });
  assert.equal(json.id, "bc-test");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/v1/agents");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  const expected = "Basic " + Buffer.from("secret-key:").toString("base64");
  assert.equal(calls[0].opts.headers.Authorization, expected);
  assert.deepEqual(JSON.parse(calls[0].opts.body), payload);
});

test("postAgent refuses a missing key and surfaces a non-OK body", async () => {
  await assert.rejects(() => postAgent({}, {}), /CURSOR_API_KEY/);
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "nope" });
  await assert.rejects(
    () => postAgent({}, { fetchImpl, apiKey: "x" }),
    /Cloud Agents API 401/,
  );
});

test("steward + launch skills name launch-steward.mjs and ban Task cloud", () => {
  const steward = fs.readFileSync(path.join(ROOT, ".claude/skills/steward/SKILL.md"), "utf8");
  const launch = fs.readFileSync(
    path.join(ROOT, "cursor-plugins/apex-f1-game/skills/apex-cloud-agent-launch/SKILL.md"),
    "utf8",
  );
  for (const [name, text] of [["steward", steward], ["apex-cloud-agent-launch", launch]]) {
    assert.match(text, /launch-steward\.mjs/, `${name} must name the full-agent launcher`);
    assert.match(text, /workOnCurrentBranch/, `${name} must pin workOnCurrentBranch`);
    assert.doesNotMatch(
      text,
      /Pass `cloud_base_branch`/,
      `${name} must not tell coordinators to launch Task children via cloud_base_branch`,
    );
  }
  assert.match(steward, /subscribe_github_pr/);
  assert.match(launch, /subscribe_github_pr/);
  assert.match(steward, /Do not merge/);
});
