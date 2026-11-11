// tools/ui/flows.mjs pure parts: flag parsing, evidence → row classification, --diff, markdown. No browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseOptions, CHECKS, DOORS, classifyDoor, classifyFocus, classifyDoubletap, classifyEscape, classifyBack, classifyPersist,
  classifySearch, classifyRotate, classifyDpad, pageErrorRow, diffRows, environmentMismatch, toMarkdown, summarize, row,
  loadDeferral, readReport, pacificStamp, WEBDRIVER_NOTE, PERSIST_TRANSIENT, USAGE, listText,
} from "../../tools/ui/flows/core.mjs";
import { CliArgError } from "../../tools/lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const parse = (argv) => parseOptions(argv, { root: ROOT });

test("defaults: every check, 16 doors, 844x390 touch, artifacts/ui-flows", () => {
  const o = parse([]);
  assert.deepEqual(o.checks, CHECKS);
  assert.equal(o.doors.length, 16);
  assert.deepEqual(o.viewport, { width: 844, height: 390 });
  assert.equal(o.touch, true);
  assert.equal(o.outDir, path.join(ROOT, "artifacts/ui-flows"));
  assert.equal(o.diff, null);
});

test("both flag spellings; checks keep canonical order; --mouse", () => {
  const o = parse(["--checks", "search,doors", "--doors=mb-race,mb-help", "--viewport=932x430", "--mouse", "--diff", "artifacts/old/flows.json"]);
  assert.deepEqual(o.checks, ["doors", "search"]);
  assert.deepEqual(o.doors, ["mb-race", "mb-help"]);
  assert.deepEqual(o.viewport, { width: 932, height: 430 });
  assert.equal(o.touch, false);
  assert.equal(o.diff, path.join(ROOT, "artifacts/old/flows.json"));
});

test("bad invocations throw CliArgError", () => {
  for (const argv of [["--checks=doors,nope"], ["--doors=race"], ["--viewport=844"], ["--viewport=100x100"], ["--touch", "--mouse"],
    ["--out=docs"], ["--chcks=doors"], ["--touch=1"], ["--diff"], ["stray"], ["--checks="]]) {
    assert.throws(() => parse(argv), CliArgError, argv.join(" "));
  }
  assert.equal(parse(["--out=scratch/x"]).outDir, path.join(ROOT, "scratch/x"));
});

test("load >= 3 defers with exit 75", () => {
  assert.equal(loadDeferral(2.9), null);
  assert.equal(loadDeferral(3).exitCode, 75);
});

test("doors and focus rows", () => {
  const ok = { door: "mb-race", opened: "select", escapes: ["overlay"], focusAfter: "mb-race" };
  assert.equal(classifyDoor(ok).status, "pass");
  assert.equal(classifyFocus(ok).status, "pass");
  const garage = { door: "mb-garage", opened: "carsetup", escapes: ["overlay"], focusAfter: "body" };
  assert.equal(classifyFocus(garage).status, "fail");
  assert.equal(classifyFocus(garage).detail, "focus lands on body, not #mb-garage");
  assert.equal(classifyDoor({ door: "x", opened: "overlay" }).status, "fail");
  assert.equal(classifyDoor({ door: "x", opened: "a", escapes: ["b", "overlay"] }).status, "warn");
  assert.equal(classifyDoor({ door: "x", opened: "a", escapes: ["a", "a"] }).status, "fail");
  assert.equal(classifyDoor({ door: "mb-practice", inRace: true }).status, "skip");
  assert.equal(classifyFocus({ door: "mb-practice", inRace: true }).status, "skip");
  assert.equal(classifyDoor({ door: "x", missing: true }).status, "skip");
  assert.equal(classifyDoor({ door: "x", err: "boom" }).status, "fail");
});

