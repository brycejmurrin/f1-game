/* Shared tuner furniture only. Domain modules retain preview and persistence ownership. */
const EditorWorkspace = (function () {
  "use strict";
  const mounted = new WeakMap();
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
    toggle.onclick = () => setPreview(sheet.dataset.editorView !== "preview");
    const media = doc.defaultView && doc.defaultView.matchMedia("(max-height: 620px), (max-width: 600px)");
    const fit = () => { if (tools) tools.open = !media || !media.matches; };
    if (media && media.addEventListener) media.addEventListener("change", fit);
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
    return [
      ["lighting", "lt-rail", "Lighting", "Auto-saved · displayed circuit, time and weather"],
      ["camtune", "ct-rail", "Camera", "Auto-saved · selected camera scope"],
      ["flyby", "fb-rail", "Flyby", "Auto-saved · next race’s flyby"],
      ["garrival", null, "Garage arrival", "Auto-saved · arrivals and drive-outs"],
    ].map(([id, rail, title, note]) => attach(doc.getElementById(id), {
      rail, title, note, done: ({ lighting: "lt-close", camtune: "ct-close", flyby: "fb-close", garrival: "ga-close" })[id],
      previews: id === "camtune" ? "ct-previews" : null,
      entry: ({ lighting: "pc-toggle", flyby: "fb-freecam" })[id] || null,
      help: id === "garrival" ? "#ga-rows > .adv-help" : null, launcher: "pm-" + id, nested: id === "flyby" ? "freecam" : null,
    }));
  }
  return Object.freeze({ attach, init });
})();
