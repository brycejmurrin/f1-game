// gate-receipt merge kind: no tool can WRITE a `merge` receipt any more (review M2, 2026-10-27: `node -e` calling
// writeReceipt(…, "merge", {ok:true}) passed the hooks' merge door over the `hold` veto), while the readers still
// parse one, so an old receipt on disk is judged, not crashed on. Scratch dirs only; no network; < 0.5 s.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KINDS, WRITABLE_KINDS, writeReceipt, readReceipt, receiptPath, receiptVerdict } from "../../tools/lib/gate-receipt.mjs";

const HEAD = "c".repeat(40);

test("writeReceipt refuses the merge kind and writes nothing; ready still writes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcpt-merge-kind-"));
  try {
    assert.deepEqual([...WRITABLE_KINDS], ["ready"]);
    assert.deepEqual(KINDS, ["merge", "ready"], "readers keep both kinds");
    assert.throws(() => writeReceipt(dir, "merge", { pr: 7, head: HEAD, ok: true }, { main: null }), (e) => e.message.startsWith("no tool writes a merge receipt"));
    assert.equal(fs.existsSync(receiptPath(dir, "merge", 7)), false);
    assert.throws(() => writeReceipt(dir, "bogus", { pr: 7, ok: true }, { main: null }), (e) => e.message === "unknown receipt kind bogus");
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true }, { main: null });
    assert.equal(readReceipt(dir, "ready", 7).kind, "ready");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("readers stay tolerant: a merge receipt on disk is still read and judged by receiptVerdict", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcpt-merge-read-"));
  try {
    const now = Date.parse("2026-10-27T12:00:00Z");
    fs.mkdirSync(path.dirname(receiptPath(dir, "merge", 9)), { recursive: true });
    fs.writeFileSync(receiptPath(dir, "merge", 9), JSON.stringify({ kind: "merge", pr: 9, head: HEAD, ok: true, at: new Date(now - 60e3).toISOString() }));
    const r = readReceipt(dir, "merge", 9);
    assert.equal(r.kind, "merge");
    assert.equal(receiptVerdict(r, { kind: "merge", pr: 9, head: HEAD, now }).ok, true);
    assert.equal(receiptVerdict(r, { kind: "merge", pr: 9, head: "", now }).ok, false, "a merge still pins its head");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
