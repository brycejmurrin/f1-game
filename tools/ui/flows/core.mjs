// @doc UI flows pure core: flags, catalogs, evidence → pass/fail/warn/skip rows, --diff, flows.md.
// @skill ui-menu-a11y
// No browser, no I/O: tests/unit/ui-flows.test.mjs pins every function here.
// The probes that gather the evidence live in ./probes.mjs (Chromium; parent-only).
import path from "node:path";
import { makeFlags, CliArgError } from "../../lib/cli-args.mjs";

export const CHECKS = Object.freeze(["doors", "doubletap", "focus", "escape", "back", "persist", "search", "rotate", "dpad"]);
export const CHECK_INFO = Object.freeze({
  doors: "each title door opens its layer; one Escape closes it back to #overlay",
  doubletap: "two taps 120 ms apart on a door: the 2nd must not activate a control in the new layer (hunt #3)",
  focus: "after the door's layer closes, document.activeElement is the door (hunt #4)",
  escape: "Settings sub-page → Escape → Settings home → Escape → title, one level per press",
  back: "browser Back closes the top layer and keeps the app (no about:blank; hunt #2)",
  persist: "step every visible Settings row, reload in the same context, compare",
  search: "Settings FIND A SETTING is empty after close + reopen (hunt #5)",
  rotate: "landscape → portrait → landscape keeps top layer, focus, focused control in view (hunt #12)",
  dpad: "BFS over the 4 arrow keys from each screen's initial focus: every control reachable (hunt #10)",
});
// The 16 title doors the 2026-10-29 hunt walked (docs/notes/UI-HUNT-FLOWS-2026-10-29.md).
export const DOORS = Object.freeze(["mb-career", "mb-daily", "mb-race", "mb-tt", "mb-vs", "mb-season", "mb-practice", "mb-garage",
  "mb-watch", "mb-data", "mb-photo", "mb-designer", "mb-visual", "mb-settings", "mb-help", "mb-saves"]);
// Settings pages (SettingsNav routes, js/ui/settings-tabs.js) stepped by persist and escape.
export const SETTINGS_PAGES = Object.freeze([
  { route: "controls", door: "pm-open-controls" }, { route: "driving", door: "pm-open-driving" },
  { route: "display", door: "pm-open-display" }, { route: "appearance", door: "pm-open-appearance" },
  { route: "a11y", door: "pm-open-a11y" }, { route: "graphics", door: "pm-open-graphics" }, { route: "visual", door: "pm-open-visual" },
]);
// Rows whose change reloads the page or swaps the renderer: never stepped (prototype persist.mjs).
export const PERSIST_SKIP = /backend|renderer|gfx|lang|reset|tlx|wgx|quality|preset|profile|steer/i;
// Changed rows that are not expected to survive a reload, each with its reason.
export const PERSIST_TRANSIENT = Object.freeze({
  "pm-hl-set-sel": "HUD-layout editor picker: which layout set is being edited (session-only)",
  "pm-hl-el-sel": "HUD-layout editor picker: which element is being edited (session-only)",
  "pm-hl-visibility-sel": "HUD-layout editor picker: follows the edited element (session-only)",
  "pm-fullscreen-sel": "fullscreen cannot re-enter without a user gesture after reload",
});
export const BACK_DOORS = Object.freeze(["mb-settings", "mb-race", "mb-help"]);
export const SEARCH_QUERY = "fov";
// Screens for rotate and dpad: a door chain from the title (null = the title itself).
export const SCREENS = Object.freeze([
  { name: "title", open: [] },
  { name: "select", open: ["#mb-race"] },
  { name: "settings", open: ["#mb-settings"] },
  { name: "settings-appearance", open: ["#mb-settings", "#pm-open-appearance"] },
  { name: "career", open: ["#mb-career"] },
  { name: "help", open: ["#mb-help"] },
  { name: "datahub", open: ["#mb-data"] },
]);
export const ROTATE_SCREENS = Object.freeze(["settings-appearance", "select", "career", "help", "datahub"]);
export const DPAD_SCREENS = Object.freeze(["title", "select", "help", "settings", "career", "datahub"]);
export const STATUSES = Object.freeze(["pass", "fail", "warn", "skip"]);
export const WEBDRIVER_NOTE = "navigator.webdriver forced false at runtime for this check: js/ui/modal.js's ghost-tap shield stands down under webdriver (98ce5953) and has no opt-in";

