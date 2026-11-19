"use strict";

const InputHoldButtons = (function () {
  const PEDAL_DEAD_PX = PedalTravel.DEAD_PX;
  const PEDAL_TRAVEL_PX = PedalTravel.TRAVEL_PX;
  const PEDAL_MIN = PedalTravel.MIN;

  function create({ clamp, beforeReleaseAll }) {
    const holdBtns = [];
    const holdById = new Map();
    const holdByEl = new Map();
    function holdReleasePointer(pointerId) {
      for (const h of holdBtns) h.release(pointerId);
    }
    function holdReleaseAll(keepLatch) {
      beforeReleaseAll(keepLatch);
      for (const h of holdBtns) {
        h.ids.clear();
        h.anchors && h.anchors.clear();
        h.levels && h.levels.clear();
        h.live && h.live.clear();
        h.slid.clear(); h.gone.clear(); h.rects.clear();
        look(h.el, null);
        h.apply(false);
        h.level && h.level(0);
      }
    }

    function holdTargetGone(el) {
      if (!el || el === document) return true;
      if (!el.isConnected) return true;
      try {
        const s = getComputedStyle(el);
        if (s.visibility === "hidden") return true;
      } catch (_) {  }
      for (let node = el; node; node = node.parentElement) {
        if (node.hidden) return true;
        try {
          if (getComputedStyle(node).display === "none") return true;
        } catch (_) {  }
      }
      return false;
    }
    function lostCaptureShouldRelease(el, pointerId) {
      if (!el || el === document || !el.isConnected) return true;
      const h = holdByEl.get(el);
      const wasVisible = !!(h && h.live.get(pointerId));
      if (!wasVisible) return false;
      return holdTargetGone(el);
    }

    const look = (el, v) => { if (!el || !el.setAttribute) return; if (v) el.setAttribute("data-slid", v); else el.removeAttribute("data-slid"); };
    function boxOf(el) {
      if (!el || el.hidden || el.disabled || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    }
    const inBox = (r, x, y) => !!r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;


    function wireHold(id, apply, level, opts) {
      const el = document.getElementById(id);
      if (!el) return;
      const axis = (opts && opts.axis) === "x" ? "x" : "y";
      const dir = (opts && opts.dir) || 1;
      const ids = new Set();
      const anchors = level ? new Map() : null;
      const levels = level ? new Map() : null;
      const live = new Map();
      const sibId = opts && opts.sibling;
      const slid = new Set();
      const gone = new Set();
      const rects = new Map();
      let painted = NaN;
      const paint = level ? (v) => { painted = v; level(v); } : null;
      function paintLevel() {
        if (!level) return;
        let strongest = 0;
        for (const value of levels.values()) strongest = Math.max(strongest, value);
        if (strongest !== painted) paint(strongest);
      }
      function release(pointerId) {
        if (gone.delete(pointerId) && gone.size === 0 && slid.size === 0) look(el, null);
        rects.delete(pointerId);
        if (slid.delete(pointerId) && slid.size === 0) look(el, gone.size ? "off" : null);
        anchors && anchors.delete(pointerId);
        levels && levels.delete(pointerId);
        live.delete(pointerId);
        if (!ids.delete(pointerId)) return;
        if (ids.size === 0) apply(false);
        paintLevel();
      }
      function press(e, arrived) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {  }
        const firstContact = ids.size === 0;
        ids.add(e.pointerId);
        live.set(e.pointerId, e.isTrusted === false ? !holdTargetGone(el) : true);
        if (firstContact) apply(true);
        if (level) {
          anchors.set(e.pointerId, axis === "x" ? e.clientX : e.clientY);
          levels.set(e.pointerId, 1);
          paintLevel();
        }
        gone.clear();
        if (arrived) slid.add(e.pointerId);
        look(el, slid.size ? "on" : null);
        const sib = sibId && holdById.get(sibId);
        if (sib) rects.set(e.pointerId, boxOf(sib.el));
      }
      function handOff(e) {
        const to = holdById.get(sibId);
        if (!to) return false;
        release(e.pointerId);
        try { el.releasePointerCapture(e.pointerId); } catch (_) {  }
        gone.add(e.pointerId); if (!slid.size) look(el, "off");
        to.press(e, true);
        return true;
      }
      const rec = { ids, apply, level: paint, anchors, levels, el, live, release, press, slid, gone, rects, move: null };
      holdBtns.push(rec);
      holdByEl.set(el, rec);
      holdById.set(id, rec);
      el.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        press(e, false);
      });
      if (level || sibId) el.addEventListener("pointermove", e => {
        if (ids.has(e.pointerId)) { rec.move(e); return; }
        const to = sibId && holdById.get(sibId);
        if (to && to.move && to.ids.has(e.pointerId)) to.move(e);
      });
      if (level || sibId) rec.move = (e) => {
        if (inBox(rects.get(e.pointerId), e.clientX, e.clientY) && handOff(e)) return;
        const a = anchors ? anchors.get(e.pointerId) : null;
        if (a == null || slid.has(e.pointerId)) return;
        if (axis === "x") {
          const ease = Math.max(0, (e.clientX - a) * (-dir) - PEDAL_DEAD_PX);
          levels.set(e.pointerId, clamp(1 - ease / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
          paintLevel();
          return;
        }
        levels.set(e.pointerId, PedalTravel.ease(a, e.clientY));
        paintLevel();
      };
      el.addEventListener("pointerup", (e) => release(e.pointerId));
      el.addEventListener("pointercancel", (e) => release(e.pointerId));
      el.addEventListener("lostpointercapture", function (e) {
        if (!lostCaptureShouldRelease(el, e.pointerId)) return;
        release(e.pointerId);
      });
    }

    function wireTap(id, fire) {
      const el = document.getElementById(id);
      if (!el) return;
      const enabled = () => !el.disabled && !(el.getAttribute && el.getAttribute("aria-disabled") === "true");
      el.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (enabled()) fire();
      });
      el.addEventListener("click", function (e) {
        if (e.detail === 0 && enabled()) fire();
      });
      el.addEventListener("keydown", function (e) {
        if (e.code !== "Space" && e.key !== " " && e.key !== "Enter" &&
            e.code !== "Enter" && e.code !== "NumpadEnter") return;
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) el.click();
      });
    }

    return { wireHold, wireTap, holdReleasePointer, holdReleaseAll, holdTargetGone, lostCaptureShouldRelease,
      pointerCounts: () => holdBtns.map((h) => h.ids.size) };
  }

  function secondaryTap(el, { activate = (_e) => el.click(), cancel = () => {}, beforeActivate = (_e) => true } = {}) {
    if (!el || !el.addEventListener) return;
    let down = null, consumed = null;
    const clear = () => { if (down && !down.cancelled) cancel(); if (down) down.cancelled = true; };
    const remember = e => { consumed = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp }; };
    const enabled = () => !el.disabled && !el.hidden && el.isConnected !== false && el.getAttribute("aria-disabled") !== "true" && (!el.checkVisibility || el.checkVisibility({ checkVisibilityCSS: true }));
    const inside = e => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    window.addEventListener("pointerdown", e => { consumed = null; if (down && down.id === e.pointerId) { clear(); down = null; } }, true);
    el.addEventListener("pointerdown", e => {
      clear(); down = null;
      if (e.pointerType !== "touch" || e.isPrimary !== false || !enabled()) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (_) {  }
    });
    el.addEventListener("pointermove", e => { if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) clear(); });
    el.addEventListener("pointerup", e => {
      if (!down || e.pointerId !== down.id) return;
      const cancelled = down.cancelled; down = null; remember(e);
      if (cancelled || !enabled() || !inside(e)) { if (!cancelled) cancel(); return; }
      if (beforeActivate(e) !== false) activate(e);
    });
    window.addEventListener("pointerup", e => { if (down && e.pointerId === down.id && (down.cancelled || !enabled())) { clear(); remember(e); down = null; } }, true);
    for (const type of ["pointercancel", "lostpointercapture"]) el.addEventListener(type, e => { if (down && e.pointerId === down.id) clear(); });
    if (typeof MutationObserver !== "undefined") new MutationObserver(() => { if (!enabled()) clear(); }).observe(el, { attributes: true, attributeFilter: ["hidden", "style", "class"] });
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    window.addEventListener("orientationchange", clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
    window.addEventListener("click", e => {
      const c = consumed;
      if (!c || !e.isTrusted || e.detail === 0 || e.timeStamp < c.at || e.timeStamp - c.at > 750) return;
      if ((typeof e.pointerId === "number" && e.pointerId !== c.id) || Math.hypot(e.clientX - c.x, e.clientY - c.y) > 12) return;
      consumed = null; e.preventDefault(); e.stopImmediatePropagation();
    }, true);
  }

  return { create, secondaryTap };
})();
Object.freeze(InputHoldButtons);
