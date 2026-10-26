// fleet-brief — the orchestrator hand-off as data (tools/ci/fleet-brief.mjs): queue rows, this fleet's board rows, the
// bus digest (newest GAME-SLOT, lines to the fleet), and the two caps: brief.json ≤ 2048 bytes and brief.md ≤ 40 lines,
// held under input far larger than either. Pure fixtures plus one main() run into artifacts/. No network. < 0.2 s.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { queueRows, boardRows, busDigest, fitBrief, digest, main, MAX_BYTES, MAX_LINES } from "../../tools/ci/fleet-brief.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const T = 1_792_990_000;
const bus = (type, to, text, i, from = "claude:session_01AAAAAAAAAAAAAAAAAAAAAA") => ({ sha: `${i}`.padStart(40, "a"), at: T + i * 60, type, to, from, text });
const QUEUE = JSON.stringify({ rows: [
  { pr: 3790, head: "abc1234def", state: "ci", owner: "claude:session_01OWNEROWNEROWNEROWNERO", next: "wait for the fast tier" },
  { pr: 3700, head: "", state: "merged", owner: "x", next: "-" },
  { pr: 3791, head: "", state: "queued", owner: "", next: "" },
] });
const BOARD = "noise\n" + JSON.stringify({ rows: [
  { number: 3790, fleetLetter: "B", suggest: "WAIT", why: "draft, ci in_progress" },
  { number: 3792, fleetLetter: "B", suggest: "FIX", why: "ci.yml failed on the head" },
  { number: 3793, fleetLetter: "A", suggest: "FIX", why: "not ours" },
] });

test("inputs: live queue rows only, this fleet's board rows actionable first, the bus digest for the fleet", () => {
  assert.deepEqual(queueRows(QUEUE).map((r) => [r.pr, r.st, r.head]), [[3790, "ci", "abc1234d"], [3791, "queued", ""]]);
  assert.deepEqual(queueRows(""), []);
  assert.throws(() => queueRows('{"x":1}'), /rows/);
  assert.deepEqual(boardRows(BOARD, "B").map((r) => [r.pr, r.act]), [[3792, "FIX"], [3790, "WAIT"]]);
  const d = busDigest([
    bus("GAME-SLOT", "*", "#3772 4ab25422 old", 1), bus("INFO", "A", "fleet A only", 2), bus("READY", "B", "#3790 abc1234 ready-gate 0", 3),
    bus("GAME-SLOT", "*", "#3790 abc1234 new", 4), bus("INFO", "B·X1", "to a B slot", 5), bus("LEASE", "*", "acquire", 6),
  ], "B");
  assert.equal(d.slot.text, "#3790 abc1234 new");
  assert.deepEqual(d.lines.map((l) => l.split(" ")[1]), ["GAME-SLOT", "READY", "GAME-SLOT", "INFO"], "to:B, to:B·…, to:*; no LEASE, no fleet A");
});

const huge = () => ({
  v: 1, fleet: "B", at: new Date(T * 1000).toISOString(), by: "claude:session_01AAAAAAAAAAAAAAAAAAAAAA", slot: null,
  cursor: { bus: "abc1234", tip: "def5678" },
  lanes: Array.from({ length: 60 }, (_, i) => ({ pr: 3700 + i, st: "ci", owner: `claude:session_01OWNER${i}`, head: "abcdef12", next: "x".repeat(150) })),
  board: Array.from({ length: 40 }, (_, i) => ({ pr: 3800 + i, act: "WAIT", why: "y".repeat(120) })),
  triggers: ["trig_01AAAA", "trig_01BBBB"], asks: ["Bryce: " + "z".repeat(190), "second ask"],
  bus: Array.from({ length: 6 }, (_, i) => `0${i}:00Z INFO to:B c:01AAA ${"w".repeat(70)}`), dropped: 0,
});

test("caps: an oversized brief fits 2048 bytes (bus first, then board, then texts, then lanes) and its digest fits 40 lines", () => {
  const b = fitBrief(huge());
  assert.ok(Buffer.byteLength(JSON.stringify(b)) <= MAX_BYTES, `${Buffer.byteLength(JSON.stringify(b))} B`);
  assert.equal(b.bus.length, 0, "bus lines go first");
  assert.equal(b.board.length, 0, "then board rows");
  assert.ok(b.lanes.length > 0 && b.lanes.length < 60, "then the last lanes, keeping the first");
  assert.equal(b.lanes[0].pr, 3700);
  assert.ok(b.lanes.every((r) => r.next.length <= 24), "texts were cut");
  assert.deepEqual(b.triggers, ["trig_01AAAA", "trig_01BBBB"], "trigger ids survive");
  assert.ok(b.dropped > 40, String(b.dropped));
  const md = digest(b);
  assert.ok(md.trimEnd().split("\n").length <= MAX_LINES, `${md.split("\n").length} lines`);
  assert.match(md, /item\(s\) dropped for the 2 KB cap/, "the digest says the brief was cut");
  // A brief already under the cap is untouched.
  const small = { ...huge(), lanes: [], board: [], bus: ["one line"], asks: [] };
  assert.equal(fitBrief(small).dropped, 0);
  assert.deepEqual(small.bus, ["one line"]);
  const many = digest({ ...small, bus: Array.from({ length: 80 }, (_, i) => `line ${i}`) });
  assert.equal(many.trimEnd().split("\n").length, MAX_LINES);
  assert.match(many, /- … \d+ more in brief\.json/);
});

test("main: writes brief.json and brief.md from a queue file, a saved board and saved bus entries; no live bus", () => {
  const dir = path.join(ROOT, "artifacts", `fleet-brief-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "queue.json"), QUEUE);
    fs.writeFileSync(path.join(dir, "board.json"), BOARD);
    fs.writeFileSync(path.join(dir, "bus.json"), JSON.stringify({ tip: "f".repeat(40), entries: [bus("GAME-SLOT", "*", "#3790 abc1234 slot", 1)] }));
    const out = [];
    const code = main(["--fleet", "b", "--queue", path.join(dir, "queue.json"), "--board", path.join(dir, "board.json"), "--bus-json", path.join(dir, "bus.json"),
      "--trigger", "trig_01XYZ", "--ask", "Bryce: LEND needs a GAME-SLOT?", "--out", path.join(dir, "out"), "--as", "claude:session_01NEWNEWNEWNEWNEWNEWNEWN"],
    { log: (l) => out.push(l), now: () => T * 1000, bus: () => assert.fail("--bus-json means no live read") });
    assert.equal(code, 0, out.join("\n"));
    const j = JSON.parse(fs.readFileSync(path.join(dir, "out", "brief.json"), "utf8"));
    assert.deepEqual([j.fleet, j.lanes.length, j.board.length, j.triggers[0], j.cursor.tip, j.slot.text], ["B", 2, 2, "trig_01XYZ", "fffffff", "#3790 abc1234 slot"]);
    const md = fs.readFileSync(path.join(dir, "out", "brief.md"), "utf8");
    assert.match(md, /\| #3791 \| queued \| \*\*none\*\* \|/, "an unowned lane is loud");
    assert.match(md, /#3792 FIX/);
    assert.equal(main(["--fleet", "BB"], { log: () => {} }), 1);
    assert.equal(main(["--fleet", "B", "--wat"], { log: () => {} }), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