test("doubletap: a 2nd click inside the new layer fails; the webdriver override is named", () => {
  const bleed = { door: "mb-settings", webdriverForced: true, finalTop: "overlay", clicks: [
    { id: "#mb-settings", inDoor: true, top: "overlay", inTop: false }, { id: "#pm-back«BACK»", inDoor: false, top: "pmsettings", inTop: true }] };
  const r = classifyDoubletap(bleed);
  assert.equal(r.status, "fail");
  assert.equal(r.detail, `2nd tap activated #pm-back«BACK» inside #pmsettings; final top #overlay; ${WEBDRIVER_NOTE}`);
  const shielded = { door: "mb-race", webdriverForced: true, finalTop: "select", clicks: [{ id: "#mb-race", inDoor: true, inTop: false }] };
  assert.equal(classifyDoubletap(shielded).status, "pass");
  assert.equal(classifyDoubletap({ door: "x", finalTop: "a", clicks: [{ inDoor: true }, { id: "y", inDoor: false, inTop: false }] }).status, "warn");
  assert.equal(classifyDoubletap({ door: "x", finalTop: "overlay", clicks: [{ inDoor: true }] }).status, "warn");
});

test("escape, back, search, rotate, dpad rows", () => {
  const esc = { route: "display", opened: { top: "pmsettings", route: "display" }, step1: { top: "pmsettings", route: "home" }, step2: { top: "overlay" } };
  assert.equal(classifyEscape(esc).status, "pass");
  assert.equal(classifyEscape({ ...esc, step1: { top: "overlay", route: "home" } }).status, "fail");
  assert.equal(classifyEscape({ ...esc, opened: { top: "pmsettings", route: "home" } }).status, "fail");

  assert.equal(classifyBack({ door: "mb-settings", opened: "pmsettings", after: { href: "http://x/", hasApex: true, top: "overlay" } }).status, "pass");
  assert.equal(classifyBack({ door: "mb-settings", opened: "pmsettings", after: { href: "about:blank", hasApex: false } }).status, "fail");
  assert.equal(classifyBack({ door: "mb-settings", opened: "pmsettings", after: null }).status, "fail");
  assert.equal(classifyBack({ door: "mb-settings", opened: "pmsettings", after: { href: "http://x/", hasApex: true, top: "pmsettings" } }).status, "fail");

  assert.equal(classifySearch({ query: "fov", reopenValue: "fov" }).status, "fail");
  assert.equal(classifySearch({ query: "fov", reopenValue: "", firstEscTop: "overlay" }).status, "pass");
  assert.equal(classifySearch({ query: "fov", reopenValue: "", firstEscTop: "overlay" }).detail, 'query "fov" cleared on close; Escape inside the field closed the whole sheet');
  assert.equal(classifySearch({ query: "fov", reopenValue: null }).status, "fail");

  const snap = { top: "career", focus: "cr-x", focusInView: true };
  assert.equal(classifyRotate({ screen: "career", a: snap, portrait: snap, back: snap }).status, "pass");
  const off = classifyRotate({ screen: "career", a: snap, portrait: { ...snap, focusInView: false }, back: snap });
  assert.equal(off.status, "fail");
  assert.equal(off.detail, "focused cr-x off-screen in portrait");

  assert.equal(classifyDpad({ screen: "help", start: "#a", n: 3, reached: 3, unreached: [] }).status, "pass");
  assert.equal(classifyDpad({ screen: "datahub", start: "#a", n: 12, reached: 9, unreached: ["#dh-close-btn"] }).status, "fail");
  assert.equal(classifyDpad({ screen: "x", start: "#a", n: 99, reached: 90, unreached: [], truncated: true }).status, "warn");
});

test("persist: survives → pass, lost → fail, allow-listed transient → skip with its reason", () => {
  assert.equal(classifyPersist({ key: "pm-open-controls:pm-feel-sel", before: "normal", set: "sim", afterReload: "sim" }).status, "pass");
  assert.equal(classifyPersist({ key: "pm-open-controls:pm-feel-sel", before: "normal", set: "sim", afterReload: "normal" }).status, "fail");
  const t = classifyPersist({ key: "pm-open-graphics:pm-fullscreen-sel", before: "off", set: "on", afterReload: "off" });
  assert.equal(t.status, "skip");
  assert.equal(t.detail, `allow-listed transient: ${PERSIST_TRANSIENT["pm-fullscreen-sel"]}`);
});