export const USAGE = `UI flows — interaction checks at 844x390 touch (the 2026-10-29 hunt's probes as one repeatable matrix).
  node tools/ui/flows.mjs [--checks=doors,doubletap,focus,escape,back,persist,search,rotate,dpad]
    [--doors=mb-race,...] [--viewport=844x390] [--touch|--mouse] [--out=artifacts/ui-flows] [--diff=<old flows.json>]
  node tools/ui/flows.mjs --list|--help          # no browser
Writes <out>/flows.json (rows + environment) and <out>/flows.md. One fresh browser context per check group.
Exit 0: every row pass/warn/skip; 1: a fail row (or, with --diff, a row that passed in the old file now fails);
2: invalid invocation; 75: deferred (load >= 3 or browser lock held), retry later.`;

const FLAGS = ["--checks", "--doors", "--viewport", "--touch", "--mouse", "--out", "--diff", "--list", "--help"];
const BOOLEAN = ["--touch", "--mouse", "--list", "--help"];

/** Parse argv (both `--x=v` and `--x v`). Throws CliArgError on a bad invocation. */
export function parseOptions(argv, { root = process.cwd() } = {}) {
  const f = makeFlags(argv, FLAGS);
  const flag = (name, fallback = null) => {
    const eq = argv.find((a) => a.startsWith(name + "="));
    if (eq !== undefined) return eq.slice(name.length + 1);
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new CliArgError(`Unexpected argument ${a}`);
    if (BOOLEAN.includes(a.split("=")[0])) { if (a.includes("=")) throw new CliArgError(`${a.split("=")[0]} is a boolean flag without a value`); continue; }
    if (!a.includes("=")) { if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new CliArgError(`${a} requires a value`); i++; }
  }
  const list = (name, all) => {
    const raw = flag(name);
    if (raw === null) return [...all];
    const items = [...new Set(String(raw).split(",").map((v) => v.trim()).filter(Boolean))];
    if (!items.length) throw new CliArgError(`${name} requires at least one value`);
    return items;
  };
  const checks = list("--checks", CHECKS);
  const badCheck = checks.find((c) => !CHECKS.includes(c));
  if (badCheck) throw new CliArgError(`Unknown check ${badCheck}; one of ${CHECKS.join(",")}`);
  const doors = list("--doors", DOORS);
  const badDoor = doors.find((d) => !/^mb-[a-z0-9-]+$/.test(d));
  if (badDoor) throw new CliArgError(`--doors takes title door ids such as mb-race (got ${badDoor})`);
  const vp = flag("--viewport", "844x390");
  if (!/^\d+x\d+$/.test(vp)) throw new CliArgError("--viewport requires WIDTHxHEIGHT such as 844x390");
  const [width, height] = vp.split("x").map(Number);
  if (width < 240 || width > 3840 || height < 240 || height > 2160) throw new CliArgError("--viewport: width 240..3840, height 240..2160");
  if (f.has("--touch") && f.has("--mouse")) throw new CliArgError("--touch and --mouse are exclusive");
  const outDir = path.resolve(root, flag("--out", "artifacts/ui-flows"));
  const rel = path.relative(root, outDir);
  const outside = rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);
  if (!outside && !/^(artifacts|scratch)([\\/]|$)/.test(rel)) throw new CliArgError("Inside the repository, --out must be under artifacts/ or scratch/");
  const diff = flag("--diff");
  if (diff !== null && !String(diff).trim()) throw new CliArgError("--diff requires a flows.json path");
  return { checks: CHECKS.filter((c) => checks.includes(c)), doors, viewport: { width, height }, touch: !f.has("--mouse"),
    outDir, diff: diff === null ? null : path.resolve(root, diff), list: f.has("--list"), help: f.has("--help") };
}

/** Retryable refusal (EX_TEMPFAIL 75), as tools/ui/explorer.mjs. */
export function deferral(reason) { return Object.assign(new Error(reason), { exitCode: 75 }); }
export function loadDeferral(load) {
  return load >= 3 ? deferral(`Browser deferred: load average ${load.toFixed(2)} is >= 3; do not start another software-rendered run`) : null;
}

