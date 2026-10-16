/* Two different answers must not both enter acceptAnswer. The handshake
 * awaits decode before it checks have-local-offer, so the lock has to be
 * set synchronously and a refused answer must not be blacklisted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "js/net/lobby.js"), "utf8");
const at = src.indexOf("let answerInFlight = false");
const fn = src.slice(at, src.indexOf("stopCodeWait();", at));

test("a second answer during acceptAnswer does not start another negotiation", () => {
  assert.match(fn, /let answerInFlight = false/);
  const lock = fn.indexOf("if (answerInFlight) return;");
  const arm = fn.indexOf("answerInFlight = true;");
  const seen = fn.indexOf("answersSeen.add(answer);");
  const wait = fn.indexOf("await NetHandshake.acceptAnswer");
  assert.ok(lock > 0 && arm > lock && seen > arm && wait > seen, "lock, then record, then await");
  assert.ok(fn.indexOf("answerInFlight = false;", wait) > wait);
  assert.match(fn, /answersSeen\.delete\(answer\)/);
});

// L8-a: guest 2's repost of an answer to an OLDER offer (dropped while guest 1's
// answer was in flight, re-posted after the reopen minted offer B) is refused by
// the handshake as wrong_offer. It can never become valid, so it stays SEEN and
// is not said — like guest 1's own reposts — instead of closing the room.
test("a wrong_offer answer stays blacklisted and silent", () => {
  const refused = fn.slice(fn.indexOf("if (!acc.ok) {"));
  assert.match(refused, /if \(acc\.error !== "wrong_offer"\) answersSeen\.delete\(answer\);/);
  assert.match(refused, /acc\.error !== "already_answered" && acc\.error !== "wrong_offer"\) say\(/);
  assert.ok(refused.indexOf("return;") < refused.indexOf("codeReopen = code;") || refused.indexOf("codeReopen = code;") < 0,
    "a refused answer returns before the room is closed for it");
});
