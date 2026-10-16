/* SaveHealth — on-demand measurements and cache-only cleanup. No permission prompts. */
const SaveHealth = (function () {
  "use strict";
  const CACHE_PREFIXES = ["apex26.api.", "apex26.realrace."];
  const mounted = new WeakMap();
  function category(key) {
    if (CACHE_PREFIXES.some((p) => key.startsWith(p))) return "Downloaded response caches";
    if (/^apex26\.career/.test(key)) return "Career saves";
    if (/^apex26\.season/.test(key)) return "Season saves";
    if (/^apex26\.(customTeam|customLogo|parts\.|setup\.|setupPresets\.|livery\.)/.test(key)) return "Garage work";
    if (/^apex26\.(ghost|ttlb\.)/.test(key)) return "Laps and ghosts";
    if (/^apex26\.(customTracks|customTrackDraft(?:Prev)?|trackDesigner|tracks\.)/.test(key)) return "Authored circuits";
    return "Other settings and data";
  }
  function dependencies(opts) {
    opts = opts || {};
    return { store: opts.store || (typeof GameStore !== "undefined" && GameStore.store),
      disk: opts.localStorage || (typeof localStorage !== "undefined" && localStorage),
      storage: opts.storage || (typeof navigator !== "undefined" && navigator.storage) };
  }
  async function inspect(opts) {
    const { store, disk, storage } = dependencies(opts), groups = new Map();
    const history = opts && opts.restorePoints || (typeof CareerRestorePoints !== "undefined" && CareerRestorePoints);
    const report = { history: history && history.health ? history.health() : [], ok: true, localBytes: 0, categories: [], estimate: null, estimateUnavailable: false,
      failed: store && store.failedKeys ? store.failedKeys() : [], mirror: store && store.mirror ? {
        supported: store.mirror.supported, pending: store.mirror.pending, failed: store.mirror.failed,
        skipped: store.mirror.skipped || 0, authoredBytes: store.mirror.authoredBytes || 0,
        authoredKeys: store.mirror.authoredKeys || 0, limitReason: store.mirror.limitReason || null,
      } : null, policy: store && store.mirrorPolicy ? {
        rowBytes: store.mirrorPolicy.authoredRowBytes, totalBytes: store.mirrorPolicy.authoredTotalBytes,
        keys: store.mirrorPolicy.authoredKeys,
      } : null };
    try {
      if (!disk) throw new Error("unavailable");
      for (let i = 0; i < disk.length; i++) {
        const key = disk.key(i); if (!key || !key.startsWith("apex26.")) continue;
        const value = disk.getItem(key); if (value === null) continue;
        const bytes = (key.length + value.length) * 2, name = category(key), row = groups.get(name) || { name, keys: 0, bytes: 0 };
        row.keys++; row.bytes += bytes; groups.set(name, row); report.localBytes += bytes;
      }
      report.categories = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
    } catch (_) { report.ok = false; report.reason = "local-storage-unavailable"; }
    if (storage && typeof storage.estimate === "function") {
      try {
        const e = await storage.estimate();
        if (Number.isFinite(e.usage) && Number.isFinite(e.quota)) report.estimate = { usage: e.usage, quota: e.quota };
        else report.estimateUnavailable = true;
      } catch (_) { report.estimateUnavailable = true; }
    } else report.estimateUnavailable = true;
    return report;
  }
  function cleanup(opts) {
    const { store, disk } = dependencies(opts);
    let removed = 0, failed = 0, bytes = 0;
    try {
      const keys = [];
      for (let i = 0; i < disk.length; i++) { const key = disk.key(i); if (key && CACHE_PREFIXES.some((p) => key.startsWith(p))) keys.push(key); }
      for (const key of keys) {
        const value = disk.getItem(key), size = (key.length + (value || "").length) * 2;
        try {
          if (store && store.rawDel ? !store.rawDel(key) : (disk.removeItem(key), false)) { failed++; continue; }
          removed++; bytes += size;
        } catch (_) { failed++; }
      }
    } catch (_) { return { ok: false, removed, failed: failed + 1, bytes }; }
    return { ok: failed === 0, removed, failed, bytes };
  }
  const size = (n) => (n / 1024).toFixed(1) + " KiB";
  function node(doc, tag, text) { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
  function mount(host, opts) {
    if (!host || mounted.has(host)) return mounted.get(host) || null;
    opts = opts || {};
    const doc = host.ownerDocument || document, root = node(doc, "section"); root.className = "save-health";
    const toggle = node(doc, "button", "STORAGE HEALTH & RESTORE POINTS"); toggle.type = "button"; toggle.className = "sel-chip";
    const panel = node(doc, "div"); panel.hidden = true; panel.className = "save-health-panel";
    const status = node(doc, "p"); status.setAttribute("role", "status");
    const measurements = node(doc, "div"), refresh = node(doc, "button", "REFRESH STORAGE REPORT"), clear = node(doc, "button", "CLEAR DOWNLOADED RESPONSE CACHES");
    for (const b of [refresh, clear]) { b.type = "button"; b.className = "sel-chip"; }
    let reportRevision = 0;
    async function update() {
      const revision = ++reportRevision; status.textContent = "Measuring storage…"; refresh.disabled = true;
      const report = await inspect(opts);
      if (revision !== reportRevision) return;
      measurements.replaceChildren();
      measurements.appendChild(node(doc, "p", report.ok ? "Local game data: " + size(report.localBytes) + " (UTF-16 estimate)." : "Local storage could not be read."));
      for (const row of report.categories) measurements.appendChild(node(doc, "p", row.name + ": " + size(row.bytes) + " across " + row.keys + " keys."));
      measurements.appendChild(node(doc, "p", report.estimate ? "Whole origin estimate: " + size(report.estimate.usage) + " used of " + size(report.estimate.quota) + ". This includes IndexedDB and downloaded assets." : "Whole-origin usage estimate is unavailable in this browser."));
      if (report.mirror) {
        const m = report.mirror;
        measurements.appendChild(node(doc, "p", "Local mirror: " + (m.supported ? "available" : "unavailable") + "; " + m.pending + " queued, " + m.failed + " failed writes, " + m.skipped + " skipped by limits."));
        if (report.policy) measurements.appendChild(node(doc, "p", "Garage mirror: " + size(m.authoredBytes) + " / " + size(report.policy.totalBytes) + ", " + m.authoredKeys + " / " + report.policy.keys + " keys; each item at most " + size(report.policy.rowBytes) + "."));
      }
      if (report.failed.length) for (const f of report.failed) measurements.appendChild(node(doc, "p", "Not saved: " + f.key + " (" + f.reason + "). Use SAVE RETRY after making room."));
      else measurements.appendChild(node(doc, "p", "No failed primary writes are currently recorded."));
      for (const point of report.history) measurements.appendChild(node(doc, "p",
        (point.flavour === "myteam" ? "MY TEAM" : "DRIVER") + " SLOT " + (point.slot + 1) + " history: " +
        (point.state === "saved" ? "last restore point saved" : point.state === "saving" ? "capturing restore point" : "restore point unavailable (" + point.reason + ")") +
        " · " + new Date(point.at).toLocaleString() + ". Primary save status is separate."));
      status.textContent = "Cleanup removes only downloaded response caches. Career saves, garage work, ghosts and authored circuits are kept.";
      refresh.disabled = false;
    }
    toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) update(); };
    toggle.setAttribute("aria-expanded", "false");
    refresh.onclick = update;
    clear.onclick = async () => {
      clear.disabled = true; const result = cleanup(opts); await update();
      status.textContent = result.ok ? "Removed " + result.removed + " downloaded cache entries (" + size(result.bytes) + " estimated). Save failures stay recorded until SAVE RETRY succeeds." : "Some caches could not be removed. Saves were kept.";
      clear.disabled = false;
    };
    const history = node(doc, "div"); history.className = "save-health-history";
    history.appendChild(node(doc, "p", "Restore points are local history, captured at round completion and import. Clearing site data removes them too. Keep exported files as a separate backup."));
    const choice = node(doc, "select"); choice.setAttribute("aria-label", "Career slot for restore points");
    for (const f of ["driver", "myteam"]) for (let i = 0; i < 3; i++) { const o = node(doc, "option", (f === "driver" ? "DRIVER" : "MY TEAM") + " SLOT " + (i + 1)); o.value = f + "." + i; choice.appendChild(o); }
    const show = node(doc, "button", "VIEW RESTORE POINTS"); show.type = "button"; show.className = "sel-chip";
    const list = node(doc, "div"); let historyRevision = 0;
    choice.onchange = () => { historyRevision++; list.replaceChildren(); };
    show.onclick = async () => {
      const api = opts.restorePoints || (typeof CareerRestorePoints !== "undefined" && CareerRestorePoints);
      if (!api) { status.textContent = "Restore history is unavailable."; return; }
      const revision = ++historyRevision, parts = choice.value.split("."), f = parts[0], i = +parts[1];
      show.disabled = true; const result = await api.list(f, i); show.disabled = false;
      if (revision !== historyRevision) return;
      list.replaceChildren();
      if (!result.ok || !result.items.length) { list.appendChild(node(doc, "p", result.ok ? "No restore points for this slot yet." : "Restore history could not be read.")); return; }
      for (const item of result.items) {
        const b = node(doc, "button", new Date(item.at).toLocaleString() + " · " + item.reason + " · " + item.summary.year + " round " + (item.summary.round + 1)); b.type = "button"; b.className = "sel-chip";
        b.onclick = async () => {
          const token = await api.preview(f, i, item.id); if (revision !== historyRevision) return;
          if (!token.ok) { status.textContent = "Cannot preview restore: " + token.reason + "."; return; }
          const confirmation = node(doc, "div");
          confirmation.appendChild(node(doc, "p", "Replace this slot's current progress (" + (token.current ? token.current.year + ", round " + (token.current.round + 1) : "empty") + ") with " + token.point.year + ", round " + (token.point.round + 1) + "?"));
          const accept = node(doc, "button", "RESTORE THIS POINT"), cancel = node(doc, "button", "CANCEL"); accept.type = cancel.type = "button"; accept.className = cancel.className = "sel-chip";
          accept.onclick = async () => {
            if (revision !== historyRevision || accept.disabled) return; accept.disabled = true;
            const r = await api.restore(token); if (revision !== historyRevision) return;
            confirmation.replaceChildren(node(doc, "p", r.ok && r.durable ? "Restore saved. Reload to use it." : "Restore did not finish durably: " + (r.reason || "storage unavailable") + ". Keep this page open."));
            if (r.ok && r.durable) { const reload = node(doc, "button", "RELOAD SAVED CAREER"); reload.type = "button"; reload.className = "sel-chip"; reload.onclick = () => location.reload(); confirmation.appendChild(reload); }
          };
          cancel.onclick = () => confirmation.remove(); confirmation.append(accept, cancel); list.replaceChildren(confirmation);
        };
        list.appendChild(b);
      }
    };
    history.append(choice, show, list); panel.append(status, measurements, refresh, clear, history); root.append(toggle, panel); host.appendChild(root);
    const handle = { root, refresh: update }; mounted.set(host, handle); return handle;
  }
  function boot() {
    if (typeof document === "undefined") return;
    const host = document.getElementById("pm-panel-files"); if (host) mount(host);
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
  }
  return { inspect, cleanup, mount, category };
})();
Object.freeze(SaveHealth);