export function row(check, target, status, detail, evidence = null) {
  if (!CHECKS.includes(check)) throw new Error(`unknown check ${check}`);
  if (!STATUSES.includes(status)) throw new Error(`unknown status ${status}`);
  return { check, target: String(target), status, detail: String(detail), evidence };
}
const errRow = (check, target, ev) => row(check, target, "fail", `probe error: ${ev.err}`, ev);

/** doors evidence: { door, missing?, err?, opened, inRace, escapes: [top after each Escape], focusAfter } */
export function classifyDoor(ev) {
  if (ev.missing) return row("doors", ev.door, "skip", "door not visible on the title", ev);
  if (ev.err) return errRow("doors", ev.door, ev);
  if (ev.inRace) return row("doors", ev.door, "skip", "door starts a session (in-race); no layer to close", ev);
  if (!ev.opened || ev.opened === "overlay") return row("doors", ev.door, "fail", "tap did not open a layer (UiLayers.top() stayed #overlay)", ev);
  const esc = ev.escapes || [];
  if (esc[0] === "overlay") return row("doors", ev.door, "pass", `opens #${ev.opened}; Escape returns to #overlay`, ev);
  if (esc[1] === "overlay") return row("doors", ev.door, "warn", `opens #${ev.opened}; needed 2 Escapes (first left #${esc[0]})`, ev);
  return row("doors", ev.door, "fail", `opens #${ev.opened}; Escape left #${esc[esc.length - 1] || "?"} on top`, ev);
}

/** focus: same walk as doors; the door must hold focus once its layer closed. */
export function classifyFocus(ev) {
  if (ev.missing || ev.inRace) return row("focus", ev.door, "skip", ev.missing ? "door not visible" : "door starts a session", ev);
  if (ev.err) return errRow("focus", ev.door, ev);
  const esc = ev.escapes || [];
  if (esc[esc.length - 1] !== "overlay") return row("focus", ev.door, "skip", "layer never closed back to the title (see doors)", ev);
  if (ev.focusAfter === ev.door) return row("focus", ev.door, "pass", "focus returns to the door", ev);
  return row("focus", ev.door, "fail", `focus lands on ${ev.focusAfter || "nothing"}, not #${ev.door}`, ev);
}

/** doubletap evidence: { door, clicks: [{ id, inDoor, top, inTop, dt }], finalTop, inRace, webdriverForced } */
export function classifyDoubletap(ev) {
  if (ev.missing) return row("doubletap", ev.door, "skip", "door not visible on the title", ev);
  if (ev.err) return errRow("doubletap", ev.door, ev);
  const note = ev.webdriverForced ? `; ${WEBDRIVER_NOTE}` : "";
  const clicks = ev.clicks || [];
  const bleed = clicks.slice(1).filter((c) => !c.inDoor);
  const inLayer = bleed.filter((c) => c.inTop);
  if (inLayer.length) return row("doubletap", ev.door, "fail", `2nd tap activated ${inLayer.map((c) => c.id).join(", ")} inside #${inLayer[0].top}; final top #${ev.finalTop}${note}`, ev);
  if (bleed.length) return row("doubletap", ev.door, "warn", `2nd tap hit ${bleed.map((c) => c.id).join(", ")} outside the new layer; final top #${ev.finalTop}${note}`, ev);
  if (ev.inRace) return row("doubletap", ev.door, "pass", `door started a session; no bleed${note}`, ev);
  if (!ev.finalTop || ev.finalTop === "overlay") return row("doubletap", ev.door, "warn", `no layer left open after the double tap (${clicks.length} click(s) seen)${note}`, ev);
  return row("doubletap", ev.door, "pass", `${clicks.length} click(s), all on the door; final top #${ev.finalTop}${note}`, ev);
}

/** escape evidence: { route, opened: {top, route}, step1: {top, route}, step2: {top} } */
export function classifyEscape(ev) {
  const t = `settings>${ev.route}`;
  if (ev.err) return errRow("escape", t, ev);
  if (!ev.opened || ev.opened.top !== "pmsettings" || ev.opened.route !== ev.route) return row("escape", t, "fail", `sub-page did not open (top #${ev.opened?.top}, route ${ev.opened?.route})`, ev);
  if (ev.step1?.top !== "pmsettings" || ev.step1?.route !== "home") return row("escape", t, "fail", `1st Escape left top #${ev.step1?.top} route ${ev.step1?.route}; expected Settings home`, ev);
  if (ev.step2?.top !== "overlay") return row("escape", t, "fail", `2nd Escape left #${ev.step2?.top}; expected the title`, ev);
  return row("escape", t, "pass", "sub-page → Settings home → title, one level per Escape", ev);
}

