// apex-tools-mcp-agents.test.mjs — apex-tools MCP (local CLI wrap): the vendor-read wraps apex_claude_agents and apex_cursor_agents.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, MCP, rpc, callCli } from "../helpers/apex-tools-mcp.mjs";

const AID = "bc-11111111-2222-3333-4444-555555555555";
const cursorBody = (r) => JSON.parse(r.stdout);
const cursorArgv = (args) => {
  const r = callCli("apex_cursor_agents", { ...args, dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  return cursorBody(r).argv.slice(2).map(String);
};
const cursorBad = (args) => {
  const r = callCli("apex_cursor_agents", { ...args, dryRun: true });
  assert.equal(cursorBody(r).error, "bad_args", JSON.stringify(args));
  return cursorBody(r);
};

test("apex_claude_agents is reads only: discovery, mock list and the retired send/read verbs refused", () => {
  const tool = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools.find((t) => t.name === "apex_claude_agents");
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["verb", "id", "options", "dryRun"]);
  assert.ok(Buffer.byteLength(JSON.stringify(tool)) < 800);
  assert.deepEqual(tool.annotations, { title: "Apex 26 · claude agents", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  const result = rpc([{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_claude_agents", arguments: { verb: "list" } } }])[0].result;
  assert.equal(result.structuredContent.dryRun, true, "mock mode answers without the CLI");
  assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
  // 2026-11-03: followup / remember / transcript left; a caller gets the reason, never a send.
  for (const verb of ["followup", "remember", "transcript"]) {
    const gone = JSON.parse(callCli("apex_claude_agents", { verb, id: "cse_contract123", options: { text: "never send" } }).stdout);
    assert.equal(gone.error, "unsupported_verb", verb);
    assert.match(gone.message, /2026-11-03/, verb);
    assert.ok(!JSON.stringify(gone).includes("never send"), verb);
  }
  const refused = JSON.parse(callCli("apex_claude_agents", { verb: "launch" }).stdout);
  assert.equal(refused.error, "unsupported_verb");
});

test("apex_cursor_agents publishes four properties and stays inside the tools/list byte budget", () => {
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result;
  const t = listed.tools.find((x) => x.name === "apex_cursor_agents");
  assert.deepEqual(Object.keys(t.inputSchema.properties), ["verb", "id", "options", "dryRun"]);
  assert.deepEqual(t.inputSchema.required, ["verb"]);
  // The server publishes additionalProperties:false for every tool, so an unknown top-level key is refused generically.
  assert.equal(t.inputSchema.additionalProperties, false);
  // The verb list is not an enum here: an enum costs bytes in every tools/list. The builder rejects an unknown verb with the full list.
  assert.equal(t.inputSchema.properties.verb.enum, undefined);
  // The listing is paid on every session start: every byte this tool adds has to fit under the same cap as the rest,
  // so the per-verb options live in the description apex_help returns, not in the published schema.
  // 800 -> 900 (2026-10-30): descriptions keep up to 360 chars, not 60, since a deferred client pays them per loaded tool.
  assert.ok(Buffer.byteLength(JSON.stringify(t)) < 900, `the entry is ${Buffer.byteLength(JSON.stringify(t))} bytes`);
  const help = rpc([{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_help", arguments: { tool: "apex_cursor_agents" } } }])[0].result.structuredContent;
  for (const needle of ["READS ONLY", "Verbs: list, status, wait (≤ 50 s a call; call again), usage, artifacts, artifact, transcript, call, digest, allowed", "launch, followup, cancel, archive and delete are refused here", "transcript: run, all", "never instructions"]) assert.ok(help.description.includes(needle), needle);
  assert.ok(!/launch: prompt|options\.confirm|envNames/.test(help.description), "no write-verb options survive in the help text");
  assert.ok(!listed.tools.some((x) => x.name === "apex_cursor_agents" && /createPr|envFile/.test(JSON.stringify(x.inputSchema))));
});

test("apex_cursor_agents maps each verb to cursor-agents.mjs argv", () => {
  assert.deepEqual(cursorArgv({ verb: "list" }), ["list", "--limit", "20"]);
  assert.deepEqual(cursorArgv({ verb: "list", options: { limit: 130, pr: "https://github.com/o/r/pull/9", includeArchived: true } }), ["list", "--limit", "130", "--pr", "https://github.com/o/r/pull/9", "--include-archived"]);
  assert.deepEqual(cursorArgv({ verb: "status", id: AID }), ["status", AID]);
  assert.deepEqual(cursorArgv({ verb: "wait", id: AID }), ["wait", AID, "--timeout", "40", "--interval", "5"]);
  assert.deepEqual(cursorArgv({ verb: "wait", id: AID, options: { timeoutS: 12 } }).slice(2, 4), ["--timeout", "12"]);
  assert.deepEqual(cursorArgv({ verb: "artifact", id: AID, options: { path: "artifacts/a.md" } }), ["artifact", AID, "artifacts/a.md"]);
  assert.deepEqual(cursorArgv({ verb: "transcript", id: AID, options: { run: "000000b2", only: ["tools", "errors"], tool: "task", grep: "ERR", results: true, summary: true, width: 90, noFetch: true } }),
    ["transcript", AID, "--run", "000000b2", "--no-fetch", "--only", "tools,errors", "--tool", "task", "--grep", "ERR", "--results", "--summary", "--width", "90"]);
  assert.deepEqual(cursorArgv({ verb: "transcript", id: AID, options: { all: true, json: true } }), ["transcript", AID, "--all", "--json"]);
  // call: the ref is the second positional, straight after the id
  assert.deepEqual(cursorArgv({ verb: "call", id: AID, options: { ref: "4b8dc871#2", max: 500, noFetch: true } }), ["call", AID, "4b8dc871#2", "--no-fetch", "--max", "500"]);
  assert.deepEqual(cursorArgv({ verb: "digest" }), ["digest"]);
  assert.deepEqual(cursorArgv({ verb: "allowed" }), ["allowed"]);
});

test("apex_cursor_agents refuses what must never reach the CLI, including every write verb (2026-11-03)", () => {
  const msg = (args) => cursorBad(args).message;
  assert.ok(/verb must be one of list, status, wait, usage, artifacts, artifact, transcript, call, digest, allowed \(/.test(msg({ verb: "nope" })));
  assert.ok(/needs id = a bc-<uuid>/.test(msg({ verb: "status" })));
  assert.ok(/id may not start|needs id/.test(msg({ verb: "status", id: "--help" })));
  assert.ok(/needs id = a bc-<uuid>/.test(msg({ verb: "status", id: "bc-nothex" })));
  // the write verbs: no agent session starts, steers or erases a Cursor agent through Bryce's login — the CLI keeps them for him
  for (const [verb, extra] of [["launch", { options: { prompt: "do it" } }], ["followup", { id: AID, options: { text: "go" } }], ["cancel", { id: AID, options: { confirm: AID } }], ["archive", { id: AID }], ["delete", { id: AID, options: { confirm: AID } }]]) {
    const r = cursorBad({ verb, ...extra });
    assert.match(r.message, new RegExp(`^${verb} is not an MCP verb`), verb);
    assert.match(r.fix, /Reads only here/, verb);
  }
  const src = fs.readFileSync(MCP, "utf8");
  assert.ok(!/LAUNCH_ENV_ALLOW|--prompt-file|--text-file|--allow-twin/.test(src), "no launch/followup argv builder survives in the server");
  assert.ok(/launch|followup|cancel|archive|delete/.test(fs.readFileSync(path.join(ROOT, "tools/ci/cursor-agents.mjs"), "utf8")), "the CLI keeps its write subcommands");
  assert.ok(/unknown option limit for status/.test(msg({ verb: "status", id: AID, options: { limit: 3 } })));
  assert.ok(/artifacts\/\.\.\. path/.test(msg({ verb: "artifact", id: AID, options: { path: "../etc/passwd" } })));
  assert.ok(/artifacts\/\.\.\. path/.test(msg({ verb: "artifact", id: AID, options: { path: "artifacts/../x" } })));
  assert.ok(/timeoutS must be 1\.\.50/.test(msg({ verb: "wait", id: AID, options: { timeoutS: 51 } })));
  assert.ok(/ref is not valid/.test(msg({ verb: "call", id: AID, options: {} })));
  assert.ok(/ref is not valid/.test(msg({ verb: "call", id: AID, options: { ref: "x y" } })));
  assert.ok(/max must be 100\.\.20000/.test(msg({ verb: "call", id: AID, options: { ref: "a", max: 50 } })));
  assert.ok(/only must be a non-empty array/.test(msg({ verb: "transcript", id: AID, options: { only: ["nope"] } })));
  assert.ok(/width must be 20\.\.1000/.test(msg({ verb: "transcript", id: AID, options: { width: 5 } })));
  assert.ok(/limit must be 1\.\.200/.test(msg({ verb: "list", options: { limit: 500 } })));
  assert.ok(/options must be (an )?object/.test(msg({ verb: "list", options: "x" })));
  // an unknown TOP-level key is refused by the server's generic validation, with a hint
  const top = cursorBody(callCli("apex_cursor_agents", { verb: "digest", confirm: AID }));
  assert.equal(top.error, "bad_args");
  assert.ok(/unknown argument confirm/.test(top.message));
  assert.ok(/Valid: verb, id, options, dryRun/.test(top.fix));
  assert.ok(/Did you mean "options"\?/.test(cursorBody(callCli("apex_cursor_agents", { verb: "digest", option: {} })).fix));
});

test("withCursorVerdict turns the CLI's typed lines and exit codes into verdicts; only exit 0 is ok", async () => {
  const { withCursorVerdict } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const run = (body) => withCursorVerdict(Promise.resolve({ content: [{ type: "text", text: JSON.stringify({ ok: true, argv: [], stderr: "", durationMs: 1, out: null, ...body }) }] }));
  const out = async (body) => {
    const r = await run(body);
    return { r, b: JSON.parse(r.content[0].text) };
  };
  let { r, b } = await out({ exit: 0, stdout: `LAUNCH ${AID} run=run-1 model=composer-2.5\n` });
  assert.equal(b.ok, true);
  assert.equal(r.isError, undefined);
  assert.deepEqual(b.out, { verdict: "LAUNCH", lines: [`LAUNCH ${AID} run=run-1 model=composer-2.5`] });
  assert.equal(b.stdout, "");
  for (const [exit, line, error, fix] of [
    [1, `BUSY ${AID} a run is already active`, "busy", /IDLE/],
    [1, `NOT_CANCELLABLE ${AID} run=r (already finished)`, "not_cancellable", /already finished/],
    [1, "ERROR /v1/agents/x: HTTP 404", "cli_error", /message/],
    [2, "BLOCKED no CURSOR_API_KEY in the environment", "no_key", /never in Cursor environment secrets/],
    [3, `REFUSED ${AID} was not launched by this tool`, "refused", /launched by this tool/],
    [3, `TWIN ${AID} IDLE "n" already exists`, "twin", /allowTwin/],
    [124, `WAIT ${AID} TIMEOUT after=40s`, "still_running", /call wait again/i],
  ]) {
    ({ r, b } = await out({ exit, stdout: `${line}\n` }));
    assert.equal(b.ok, false, line);
    assert.equal(b.error, error, line);
    assert.equal(r.isError, true, line);
    assert.equal(b.message, line);
    assert.ok(fix.test(b.fix), line);
    assert.equal(b.out.verdict, line.split(" ")[0]);
  }
  // a JSON verb (transcript --json) keeps its parsed document and gains the verdict slot
  ({ b } = await out({ exit: 0, stdout: "", out: { agent: AID, rows: [{ kind: "run" }] } }));
  assert.deepEqual(b.out, { verdict: null, agent: AID, rows: [{ kind: "run" }] });
  // a spawn failure or timeout classified by runSpawn passes through untouched
  ({ b } = await out({ ok: false, error: "timeout", message: "stopped after 75 s", exit: 1, stdout: "partial" }));
  assert.equal(b.error, "timeout");
  assert.equal(b.stdout, "partial");
});

test("apex_cursor_agents is read-only and open-world (reads of a remote API), and runs nothing in mock mode", () => {
  const r = callCli("apex_cursor_agents", { verb: "list" });
  assert.equal(r.status, 0, r.stderr);
  const body = cursorBody(r);
  assert.equal(body.ok, true);
  assert.equal(body.mock, true, "mock mode answers without spawning the CLI or touching the network");
  const src = fs.readFileSync(MCP, "utf8");
  assert.ok(/name: "apex_cursor_agents",\s*week: 6,\s*kind: "tree"/.test(src), "no browser lock");
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools.find((t) => t.name === "apex_cursor_agents");
  assert.deepEqual(listed.annotations, { title: "Apex 26 · cursor agents", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
});

test("the apex_cursor_agents pin refuses --wait, dump, a verb outside the catalog and any other script", async () => {
  const { pinOk } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const ok = ["/usr/bin/node", "/repo/tools/ci/cursor-agents.mjs", "list", "--limit", "5"];
  assert.equal(pinOk("apex_cursor_agents", ok), null);
  for (const argv of [
    [...ok, "--wait"],
    ["/usr/bin/node", "/repo/tools/ci/cursor-agents.mjs", "dump", AID],
    ["/usr/bin/node", "/repo/tools/ci/cursor-agents.mjs", "rm-rf", AID],
    ["/usr/bin/node", "/repo/tools/ci/other.mjs", "list"],
  ]) {
    const r = pinOk("apex_cursor_agents", argv);
    assert.equal(JSON.parse(r.content[0].text).error, "pin_violated", argv.join(" "));
  }
});
