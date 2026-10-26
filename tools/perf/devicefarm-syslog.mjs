#!/usr/bin/env node
// @doc Device Farm iOS syslog -> WebContent footprint dumps, process memory limits, jetsam/kill and GPU-buffer lines.
// Device Farm iOS syslog -> WebContent memory table. docs/notes/IPHONE-MEMORY-2026-10-24.md.
//
//   node tools/perf/devicefarm-syslog.mjs <syslog>... [--json] [--year 2026] [--utc-offset -7]
//
// Several files are read in the order given (an `auto` run has a setup, a test and a teardown syslog; the test one
// is the big one). Nothing is read from AWS here: fetch with `aws devicefarm list-artifacts --type FILE` on the run
// ARN and keep the files under ignored artifacts/. WebKit prints "Memory usage info dump at MainFrameLoadStarted /
// MainFrameLoadCompleted" for a WebContent process on every main-frame load, so a footprint sample exists only at a
// navigation, never in the middle of a race. runningboardd prints each extension's memory limit at launch.
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const LINE = /^([A-Z][a-z]{2}) +(\d+) (\d\d):(\d\d):(\d\d) (\S+) (.*?)\[(\d+)\] <(\w+)>: ?(.*)$/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const DUMP = /WebContent\[(\d+)\]: Memory usage info dump at (\w+):/;
const FIELD = /WebContent\[(\d+)\]: +(\w+): (-?\d+)\s*$/;
const LIMIT = /extension<com\.apple\.WebKit\.(WebContent|GPU|Networking)\[.*?\]:(\d+)\] Memory Limits: active (\d+) inactive (\d+)/;
const LIMIT_KIND = /extension<com\.apple\.WebKit\.(WebContent|GPU|Networking)\[.*?\]:(\d+)\] set Memory Limits to (Hard|Soft) (\w+) \((\d+)\)/;
const APP_LIMIT = /\[app<com\.apple\.mobilesafari\(.*?\)>:(\d+)\] Memory Limits: active (\d+) inactive (\d+)/;
const TERM = /extension<com\.apple\.WebKit\.(WebContent|GPU)\[.*?\]:(\d+)\].*termination reported by launchd \((-?\d+), (-?\d+), (-?\d+)\)/;
// A memory kill names itself in the kernel's memorystatus lines or a JetsamEvent; a bare SIGKILL exit context is also
// what the harness's force-quit of Safari looks like, so those are counted apart (sigkillExits).
const KILL = /memorystatus[\w()]*: [^\n]*\b(?:killing|killed|jetsam)\b|JetsamEvent|per-process-limit|EXC_RESOURCE|vm-pageshortage|vnode-limit/i;
const SIGKILL_EXIT = /\[app<com\.apple\.mobilesafari>:(\d+)\] Process exited: .*SIGKILL/;
const BUFFER = /Unable to create buffer|present failed|out of memory/i;

export function newState(opts = {}) {
  return { year: opts.year || 2026, utcOffset: opts.utcOffset ?? -7, open: new Map(), dumps: [], limits: [], appLimits: [],
    terms: [], kills: [], sigkillExits: [], buffers: [], lines: 0, first: null, last: null };
}

function stamp(st, m) {
  // The device prints local time with no year; Device Farm west-coast units run on PDT (UTC-7 in October).
  const ms = Date.UTC(st.year, MONTHS[m[1]], +m[2], +m[3], +m[4], +m[5]) - st.utcOffset * 3600e3;
  return new Date(ms).toISOString().slice(0, 19) + "Z";
}

export function feed(st, line) {
  st.lines++;
  const m = LINE.exec(line);
  if (!m) return;
  const t = stamp(st, m), text = m[10], who = m[7];
  if (!st.first) st.first = t;
  st.last = t;
  let x;
  if ((x = DUMP.exec(text))) {
    st.open.set(x[1], { t, pid: +x[1], at: x[2] });
  } else if ((x = FIELD.exec(text))) {
    const d = st.open.get(x[1]);
    if (d) {
      d[x[2]] = +x[3];
      if (x[2] === "resident_size_mb") { st.dumps.push(d); st.open.delete(x[1]); }
    }
  } else if ((x = LIMIT.exec(text))) {
    st.limits.push({ t, proc: x[1], pid: +x[2], activeMb: +x[3], inactiveMb: +x[4], kind: null });
  } else if ((x = LIMIT_KIND.exec(text))) {
    const l = [...st.limits].reverse().find((e) => e.pid === +x[2] && e.proc === x[1]);
    if (l) l.kind = x[3].toLowerCase();
  } else if ((x = APP_LIMIT.exec(text))) {
    st.appLimits.push({ t, pid: +x[1], activeMb: +x[2], inactiveMb: +x[3] });
  } else if ((x = TERM.exec(text))) {
    st.terms.push({ t, proc: x[1], pid: +x[2], status: [+x[3], +x[4], +x[5]] });
  } else if ((x = SIGKILL_EXIT.exec(text))) {
    st.sigkillExits.push({ t, pid: +x[1] });
  } else if (KILL.test(text) && !/Ignoring jetsam|Set jetsam priority|SuspendableJetsam|idle_demotion/.test(text)) {
    st.kills.push({ t, who, text: text.slice(0, 200) });
  } else if (BUFFER.test(text) && /WebKit|WebContent|GPU/.test(who + text)) {
    st.buffers.push({ t, who, text: text.slice(0, 200) });
  }
}