test("pageErrorRow only for pageerror", () => {
  assert.equal(pageErrorRow("doors", [{ kind: "console", message: "w" }]), null);
  assert.equal(pageErrorRow("doors", [{ kind: "pageerror", message: "TypeError: x" }]).status, "fail");
});

test("row() rejects unknown checks and statuses", () => {
  assert.throws(() => row("nope", "t", "pass", ""));
  assert.throws(() => row("doors", "t", "ok", ""));
});

test("diff: pass → fail is a regression; fixes, changes, added, removed", () => {
  const old = [row("doors", "mb-race", "pass", ""), row("search", "settings-find", "fail", ""), row("dpad", "help", "pass", ""), row("back", "mb-help", "pass", "")];
  const neu = [row("doors", "mb-race", "fail", "broke"), row("search", "settings-find", "pass", ""), row("dpad", "help", "warn", ""), row("rotate", "career", "pass", "")];
  const d = diffRows(old, neu);
  assert.deepEqual(d.regressions.map((r) => r.key), ["doors|mb-race"]);
  assert.deepEqual(d.fixed.map((r) => r.key), ["search|settings-find"]);
  assert.deepEqual(d.changed.map((r) => r.key), ["dpad|help"]);
  assert.deepEqual(d.added.map((r) => r.target), ["career"]);
  assert.deepEqual(d.removed.map((r) => r.target), ["mb-help"]);
  assert.equal(diffRows(old, old).regressions.length, 0);
  assert.deepEqual(environmentMismatch({ viewport: { width: 844, height: 390 }, touch: true }, { viewport: { width: 844, height: 390 }, touch: false }), ["touch true vs false"]);
});

test("readReport validates a flows.json", () => {
  assert.throws(() => readReport({}));
  assert.throws(() => readReport({ rows: [{ check: "doors", status: "meh" }] }));
  assert.ok(readReport({ rows: [row("doors", "a", "pass", "")] }));
});

test("markdown: counts, fails first, pipes escaped", () => {
  const rows = [row("doors", "a", "pass", "ok"), row("doors", "b|c", "fail", "x|y")];
  const md = toMarkdown({ environment: { viewport: { width: 844, height: 390 }, touch: true, sha: "abc", date: "d", checks: ["doors"] }, rows });
  const lines = md.split("\n");
  assert.equal(lines[0], "# UI flows — 844x390 touch");
  assert.equal(lines[4], "**1 pass · 1 fail · 0 warn · 0 skip**");
  assert.equal(lines[8], "| doors | b\\|c | **fail** | x\\|y |");
  assert.equal(lines[9], "| doors | a | pass | ok |");
  assert.deepEqual(summarize(rows), { pass: 1, fail: 1, warn: 0, skip: 0 });
});

test("pacificStamp names the Pacific zone", () => {
  assert.equal(pacificStamp(new Date("2026-10-30T19:05:00Z")), "2026-10-30 12:05 PDT");
  assert.equal(pacificStamp(new Date("2026-12-01T08:30:00Z")), "2026-12-01 00:30 PST");
});

test("DOORS are the hunt's 16 title doors", () => {
  assert.equal(new Set(DOORS).size, 16);
});

test("CLI --help/--list/bad flag never launch a browser", () => {
  const cli = path.join(ROOT, "tools/ui/flows.mjs");
  const h = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8", timeout: 30000 });
  assert.equal(h.status, 0, h.stderr);
  assert.equal(h.stdout.trim(), USAGE);
  const l = spawnSync(process.execPath, [cli, "--list"], { encoding: "utf8", timeout: 30000 });
  assert.equal(l.status, 0, l.stderr);
  assert.equal(l.stdout.trim(), listText());
  const b = spawnSync(process.execPath, [cli, "--checks=nope"], { encoding: "utf8", timeout: 30000 });
  assert.equal(b.status, 2);
});