/** back evidence: { door, opened, after: { href, hasApex, top } | null, goBackErr } */
export function classifyBack(ev) {
  if (ev.err) return errRow("back", ev.door, ev);
  if (!ev.opened || ev.opened === "overlay") return row("back", ev.door, "skip", "door did not open a layer", ev);
  const a = ev.after;
  if (!a || !a.hasApex || /^about:blank/.test(a.href || "")) return row("back", ev.door, "fail", `Back left the app (${a ? a.href : "page gone"})`, ev);
  if (a.top === "overlay") return row("back", ev.door, "pass", `Back closed #${ev.opened}; app kept`, ev);
  if (a.top === ev.opened) return row("back", ev.door, "fail", `Back kept #${ev.opened} on top (no history sentinel taken)`, ev);
  return row("back", ev.door, "warn", `Back moved #${ev.opened} → #${a.top}`, ev);
}

/** persist evidence: { key: "<pageDoor>:<controlId>", before, set, afterReload } */
export function classifyPersist(ev) {
  const id = ev.key.split(":").pop();
  if (Object.hasOwn(PERSIST_TRANSIENT, id)) return row("persist", ev.key, "skip", `allow-listed transient: ${PERSIST_TRANSIENT[id]}`, ev);
  if (ev.afterReload === ev.set) return row("persist", ev.key, "pass", `${JSON.stringify(ev.before)} → ${JSON.stringify(ev.set)} survives reload`, ev);
  return row("persist", ev.key, "fail", `set ${JSON.stringify(ev.set)}, reload shows ${JSON.stringify(ev.afterReload)}`, ev);
}

/** search evidence: { query, filtered, firstEscTop, reopenValue } */
export function classifySearch(ev) {
  const t = "settings-find";
  if (ev.err) return errRow("search", t, ev);
  if (ev.reopenValue === undefined || ev.reopenValue === null) return row("search", t, "fail", "FIND A SETTING field not found", ev);
  const escNote = ev.firstEscTop && ev.firstEscTop !== "pmsettings" ? "; Escape inside the field closed the whole sheet" : "";
  if (ev.reopenValue === "") return row("search", t, "pass", `query "${ev.query}" cleared on close${escNote}`, ev);
  return row("search", t, "fail", `reopened Settings still holds "${ev.reopenValue}"${escNote}`, ev);
}

/** rotate evidence: { screen, a, portrait, back } each { top, focus, focusInView } */
export function classifyRotate(ev) {
  if (ev.err) return errRow("rotate", ev.screen, ev);
  const { a, portrait: p, back: b } = ev;
  if (!a || !p || !b) return row("rotate", ev.screen, "fail", "missing snapshot", ev);
  const bad = [];
  if (p.top !== a.top) bad.push(`portrait top #${p.top}`);
  if (b.top !== a.top) bad.push(`back top #${b.top}`);
  if (b.focus !== a.focus) bad.push(`focus ${a.focus} → ${b.focus}`);
  if (!p.focusInView) bad.push(`focused ${p.focus} off-screen in portrait`);
  if (!b.focusInView) bad.push(`focused ${b.focus} off-screen after rotating back`);
  return bad.length ? row("rotate", ev.screen, "fail", bad.join("; "), ev)
    : row("rotate", ev.screen, "pass", `#${a.top} keeps top, focus (${a.focus}) and view through the round trip`, ev);
}

/** dpad evidence: { screen, start, n, reached, unreached: [], truncated } */
export function classifyDpad(ev) {
  if (ev.err) return errRow("dpad", ev.screen, ev);
  const un = ev.unreached || [];
  if (un.length) return row("dpad", ev.screen, "fail", `${un.length}/${ev.n} unreachable from ${ev.start}: ${un.slice(0, 8).join(", ")}${un.length > 8 ? " …" : ""}`, ev);
  if (ev.truncated) return row("dpad", ev.screen, "warn", `BFS step budget hit at ${ev.reached}/${ev.n}`, ev);
  return row("dpad", ev.screen, "pass", `all ${ev.n} controls reachable from ${ev.start}`, ev);
}

