/* Named, bounded mechanical sheets. Applying never changes parts or paint. */
const SetupPresets = (function () {
  "use strict";
  const PREFIX = "setupPresets.", MAX = 12;
  let sequence = 0;
  const key = (team) => PREFIX + team;
  function cleanTune(tune) {
    if (!tune || typeof tune !== "object") return null;
    const out = {};
    for (const field of SetupTune.FIELDS) {
      if (typeof tune[field] !== "number" || !Number.isFinite(tune[field])) return null;
      const n = SetupTune.clampField(field, tune[field]);
      if (n !== tune[field]) return null;
      out[field] = n;
    }
    return out;
  }
  function cleanContext(raw) {
    if (!raw || raw.v !== 1) return null;
    const text = (v, n) => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, n) : null;
    const parts = {};
    if (raw.parts && typeof raw.parts === "object") for (const k of Object.keys(raw.parts).sort().slice(0, 32)) {
      if (/^[a-z0-9_-]{1,48}$/i.test(k) && typeof raw.parts[k] === "string") parts[k] = text(raw.parts[k], 96);
    }
    return { v: 1, physics: text(raw.physics, 96), track: text(raw.track, 128), parts,
      note: text(raw.note, 160) || "" };
  }
  function contextDiff(saved, current) {
    const a = cleanContext(saved), b = cleanContext(current);
    if (!a) return ["Saved context unknown (older preset)."];
    const out = [];
    for (const k of ["physics", "track"]) {
      if (!a[k] || !b || !b[k]) out.push(k + ": context unknown");
      else if (a[k] !== b[k]) out.push(k + ": " + a[k] + " → " + b[k]);
    }
    const keys = new Set([...Object.keys(a.parts), ...Object.keys(b && b.parts || {})]);
    if (!keys.size) out.push("Fitted build context unknown.");
    for (const k of keys) if (a.parts[k] !== (b && b.parts[k])) out.push("Part " + k + ": " + (a.parts[k] || "unknown") + " → " + (b && b.parts[k] || "unknown"));
    return out;
  }
  function normalize(raw) {
    if (!raw || raw.v !== 1 || !Array.isArray(raw.items)) return { v: 1, items: [] };
    const ids = new Set(), items = [];
    for (const row of raw.items.slice(0, MAX)) {
      const tune = cleanTune(row && row.tune);
      if (!tune || typeof row.id !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(row.id) || ids.has(row.id)
          || typeof row.name !== "string" || !row.name.trim()) continue;
      ids.add(row.id);
      items.push({ id: row.id, name: row.name.trim().slice(0, 32), tune,
        trackId: typeof row.trackId === "string" ? row.trackId.slice(0, 128) : null,
        at: Number.isFinite(row.at) ? row.at : 0, ...(Object.hasOwn(row, "context") ? { context: cleanContext(row.context) } : {}) });
    }
    return { v: 1, items };
  }
  function list(store, team) { return normalize(store.get(key(team), null)).items; }
  function editable(store, team) {
    const raw = store.get(key(team), null);
    return raw == null || (raw.v === 1 && Array.isArray(raw.items) && raw.items.length <= MAX
      && normalize(raw).items.length === raw.items.length);
  }
  function write(store, team, items) {
    if (!editable(store, team)) return { ok: false, reason: "incompatible" };
    const value = { v: 1, items };
    const result = store.write ? store.write(key(team), value) : { ok: true, durable: store.set(key(team), value) !== false };
    return { ok: result.ok !== false, durable: result.durable !== false, reason: result.reason || null };
  }
  function save(store, team, name, tune, trackId, context) {
    const items = list(store, team), clean = cleanTune(tune), title = String(name || "").trim().slice(0, 32);
    if (!title || !clean) return { ok: false, reason: "invalid" };
    if (items.length >= MAX) return { ok: false, reason: "full" };
    if (items.some((r) => r.name.toLowerCase() === title.toLowerCase())) return { ok: false, reason: "name" };
    const row = { id: Date.now().toString(36) + "-" + (++sequence).toString(36), name: title, tune: clean,
      trackId: typeof trackId === "string" ? trackId.slice(0, 128) : null, at: Date.now(), ...(context ? { context: cleanContext(context) } : {}) };
    const result = write(store, team, items.concat([row]));
    return Object.assign(result, { row });
  }
  function remove(store, team, id, expectedRevision) {
    if (expectedRevision != null && store.keyRevision && expectedRevision !== store.keyRevision(key(team))) return { ok: false, reason: "changed" };
    const items = list(store, team);
    if (!items.some((r) => r.id === id)) return { ok: false, reason: "missing" };
    return write(store, team, items.filter((r) => r.id !== id));
  }
  function diff(current, next) {
    return SetupTune.FIELDS.filter((f) => current[f] !== next[f]).map((field) => ({
      field, label: SetupTune.RANGE[field].label, before: current[field], after: next[field], unit: SetupTune.RANGE[field].unit,
    }));
  }
  function preview(store, team, id, context) {
    const row = list(store, team).find((r) => r.id === id);
    if (!row) return null;
    const current = SetupTune.get(team);
    return { id, tune: row.tune, current, context: row.context, at: row.at, contextChanges: contextDiff(row.context, context), changes: diff(current, row.tune),
      setupRevision: store.keyRevision ? store.keyRevision("setup." + team) : null,
      libraryRevision: store.keyRevision ? store.keyRevision(key(team)) : null };
  }
  function apply(store, team, pending) {
    if (!pending) return { ok: false, reason: "missing" };
    const row = list(store, team).find((r) => r.id === pending.id);
    if (!row) return { ok: false, reason: "missing" };
    if ((store.keyRevision && (pending.setupRevision !== store.keyRevision("setup." + team)
        || pending.libraryRevision !== store.keyRevision(key(team))))
        || diff(SetupTune.get(team), pending.current).length
        || diff(row.tune, pending.tune).length) return { ok: false, reason: "changed" };
    const result = store.write ? store.write("setup." + team, row.tune) : { ok: true, durable: store.set("setup." + team, row.tune) !== false };
    return { ok: result.ok !== false, durable: result.durable !== false, reason: result.reason || null };
  }
  function mount(host, o) {
    const section = document.createElement("section"); section.className = "player-tool-panel"; section.setAttribute("aria-label", "Named mechanical setups");
    const title = document.createElement("h3"); title.className = "adv-sec"; title.textContent = "SAVED SETUPS";
    const name = document.createElement("input"); name.type = "text"; name.maxLength = 32; name.placeholder = "Name this mechanical setup"; name.setAttribute("aria-label", "Setup name");
    const pick = document.createElement("select"); pick.setAttribute("aria-label", "Saved mechanical setup");
    const note = document.createElement("p"); note.className = "adv-help player-tool-note"; note.setAttribute("role", "status");
    const provenance = document.createElement("ul"); provenance.setAttribute("aria-label", "Saved setup context");
    const differences = document.createElement("ul"); differences.setAttribute("aria-label", "Proposed setup changes");
    const row = document.createElement("div"); row.className = "player-tool-row";
    function button(label, action) { const b = document.createElement("button"); b.type = "button"; b.className = "sel-chip"; b.textContent = label; b.onclick = action; row.appendChild(b); return b; }
    const intent = document.createElement("input"); intent.type = "text"; intent.maxLength = 160; intent.setAttribute("aria-label", "Setup context note"); intent.placeholder = "Optional note, e.g. dry braking practice";
    const context = () => Object.assign({}, o.context ? o.context() : {}, { note: intent.value || "" });
    let pending = null, deleting = null;
    const feedback = (result, success) => { note.textContent = !result.ok ? ({ full: "Twelve setups saved. Delete one before saving another.", name: "That name is already used. Choose a new name.", invalid: "Enter a name for this setup.", incompatible: "This preset library uses an unsupported or damaged format. Export it before replacing anything.", changed: "The setup changed since the preview. Preview it again.", missing: "That saved setup is no longer available." }[result.reason] || "Could not save this setup.")
      : result.durable === false ? success + " — SESSION ONLY. Keep this session open and use SAVE RETRY." : success; };
    function disarm() { pending = null; deleting = null; differences.replaceChildren(); provenance.replaceChildren(); applyButton.textContent = "PREVIEW APPLY"; deleteButton.textContent = "DELETE SETUP"; }
    function render(id) {
      const items = list(o.store, o.teamId); pick.replaceChildren();
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Choose a saved setup"; pick.appendChild(empty);
      for (const item of items) { const option = document.createElement("option"); option.value = item.id; option.textContent = item.name + (item.trackId ? " · " + item.trackId : ""); pick.appendChild(option); }
      pick.value = id || ""; saveButton.disabled = items.length >= MAX; applyButton.disabled = deleteButton.disabled = !pick.value;
    }
    const saveButton = button("SAVE CURRENT SETUP", () => {
      const result = save(o.store, o.teamId, name.value, SetupTune.get(o.teamId), o.trackId, context());
      feedback(result, "Setup saved"); if (result.ok) { disarm(); render(result.row.id); }
    });
    const applyButton = button("PREVIEW APPLY", () => {
      deleting = null; deleteButton.textContent = "DELETE SETUP";
      if (!pending) {
        pending = preview(o.store, o.teamId, pick.value, context()); differences.replaceChildren(); provenance.replaceChildren();
        if (!pending) { feedback({ ok: false, reason: "missing" }); return; }
        for (const text of ["Saved " + (pending.at ? new Date(pending.at).toLocaleString() : "date unknown"), ...(pending.context && pending.context.note ? [pending.context.note] : []), ...pending.contextChanges]) { const li = document.createElement("li"); li.textContent = text; provenance.appendChild(li); }
        for (const change of pending.changes) { const li = document.createElement("li"); li.textContent = change.label + ": " + change.before + " → " + change.after + change.unit; differences.appendChild(li); }
        note.textContent = pending.changes.length ? "Only these mechanical values will change. Confirm to apply." : "This setup already matches. Confirming makes no other changes.";
        applyButton.textContent = "CONFIRM APPLY";
        // Put the proposed change in view before offering the second press.
        // Scrolling never moves keyboard focus off the same action button.
        const previewBlock = pending.changes.length ? differences : note;
        if (previewBlock.scrollIntoView) previewBlock.scrollIntoView({ block: "start", behavior: "instant" });
        return;
      }
      const result = apply(o.store, o.teamId, pending); feedback(result, "Mechanical setup applied"); disarm(); if (result.ok && o.refresh) o.refresh();
    });
    const deleteButton = button("DELETE SETUP", () => {
      if (!deleting || deleting.id !== pick.value) { pending = null; applyButton.textContent = "PREVIEW APPLY"; differences.replaceChildren(); deleting = { id: pick.value, revision: o.store.keyRevision ? o.store.keyRevision(key(o.teamId)) : null }; deleteButton.textContent = "CONFIRM DELETE"; note.textContent = "Delete this saved preset? Your fitted mechanical setup stays as it is."; return; }
      const result = remove(o.store, o.teamId, deleting.id, deleting.revision); feedback(result, "Saved setup deleted"); disarm(); render();
    });
    pick.onchange = () => { disarm(); applyButton.disabled = deleteButton.disabled = !pick.value; };
    const help = document.createElement("p"); help.className = "adv-help"; help.textContent = "Up to twelve named mechanical setups per team. Circuit labels are reminders; presets never apply automatically or change parts or paint.";
    section.append(title, help, name, intent, pick, differences, provenance, note, row); host.appendChild(section); render();
    return { section, render };
  }
  return Object.freeze({ PREFIX, MAX, normalize, cleanContext, contextDiff, list, save, remove, diff, preview, apply, mount });
})();
Object.freeze(SetupPresets);
