"use strict";
/* A transparent native modal owns input while the actual screen renders each draft.
   Only Apply writes. Rotation switches draft and history together. */
window.ScreenArranger = (function () {
  const orientation = () => window.ScreenPlacement.orientation();
  const clone = value => JSON.parse(JSON.stringify(value));
  let active = null;

  function open(id, invoker = document.activeElement, onClose) {
    if (active) active();
    const screen = window.ScreenRegions[id];
    const root = screen && document.querySelector(screen.root);
    if (!root || root.hidden || root.closest("[hidden], dialog:not([open])")) return false;
    const placement = window.ScreenPlacement;
    const element = key => root.matches(screen.regions[key].selector) ? root : root.querySelector(screen.regions[key].selector);
    function shown(el) {
      if (!el?.getClientRects?.().length) return false;
      // A closed <details> can retain descendant layout boxes. Only its
      // summary and the disclosure itself are selectable until it opens.
      for (let p = el.parentElement; p && root.contains(p); p = p.parentElement) {
        if (p.tagName === "DETAILS" && !p.open && !p.querySelector("summary")?.contains(el)) return false;
        if (p === root) break;
      }
      return true;
    }
    const visibleKeys = () => Object.keys(screen.regions).filter(key => shown(element(key)));
    let keys = visibleKeys();
    const viewport = () => ({w: document.documentElement.clientWidth || innerWidth, h: document.documentElement.clientHeight || innerHeight});
    const rectOf = el => window.CssZoom ? window.CssZoom.viewportRect(el) : el.getBoundingClientRect();
    if (!keys.length) return false;

    let drafts = {}, resetLegacy = false;
    const history = [], initial = {};
    for (const side of ["portrait", "landscape"]) {
      drafts[side] = clone(placement.read(id, side));
      initial[side] = clone(drafts[side]);
    }
    let side = orientation(), key = keys[0], marked, drag, frame, closed = false;
    function el(tag, className) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      return element;
    }
    const dialog = el("dialog", "screen-arranger");
    dialog.id = "screen-arranger";
    dialog.dataset.editingScreen = id;
    dialog.setAttribute("aria-labelledby", "screen-arranger-title");
    dialog.setAttribute("data-esc-close", "screen-arranger-cancel");
    function node(tag, parent, value) {
      const child = el(tag);
      if (value) child.textContent = value;
      parent.appendChild(child);
      return child;
    }
    const panel = node("section", dialog);
    panel.className = "arrange-tools";
    const actions = node("div", panel);
    actions.id = "screen-arranger-bar";
    const controls = node("div", panel);
    controls.id = "arrange-controls";
    controls.hidden = true;
    const heading = node("h2", controls);
    heading.id = "screen-arranger-title";
    button(controls, "Move toolbar", () => {
      dialog.dataset.edge = dialog.dataset.edge === "start" ? "end" : "start";
      setExpanded(false);
      toggle.focus({preventScroll:true});
    });
    const picker = node("select", actions);
    picker.setAttribute("aria-label", "Region");
    const toggle = button(actions, "Controls", () => setExpanded(controls.hidden));
    toggle.setAttribute("aria-controls", controls.id);
    toggle.setAttribute("aria-expanded", "false");
    function setExpanded(open) {
      controls.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open) { refreshBrowse(); refreshScroll(); }
      if (!open && controls.contains(document.activeElement)) toggle.focus({preventScroll:true});
    }
    for (const k of keys) node("option", picker, screen.regions[k].label).value = k;
    const browseLabel = node("label", controls, "Browse section ");
    const browse = node("select", browseLabel);
    let browseActions = [];
    const originalTabs = new Map(), originalFolds = new Map();
    // Only native disclosures and the owner's semantic tab buttons are
    // forwarded. Capture, Quit, drive controls and arbitrary links stay inert.
    const tabSelector = 'button[role="tab"][aria-controls]';
    const canBrowse = el => shown(el) && !el.disabled && !el.matches(":disabled") && !el.closest('[aria-disabled="true"]');
    function refreshBrowse() {
      const candidates = Array.from(root.querySelectorAll('summary,' + tabSelector))
        .filter(el => (el.tagName !== "SUMMARY" || el.parentElement?.tagName === "DETAILS") &&
          canBrowse(el) &&
          (root !== document.body || keys.some(k => element(k)?.contains(el))))
        .map(el => {
          const title = el.getAttribute("aria-label") || el.textContent.trim();
          const verb = el.tagName !== "SUMMARY" ? "Tab · " : el.parentElement.open ? "Close " : "Open ";
          return {el, label: verb + title};
        });
      browseLabel.hidden = !candidates.length;
      if (candidates.length === browseActions.length &&
        candidates.every(({el, label}, i) => browseActions[i].el === el && browseActions[i].label === label)) return;
      browseActions = candidates;
      browse.replaceChildren();
      node("option", browse, "Choose a section").value = "";
      browseActions.forEach(({label}, i) => { node("option", browse, label).value = String(i); });
      browse.value = "";
    }
    browse.addEventListener("change", () => {
      if (browse.value === "") return;
      const el = browseActions[Number(browse.value)]?.el;
      browse.value = "";
      if (!el || !root.contains(el) || !canBrowse(el)) return;
      if (el.tagName === "SUMMARY") {
        // Opening a named disclosure can also close a sibling.
        for (const fold of root.querySelectorAll("details")) if (!originalFolds.has(fold)) originalFolds.set(fold, fold.open);
        el.parentElement.open = !el.parentElement.open;
      } else {
        const list = el.closest('[role="tablist"]');
        const previous = list?.querySelector('[aria-selected="true"]');
        if (previous && !originalTabs.has(list)) originalTabs.set(list, previous);
        el.click();
      }
      refreshRegions();
      refreshBrowse();
    });
    const stepLabel = node("label", controls, "Adjustment ");
    const step = node("select", stepLabel);
    node("option", step, "Fine").value = "1";
    node("option", step, "Coarse").value = "5";
    const row = () => {
      const el = node("div", controls);
      el.className = "arrange-row";
      return el;
    };
    const scrollButtons = row();
    let scrollHost;
    function scrollable(el) {
      return el?.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY);
    }
    function refreshScroll() {
      const part = element(key);
      scrollHost = null;
      for (let n = part; n && root.contains(n); n = n.parentElement) {
        if (scrollable(n)) { scrollHost = n; break; }
      }
      if (!scrollHost) scrollHost = Array.from(root.querySelectorAll(".pane, .sheet-body, [role=tabpanel]")).find(scrollable);
      scrollButtons.hidden = !scrollHost;
    }
    for (const [name, sign] of [["Scroll up", -1], ["Scroll down", 1]]) {
      button(scrollButtons, name, () => {
        refreshScroll();
        if (scrollHost) scrollHost.scrollTop += sign * Math.max(1, Math.floor(scrollHost.clientHeight * .75));
      });
    }
    function button(parent, title, fn) {
      const el = node("button", parent, title);
      el.type = "button";
      el.addEventListener("click", fn);
      return el;
    }
    function remember() {
      if (history.length >= 80) history.shift();
      history.push({drafts: clone(drafts), resetLegacy});
    }
    function undoLast() {
      const snapshot = history.pop();
      if (!snapshot) return;
      drafts = snapshot.drafts;
      if (snapshot.resetLegacy !== resetLegacy) {
        resetLegacy = snapshot.resetLegacy;
        placement.resetLegacy(id, resetLegacy ? "preview" : "restore");
      }
    }
    function change(fn) {
      if (!shown(element(key))) return;
      remember();
      fn();
      render();
    }
    function region() { return drafts[side][key] || (drafts[side][key] = {}); }
    const fieldValue = (prop, value) => placement.fieldValue(prop, value, screen.regions[key]);
    const directions = {Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1]};
    function offset(record, x, y, dx, dy) {
      record.x = fieldValue("x", x + dx);
      record.y = fieldValue("y", y + dy);
    }
    function move(name, amount) {
      const [dx, dy] = directions[name];
      if (screen.regions[key][dx ? "x" : "y"] === false) return;
      change(() => {
        const r = region();
        offset(r, r.x || 0, r.y || 0, dx * amount, dy * amount);
      });
    }
    const arrows = row();
    for (const name of Object.keys(directions)) button(arrows, name, () => move(name, Number(step.value)));
    const sizes = row(), sizing = [];
    for (const prop of ["width", "height", "scale"]) {
      for (const sign of [-1, 1]) {
        const title = prop[0].toUpperCase() + prop.slice(1) + (sign < 0 ? " −" : " +");
        const btn = button(sizes, title, () => change(() => {
          const r = region(), n = Number(step.value) * sign;
          if (prop === "scale") r.scale = fieldValue(prop, (r.scale || 1) + n * 0.05);
          else {
            const rect = rectOf(element(key));
            const {w, h} = viewport();
            const measured = rect[prop] / ((prop === "width" ? w : h) * (r.scale || 1)) * 100;
            r[prop] = fieldValue(prop, (r[prop] || measured) + n);
            if (id === "career" && prop === "width" && ["calendar", "navigation"].includes(key)) {
              const other = drafts[side][key === "calendar" ? "navigation" : "calendar"];
              if (other) delete other.width;
            }
          }
        }));
        sizing.push({btn, prop});
      }
    }
    // Only measure a button when changing a dimension. A drag never needs its size.
    const styleRow = row();
    const buttonSelector = "button:not(.screen-arrange-entry), [role=button], input[type=button], input[type=submit], input[type=reset]";
    function firstButton() {
      const part = element(key);
      if (!part) return null;
      return part.matches(buttonSelector) ? part : part.querySelector(buttonSelector);
    }
    const appearanceButtons = [];
    for (const [prop, label] of [["textSize", "Text size"], ["buttonWidth", "Button width"], ["buttonHeight", "Button height"]]) {
      for (const sign of [-1, 1]) {
        const btn = button(styleRow, label + (sign < 0 ? " −" : " +"), () => change(() => {
          const r = region(), increment = Number(step.value) * sign;
          if (prop === "textSize") r[prop] = fieldValue(prop, (r[prop] || 1) + increment * .05);
          else {
            const control = firstButton();
            if (!control) return;
            let parent = control.parentElement;
            while (parent && !parent.clientWidth) parent = parent.parentElement;
            const current = prop === "buttonWidth"
              ? control.offsetWidth * 100 / Math.max(1, parent?.clientWidth || control.offsetWidth)
              : control.offsetHeight;
            const baseline = r[prop] ?? fieldValue(prop, current);
            r[prop] = fieldValue(prop, baseline + increment * 2);
          }
        }));
        if (prop !== "textSize") appearanceButtons.push(btn);
      }
    }
    const advanced = node("details", controls);
    node("summary", advanced, "Advanced style");
    const advancedInputs = new Map();
    for (const [prop, name, min, max] of [
      ["formWidth", "Form control width (%)", 10, 100],
      ["textAlign", "Text alignment"], ["cornerRadius", "Corner radius (px)", 0, 40],
      ["rowGap", "Row gap (px)", 0, 48], ["columnGap", "Column gap (px)", 0, 48],
    ]) {
      const label = node("label", advanced, name);
      const input = node(prop === "textAlign" ? "select" : "input", label);
      if (prop === "textAlign") {
        for (const [value, text] of [["", "Automatic"], ["start", "Start"], ["center", "Center"], ["end", "End"]]) {
          node("option", input, text).value = value;
        }
      } else {
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = "1";
        input.placeholder = "Auto";
      }
      input.addEventListener("change", () => change(() => {
        if (input.value === "") delete region()[prop];
        else region()[prop] = prop === "textAlign" ? input.value : fieldValue(prop, Number(input.value));
      }));
      advancedInputs.set(prop, { label, input });
    }
    function refreshStyleFields() {
      const part = element(key);
      const form = placement.formControls;
      advancedInputs.get("formWidth").label.hidden = !part || !form || !(part.matches(form) || part.querySelector(form));
      const display = part && window.getComputedStyle?.(part).display;
      const hasGap = ["grid", "inline-grid", "flex", "inline-flex"].includes(display);
      advancedInputs.get("rowGap").label.hidden = !hasGap;
      advancedInputs.get("columnGap").label.hidden = !hasGap;
    }
    advanced.addEventListener("toggle", () => { if (advanced.open) refreshStyleFields(); });
    const status = node("output", controls);
    status.setAttribute("aria-live", "polite");
    const edits = row();
    const undo = button(edits, "Undo", () => {
      undoLast();
      render();
    });
    button(edits, "Reset region", () => change(() => { delete drafts[side][key]; }));
    button(edits, "Reset screen", () => change(() => {
      drafts = {portrait: {}, landscape: {}};
      resetLegacy = true;
      placement.resetLegacy(id, "preview");
    }));
    const copy = button(edits, "", () => change(() => {
      drafts[side] = clone(drafts[side === "portrait" ? "landscape" : "portrait"]);
    }));
    button(actions, "Cancel", () => finish(false)).id = "screen-arranger-cancel";
    button(actions, "Apply", () => finish(true));
    let checkedKey;
    function render() {
      placement.apply(id, drafts[side]);
      const selected = element(key);
      if (selected !== marked) {
        marked?.classList.remove("arrange-selection");
        marked = selected;
        marked?.classList.add("arrange-selection");
      }
      picker.value = key;
      heading.textContent = screen.label + " · " + side;
      copy.textContent = "Copy from " + (side === "portrait" ? "landscape" : "portrait");
      undo.disabled = !history.length;
      for (const {btn, prop} of sizing) btn.disabled = screen.regions[key][prop] === false;
      arrows.hidden = screen.regions[key].x === false && screen.regions[key].y === false;
      sizes.hidden = sizing.every(({btn}) => btn.disabled);
      if (checkedKey !== key) {
        const available = !!firstButton();
        for (const btn of appearanceButtons) btn.hidden = !available;
        if (advanced.open) refreshStyleFields();
        checkedKey = key;
      }
      const r = drafts[side][key] || {};
      for (const [prop, { input }] of advancedInputs) {
        const value = String(r[prop] ?? "");
        if (input.value !== value) input.value = value;
      }
      updateStatus(r);
    }
    function updateStatus(r) {
      status.textContent = "X " + (r.x || 0) + "% · Y " + (r.y || 0) + "% · Width " +
        (r.width ? r.width + "%" : "auto") + " · Height " + (r.height ? r.height + "%" : "auto") +
        " · Scale " + Math.round((r.scale || 1) * 100) + "%" +
        " · Text " + Math.round((r.textSize || 1) * 100) + "%" +
        (!appearanceButtons[0].hidden ? " · Button width " + (r.buttonWidth ? r.buttonWidth + "%" : "auto") +
          " · Minimum button height " + (r.buttonHeight ? r.buttonHeight + " px" : "auto") : "") +
        (screen.regions[key].constraint ? " · " + screen.regions[key].constraint : "") +
        (resetLegacy ? " · Reset covers both orientations" : "");
    }
    // Prefer the edge covering less of the selected region. Keep the bar
    // still during a drag so moving a region never moves the controls.
    function clearSelection() {
      if (!marked) return;
      const box = rectOf(marked), bar = panel.getBoundingClientRect();
      const {w, h} = viewport();
      const overlap = (x, y) => Math.max(0, Math.min(x + bar.width, box.right) - Math.max(x, box.left))
        * Math.max(0, Math.min(y + bar.height, box.bottom) - Math.max(y, box.top));
      const x = side === "landscape" ? w - bar.right : bar.left;
      const y = side === "portrait" ? h - bar.bottom : bar.top;
      if (overlap(x, y) < overlap(bar.left, bar.top)) {
        dialog.dataset.edge = dialog.dataset.edge === "start" ? "end" : "start";
      }
    }
    picker.addEventListener("change", () => {
      key = picker.value;
      element(key)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      render(); clearSelection();
    });
    function abortDrag() {
      if (!drag) return;
      cancelAnimationFrame(frame);
      frame = 0;
      if (drag.changed) undoLast();
      drag = null;
      render();
    }
    function flush() {
      frame = 0;
      if (!drag || (!drag.changed && Math.hypot(drag.dx, drag.dy) < 3)) return;
      if (drag.dx === drag.lastX && drag.dy === drag.lastY) return;
      if (!drag.changed) { remember(); drag.changed = true; undo.disabled = false; }
      drag.lastX = drag.dx;
      drag.lastY = drag.dy;
      const r = region();
      offset(r, drag.x, drag.y, drag.dx / drag.w * 100, drag.dy / drag.h * 100);
      placement.apply(id, drafts[side]);
      updateStatus(r);
    }
    dialog.addEventListener("pointerdown", e => {
      if (drag) { abortDrag(); return; }
      if (!e.isPrimary || e.button !== 0 || panel.contains(e.target)) return;
      setExpanded(false);
      e.preventDefault();
      const hit = keys.map(k => {
        const el = element(k);
        return {k, rect:el && rectOf(el)};
      }).filter(({rect}) => rect &&
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
      hit.sort((a,b) => a.rect.width*a.rect.height - b.rect.width*b.rect.height);
      if (!hit.length) return;
      key = hit[0].k;
      render();
      if (screen.regions[key].x === false && screen.regions[key].y === false) { clearSelection(); return; }
      const r = drafts[side][key] || {};
      drag = {id:e.pointerId, startX:e.clientX, startY:e.clientY, dx:0, dy:0,
        ...viewport(), x:r.x || 0, y:r.y || 0, changed:false};
      dialog.setPointerCapture(e.pointerId);
    });
    dialog.addEventListener("pointermove", e => {
      if (!drag || drag.id !== e.pointerId) return;
      drag.dx = e.clientX - drag.startX;
      drag.dy = e.clientY - drag.startY;
      if (!frame) frame = requestAnimationFrame(flush);
    });
    dialog.addEventListener("pointerup", e => {
      if (!drag || drag.id !== e.pointerId) return;
      cancelAnimationFrame(frame);
      drag.dx = e.clientX - drag.startX;
      drag.dy = e.clientY - drag.startY;
      flush();
      drag = null;
    });
    for (const event of ["pointercancel", "lostpointercapture"]) dialog.addEventListener(event, abortDrag);
    function refreshRegions() {
      if (closed) return;
      const current = visibleKeys();
      if (drag && (!current.includes(key) || element(key) !== marked)) abortDrag();
      if (!current.length) { picker.disabled = true; return; }  // an asynchronous tab can briefly be empty
      picker.disabled = false;
      const changed = current.length !== keys.length || current.some((k, i) => k !== keys[i]);
      keys = current;
      if (!keys.includes(key)) key = keys[0];
      if (changed) {
        picker.replaceChildren();
        for (const k of keys) node("option", picker, screen.regions[k].label).value = k;
      }
      checkedKey = null;
      render();
      if (!controls.hidden) refreshScroll();
    }
    function resize() {
      abortDrag();
      side = orientation();
      refreshRegions();
    }
    function keydown(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !e.target?.matches?.("input, textarea")) {
        e.preventDefault(); e.stopImmediatePropagation(); undoLast(); render(); return;
      }
      const name = e.key.replace(/^Arrow/, "");
      if (!e.altKey || !directions[name]) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      move(name, e.shiftKey ? 5 : Number(step.value));
    }
    function ownerVisible() {
      return root.isConnected && !root.hidden && !root.closest("[hidden], dialog:not([open])") && root.matches(screen.root);
    }
    function finish(save) {
      if (closed) return;
      closed = true;
      abortDrag();
      observer.disconnect();
      cancelAnimationFrame(refreshFrame);
      if (ownerVisible()) {
        for (const previous of [...originalTabs.values()].reverse()) {
          const tab = previous.isConnected ? previous : Array.from(root.querySelectorAll(tabSelector)).find(el => el.id && el.id === previous.id);
          if (tab && !tab.matches(":disabled") && !tab.disabled && tab.getAttribute("aria-selected") !== "true") tab.click();
        }
        for (const [fold, open] of originalFolds) if (fold.isConnected && fold.open !== open) fold.open = open;
      }
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", abortDrag);
      window.removeEventListener("keydown", keydown, true);
      let durable = true;
      if (resetLegacy && placement.resetLegacy(id, save ? "save" : "restore") === false) durable = false;
      if (save) for (const shape of Object.keys(drafts)) {
        if (JSON.stringify(initial[shape]) === JSON.stringify(drafts[shape])) continue;
        if (placement.save(id, shape, drafts[shape]) === false) durable = false;
      }
      placement.apply(id, placement.read(id, orientation()));
      if (marked) marked.classList.remove("arrange-selection");
      dialog.close();
      dialog.remove();
      active = null;
      if (!durable) {
        const message = "Layout applied for this session. Device storage is unavailable.";
        if (typeof LiveRegion !== "undefined") LiveRegion.say(message, "save");
        const notice = node("p", root, message);
        notice.setAttribute("role", "status");
        window.setTimeout(() => notice.remove(), 8000);
      }
      if (onClose) onClose();
      else if (invoker?.isConnected && !invoker.closest("[hidden], dialog:not([open])")) invoker.focus({preventScroll:true});
    }
    let refreshFrame = 0;
    const observer = new MutationObserver(records => {
      if (!ownerVisible()) { finish(false); return; }
      if (refreshFrame || !records.some(r => root.contains(r.target) && !dialog.contains(r.target) &&
          (r.type === "childList" ? [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1) : r.attributeName !== "class"))) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        refreshRegions();
        if (!controls.hidden) refreshBrowse();
      });
    });
    observer.observe(root, {attributes:true, attributeFilter:["hidden","open","class","disabled","aria-disabled","aria-selected"], childList:true, subtree:true});
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, {attributes:true, attributeFilter:["hidden","open"], childList:true});
    }
    dialog.addEventListener("cancel", e => { e.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false));
    document.body.appendChild(dialog);
    dialog.showModal();
    window.addEventListener("resize", resize);
    window.addEventListener("blur", abortDrag);
    window.addEventListener("keydown", keydown, true);
    active = () => finish(false);
    render();
    clearSelection();
    picker.focus();
    return true;
  }
  return {open};
})();