/** A group's page errors: any pageerror is a fail row for that check. */
export function pageErrorRow(check, errors) {
  const pe = (errors || []).filter((e) => e.kind === "pageerror");
  return pe.length ? row(check, "(pageerror)", "fail", `${pe.length} pageerror(s): ${pe[0].message.slice(0, 160)}`, pe.slice(0, 5)) : null;
}

export const rowKey = (r) => `${r.check}|${r.target}`;
export function summarize(rows) {
  const s = Object.fromEntries(STATUSES.map((k) => [k, 0]));
  for (const r of rows) s[r.status]++;
  return s;
}

/** Old vs new rows. A regression is a row that PASSED before and FAILS now. */
export function diffRows(oldRows, newRows) {
  const before = new Map(oldRows.map((r) => [rowKey(r), r]));
  const after = new Map(newRows.map((r) => [rowKey(r), r]));
  const regressions = [], fixed = [], changed = [], added = [], removed = [];
  for (const [k, n] of after) {
    const o = before.get(k);
    if (!o) { added.push(n); continue; }
    if (o.status === "pass" && n.status === "fail") regressions.push({ key: k, before: o, after: n });
    else if (o.status === "fail" && n.status === "pass") fixed.push({ key: k, before: o, after: n });
    else if (o.status !== n.status) changed.push({ key: k, before: o, after: n });
  }
  for (const [k, o] of before) if (!after.has(k)) removed.push(o);
  return { regressions, fixed, changed, added, removed };
}

/** Environment keys whose mismatch makes a diff compare different rigs. */
export function environmentMismatch(a = {}, b = {}) {
  const out = [];
  const vp = (e) => e.viewport ? `${e.viewport.width}x${e.viewport.height}` : "?";
  if (vp(a) !== vp(b)) out.push(`viewport ${vp(a)} vs ${vp(b)}`);
  if (a.touch !== b.touch) out.push(`touch ${a.touch} vs ${b.touch}`);
  return out;
}

export function formatDiff(d) {
  const lines = [`diff: ${d.regressions.length} regression(s), ${d.fixed.length} fixed, ${d.changed.length} other change(s), ${d.added.length} new, ${d.removed.length} gone`];
  for (const r of d.regressions) lines.push(`  REGRESSION ${r.key}: ${r.after.detail}`);
  for (const r of d.fixed) lines.push(`  fixed ${r.key}`);
  for (const r of d.changed) lines.push(`  ${r.before.status} → ${r.after.status} ${r.key}`);
  return lines.join("\n");
}

/** Pacific wall time (AGENTS.md: times in America/Los_Angeles). */
export function pacificStamp(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute} ${p.timeZoneName}`;
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
export function toMarkdown(report) {
  const e = report.environment || {};
  const s = summarize(report.rows);
  const out = [`# UI flows — ${e.viewport ? `${e.viewport.width}x${e.viewport.height}` : "?"} ${e.touch ? "touch" : "mouse"}`, "",
    `sha \`${e.sha || "?"}\` · ${e.date || "?"} · checks ${(e.checks || []).join(", ")}`, "",
    `**${s.pass} pass · ${s.fail} fail · ${s.warn} warn · ${s.skip} skip**`, "",
    "| check | target | status | detail |", "|---|---|---|---|"];
  const order = { fail: 0, warn: 1, pass: 2, skip: 3 };
  const rows = [...report.rows].sort((a, b) => CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check) || order[a.status] - order[b.status]);
  for (const r of rows) out.push(`| ${r.check} | ${cell(r.target)} | ${r.status === "fail" ? "**fail**" : r.status} | ${cell(r.detail)} |`);
  return out.join("\n") + "\n";
}

export function listText() {
  return ["checks:", ...CHECKS.map((c) => `  ${c.padEnd(10)} ${CHECK_INFO[c]}`), "doors (default --doors):", `  ${DOORS.join(",")}`,
    `settings pages: ${SETTINGS_PAGES.map((p) => p.route).join(",")}`, `rotate screens: ${ROTATE_SCREENS.join(",")}`,
    `dpad screens: ${DPAD_SCREENS.join(",")}`, `persist transients: ${Object.keys(PERSIST_TRANSIENT).join(",")}`].join("\n");
}

/** Validate a flows.json read for --diff. */
export function readReport(json) {
  if (!json || !Array.isArray(json.rows) || json.rows.some((r) => !r || !CHECKS.includes(r.check) || !STATUSES.includes(r.status))) throw new Error("--diff file is not a flows.json report");
  return json;
}
