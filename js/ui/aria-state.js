"use strict";
window.AriaState = (function () {
  const ON = ["active", "on"];
  const ROOTS = "#overlay,#select,#career,#career-offers,#career-history,#career-guide,#teampicker,#carsetup,#howtoplay," +
    "#pmsettings,#bench,#pausemenu,#lighting,#camtune,#flyby,#freecam,#garrival,#tl-editor,#results,#quali,#standings,#duel-picker," +
    "#race-settings,#customize,#datahub,#track-detail,#spotifypanel,#vsfriend,#season-setup,#photo-studio,#trackdesigner";

  const isOn = (el) => ON.some((c) => el.classList.contains(c));
  const claimed = (el) =>
    el.hasAttribute("aria-selected") || el.hasAttribute("aria-checked") ||
    (el.hasAttribute("aria-pressed") && !labelled.has(el)) ||
    el.hasAttribute("data-aria-toggle") ||
    el.hasAttribute("data-aria-action") ||
    el.getAttribute("role") === "option" || el.getAttribute("role") === "tab";

  const labelled = new WeakSet();

  function syncGroup(parent) {
    if (!parent) return;
    const btns = [];
    let anyOn = false;
    let known = false;
    for (const c of parent.children) {
      if (c.tagName !== "BUTTON" || claimed(c)) continue;
      btns.push(c);
      if (isOn(c)) anyOn = true;
      if (labelled.has(c)) known = true;
    }
    if (!btns.length || (!anyOn && !known)) return;
    for (const b of btns) {
      labelled.add(b);
      const next = isOn(b) ? "true" : "false";
      if (b.getAttribute("aria-pressed") !== next) b.setAttribute("aria-pressed", next);
    }
  }

  function syncRoot(root) {
    if (!root) return;
    const seen = new Set();
    for (const b of root.querySelectorAll("button")) {
      const p = b.parentElement;
      if (!p || seen.has(p)) continue;
      seen.add(p);
      syncGroup(p);
    }
  }

  const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function wrapOnOff(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!/\b(ON|OFF)\b/.test(t)) return null;
    return t.replace(/[&<>"']/g, (c) => HTML_ESC[c]).replace(/\b(ON|OFF)\b/g, (w) => `<span data-fold="${w.toLowerCase()}">${w}</span>`)
      .replace(/:\s+<span/g, ":\u00a0<span")
      .replace(/·\s+<span/g, "·\u00a0<span");
  }

  function paintOnOff(root) {
    if (!root) return;
    for (const el of root.querySelectorAll("button, summary")) {
      if (el.closest("#hud, #game-metrics")) continue;
      if (el.classList.contains("opt-btn")) continue;
      let foreign = false;
      for (const c of el.children) {
        if (!c.hasAttribute("data-fold")) { foreign = true; break; }
      }
      if (foreign) continue;
      if (el.querySelector("[data-fold]")) continue;
      const html = wrapOnOff(el.textContent);
      if (html) el.innerHTML = html;
    }
  }

  function syncHashNav(root) {
    const navs = root.querySelectorAll("#htp-contents, #cg-contents, #ch-contents");
    if (!navs.length) return;
    const hash = typeof location !== "undefined" ? location.hash : "";
    navs.forEach((nav) => {
      nav.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (href.charAt(0) === "#" && hash === href) { if (a.getAttribute("aria-current") !== "true") a.setAttribute("aria-current", "true"); }
        else a.removeAttribute("aria-current");
      });
    });
  }

  function syncValueText(root) {
    for (const input of root.querySelectorAll('input[type="range"][id]')) {
      const out = document.getElementById(input.id + "-v") ||
        (/^pm-hl-[xys]$/.test(input.id) && input.closest("label")?.querySelector(".tune-label")?.querySelector("b"));
      const text = out ? out.textContent.trim() : "";
      if (text && text !== String(input.value)) {
        if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
      } else if (input.hasAttribute("aria-valuetext")) input.removeAttribute("aria-valuetext");
    }
  }

  function syncOne(r) {
    syncRoot(r);
    paintOnOff(r);
    syncHashNav(r);
    syncValueText(r);
  }
  function syncAll() {
    for (const r of document.querySelectorAll(ROOTS)) syncOne(r);
  }

  function scopeOf(root, record) {
    const target = record.target;
    const el = target && (target.nodeType === 3 ? target.parentElement : target);
    if (!el || !el.closest || !root.contains(el)) return root;
    const button = el.closest("button"), summary = el.closest("summary");
    const label = el.closest("label");
    let scope = button ? button.parentElement : summary ? summary.parentElement : label;
    if (!scope && el.id && el.id.endsWith("-v")) {
      const input = document.getElementById(el.id.slice(0, -2));
      if (input && input.tagName === "INPUT" && input.type === "range") scope = input.parentElement;
    }
    return scope && root.contains(scope) ? scope : root;
  }
  let pending = 0;
  const dirty = new Set();
  const schedule = (root) => {
    for (const r of dirty) {
      if (r === root || r.contains(root)) return;
      if (root.contains(r)) dirty.delete(r);
    }
    dirty.add(root);
    if (pending) return;
    pending = setTimeout(() => {
      pending = 0;
      const roots = [...dirty];
      dirty.clear();
      for (const r of roots) syncOne(r);
    }, 0);
  };

  function init() {
    Log.info("game", "AriaState.init");
    for (const root of document.querySelectorAll(ROOTS)) {
      const obs = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "childList" || r.type === "attributes" || r.type === "characterData") {
            schedule(scopeOf(root, r));
          }
        }
      });
      obs.observe(root, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ["class"],
      });
    }
    window.addEventListener("hashchange", syncAll);
    syncAll();
  }

  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  return { sync: syncAll, wrapOnOff };
})();
