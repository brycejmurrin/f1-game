// @doc Atomic cross-owner admission and complete manifests for durable Apex jobs.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
