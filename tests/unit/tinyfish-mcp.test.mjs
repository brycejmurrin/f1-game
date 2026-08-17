// tinyfish-mcp.test.mjs — guards the TinyFish proxy helper + RPC unwrap.
// Does NOT hit the live TinyFish API (needs a key + network). Fixtures cover
// the nested JSON-RPC shape we measured from fetch_content / deploy-check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SH = path.join(ROOT, "tools/tinyfish-mcp.sh");
const RPC = path.join(ROOT, "tools/tinyfish-rpc.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");
const MCP_CLI = path.join(ROOT, "tools/mcp-cli.mjs");
const CD_SH = path.join(ROOT, "tools/chrome-devtools-mcp.sh");

const FIXTURE_FETCH = {
  jsonrpc: "2.0",
  id: 3,
  result: {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          results: [
            {
              url: "https://brycejmurrin.github.io/f1-game/version.json",
              text: "```\n{ \"build\": 1262 }\n```",
              format: "markdown",
            },
          ],
          errors: [],
        }),
      },
    ],
  },
};

test("tinyfish-mcp.sh and tinyfish-rpc.py exist", () => {
  assert.ok(fs.existsSync(SH));
  assert.ok(fs.existsSync(RPC));
  assert.ok(fs.statSync(SH).mode & 0o100, "tinyfish-mcp.sh should be executable");
});

test(".mcp.json wires tinyfish HTTP + chrome-devtools wrapper + probe bridge", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "chrome-devtools",
    "probe",
    "tinyfish",
  ]);
  assert.equal(cfg.mcpServers.tinyfish.url, "http://127.0.0.1:3711/mcp");
  assert.match(cfg.mcpServers["chrome-devtools"].command, /chrome-devtools-mcp\.sh$/);
  assert.deepEqual(cfg.mcpServers["chrome-devtools"].args, ["run"]);
  assert.equal(cfg.mcpServers.probe.command, "python3");
  assert.deepEqual(cfg.mcpServers.probe.args, ["tools/probe-mcp.py", "serve"]);
});

test("tinyfish-mcp.sh help lists setup / ensure / deploy-js / format", () => {
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /setup/);
  assert.match(r.stdout, /ensure/);
  assert.match(r.stdout, /deploy-check/);
  assert.match(r.stdout, /deploy-js/);
  assert.match(r.stdout, /--format/);
  assert.match(r.stdout, /version\.json/);
});

test("tinyfish-rpc live-build extracts N from nested version.json RPC", () => {
  const r = spawnSync("python3", [RPC, "live-build"], {
    encoding: "utf8",
    input: JSON.stringify(FIXTURE_FETCH),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "1262");
});

test("chrome-devtools-mcp.sh help lists clone / verify / run", () => {
  const r = spawnSync("bash", [CD_SH, "help"], { encoding: "utf8" });
  // help is the default unknown-path; script exits 1 with usage on bad cmd —
  // `status` exits 0. Usage text lives on stderr+stdout for the catch-all.
  const text = `${r.stdout}\n${r.stderr}`;
  assert.match(text, /clone/);
  assert.match(text, /verify/);
  assert.match(text, /run/);
  assert.match(text, /chrome-devtools-mcp/);
});

test("tinyfish-rpc unwrap prints version.json body text from nested RPC", () => {
  const r = spawnSync("python3", [RPC, "unwrap"], {
    encoding: "utf8",
    input: JSON.stringify(FIXTURE_FETCH),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"build":\s*1262/);
});

test("tinyfish-rpc deploy-summary reports STALE when live != local", () => {
  const r = spawnSync(
    "python3",
    [RPC, "deploy-summary", "--local-build", "1286"],
    { encoding: "utf8", input: JSON.stringify(FIXTURE_FETCH) },
  );
  assert.equal(r.status, 1, "mismatch must be non-zero");
  assert.match(r.stdout, /live=1262/);
  assert.match(r.stdout, /local=1286/);
  assert.match(r.stdout, /STALE/);
});

test("tinyfish-rpc deploy-summary reports OK when builds match", () => {
  const r = spawnSync(
    "python3",
    [RPC, "deploy-summary", "--local-build", "1262"],
    { encoding: "utf8", input: JSON.stringify(FIXTURE_FETCH) },
  );
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK/);
});

test("mcp-cli.mjs drives chrome via chrome-devtools-mcp.sh, not a hard-coded pw path", () => {
  const src = fs.readFileSync(MCP_CLI, "utf8");
  assert.match(src, /chrome-devtools-mcp\.sh/);
  assert.doesNotMatch(src, /\/opt\/pw-browsers\/chromium/);
  assert.ok(fs.existsSync(CD_SH));
});