export function summarise(st) {
  const web = (p) => st.limits.filter((l) => l.proc === p);
  const limitOf = (p) => { const l = web(p)[0]; return l ? { activeMb: l.activeMb, inactiveMb: l.inactiveMb, kind: l.kind } : null; };
  const wc = limitOf("WebContent");
  // Game pages: a WebContent process whose footprint ever passed 100 MB (a blank or about: load stays near 11 MB).
  const big = new Set(st.dumps.filter((d) => d.phys_footprint_mb >= 100).map((d) => d.pid));
  const game = st.dumps.filter((d) => big.has(d.pid));
  const peak = game.reduce((a, d) => (d.phys_footprint_mb > (a ? a.phys_footprint_mb : -1) ? d : a), null);
  const abnormal = st.terms.filter((e) => e.status.some((v) => v !== 0));
  return {
    window: [st.first, st.last], lines: st.lines,
    limits: { webContent: wc, gpu: limitOf("GPU"), networking: limitOf("Networking"), safariApp: st.appLimits[0] || null },
    dumps: game.length, peakDump: peak,
    peakPctOfWebContentLimit: peak && wc ? +(100 * peak.phys_footprint_mb / wc.activeMb).toFixed(1) : null,
    headroomMb: peak && wc ? wc.activeMb - peak.phys_footprint_mb : null,
    abnormalTerminations: abnormal, sigkillExits: st.sigkillExits, kills: st.kills, bufferFailures: st.buffers,
  };
}

export async function parseFiles(files, opts = {}) {
  const st = newState(opts);
  for (const f of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(f, { encoding: "latin1" }), crlfDelay: Infinity });
    for await (const line of rl) feed(st, line);
  }
  return st;
}

export function table(st) {
  const s = summarise(st);
  const out = [];
  out.push(`window ${s.window[0]} .. ${s.window[1]} (${st.lines} lines)`);
  const L = s.limits;
  const fmt = (l) => (l ? `${l.activeMb}/${l.inactiveMb} MB${l.kind ? " " + l.kind : ""}` : "none");
  out.push(`limits (active/inactive): WebContent ${fmt(L.webContent)} | GPU ${fmt(L.gpu)} | Networking ${fmt(L.networking)} | Safari app ${fmt(L.safariApp)}`);
  out.push("", "time (UTC)            pid  event                    footprint  internal  compressed  resident  jsHeap  docs");
  const big = new Set(st.dumps.filter((d) => d.phys_footprint_mb >= 100).map((d) => d.pid));
  for (const d of st.dumps.filter((e) => big.has(e.pid))) {
    out.push([d.t.padEnd(20), String(d.pid).padStart(5), d.at.padEnd(24), String(d.phys_footprint_mb).padStart(9), String(d.internal_mb).padStart(9),
      String(d.compressed_mb).padStart(11), String(d.resident_size_mb).padStart(9), String(d.javascript_gc_heap_capacity_mb).padStart(7), String(d.document_count).padStart(5)].join("  "));
  }
  out.push("", s.peakDump ? `peak sampled footprint ${s.peakDump.phys_footprint_mb} MB at ${s.peakDump.t} (${s.peakDump.at}) = ${s.peakPctOfWebContentLimit}% of the WebContent limit, headroom ${s.headroomMb} MB` : "no game-page dump");
  out.push(`non-zero WebContent/GPU exits ${s.abnormalTerminations.length}, Safari SIGKILL exits ${s.sigkillExits.length} (${s.sigkillExits.map((e) => e.t.slice(11)).join(" ") || "-"}), memory-kill lines ${s.kills.length}, buffer/present failures ${s.bufferFailures.length}`);
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
  const files = a.filter((x, i) => !x.startsWith("--") && !(i > 0 && ["--year", "--utc-offset"].includes(a[i - 1])));
  if (!files.length) { process.stderr.write("usage: devicefarm-syslog.mjs <syslog>... [--json] [--year Y] [--utc-offset H]\n"); process.exit(2); }
  const st = await parseFiles(files, { year: +opt("year", 2026), utcOffset: +opt("utc-offset", -7) });
  process.stdout.write((a.includes("--json") ? JSON.stringify({ summary: summarise(st), dumps: st.dumps }, null, 1) : table(st)) + "\n");
}
