// tinyfish-mcp.test.mjs — guards the TinyFish proxy helper + RPC unwrap.
// Runs in `npm run test:mcp` (the Pages gate's node suites), not tooling-fast:
// the tool is CLI-only and egress-blocked in-container, and the spawns cost
// 11 s of the edit loop. The assertions about the tools that stay on the fast
// gate (chrome-devtools-mcp.sh, mcp-cli.mjs, the MCP release pins) live in
// tests/unit/mcp-cli.test.mjs.
// Does NOT hit the live TinyFish API (needs a key + network). Fixtures cover
// the nested JSON-RPC shape we measured from fetch_content / deploy-check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

test(".mcp.json is the three-server catalog — tinyfish / probe are CLI-only now", () => {
  // 2026-09: the container egress blocks agent.tinyfish.ai, so the local
  // TinyFish proxy (and probe's tinyfish_* half) can never answer here. The
  // hosted TinyFish connector / host fetch tool in the main session can.
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
  assert.equal(cfg.mcpServers.tinyfish, undefined, "tinyfish must not be MCP-attached");
  assert.equal(cfg.mcpServers.probe, undefined, "probe must not be MCP-attached");
  assert.equal(cfg.mcpServers.playwright, undefined, "the wrapper playwright server failed to connect; playwright-official replaces it");
  assert.equal(cfg.mcpServers["chrome-devtools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["chrome-devtools"].args, ["tools/chrome-devtools-mcp.sh", "run"]);
  assert.equal(cfg.mcpServers["apex-tools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/apex-tools-mcp.sh", "serve"]);
  assert.doesNotMatch(JSON.stringify(cfg), /3711/, "no loopback TinyFish URL in the catalog");
  const sh = fs.readFileSync(SH, "utf8");
  assert.match(sh, /NOT MCP-ATTACHED/, "tinyfish-mcp.sh must say it is a CLI, not a server entry");
});

test("tinyfish-mcp.sh help lists setup / ensure / deploy-js / format", () => {
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /setup/);
  assert.match(r.stdout, /ensure/);
  assert.match(r.stdout, /deploy-check/);
  assert.match(r.stdout, /deploy-js/);
  assert.match(r.stdout, /--format/);
  assert.match(r.stdout, /--tip/);
  assert.match(r.stdout, /version\.json/);
  assert.match(r.stdout, /No tracked\s+fallback/);
  assert.match(r.stdout, /NOT attached in \.mcp\.json/);
  assert.match(r.stdout, /https:\/\/agent\.tinyfish\.ai\/home/);
});

test("no key is shipped: missing TINYFISH_API_KEY is a clear exit 1, never a fallback", () => {
  // A tracked fallback variable holding a live credential lived in this script
  // until 2026-09 and THIS test asserted it was present. Now the inverse.
  const src = fs.readFileSync(SH, "utf8");
  const credentialPrefix = "sk-" + "tinyfish-";
  const legacyFallbackName = "BAKED" + "_KEY";
  const fallbackName = "KEY_" + "FALLBACK";
  assert.ok(!src.includes(legacyFallbackName), "legacy BAKED_KEY name must stay gone");
  assert.ok(!src.includes(fallbackName), "no tracked fallback variable");
  assert.ok(!src.includes("NO_" + "FALLBACK"), "the opt-out branch went with the fallback");
  assert.ok(!src.includes(credentialPrefix), "no TinyFish credential literal in the script");
  assert.match(src, /TINYFISH_API_KEY/);
  assert.match(src, /persist_env/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-tinyfish-missing-"));
  try {
    const missingRepo = path.join(dir, "not-built");
    const noKey = spawnSync("bash", [SH, "ensure"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        TINYFISH_API_KEY: "",
        TINYFISH_MCP_REPO: missingRepo,
      },
    });
    assert.notEqual(noKey.status, 0);
    const noKeyText = `${noKey.stdout}\n${noKey.stderr}`;
    assert.match(noKeyText, /TINYFISH_API_KEY is not set/);
    assert.match(noKeyText, /NO fallback key/);
    assert.match(noKeyText, /https:\/\/agent\.tinyfish\.ai\/home/);
    assert.doesNotMatch(noKeyText, /api-keys/);
    assert.doesNotMatch(noKeyText, /Missing build/,
      "with no key the script must stop at the key check, not fall through to the repo check");

    const r = spawnSync("bash", [SH, "ensure"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        TINYFISH_API_KEY: "test-only-placeholder",
        TINYFISH_MCP_REPO: missingRepo,
      },
    });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stdout}\n${r.stderr}`, /Missing build.*run: .* setup/s);
    assert.equal(fs.existsSync(missingRepo), false,
      "ensure must not silently clone/build when its documented prerequisite is absent");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("start persists the SHELL key into the gitignored .env (and nothing when there is none)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-tinyfish-persist-"));
  try {
    const repo = path.join(dir, "fake-tinyfish");
    fs.mkdirSync(path.join(repo, "dist"), { recursive: true });
    fs.writeFileSync(path.join(repo, "dist/index.js"), "// stub\n");
    const envFile = path.join(repo, ".env");
    const none = spawnSync("bash", [SH, "start"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, TINYFISH_API_KEY: "", TINYFISH_MCP_REPO: repo },
    });
    assert.notEqual(none.status, 0);
    assert.equal(fs.existsSync(envFile), false, "no key → nothing to persist");
    const r = spawnSync("bash", [SH, "start"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        TINYFISH_API_KEY: "test-only-placeholder",
        TINYFISH_MCP_REPO: repo,
      },
    });
    assert.ok(fs.existsSync(envFile), `expected persist:\n${r.stdout}\n${r.stderr}`);
    assert.match(fs.readFileSync(envFile, "utf8"), /^TINYFISH_API_KEY=test-only-placeholder$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no TinyFish credential literal and no tracked-fallback variable anywhere under tools/ or .claude/", () => {
  // The tracked key was the one file this walk used to EXEMPT. Nothing is
  // exempt now: a credential belongs in the shell or the gitignored .env.
  const prefix = "sk-" + "tinyfish-";
  const fallbackName = "KEY_" + "FALLBACK";
  const skip = new Set(["node_modules", ".git", "scratch", "artifacts", "dist", "worktrees"]);   // .claude/worktrees/ holds transient agent checkouts of the same tree
  const hits = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(md|sh|mjs|cjs|py|json|mdc|txt|js|yml)$/.test(ent.name)) continue;
      const rel = path.relative(ROOT, p);
      const text = fs.readFileSync(p, "utf8");
      if (text.includes(prefix)) hits.push(`${rel}: credential literal`);
      if (text.includes(fallbackName)) hits.push(`${rel}: ${fallbackName}`);
    }
  }
  for (const rel of ["tools", ".claude", "tests", ".cursor", "AGENTS.md", "CLAUDE.md", ".mcp.json"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (fs.readFileSync(p, "utf8").includes(prefix)) hits.push(rel);
  }
  assert.deepEqual(hits, [], "a TinyFish credential or its tracked-fallback variable is back in the tree");
});

test("tinyfish-rpc live-build extracts N from nested version.json RPC", () => {
  const r = spawnSync("python3", [RPC, "live-build"], {
    encoding: "utf8",
    input: JSON.stringify(FIXTURE_FETCH),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "1262");
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

test("tinyfish-mcp.sh asks for a per-URL timeout budget rather than eating the default", () => {
  // fetch_content accepts per_url_timeout_ms (max 110000) and its default is
  // short enough that github.io timed out twice in one session. Asking for the
  // budget is the root-cause fix; the retry loop is the belt.
  const src = fs.readFileSync(SH, "utf8");
  assert.match(src, /FETCH_TIMEOUT_MS="60000"/);
  assert.match(src, /--timeout-ms\)/);
  assert.match(src, /per_url_timeout_ms/);
  // The version.json fetch behind deploy-check/deploy-js needs it too — that is
  // the one that actually timed out.
  assert.match(src, /version\.json.*per_url_timeout_ms/s);
  const help = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.match(help.stdout, /--timeout-ms/);
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

test("tinyfish-rpc deploy-summary --tip-build is OK when live matches tip, even if local differs", () => {
  const r = spawnSync(
    "python3",
    [RPC, "deploy-summary", "--local-build", "1286", "--tip-build", "1262"],
    { encoding: "utf8", input: JSON.stringify(FIXTURE_FETCH) },
  );
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /live=1262/);
  assert.match(r.stdout, /tip=1262/);
  assert.match(r.stdout, /local=1286/);
  assert.match(r.stdout, /OK/);
  assert.doesNotMatch(r.stdout, /STALE/);
});

test("tinyfish-rpc deploy-summary --tip-build reports STALE when live != tip", () => {
  const r = spawnSync(
    "python3",
    [RPC, "deploy-summary", "--local-build", "1262", "--tip-build", "1300"],
    { encoding: "utf8", input: JSON.stringify(FIXTURE_FETCH) },
  );
  assert.equal(r.status, 1, "tip mismatch must be non-zero");
  assert.match(r.stdout, /live=1262/);
  assert.match(r.stdout, /tip=1300/);
  assert.match(r.stdout, /STALE/);
});

test("tinyfish-mcp.sh help lists --tip for deploy-check", () => {
  const help = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--tip/);
  assert.match(help.stdout, /deploy tip|deploy-branch tip|origin\//);
  const src = fs.readFileSync(SH, "utf8");
  assert.match(src, /--tip\) FLAG_TIP=1/);
  assert.match(src, /origin\/\$\{DEPLOY_BRANCH\}:version\.json/);
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

test("deploy-check --tip does not trip set -u on an empty rest array", () => {
  const src = fs.readFileSync(SH, "utf8");
  assert.match(src, /# bash \+ set -u: empty rest\[@\] is unbound/);
  assert.match(src, /if \(\(\$\{#rest\[@\]\}\)\)/);
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
