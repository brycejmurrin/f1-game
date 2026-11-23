// @ts-check
// OFFLINE PRECACHE, END TO END, ON THE BYTES PAGES SHIPS (W24 row 5).
//
// tools/check/offline-precache-check.cjs installs the service worker online,
// kills the origin, and races a circuit this session never touched; a bare
// build (scenery closure never precached) is a large instanced-prop gap. It
// was called by nothing. Here it runs with --stage: the site is staged and
// stamped the way pages.yml stamps it (content-hashed ?v= keys, the lazy-hash
// map, a real build) and served under a non-loopback host, so sw.js runs its
// deployed cache-first path, not the DEV_HOST network-first one.
//
// The check launches its own Chromium (it needs two contexts and to stop the
// server mid-run), so this spec only drives it and keeps its log.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = "artifacts/offline-precache";

test("an installed worker races a never-visited circuit offline with its full scenery (stamped stage)", async () => {
  test.setTimeout(900_000);
  const out = [];
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["tools/check/offline-precache-check.cjs", "--stage"], { cwd: process.cwd() });
    child.stdout.on("data", (d) => out.push(String(d)));
    child.stderr.on("data", (d) => out.push(String(d)));
    child.on("close", (c) => resolve(c));
  });
  const log = out.join("");
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOG_DIR, "check.log"), log);
  await test.info().attach("offline-precache-check.log", { body: log, contentType: "text/plain" });
  expect(log, "the check ran against the stamped stage").toMatch(/staged \+ stamped build \d+/);
  expect(code, "offline-precache-check failures:\n" + log.split("\n").filter((l) => l.startsWith("FAIL")).join("\n")).toBe(0);
});
