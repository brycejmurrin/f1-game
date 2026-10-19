import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { verifyLive } from "../../tools/ci/verify-live.mjs";

const sri = (bytes) => `sha256-${createHash("sha256").update(bytes).digest("base64")}`;

async function fixtureServer(files) {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\//, "");
    const body = files.get(name);
    if (!body) { res.writeHead(404); res.end("missing"); return; }
    res.writeHead(200, { "content-type": name.endsWith(".html") ? "text/html" : "application/octet-stream" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

test("verifyLive checks secondary HTML, service worker, and every lazy integrity byte", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-live-"));
  const lazy = Buffer.from("lazy bytes");
  const index = Buffer.from(`<html><head><script type="application/json" id="apex-lazy-integrity">${JSON.stringify({ "js/core/lazy-bundles.js": sri(lazy) })}</script></head></html>`);
  const files = new Map([
    ["index.html", index], ["version.json", Buffer.from('{"build":42}\n')],
    ["sw.js", Buffer.from("service worker")], ["controller.html", Buffer.from("controller")],
    ["js/core/lazy-bundles.js", lazy],
  ]);
  for (const [name, body] of files) await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }).then(() => fs.writeFile(path.join(root, name), body));
  const { server, base } = await fixtureServer(files);
  try {
    const result = await verifyLive({ baseUrl: base, root, files: ["index.html", "version.json", "sw.js", "controller.html"] });
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.deepEqual(result.errors, []);
    assert.ok(result.checked.includes("js/core/lazy-bundles.js"));
  } finally { server.close(); }
});

test("verifyLive reports a stale lazy response with exact hashes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-live-"));
  const expected = Buffer.from("expected");
  const stale = Buffer.from("stale");
  const index = Buffer.from(`<script type="application/json" id="apex-lazy-integrity">${JSON.stringify({ "js/core/lazy-bundles.js": sri(expected) })}</script>`);
  const files = new Map([["index.html", index], ["js/core/lazy-bundles.js", stale]]);
  for (const [name, body] of files) await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }).then(() => fs.writeFile(path.join(root, name), body));
  const { server, base } = await fixtureServer(files);
  try {
    const result = await verifyLive({ baseUrl: base, root, files: ["index.html"] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("does not match shell")));
  } finally { server.close(); }
});

test("verifyLive retries transient HTTP 503 then accepts the body", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-live-"));
  const lazy = Buffer.from("lazy-ok");
  const index = Buffer.from(`<script type="application/json" id="apex-lazy-integrity">${JSON.stringify({ "js/circuits/fuji.js": sri(lazy) })}</script>`);
  await fs.mkdir(path.join(root, "js/circuits"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), index);
  await fs.writeFile(path.join(root, "js/circuits/fuji.js"), lazy);

  let hits = 0;
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\//, "");
    if (name === "js/circuits/fuji.js") {
      hits += 1;
      if (hits < 3) { res.writeHead(503); res.end("unavailable"); return; }
      res.writeHead(200); res.end(lazy); return;
    }
    if (name === "index.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(index); return; }
    res.writeHead(404); res.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const result = await verifyLive({
      baseUrl: base,
      root,
      files: ["index.html"],
      fetchOpts: { sleep: async () => {} },
    });
    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.ok(hits >= 3, `expected retries, got ${hits} hits`);
  } finally { server.close(); }
});

test("verifyLive still fails a persistent HTTP 404 without endless retry", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verify-live-"));
  const lazy = Buffer.from("missing-live");
  // Use a fixture-only relative name (not a repo path) so docs-integrity does not
  // treat the integrity key as a source comment pointing at a missing file.
  const lazyRel = "fixture-lazy-missing.bin";
  const index = Buffer.from(`<script type="application/json" id="apex-lazy-integrity">${JSON.stringify({ [lazyRel]: sri(lazy) })}</script>`);
  await fs.writeFile(path.join(root, "index.html"), index);
  await fs.writeFile(path.join(root, lazyRel), lazy);

  let hits = 0;
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\//, "");
    if (name === lazyRel) { hits += 1; res.writeHead(404); res.end("no"); return; }
    if (name === "index.html") { res.writeHead(200); res.end(index); return; }
    res.writeHead(404); res.end("missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const result = await verifyLive({
      baseUrl: base,
      root,
      files: ["index.html"],
      fetchOpts: { sleep: async () => {}, retries: 2 },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /HTTP 404/.test(error)));
    assert.equal(hits, 1, "404 must not retry like a CDN 503");
  } finally { server.close(); }
});
