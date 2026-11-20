"use strict";
/* A transparent native modal owns input while the actual screen renders each draft.
   Only Apply writes. Rotation switches draft and history together. */
window.ScreenArranger = (function () {
  const orientation = () => window.ScreenPlacement.orientation();
  const clone = value => JSON.parse(JSON.stringify(value));
  let active = null;

  function open(id, invoker = document.activeElement) {
    if (active) active();
    const screen = window.ScreenRegions[id];
    const root = screen && document.querySelector(screen.root);
    if (!root || root.hidden) return false;
    const placement = window.ScreenPlacement;
    const element = key => root.matches(screen.regions[key].selector) ? root : root.querySelector(screen.regions[key].selector);
    const visibleKeys = () => Object.keys(screen.regions).filter(key => element(key)?.getClientRects().length);
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
    actions.id = "arrange-bar";
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
      if (!open && controls.contains(document.activeElement)) toggle.focus({preventScroll:true});
    }
    for (const k of keys) node("option", picker, screen.regions[k].label).value = k;
    const stepLabel = node("label", controls, "Adjustment ");
    const step = node("select", stepLabel);
    node("option", step, "Fine").value = "1";
    node("option", step, "Coarse").value = "5";
    const row = () => {
      const el = node("div", controls);
      el.className = "arrange-row";
      return el;
    };
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
    function render() {
      placement.apply(id, drafts[side]);
      if (marked) marked.classList.remove("arrange-selection");
      marked = element(key);
      if (marked) marked.classList.add("arrange-selection");
      picker.value = key;
      heading.textContent = screen.label + " · " + side;
      copy.textContent = "Copy from " + (side === "portrait" ? "landscape" : "portrait");
      undo.disabled = !history.length;
      for (const {btn, prop} of sizing) btn.disabled = screen.regions[key][prop] === false;
      const r = drafts[side][key] || {};
      status.textContent = "X " + (r.x || 0) + "% · Y " + (r.y || 0) + "% · Width " +
        (r.width ? r.width + "%" : "auto") + " · Height " + (r.height ? r.height + "%" : "auto") +
        " · Scale " + Math.round((r.scale || 1) * 100) + "%" +
        (screen.regions[key].constraint ? " · " + screen.regions[key].constraint : "") +
        (resetLegacy ? " · Reset covers both orientations" : "");
    }
    // Prefer the edge covering less of the selected region. Keep the bar
    // still during a drag so moving a region never moves the controls.
    function clearSelection() {
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
    picker.addEventListener("change", () => { key = picker.value; render(); clearSelection(); });
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
      if (!drag.changed) { remember(); drag.changed = true; }
      offset(region(), drag.x, drag.y, drag.dx / drag.w * 100, drag.dy / drag.h * 100);
      render();
    }
    dialog.addEventListener("pointerdown", e => {
      if (drag) { abortDrag(); return; }
      if (!e.isPrimary || e.button !== 0 || panel.contains(e.target)) return;
      setExpanded(false);
      e.preventDefault();
      const hit = keys.map(k => ({k, rect:element(k) && rectOf(element(k))})).filter(({rect}) => rect &&
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
      hit.sort((a,b) => a.rect.width*a.rect.height - b.rect.width*b.rect.height);
      if (!hit.length) return;
      key = hit[0].k;
      render();
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
    function resize() {
      abortDrag();
      side = orientation();
      placement.apply(id, drafts[side]);
      keys = visibleKeys();
      if (!keys.length) { finish(false); return; }
      if (!keys.includes(key)) key = keys[0];
      picker.replaceChildren();
      for (const k of keys) node("option", picker, screen.regions[k].label).value = k;
      render();
    }
    function keydown(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
      const name = e.key.replace(/^Arrow/, "");
      if (!e.altKey || !directions[name]) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      move(name, e.shiftKey ? 5 : Number(step.value));
    }
    function finish(save) {
      if (closed) return;
      closed = true;
      abortDrag();
      observer.disconnect();
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
      if (invoker?.isConnected && !invoker.closest("[hidden]")) invoker.focus({preventScroll:true});
    }
    const observer = new MutationObserver(() => {
      if (!root.isConnected || root.hidden || !root.matches(screen.root) || (root.tagName === "DIALOG" && !root.open)) finish(false);
    });
    observer.observe(root, {attributes:true, attributeFilter:["hidden","open","class"]});
    if (root.parentNode) observer.observe(root.parentNode, {childList:true});
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
