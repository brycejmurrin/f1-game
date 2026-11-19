"use strict";

const InputPadMenu = (function () {
  function create({ btnDown, btnEdge, nowMs, getPadAxisMap, padRest = () => 0, padButtons = () => [], padBrand = () => "xbox" }) {
    const PAD_NAV_DEADZONE = 0.22;

    let padNavDir = null;
    let padNavNextT = 0;
    let padNavSeeded = false;
    const padAxScratch = [];
    let padNavSeedLayer = null;
    const PAD_NAV_DELAY_MS = 450;
    const PAD_NAV_REPEAT_MS = 130;
    const PAD_NAV_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

    function padDispatchKey(key) {
      const el = document.activeElement;
      const target = el && el !== document.body && el.dispatchEvent ? el : document;
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }

    function padNavKey(dir) {
      const el = document.activeElement;
      const key = PAD_NAV_KEYS[dir];
      const horizontal = dir === "left" || dir === "right";
      if (el && !el.disabled) {
        const t = el.tagName;
        const ty = t === "INPUT" ? String(el.type || "text").toLowerCase() : "";
        if (t === "SELECT" && horizontal) {
          const opts = el.options || [];
          const n = opts.length;
          const d = dir === "right" ? 1 : -1;
          let j = el.selectedIndex;
          const wrap = !(el._srLive && el._srLive.wrap === false);
          for (let seen = 0; seen < n; seen++) {
            const k = j + d;
            if (!wrap && (k < 0 || k >= n)) { j = el.selectedIndex; break; }
            j = ((k % n) + n) % n;
            if (!opts[j].disabled) break;
          }
          if (n && j !== el.selectedIndex && !opts[j].disabled) {
            el.selectedIndex = j;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
        if (t === "INPUT" && (ty === "range" || ty === "number") && horizontal) {
          const step = parseFloat(el.step) || 1;
          const min = el.min === "" ? -Infinity : parseFloat(el.min), max = el.max === "" ? Infinity : parseFloat(el.max);
          const ds = parseFloat(el.dataset && el.dataset.padStep);
          const span = max - min;
          const coarse = ds > 0 ? ds : (isFinite(span) && span > 0 ? span / 40 : step);
          const padStep = Math.max(step, Math.round(coarse / step) * step);
          const dec = Math.min(6, (String(el.step).split(".")[1] || "").length);
          const base = isFinite(min) ? min : 0;
          let v = (parseFloat(el.value) || 0) + (dir === "right" ? padStep : -padStep);
          v = +(base + Math.round((v - base) / step) * step).toFixed(dec);
          v = Math.max(min, Math.min(max, v));
          if (String(v) !== String(el.value)) {
            el.value = String(v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
      }
      padDispatchKey(key);
    }

    function padNavDirOf(pad) {
      const axisMap = getPadAxisMap();
      const std = pad.mapping == null || pad.mapping === "standard";
      if (!std) {
        const sx = axisMap.steer;
        const ax = pad.axes || [];
        if (Number.isInteger(sx) && sx >= 0 && sx < ax.length) {
          const x = (ax[sx] || 0) * axisMap.steerInvert - padRest();
          if (Math.abs(x) >= PAD_NAV_DEADZONE) return x < 0 ? "left" : "right";
        }
        if ((padButtons("shiftDown") || []).some((b) => b != null && btnDown(pad, b))) return "up";
        if ((padButtons("shiftUp") || []).some((b) => b != null && btnDown(pad, b))) return "down";
        return null;
      }
      if (btnDown(pad, 12)) return "up";
      if (btnDown(pad, 13)) return "down";
      if (btnDown(pad, 14)) return "left";
      if (btnDown(pad, 15)) return "right";
      const ped = (i) => i === axisMap.throttle || i === axisMap.brake;
      const src = pad.axes || [], ax = padAxScratch;
      ax.length = src.length;
      for (let i = 0; i < src.length; i++) ax[i] = ped(i) ? 0 : src[i];
      const sx = axisMap.steer;
      if (Number.isInteger(sx) && sx >= 0 && sx < ax.length && !ped(sx)) {
        ax[sx] = (ax[sx] || 0) * axisMap.steerInvert - padRest();
      }
      const stick = (x, y) => {
        const mx = Math.abs(x) >= PAD_NAV_DEADZONE ? Math.abs(x) : 0;
        const my = Math.abs(y) >= PAD_NAV_DEADZONE ? Math.abs(y) : 0;
        if (!mx && !my) return null;
        return my >= mx ? (y < 0 ? "up" : "down") : (x < 0 ? "left" : "right");
      };
      return stick(ax[0] || 0, ax[1] || 0) || stick(ax[2] || 0, ax[3] || 0);
    }

    function padFocusableInLayer() {
      const layer = window.MenuNav && window.MenuNav.activeLayer();
      if (!layer) return null;
      const active = document.activeElement;
      const sel = window.MenuNav.FOCUSABLE;
      if (active && sel && layer.contains(active) && active.matches && active.matches(sel)) {
        return active;
      }
      return null;
    }

    function padSeedFocus() {
      if (!window.MenuNav || !window.MenuNav.activeLayer()) return;
      if (padFocusableInLayer()) return;
      padDispatchKey("ArrowDown");
    }

    function padActivate(guard) {
      const focused = padFocusableInLayer();
      if (focused) {
        if (typeof guard === "function" && guard(focused)) return false;
        const ty = (focused.type || "").toLowerCase();
        if (focused.tagName === "INPUT" && (ty === "range" || ty === "number")) return;
        focused.click();
        return;
      }
      padSeedFocus();
    }

    function padEscape() {
      const layer = window.UiLayers && window.UiLayers.top();
      if (!layer) return;
      let inner = null;
      try { inner = Array.from(document.querySelectorAll(":modal")).filter((m) => m !== layer && layer.contains(m)).pop() || null; } catch (_) {  }
      if (inner && inner.tagName === "DIALOG") {
        inner.dispatchEvent(new Event("cancel", { cancelable: true }));
      } else if (layer.tagName === "DIALOG") {
        layer.dispatchEvent(new Event("cancel", { cancelable: true }));
      } else {
        padDispatchKey("Escape");
      }
    }

    function padNavPoll(pad) {
      const top = window.UiLayers && window.UiLayers.top();
      if (top !== padNavSeedLayer) {
        padNavSeedLayer = top || null;
        padNavSeeded = false;
        padNavDir = null;
        padNavNextT = 0;
      }
      const dir = padNavDirOf(pad);
      const nin = padBrand(pad) === "nintendo";
      const okBtn = nin ? 1 : 0, backBtn = nin ? 0 : 1;
      if (!padNavSeeded) {
        padNavSeeded = true;
        if (!dir && !btnEdge(pad, okBtn)) padSeedFocus();
      }
      if (dir) {
        const now = nowMs();
        if (dir !== padNavDir) {
          padNavDir = dir;
          padNavKey(dir);
          padNavNextT = now + PAD_NAV_DELAY_MS;
        } else if (now >= padNavNextT) {
          padNavKey(dir);
          padNavNextT = now + PAD_NAV_REPEAT_MS;
        }
      } else {
        padNavDir = null;
      }
      if (pad.mapping == null || pad.mapping === "standard") {
        if (btnEdge(pad, 6)) padDispatchKey("PageUp");
        if (btnEdge(pad, 7)) padDispatchKey("PageDown");
        if (btnEdge(pad, 4)) padDispatchKey("ArrowLeft");
        if (btnEdge(pad, 5)) padDispatchKey("ArrowRight");
      }
      if (btnEdge(pad, okBtn)) padActivate();
      if (btnEdge(pad, backBtn)) padEscape();
    }

    function remoteNav(dir) {
      if (!(window.MenuNav && window.MenuNav.activeLayer())) return;
      if (!padFocusableInLayer()) { padSeedFocus(); return; }
      padNavKey(dir);
    }
    function reset() { padNavDir = null; padNavSeeded = false; padNavSeedLayer = null; }
    return { poll: padNavPoll, activate: padActivate, escape: padEscape, remoteNav,
      releaseDirection() { padNavDir = null; }, reset };
  }

  const DESTRUCTIVE_RE = /(?:^|[^a-z])(reset|delete|del|import|erase|wipe|clear|remove|forget)(?![a-z])/i;
  function isDestructive(el) {
    if (!el || typeof el !== "object") return false;
    const attr = (n) => (typeof el.getAttribute === "function" ? el.getAttribute(n) : null);
    const flag = el.dataset && el.dataset.destructive !== undefined ? el.dataset.destructive : attr("data-destructive");
    if (flag != null) return String(flag).toLowerCase() !== "false";
    if (el.tagName === "INPUT" && String(el.type || "").toLowerCase() === "file") return true;
    const cls = typeof el.className === "string" ? el.className : "";
    const words = [el.id, cls, el.name, attr("aria-label"), el.textContent].filter((v) => typeof v === "string").join(" ");
    return DESTRUCTIVE_RE.test(words);
  }

  return { create, isDestructive };
})();
Object.freeze(InputPadMenu);
