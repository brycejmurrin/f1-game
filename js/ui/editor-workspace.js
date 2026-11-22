/* Shared tuner furniture only. Domain modules retain preview and persistence ownership. */
const EditorWorkspace = (function () {
  "use strict";
  const mounted = new WeakMap();
  function arrangeDoor(root, host, id = root?.id, label = "Arrange this screen") {
    if (!root || !host || !id) return;
    const existing = host.querySelector('[data-arrange-screen="' + id + '"]');
    if (existing) return existing;
    const doc = root.ownerDocument, button = doc.createElement("button");
    button.type = "button";
    button.setAttribute("data-arrange-screen", id);
    button.textContent = label;
    button.onclick = () => SettingsNav.arrangeScreen(id, button,
      () => !root.hidden && button.isConnected && button.getClientRects().length, label);
    host.appendChild(button);
    return button;
  }
  function attach(root, options = {}) {
    if (!root || !root.ownerDocument) return null;
    if (mounted.has(root)) return mounted.get(root);
    const sheet = root.querySelector(".sheet");
    if (!sheet) return null;
    const doc = root.ownerDocument;
    const make = (tag, text, cls) => {
      const el = doc.createElement(tag);
      if (text) el.textContent = text;
      if (cls) el.className = cls;
      return el;
    };
    // Keep the garage's live controls ahead of documentation. Move the actual
    // buttons, preserving the domain handlers, preview origin and focus target.
    const rows = options.rows && doc.getElementById(options.rows);
    if (rows) {
      const sequences = make("div", null, "balanced-row");
      sequences.dataset.editorSequences = "";
      sequences.setAttribute("role", "group"); sequences.setAttribute("aria-label", "Preview sequence");
      for (const [id, text] of options.sequences || []) {
        const button = doc.getElementById(id);
        if (button) { button.textContent = text; sequences.append(button); }
      }
      if (sequences.children.length) sheet.insertBefore(sequences, rows);
      const help = make("details", null, "ew-tools");
      help.dataset.editorHelp = ""; help.open = false;
      help.append(make("summary", "Help and reset"));
      const reset = options.reset && doc.getElementById(options.reset);
      if (reset) help.append(reset);
      for (const paragraph of [...rows.querySelectorAll(".adv-help")]) help.append(paragraph);
      rows.append(help);
      const first = options.first && doc.getElementById(options.first);
      const row = first && first.closest(".set-row");
      if (row && row.parentNode === rows) { row.remove(); rows.prepend(row); }
    }
    const bar = make("div", null, "ew-toolbar");
    const label = make("h2", options.title || root.getAttribute("aria-label") || "Editor", "ew-title");
    const toggle = make("button", "Preview", "ew-preview");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Show unobstructed preview");
    bar.append(label, toggle);
    // The FREE CAMERA door stays on the always-visible toolbar: on a short screen the rail it
    // lives in is folded into the tools disclosure, which would hide the only way into it.
    const entry = options.entry && doc.getElementById(options.entry);
    if (entry) bar.append(entry);
    arrangeDoor(root, bar);
    const note = make("p", options.note || "Changes save automatically on this device.", "ew-note");
    sheet.prepend(note);
    sheet.prepend(bar);
    sheet.classList.add("editor-workspace");
    let tools = null;
    const rail = options.rail && doc.getElementById(options.rail);
    const foot = sheet.querySelector(".sheet-foot");
    const actions = foot && options.done ? [...foot.querySelectorAll("button")].filter(b => b.id !== options.done) : [];
    if ((rail && rail.parentNode === sheet) || actions.length) {
      tools = make("details", null, "ew-tools");
      tools.append(make("summary", "Scope, presets and preview tools"));
      sheet.insertBefore(tools, rail || sheet.children[2] || foot);
      if (rail && rail.parentNode === sheet) tools.append(rail);
      const help = options.help && sheet.querySelector(options.help);
      if (help) tools.append(help);
      if (actions.length) {
        const row = make("div", null, "balanced-row");
        row.setAttribute("role", "group"); row.setAttribute("aria-label", "Editor actions");
        row.append(...actions); tools.append(row);
      }
      const previews = options.previews && doc.getElementById(options.previews);
      if (previews) tools.append(previews);
      const json = sheet.querySelector("textarea");
      if (json) tools.append(json);
    }
    function setPreview(on) {
      sheet.dataset.editorView = on ? "preview" : "edit";
      toggle.textContent = on ? "Edit" : "Preview";
      toggle.setAttribute("aria-pressed", String(on));
      toggle.setAttribute("aria-label", on ? "Return to editor controls" : "Show unobstructed preview");
    }
    toggle.onclick = () => {
      const on = sheet.dataset.editorView !== "preview";
      const session = options.previewSession && doc.getElementById(options.previewSession);
      // A bare garage editor has no scene. Start its real preview action only
      // when no transport is active; an edited or paused sequence keeps its pose.
      if (on && options.defaultPreview && (!session || session.hidden)) {
        const scope = doc.getElementById("ga-edit-moment");
        const selected = scope && { raceStart: "ga-preview-out", pitIn: "ga-preview-in", pitOut: "ga-preview-pit-exit", afterRace: "ga-preview-home" }[scope.value];
        const button = doc.getElementById(selected || options.defaultPreview);
        if (button) {
          // The domain hides its sheet for playback and restores it on Stop.
          // Leave edit furniture ready for that return rather than hiding it twice.
          setPreview(false); button.click(); return;
        }
      }
      setPreview(on);
    };
    // Fold the tools only where css/tuner.css shows their summary: the sheet's OWN density (UI SIZE moves it; a
    // window-height query closed them at UI SIZE 50-62 on a 390 px phone with no summary to reopen, #5562) or a narrow window.
    const media = doc.defaultView && doc.defaultView.matchMedia("(max-width: 600px)");
    const fit = () => {
      if (!tools) return;
      const compact = sheet.dataset.density === "compact" || (media && media.matches);
      const editingTool = tools.contains(doc.activeElement) && doc.activeElement !== tools.firstChild;
      tools.open = !compact || editingTool;
    };
    if (media && media.addEventListener) media.addEventListener("change", fit);
    const Shape = doc.defaultView && doc.defaultView.MutationObserver;
    if (Shape && tools) new Shape(fit).observe(sheet, { attributes: true, attributeFilter: ["data-density"] });
    fit(); setPreview(false);
    // Capture before a domain opener hides Settings (and may move focus).
    // A direct garage/context entry has no Settings origin to restore.
    const nav = options.nav || (typeof SettingsNav !== "undefined" ? SettingsNav : null);
    const settings = doc.getElementById("pmsettings");
    const launcher = options.launcher && doc.getElementById(options.launcher);
    const nested = options.nested && doc.getElementById(options.nested);
    let pending = null, origin = null, opened = !root.hidden, suspended = false;
    if (launcher) launcher.addEventListener("click", () => {
      pending = settings && !settings.hidden && nav && nav.current
        ? { page: nav.current(), focus: launcher } : null;
    }, true);
    // Reset furniture on entry; restore navigation only AFTER domain cleanup
    // has returned to Settings. A resume/quit must never reopen that sheet.
    const Observer = doc.defaultView && doc.defaultView.MutationObserver;
    const observer = Observer && new Observer(() => {
      if (!root.hidden) {
        if (!opened) { origin = pending || (suspended ? origin : null); pending = null; }
        suspended = false;
        opened = true; setPreview(false); fit();
      } else if (opened) {
        opened = false;
        // Flyby hands its camera to Free Camera and receives it back on Done.
        // Observe both roots so abandoning that nested view clears the origin.
        if (origin && nested && !nested.hidden && settings && settings.hidden) {
          suspended = true; return;
        }
        const back = origin; origin = null;
        if (!back || !settings || settings.hidden) return;
        if (nav && nav.show) nav.show(back.page);
        const focus = () => {
          if (root.hidden && !settings.hidden && back.focus.isConnected &&
              (!back.focus.getClientRects || back.focus.getClientRects().length)) back.focus.focus();
        };
        if (doc.defaultView && doc.defaultView.requestAnimationFrame) doc.defaultView.requestAnimationFrame(focus);
        else focus();
      } else if (suspended && (!nested || nested.hidden)) {
        suspended = false; origin = null;
      }
    });
    if (observer) {
      observer.observe(root, { attributes: true, attributeFilter: ["hidden"] });
      if (nested) observer.observe(nested, { attributes: true, attributeFilter: ["hidden"] });
    }
    const api = Object.freeze({ setPreview, setNote: (text) => { note.textContent = text; } });
    mounted.set(root, api);
    return api;
  }
  function init(doc = document) {
    arrangeDoor(doc.getElementById("photo-controls"), doc.getElementById("pc-bar"), "photo-controls", "Arrange camera sticks");
    return [
      ["lighting", "lt-rail", "Lighting", "Auto-saved · displayed circuit, time and weather"],
      ["camtune", "ct-rail", "Camera", "Auto-saved · selected camera scope"],
      ["flyby", "fb-rail", "Flyby", "Auto-saved · next race’s flyby"],
      ["garrival", null, "Garage animation", "Changes save automatically."],
    ].map(([id, rail, title, note]) => attach(doc.getElementById(id), {
      rail, title, note, done: ({ lighting: "lt-close", camtune: "ct-close", flyby: "fb-close", garrival: "ga-close" })[id],
      previews: id === "camtune" ? "ct-previews" : null,
      entry: ({ lighting: "pc-toggle", flyby: "fb-freecam" })[id] || null,
      rows: id === "garrival" ? "ga-rows" : null, first: "ga-edit-moment", reset: "ga-reset",
      defaultPreview: id === "garrival" ? "ga-preview-out" : null, previewSession: id === "garrival" ? "ga-transport" : null,
      sequences: [["ga-preview-out", "Race start"], ["ga-preview-in", "Pit entry"], ["ga-preview-pit-exit", "Pit exit"], ["ga-preview-home", "Race end"]],
      launcher: "pm-" + id, nested: id === "flyby" ? "freecam" : null,
    }));
  }
  return Object.freeze({ attach, init, arrangeDoor });
})();
