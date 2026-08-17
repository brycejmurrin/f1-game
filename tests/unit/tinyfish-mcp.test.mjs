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

test("every mcp_post body in tinyfish-mcp.sh is valid JSON once splices are stubbed", () => {
  // cmd_search shipped with a stray trailing quote inside its single-quoted
  // JSON body ('}}}"'), so every search returned -32700 Parse error from the
  // day the command landed (measured 2026-08-17) — a defect no runtime test
  // here can see because the suite never hits the live API. Emulate the shell
  // quoting, replace each '"$var"' splice with a placeholder, and require the
  // result to parse. Vars named *_esc/*_json/*args splice WHOLE JSON values;
  // anything else (PROTO) splices into a string's interior.
  const src = fs.readFileSync(SH, "utf8");
  const lines = src.split("\n").filter((l) => l.includes("mcp_post '"));
  assert.ok(lines.length >= 5, `expected the known mcp_post call sites, got ${lines.length}`);
  for (const line of lines) {
    const s = line.slice(line.indexOf("mcp_post ") + "mcp_post ".length);
    let body = "";
    let inQ = false;
    let done = false;
    for (let j = 0; j < s.length && !done; j++) {
      const c = s[j];
      if (c === "'") { inQ = !inQ; continue; }
      if (inQ) { body += c; continue; }
      if (c === '"') continue; // the wrapper quotes of a '"$var"' splice
      if (c === "$") {
        const m = s.slice(j).match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/);
        if (m) {
          body += /(_esc|_json|args)$/.test(m[1]) ? '"x"' : "x";
          j += m[0].length - 1;
          continue;
        }
      }
      done = true; // left the quoted body — `)`, space, positional arg
    }
    assert.doesNotThrow(
      () => JSON.parse(body),
      `mcp_post body is not valid JSON in: ${line.trim()}\n→ ${body}`,
    );
  }
});

test("tinyfish-rpc unwrap renders search rows (title + url + snippet, not bare URLs)", () => {
  // Search rows are {position, site_name, snippet, title, url} with NO text
  // field — the text-only unwrap printed every result as a naked URL.
  const fixture = {
    jsonrpc: "2.0",
    id: 4,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query: "monza",
            results: [
              {
                position: 1,
                site_name: "en.wikipedia.org",
                snippet: "The Monza Circuit is a 5.793 km race track.",
                title: "Monza Circuit - Wikipedia",
                url: "https://en.wikipedia.org/wiki/Monza_Circuit",
              },
            ],
            total_results: 1,
            page: 1,
          }),
        },
      ],
    },
  };
  const r = spawnSync("python3", [RPC, "unwrap"], {
    encoding: "utf8",
    input: JSON.stringify(fixture),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[1\] Monza Circuit - Wikipedia/);
  assert.match(r.stdout, /https:\/\/en\.wikipedia\.org\/wiki\/Monza_Circuit/);
  assert.match(r.stdout, /5\.793 km/);
});

test("mcp-cli.mjs drives chrome via chrome-devtools-mcp.sh, not a hard-coded pw path", () => {
  const src = fs.readFileSync(MCP_CLI, "utf8");
  assert.match(src, /chrome-devtools-mcp\.sh/);
  assert.doesNotMatch(src, /\/opt\/pw-browsers\/chromium/);
  assert.ok(fs.existsSync(CD_SH));
});
