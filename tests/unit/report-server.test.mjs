import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { request } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startReportServer } from "../../tools/mcp/report-server.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixture() {
  mkdirSync(join(ROOT, "scratch"), { recursive: true });
  const root = mkdtempSync(join(ROOT, "scratch", "report-server-test-"));
  for (const dir of ["js", "tools/mcp", ".git", "artifacts/reports"])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><body>game</body>");
  writeFileSync(join(root, "js/game.js"), "window.game = true;");
  writeFileSync(join(root, "tools/mcp/apex-report.js"), "window.apexReport = true;");
  writeFileSync(join(root, ".git/config"), "private repository metadata");
  writeFileSync(join(root, "artifacts/reports/old.json"), '{"secret":true}');
  return root;
}

test("LAN report server requires its run token and serves only runtime files", async () => {
  const root = fixture();
  const token = "test-token-with-enough-entropy";
  const srv = await startReportServer({ root, host: "127.0.0.1", port: 0, token });
  try {
    assert.equal((await fetch(srv.url + "index.html")).status, 403);

    const shell = await fetch(srv.url + `?report=1&token=${encodeURIComponent(token)}`);
    assert.equal(shell.status, 200);
    const cookie = shell.headers.get("set-cookie").split(";", 1)[0];
    assert.match(cookie, /^apex26_report_token=/);

    assert.equal((await fetch(srv.url + "js/game.js", { headers: { cookie } })).status, 200);
    assert.equal((await fetch(srv.url + ".git/config", { headers: { cookie } })).status, 404);
    assert.equal((await fetch(srv.url + "artifacts/reports/old.json", { headers: { cookie } })).status, 404);
  } finally {
    await srv.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("report POSTs require auth, valid JSON, quota, and never overwrite", async () => {
  const root = fixture();
  const token = "second-test-token-with-entropy";
  const srv = await startReportServer({
    root, host: "127.0.0.1", port: 0, token, maxTotalBytes: 128,
  });
  const endpoint = srv.url + "apex-report?file=proof.json";
  const headers = {
    cookie: `apex26_report_token=${encodeURIComponent(token)}`,
    "content-type": "application/json",
  };
  try {
    assert.equal((await fetch(endpoint, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    })).status, 403);
    assert.equal((await fetch(endpoint, {
      method: "POST", headers, body: "not json",
    })).status, 400);

    const first = '{"build":1,"verdict":[]}';
    assert.equal((await fetch(endpoint, { method: "POST", headers, body: first })).status, 200);
    assert.equal(readFileSync(join(root, "artifacts/reports/proof.json"), "utf8"), first);

    assert.equal((await fetch(endpoint, {
      method: "POST", headers, body: '{"build":2,"verdict":[]}',
    })).status, 409, "a duplicate name must not erase the first report");
    assert.equal(readFileSync(join(root, "artifacts/reports/proof.json"), "utf8"), first);

    assert.equal((await fetch(srv.url + "apex-report?file=large.json", {
      method: "POST", headers, body: JSON.stringify({ data: "x".repeat(200) }),
    })).status, 413);
  } finally {
    await srv.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent report streams reserve quota before either one commits", async () => {
  const root = fixture();
  const token = "concurrent-test-token-with-entropy";
  const srv = await startReportServer({
    root, host: "127.0.0.1", port: 0, token, maxTotalBytes: 128,
  });
  const body = JSON.stringify({ data: "x".repeat(64) });
  const openPost = (name) => {
    let resolve;
    let reject;
    const response = new Promise((res, rej) => { resolve = res; reject = rej; });
    const req = request(new URL(`apex-report?file=${name}`, srv.url), {
      method: "POST",
      headers: {
        cookie: `apex26_report_token=${encodeURIComponent(token)}`,
        "content-type": "application/json",
      },
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.write(body);                  // reserve bytes, deliberately do not end yet
    return { req, response };
  };

  try {
    const first = openPost("first.json");
    // Let the first chunk reach the route while its request remains in flight.
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = openPost("second.json");
    assert.equal(await second.response, 413,
      "an in-flight report must count against the total quota");
    first.req.end();
    assert.equal(await first.response, 200);
  } finally {
    await srv.close();
    rmSync(root, { recursive: true, force: true });
  }
});
