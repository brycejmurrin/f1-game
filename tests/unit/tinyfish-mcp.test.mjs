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

// A TinyFish upstream timeout is a SUCCESSFUL JSON-RPC result carrying an
// errors[] payload — measured 2026-08-17, two consecutive version.json fetches,
// one timeout and one clean, nothing changed between them. Reporting that as
// "could not parse" points the reader at our regex; reporting it as STALE would
// be worse, because deploy-check is a gate. Exit 3 means "transient, retry".
const FIXTURE_TIMEOUT = {
  jsonrpc: "2.0",
  id: 3,
  result: { content: [{ type: "text", text: JSON.stringify({
    results: [],
    errors: [{ url: "https://brycejmurrin.github.io/f1-game/version.json", error: "timeout" }],
  }, null, 2) }] },
};

test("tinyfish-rpc calls an upstream timeout transient (exit 3), not a parse failure", () => {
  for (const cmd of [["live-build"], ["deploy-summary", "--local-build", "1293"]]) {
    const r = spawnSync("python3", [RPC, ...cmd], {
      encoding: "utf8", input: JSON.stringify(FIXTURE_TIMEOUT),
    });
    assert.equal(r.status, 3, `${cmd[0]}: transient must be its own exit code, got ${r.status}`);
    assert.match(r.stderr, /timeout/, cmd[0]);
    assert.match(r.stderr, /retry/, cmd[0]);
    assert.doesNotMatch(r.stdout, /STALE/, `${cmd[0]}: a blip must never read as a stale deploy`);
  }
});

test("tinyfish-rpc still reports a genuine parse failure as exit 2", () => {
  const junk = { jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "no build here" }] } };
  const r = spawnSync("python3", [RPC, "live-build"], {
    encoding: "utf8", input: JSON.stringify(junk),
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /could not parse/);
});

test("tinyfish-mcp.sh retries the live-build fetch and says the body is capped", () => {
  const src = fs.readFileSync(SH, "utf8");
  // The retry loop exists and is bounded (a gate that hangs is its own bug).
  assert.match(src, /fetch_live_build\(\) \{/);
  assert.match(src, /for attempt in 1 2 3/);
  assert.match(src, /rc" -ne 3/, "only the transient exit code may be retried");
  // deploy-js --marker: a verdict plus the cap caveat, so ABSENT cannot be
  // misread as "the fix did not ship" when the marker is simply past the cap.
  assert.match(src, /--marker\)/);
  assert.match(src, /MARKER PRESENT/);
  assert.match(src, /MARKER ABSENT/);
  assert.match(src, /NOT a verdict on the deployed file/);
  const help = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.match(help.stdout, /BODY IS TRUNCATED/, "the limit belongs in help, not just in a comment");
  assert.match(help.stdout, /--marker/);
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

test("every JSON-RPC body the helper builds is valid JSON", () => {
  // A stray `"` at the end of the hand-pasted search body made EVERY search a
  // -32700 Parse error while init/fetch stayed green, so the helper looked
  // healthy. Extract each literal body and parse it with the shell placeholders
  // filled in.
  const src = fs.readFileSync(SH, "utf8");
  const bodies = src.match(/\{"jsonrpc":"2\.0"[^\n]*/g) || [];
  assert.ok(bodies.length >= 3, `expected several RPC bodies, found ${bodies.length}`);
  for (const raw of bodies) {
    // Trim the shell assignment tail, then substitute each interpolation:
    // one already inside quotes becomes a bare token, one standing where a whole
    // value goes becomes an empty object.
    // Substitute interpolations FIRST (they consume their own quotes), then cut
    // the shell tail at the single quote that closes the literal. A body built
    // inside python (json.dumps) carries python expressions where values go —
    // stand those in too, so its structure is checked the same way.
    const body = raw
      .replace(/(")?'"\$(?:\{[^}]+\}|\w+)"'/g, (_m, quoted) => (quoted ? '"X' : "{}"))
      .replace(/sys\.argv\[\d+\]/g, '"X"')
      .split("'")[0]
      .replace(/\)+\s*$/, "");
    assert.doesNotThrow(() => JSON.parse(body),
      `helper builds invalid JSON-RPC: ${body}`);
  }
});

test("tinyfish-rpc unwrap renders SEARCH rows (title + snippet), not bare URLs", () => {
  // search rows carry title/snippet/url and NO `text`, so the shared unwrap used
  // to print only the URL heading — the snippets are the whole value of a search.
  const searchRpc = {
    jsonrpc: "2.0",
    id: 4,
    result: {
      content: [{
        type: "text",
        text: JSON.stringify({
          query: "webgpu maxAnisotropy",
          results: [{
            position: 1,
            url: "https://www.w3.org/TR/webgpu/",
            title: "WebGPU - W3C",
            site_name: "www.w3.org",
            date: "5 days ago",
            snippet: "Anisotropic filtering is enabled when maxAnisotropy is > 1.",
          }],
        }),
      }],
    },
  };
  const r = spawnSync("python3", [RPC, "unwrap"], {
    encoding: "utf8",
    input: JSON.stringify(searchRpc),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /WebGPU - W3C/);
  assert.match(r.stdout, /Anisotropic filtering is enabled/);
  assert.match(r.stdout, /www\.w3\.org/);
});

test("mcp-cli.mjs drives chrome via chrome-devtools-mcp.sh, not a hard-coded pw path", () => {
  const src = fs.readFileSync(MCP_CLI, "utf8");
  assert.match(src, /chrome-devtools-mcp\.sh/);
  assert.doesNotMatch(src, /\/opt\/pw-browsers\/chromium/);
  assert.ok(fs.existsSync(CD_SH));
});
