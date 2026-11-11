// @doc Atomic cross-owner admission and complete manifests for durable Apex jobs.
// Also: process birth identity (processBirth / compareBirth) and the one-browser lock file (readLock / reapStaleLock).
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { alive } from "../lib/process-tree.mjs";

export function publishJobManifest(file, meta) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(meta, null, 2) + "\n", { flag: "wx" }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

export function jobOwnerGone(owner, processBirth) {
  if (!owner || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  if (!alive(owner.pid)) return true;
  const current = processBirth(owner.pid);
  return Boolean(owner.birth && current && owner.birth.split(":", 1)[0] === current.split(":", 1)[0] && owner.birth !== current);
}

// Immutable epochs avoid stale-lock unlink races: only the latest live owner
// can admit, and competing successors atomically link the same next epoch.
export function takeJobAdmission(dir, owner, processBirth) {
  fs.mkdirSync(dir, { recursive: true });
  const epochs = () => fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f)).map(f => Number(f.slice(0, -5))).sort((a, b) => b - a);
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = epochs()[0] || 0;
    if (!Number.isSafeInteger(latest) || latest >= Number.MAX_SAFE_INTEGER) return null;
    let previous;
    try { if (latest) previous = JSON.parse(fs.readFileSync(path.join(dir, `${latest}.json`), "utf8")); }
    catch (e) { if (e.code === "ENOENT") continue; return null; }
    if (latest && previous?.state !== "released" && !jobOwnerGone(previous?.owner, processBirth)) return null;
    const epoch = latest + 1, file = path.join(dir, `${epoch}.json`), temporary = path.join(dir, `${randomUUID()}.tmp`);
    const claim = { state: "held", owner, token: randomUUID() };
    try {
      fs.writeFileSync(temporary, JSON.stringify(claim), { flag: "wx" });
      fs.linkSync(temporary, file); // publish complete owner identity, never an empty lock
    } catch (e) { if (e.code === "EEXIST") continue; throw e; }
    finally { fs.rmSync(temporary, { force: true }); }
    // A delayed stale contender must observe any newer epoch before entry.
    const release = () => {
      let current;
      try { current = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch (e) { if (e.code === "ENOENT" && epochs().some(n => n > epoch)) return; throw e; }
      if (current?.token !== claim.token) throw Error("job admission ownership changed before release");
      if (current.state !== "released") publishJobManifest(file, { ...claim, state: "released" });
    };
    if (epochs()[0] !== epoch) { release(); continue; }
    // While this live latest claim is held no peer may become its successor.
    // Retain the previous epoch, and only prune provably retired older claims.
    for (const old of epochs().filter(n => n < epoch - 1)) {
      const oldFile = path.join(dir, `${old}.json`);
      try {
        const retired = JSON.parse(fs.readFileSync(oldFile, "utf8"));
        if (retired.state === "released" || jobOwnerGone(retired.owner, processBirth)) fs.rmSync(oldFile, { force: true });
      } catch { /* uncertain history stays intact */ }
    }
    return release;
  }
  return null;
}

// ── Process birth: /proc starttime + boot id (or a UTC ps lstart), so a recorded PID can be told from a reused one.
/** A string naming the process's start, or null when it cannot be read (gone, or no procfs and no ps). */
export function processBirth(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/)[19];
    const boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    if (start && boot) return `proc:${boot}:${start}`;
  } catch { /* portable fallback below */ }
  try {
    const start = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8", timeout: 5000, env: { ...process.env, TZ: "UTC0", LC_ALL: "C", LANG: "C" },
    }).trim();
    // Version the canonical format: old ps records inherited TZ/locale, so a
    // mismatch with them cannot prove that the original process has exited.
    return start ? `ps-utc-v1:${start}` : null;
  } catch { return null; }
}

const scheme = (birth) => String(birth).split(":", 1)[0];

/** "same": recorded identity is this live process; "different": same scheme, other start (PID reused);
 *  "unknown": either side missing or the schemes differ, so nothing is proven. */
export function compareBirth(recorded, current) {
  if (!recorded || !current || scheme(recorded) !== scheme(current)) return "unknown";
  return recorded === current ? "same" : "different";
}

// ── The one-browser lock (scratch/apex-browser.lock): owner stamp with start time, staleness, race-safe reaping.
const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** The payload acquire writes: pid + its birth, so a reused PID never reads as the holder. */
export const lockPayload = (tool, pid = process.pid) => ({ pid, birth: processBirth(pid), since: Date.now(), tool, token: randomUUID() });

/** {held:false} | {held:false, stale:true, pid, text} | {held:true, pid, since, tool, birth} | {held:true, error}.
 *  Stale only when the owner is dead, or alive with a different start time than the one stamped. A legacy lock
 *  with no birth falls back to liveness alone. */
export function readLock(lockPath, { alive = pidAlive, birthOf = processBirth } = {}) {
  let text;
  try { text = fs.readFileSync(lockPath, "utf8"); }
  catch (e) { return e.code === "ENOENT" ? { held: false } : { held: true, stale: false, error: "unreadable" }; }
  let raw;
  try { raw = JSON.parse(text); } catch { return { held: true, stale: false, error: "unreadable" }; }
  if (!isObject(raw) || !Number.isInteger(Number(raw.pid)) || Number(raw.pid) <= 0) return { held: true, stale: false, error: "invalid owner" };
  const pid = Number(raw.pid);
  if (!alive(pid)) return { held: false, stale: true, pid, text };
  if (raw.birth && compareBirth(raw.birth, birthOf(pid)) === "different") return { held: false, stale: true, pid, text, reused: true };
  return { held: true, pid, since: raw.since || null, tool: raw.tool || null, birth: raw.birth || null };
}

/** Remove a stale lock without ever removing a fresh one: move it aside atomically, then confirm the moved bytes are
 *  the stale ones judged; if a new owner's lock was moved instead, put it back (link fails if yet another exists). */
export function reapStaleLock(lockPath, opts = {}) {
  const info = readLock(lockPath, opts);
  if (!info.stale) return { reaped: false, info };
  const aside = `${lockPath}.${randomUUID()}.reap`;
  try { fs.renameSync(lockPath, aside); }
  catch (e) { return { reaped: false, info, error: e.code }; }   // gone already: another reaper won
  try {
    const moved = fs.readFileSync(aside, "utf8");
    if (moved === info.text) return { reaped: true, info };
    try { fs.linkSync(aside, lockPath); } catch { /* a newer owner already holds it */ }
    return { reaped: false, info, restored: true };
  } finally { fs.rmSync(aside, { force: true }); }
}

/** Write a fresh lock exclusively; null on success, "held" when another owner has it. */
export function writeLock(lockPath, payload) {
  try { fs.writeFileSync(lockPath, JSON.stringify(payload), { flag: "wx" }); return null; }
  catch (e) { if (e.code === "EEXIST") return "held"; throw e; }
}
