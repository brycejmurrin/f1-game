// cache-bump-only — the one exemption the infra gate is allowed to make.
//
// Change-aware CI treats index.html as an infra path (its script block IS the
// load order), so touching it forces a full run. That is correct and, at file
// granularity, self-defeating: this repo's convention is that the LAST commit
// of every shippable change bumps ?v=N across index.html, so the commit that
// gets reviewed is exactly the one where selection gives up.
//
// This tool carves out the one provably-safe case. Getting it wrong SKIPS
// tests, so every test below is really asking the same question: does it stay
// conservative when the diff is anything other than a pure version rewrite?
import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../tools/cache-bump-only.mjs";

const diff = (...lines) => lines.join("\n");

test("a pure ?v bump across many tags is recognised", () => {
  const r = analyse(diff(
    `-  <script src="js/log.js?v=1025"></script>`,
    `+  <script src="js/log.js?v=1026"></script>`,
    `-  <script src="js/mat4.js?v=1025"></script>`,
    `+  <script src="js/mat4.js?v=1026"></script>`,
  ));
  assert.equal(r.pure, true);
});

test("a NEW script tag is not a bump", () => {
  // The load order changed: one added line has no removed partner.
  const r = analyse(diff(
    `-  <script src="js/log.js?v=1025"></script>`,
    `+  <script src="js/log.js?v=1026"></script>`,
    `+  <script src="js/game/hud.js?v=1026"></script>`,
  ));
  assert.equal(r.pure, false);
  assert.match(r.reason, /asymmetric/);
});

test("a REORDERED script block is not a bump, even though the lines pair up", () => {
  // The trap that would make this tool dangerous: the same set of lines on both
  // sides, so any sorted/set comparison calls it pure. Positional pairing is
  // what catches it — and reordering the script block is precisely the
  // load-order change the infra gate exists to protect.
  const r = analyse(diff(
    `-  <script src="js/log.js?v=1025"></script>`,
    `-  <script src="js/mat4.js?v=1025"></script>`,
    `+  <script src="js/mat4.js?v=1026"></script>`,
    `+  <script src="js/log.js?v=1026"></script>`,
  ));
  assert.equal(r.pure, false);
  assert.match(r.reason, /differs by more than \?v/);
});

test("a real markup edit that happens to sit beside a bump is not a bump", () => {
  const r = analyse(diff(
    `-  <dialog id="track-detail" hidden>`,
    `+  <dialog id="track-detail" aria-labelledby="x" hidden>`,
  ));
  assert.equal(r.pure, false);
});

test("a line that changed WITHOUT its ?v changing is not a bump", () => {
  // Same version, different content — an edit hiding inside a bump commit.
  const r = analyse(diff(
    `-  <script src="js/log.js?v=1026" defer></script>`,
    `+  <script src="js/log.js?v=1026"></script>`,
  ));
  assert.equal(r.pure, false);
});

test("an empty diff is NOT reported pure", () => {
  // "Nothing to classify" must not read as "safe to skip tests". The caller
  // asked because index.html was in the changed set; an empty diff means the
  // question was malformed, and the safe answer is to run everything.
  assert.equal(analyse("").pure, false);
  assert.equal(analyse("--- a/index.html\n+++ b/index.html").pure, false);
});

test("the real index.html bump in this repo's history classifies as pure", () => {
  // Anchored to a real commit rather than a hand-written fixture, so the tool
  // is checked against the shape the convention actually produces.
  const r = analyse(diff(
    `-<link rel="stylesheet" href="css/tokens.css?v=1025">`,
    `+<link rel="stylesheet" href="css/tokens.css?v=1026">`,
    `-  <script src="js/game/apex.js?v=1025"></script>`,
    `+  <script src="js/game/apex.js?v=1026"></script>`,
  ));
  assert.equal(r.pure, true);
  assert.equal(r.added, 2);
});
