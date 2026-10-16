import test from "node:test";
import assert from "node:assert/strict";
import { ancestryVerdict, parseLiveShell, renderMarkdown } from "../../tools/ci/release-provenance.mjs";

test("release provenance parses the stamped live shell metadata", () => {
  const live = parseLiveShell(`
    <meta name="apex-sha" content="ABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD">
    <meta name="apex-build" content="16573">
    <meta name="apex-version" content="2026.10.16">
  `);
  assert.deepEqual(live, {
    sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    build: "16573",
    version: "2026.10.16",
  });
});

test("release provenance rejects an untrusted live sha", () => {
  assert.equal(parseLiveShell('<meta name="apex-sha" content="latest">').sha, null);
  assert.equal(ancestryVerdict({ sourceSha: "a", deploySha: "b", liveSha: null, mergeBase: "a" }), "live-unknown");
});

test("release provenance distinguishes exact deploy from newer source", () => {
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "deploy", mergeBase: "base" }), "live-exact-deploy");
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "source", mergeBase: "base" }), "live-exact-source");
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "base", mergeBase: "base" }), "live-at-merge-base");
});

test("release provenance markdown keeps the source/live distinction visible", () => {
  const text = renderMarkdown({ verdict: "live-exact-deploy", repository: "origin", branch: "main", sourceSha: "source", deploySha: "deploy", liveSha: "deploy", mergeBase: "base", liveBuild: "42", liveVersion: null, dirty: false, site: "https://example.test" });
  assert.match(text, /The deploy tip is live/);
  assert.match(text, /\| Source SHA \| source \|/);
  assert.match(text, /\| Live SHA \| deploy \|/);
});
