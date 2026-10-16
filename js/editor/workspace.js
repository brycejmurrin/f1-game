/* Track Designer workspace: navigation, disclosure groups and review actions.
 * Presentation state stays local; circuit edits still belong to TrackDesigner. */
const DesignerWorkspace = (function () {
  "use strict";
  const FOLDS = new Set(["CORNERS", "ROAD", "ELEVATION", "BANKING & KERBS", "TURNS", "SHARE CODE"]);
  function group(el, label) {
    const fold = FOLDS.has(label), g = el(fold ? "details" : "div", "td-group");
    g._label = el(fold ? "summary" : "div", "td-label", label);
    if (fold) { g.dataset.role = "inspector-section"; g.open = !["TURNS", "BANKING & KERBS", "SHARE CODE", "CORNERS"].includes(label); }
    g.appendChild(g._label);
    return g;
  }
  function create({ root, ui, files, el, btn, onTest, onHelp }) {
    const positions = new Map();
    let location = "design:edit", lastTool = null;
    const foot = root.querySelector(".td-foot");
    const menu = el("details"); menu.dataset.role = "file-menu";
    const trigger = el("summary", "sel-chip", "SHARE & FILES");
    files.remove(); menu.append(trigger, files);
    const closeMenu = (e) => {
      if ((e.key === "Escape" || e.type === "cancel") && menu.open && !root.hidden) {
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        menu.open = false; trigger.focus();
        return true;
      }
      return false;
    };
    menu.addEventListener("keydown", closeMenu);
    menu.addEventListener("cancel", closeMenu);
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("keydown", closeMenu, true);
    files.addEventListener("click", () => { menu.open = false; trigger.focus(); });
    const status = el("div", "td-chips"); status.dataset.role = "workspace-status";
    const checks = btn("CHECKS · WAITING", "sel-chip", () => { onTest(); requestAnimationFrame(() => { ui.checksGroup.scrollIntoView({ block: "nearest" }); ui.checksGroup.focus(); }); });
    checks.dataset.role = "checks-summary";
    checks.disabled = true;
    ui.checksGroup.tabIndex = -1;
    ui.msg.remove(); status.append(checks, ui.msg); foot.append(menu, status);
    const help = btn("HELP", "sel-chip", onHelp); help.dataset.role = "context-help";
    ui.modeGroup.appendChild(help);
    let step = 0;
    for (const b of ui.modes.children) { b.dataset.step = String(++step); }
    function remember() { positions.set(location, ui.rail.scrollTop); }
    function navigate(key) {
      if (key === location) return;
      location = key;
      ui.rail.scrollTop = positions.get(key) || 0;
      menu.open = false;
    }
    function refresh(mode, tool) {
      if (tool !== lastTool && tool !== "select" && tool !== "draw") ui.shape.open = true;
      lastTool = tool;
      help.setAttribute("aria-label", "Help with " + mode);
    }
    function review(verdict) {
      checks.disabled = !verdict;
      if (!verdict) return;
      checks.dataset.level = verdict.red ? "red" : verdict.amber ? "amber" : "ok";
      checks.textContent = "CHECKS · " + (verdict.red ? verdict.red + " TO FIX" : verdict.amber ? verdict.amber + " WARNINGS" : "READY TO RACE");
      checks.setAttribute("aria-label", "Review design checks: " + verdict.red + " errors, " + verdict.amber + " warnings");
    }
    return { navigate, remember, refresh, review, closeMenu };
  }
  return { group, create };
})();
