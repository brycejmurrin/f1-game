// github-api — the shared GET-only GitHub REST helper (extracted from the retired ready-full-cap, #3013).
import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../../tools/ci/github-api.mjs";

test("api() reads past spawnSync's 1 MB default (ENOBUFS on 100 open PRs, 2026-10-14)", () => {
  let opts;
  const run = (_c, _a, o) => { opts = o; return { status: 0, stdout: "{}\n200", stderr: "" }; };
  api("pulls", { run, env: { GH_TOKEN: "t" } });
  assert.ok(opts.maxBuffer >= 16 << 20, `maxBuffer ${opts.maxBuffer} — a page of PR JSON exceeds 1 MB`);
  const failed = api("pulls", { run: () => ({ status: null, stdout: "", stderr: "", error: { code: "ENOBUFS" } }), env: { GH_TOKEN: "t" } });
  assert.match(failed.error, /ENOBUFS/, "a spawn error is named, not reported as a bare curl failure");
});
