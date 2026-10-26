// tools/transcripts/cli.mjs: stream search/export/digest over Grok JSONL dumps.
// Pins arg parse, match filters, digest counts, and spawn smoke against fixtures.
//
// Run: node --test tests/unit/transcripts-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import {
  parseArgs,
  run,
  matchRecord,
  createDigest,
  digestRecord,
  formatDigest,
  streamPaths,
} from "../../tools/transcripts/cli.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "tools/transcripts/cli.mjs");
const FIXTURE = path.join(ROOT, "tests/fixtures/grok-transcripts/sample.jsonl");
const BAD = path.join(ROOT, "tests/fixtures/grok-transcripts/with-bad-line.jsonl");

function capture() {
  let text = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      text += String(chunk);
      cb();
    },
  });
  return {
    stream,
    text: () => text,
  };
}

const cli = (args) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 15000,
  maxBuffer: 2 * 1024 * 1024,
});

test("parseArgs: help, search requires --query, rejects unknown flags", () => {
  assert.equal(parseArgs([]).help, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["search", FIXTURE]).error.includes("query"), true);
  assert.equal(parseArgs(["search", "--query", "x", FIXTURE]).cmd, "search");
  assert.equal(parseArgs(["search", "--query", "x", FIXTURE]).query, "x");
  assert.equal((parseArgs(["nope"]).error || "").includes("unknown command"), true);
  assert.equal((parseArgs(["search", "--nope", FIXTURE, "--query", "a"]).error || "").includes("unknown flag"), true);
});

test("matchRecord: role / type / tool / query (case-insensitive)", () => {
  const rec = {
    role: "assistant",
    message: {
      content: [
        { type: "text", text: "Hello Mom" },
        { type: "tool_use", id: "1", name: "SendToUser", input: { type: "text", content: "hi" } },
      ],
    },
  };
  assert.equal(matchRecord(rec, { role: "user" }).ok, false);
  assert.equal(matchRecord(rec, { query: "mom" }).ok, true);
  assert.equal(matchRecord(rec, { query: "mom" }).blocks[0].type, "text");
  assert.equal(matchRecord(rec, { type: "tool_use", tool: "sendtouser" }).ok, true);
  assert.equal(matchRecord(rec, { type: "thinking" }).ok, false);
  assert.equal(matchRecord(rec, { query: "sendtouser" }).ok, true);
});

test("digest counts roles/types/tools on sample fixture via stream", async () => {
  const state = createDigest();
  const stats = await streamPaths([FIXTURE], ({ record }) => digestRecord(state, record));
  state.files = stats.files;
  state.lines = stats.lines;
  state.bad = stats.bad;
  assert.equal(state.files, 1);
  assert.equal(state.lines, 12);
  assert.equal(state.bad, 0);
  assert.ok(state.roles.assistant >= 1);
  assert.ok(state.roles.tool >= 1);
  assert.ok(state.types.tool_use >= 1);
  assert.ok(state.types.tool_result >= 1);
  assert.ok(state.tools.SendToUser >= 1);
  const text = formatDigest(state);
  assert.equal(text.includes("files=1"), true);
  assert.equal(text.includes("SendToUser="), true);
});

test("run digest / search / export against fixture", async () => {
  const dOut = capture();
  const dErr = capture();
  const dCode = await run(["digest", FIXTURE], { stdout: dOut.stream, stderr: dErr.stream });
  assert.equal(dCode, 0, dErr.text());
  assert.equal(dOut.text().includes("files=1"), true);
  assert.equal(dOut.text().includes("lines=12"), true);

  const sOut = capture();
  const sErr = capture();
  const sCode = await run(["search", FIXTURE, "--query", "Mom"], {
    stdout: sOut.stream,
    stderr: sErr.stream,
  });
  assert.equal(sCode, 0, sErr.text());
  assert.equal(sOut.text().includes("Mom"), true);
  assert.equal(sOut.text().includes(":1\t"), true);

  const eOut = capture();
  const eErr = capture();
  const eCode = await run(["export", FIXTURE, "--type", "tool_use"], {
    stdout: eOut.stream,
    stderr: eErr.stream,
  });
  assert.equal(eCode, 0, eErr.text());
  const rows = eOut.text().trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    const types = (r.message.content || []).map((b) => b.type);
    assert.ok(types.includes("tool_use"), JSON.stringify(types));
  }
});

test("bad JSON lines skipped with stderr count; unreadable path exits 1", async () => {
  const out = capture();
  const err = capture();
  const code = await run(["digest", BAD], { stdout: out.stream, stderr: err.stream });
  assert.equal(code, 0);
  assert.equal(err.text().includes("bad_json_lines=1"), true);
  assert.equal(out.text().includes("lines=5"), true);
  assert.equal(out.text().includes("bad_json_lines=1"), true);

  const out2 = capture();
  const err2 = capture();
  const code2 = await run(["digest", path.join(ROOT, "tests/fixtures/grok-transcripts/missing.jsonl")], {
    stdout: out2.stream,
    stderr: err2.stream,
  });
  assert.equal(code2, 1);
  assert.equal(err2.text().includes("unreadable path"), true);
});

test("spawn: help exit 0; search --json emits NDJSON", () => {
  const help = cli(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout.includes("Usage:"), true);

  const bare = cli([]);
  assert.equal(bare.status, 0);
  assert.equal(bare.stdout.includes("Usage:"), true);

  const search = cli(["search", FIXTURE, "--query", "SendToUser", "--json"]);
  assert.equal(search.status, 0, search.stderr);
  const lines = search.stdout.trim().split("\n").filter(Boolean);
  assert.ok(lines.length >= 1);
  const row = JSON.parse(lines[0]);
  assert.ok(row.file);
  assert.ok(Number.isInteger(row.line));
  assert.ok(row.snippet || row.type);
});

test("fixture file exists and is non-empty JSONL", () => {
  const raw = fs.readFileSync(FIXTURE, "utf8").trim().split("\n");
  assert.equal(raw.length, 12);
  JSON.parse(raw[0]);
});
