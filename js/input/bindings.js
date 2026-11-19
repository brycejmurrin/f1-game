"use strict";

const InputBindings = (function () {
  const HOLD_MODE_ACTIONS = Object.freeze(["throttle", "lookBack"]);
  function holdModeDefaults() { return { throttle: "hold", lookBack: "hold" }; }
  function parseHoldMode(saved) {
    const out = holdModeDefaults();
    if (!saved || typeof saved !== "object") return out;
    for (const id of HOLD_MODE_ACTIONS) {
      const v = saved[id];
      if (v === "hold" || v === "toggle") out[id] = v;
    }
    return out;
  }

  function snapshot(actions, map) {
    const result = {};
    for (const a of actions) result[a.id] = map[a.id].slice();
    return result;
  }
  function rows(actions, map) {
    return actions.map((a) => ({ id: a.id, label: a.label, codes: map[a.id].slice(), def: a.def.slice() }));
  }
  function isDefault(actions, map) {
    return actions.every((a) => a.def[0] === map[a.id][0] && a.def[1] === map[a.id][1]);
  }
  function claim(actions, map, id, slot, value) {
    let conflict = null;
    for (const a of actions) for (let i = 0; i < 2; i++) {
      if (map[a.id][i] === value && !(a.id === id && i === slot)) {
        map[a.id][i] = null;
        if (a.id !== id) conflict = a.id;
      }
    }
    map[id][slot] = value;
    return conflict;
  }

  function create({ onKeysChanged, onPadBindingChanged, activePad }) {
    const KEY_ACTIONS = [
      { id: "left",      label: "STEER LEFT",  def: ["ArrowLeft", "KeyA"] },
      { id: "right",     label: "STEER RIGHT", def: ["ArrowRight", "KeyD"] },
      { id: "throttle",  label: "GAS",         def: ["ArrowUp", "KeyW"] },
      { id: "brake",     label: "BRAKE",       def: ["ArrowDown", "KeyS"] },
      { id: "boost",     label: "BOOST",       def: ["Space", null] },
      { id: "overtake",  label: "OVERTAKE",    def: ["KeyX", null] },
      { id: "aero",      label: "ACTIVE AERO", def: ["KeyZ", null] },
      { id: "shiftUp",   label: "SHIFT UP",    def: ["KeyE", null] },
      { id: "shiftDown", label: "SHIFT DOWN",  def: ["KeyQ", "ShiftLeft"] },
      { id: "camera",    label: "CAMERA",      def: ["KeyC", null] },
      { id: "lookBack",  label: "LOOK BACK",   def: ["KeyB", null] },
      { id: "recover",   label: "RECOVER",     def: ["KeyR", null] },
      { id: "radio",     label: "RADIO CHECK", def: ["KeyT", null] },
      { id: "mirror",    label: "MIRROR",      def: ["KeyM", null] },
      { id: "pause",     label: "PAUSE",       def: ["KeyP", null] },
    ];
    const KEY_RESERVED = { Escape: 1, Enter: 1, NumpadEnter: 1, Tab: 1, Backquote: 1, F9: 1, MetaLeft: 1, MetaRight: 1, ContextMenu: 1,
      AltLeft: 1, AltRight: 1, ControlLeft: 1, ControlRight: 1 };
    const keyMap = {};
    let codeToAction = {};
    const normCode = (c) => c === "ShiftRight" ? "ShiftLeft" : c === "ControlRight" ? "ControlLeft" : c === "AltRight" ? "AltLeft" : c;
    function rebuildKeyIndex() {
      codeToAction = {};
      for (const a of KEY_ACTIONS) for (const c of keyMap[a.id]) if (c && !codeToAction[c]) codeToAction[c] = a.id;
      onKeysChanged();
    }
    function resetKeys() { for (const a of KEY_ACTIONS) keyMap[a.id] = a.def.slice(); rebuildKeyIndex(); }
    resetKeys();
    function setKeyMap(saved) {
      resetKeys();
      if (saved && typeof saved === "object") {
        const seen = {};
        for (const a of KEY_ACTIONS) {
          const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
          if (!v) continue;
          const slots = [0, 1].map((i) => {
            const c = typeof v[i] === "string" ? normCode(v[i]) : null;
            if (!c || !/^[A-Za-z0-9]{1,24}$/.test(c) || KEY_RESERVED[c] || seen[c]) return null;
            seen[c] = 1;
            return c;
          });
          keyMap[a.id] = slots;
        }
        for (const a of KEY_ACTIONS) if (!Array.isArray(saved[a.id])) keyMap[a.id] = keyMap[a.id].map((c) => (c && seen[c] ? null : c));
        rebuildKeyIndex();
      }
      return getKeyMap();
    }
    function getKeyMap() { return snapshot(KEY_ACTIONS, keyMap); }
    function keyBindings() { return rows(KEY_ACTIONS, keyMap); }
    function keysAreDefault() { return isDefault(KEY_ACTIONS, keyMap); }
    function setKeyBinding(id, slot, code) {
      if (!keyMap[id] || !(slot === 0 || slot === 1) || !code) return { ok: false, reason: "invalid" };
      code = normCode(String(code));
      if (KEY_RESERVED[code]) return { ok: false, reason: "reserved" };
      const conflict = claim(KEY_ACTIONS, keyMap, id, slot, code);
      rebuildKeyIndex();
      return { ok: true, conflict };
    }
    function clearKeyBinding(id, slot) {
      if (!keyMap[id] || !(slot === 0 || slot === 1)) return false;
      keyMap[id][slot] = null; rebuildKeyIndex(); return true;
    }
    const KEY_NAMES = { ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192", Space: "SPACE",
      ShiftLeft: "SHIFT", ControlLeft: "CTRL", AltLeft: "ALT", Comma: ",", Period: ".", Slash: "/", Semicolon: ";",
      Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Backspace: "BKSP",
      CapsLock: "CAPS", Insert: "INS", Delete: "DEL", Home: "HOME", End: "END", PageUp: "PGUP", PageDown: "PGDN", IntlBackslash: "\\" };
    let kbLayout = null;
    function loadLayoutMap() {
      const kb = typeof navigator !== "undefined" && navigator.keyboard;
      if (!kb || typeof kb.getLayoutMap !== "function") return;
      try {
        Promise.resolve(kb.getLayoutMap()).then((m) => {
          kbLayout = m || null;
          if (kbLayout) { try { Log.info("input", "keyboard layout map available"); } catch (_) {  } }
        }).catch(() => {  });
      } catch (_) {  }
    }
    function layoutLabel(code) {
      if (!kbLayout || typeof kbLayout.get !== "function") return null;
      let v;
      try { v = kbLayout.get(code); } catch (_) { return null; }
      if (typeof v !== "string" || !v) return null;
      return v.toUpperCase();
    }
    function keyLabel(code) {
      if (!code) return "";
      code = normCode(String(code));
      let m;
      if (/^(Key[A-Z]|Digit\d|Bracket|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|IntlBackslash)/.test(code)) {
        const l = layoutLabel(code);
        if (l) return l;
      }
      if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
      if ((m = /^Digit(\d)$/.exec(code))) return m[1];
      if ((m = /^Numpad(.+)$/.exec(code))) return "NUM " + ({ Add: "+", Subtract: "-", Multiply: "*", Divide: "/", Decimal: "." }[m[1]] || m[1].toUpperCase());
      return KEY_NAMES[code] || code.toUpperCase();
    }

    const PAD_ACTIONS = [
      { id: "throttle",  label: "GAS",         def: [7, 0] },
      { id: "brake",     label: "BRAKE",       def: [6, 1] },
      { id: "boost",     label: "BOOST",       def: [2, null] },
      { id: "overtake",  label: "OVERTAKE",    def: [3, null] },
      { id: "aero",      label: "ACTIVE AERO", def: [12, null] },
      { id: "shiftUp",   label: "SHIFT UP",    def: [5, null] },
      { id: "shiftDown", label: "SHIFT DOWN",  def: [4, null] },
      { id: "camera",    label: "CAMERA",      def: [8, null] },
      { id: "lookBack",  label: "LOOK BACK",   def: [11, null] },
      { id: "recover",   label: "RECOVER",     def: [10, null] },
      { id: "radio",     label: "RADIO CHECK", def: [13, null] },
      { id: "mirror",    label: "MIRROR",      def: [null, null] },
      { id: "pause",     label: "PAUSE",       def: [9, null] },
    ];
    const PAD_RESERVED = { 14: 1, 15: 1 };
    const padMap = {};
    const padIndexOk = (v) => Number.isInteger(v) && v >= 0 && v < 32;
    function notifyPad() { onPadBindingChanged(); }
    function resetPad() { for (const a of PAD_ACTIONS) padMap[a.id] = a.def.slice(); }
    resetPad();
    function resetPadPublic() { resetPad(); notifyPad(); }
    function setPadMap(saved) {
      resetPad();
      if (saved && typeof saved === "object") {
        const seen = {};
        for (const a of PAD_ACTIONS) {
          const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
          if (!v) continue;
          padMap[a.id] = [0, 1].map((i) => {
            const raw = v[i];
            const b = typeof raw === "number" || typeof raw === "string" ? Number(raw) : null;
            if (b == null || !padIndexOk(b) || PAD_RESERVED[b] || seen[b]) return null;
            seen[b] = 1;
            return b;
          });
        }
        for (const a of PAD_ACTIONS) if (!Array.isArray(saved[a.id])) padMap[a.id] = padMap[a.id].map((b) => (b != null && seen[b] ? null : b));
      }
      notifyPad();
      return getPadMap();
    }
    function getPadMap() { return snapshot(PAD_ACTIONS, padMap); }
    function padBindings() { return rows(PAD_ACTIONS, padMap); }
    function padsAreDefault() { return isDefault(PAD_ACTIONS, padMap); }
    function setPadBinding(id, slot, index) {
      index = index == null ? NaN : Number(index);
      if (!padMap[id] || !(slot === 0 || slot === 1) || !padIndexOk(index)) return { ok: false, reason: "invalid" };
      if (PAD_RESERVED[index]) return { ok: false, reason: "reserved" };
      const conflict = claim(PAD_ACTIONS, padMap, id, slot, index);
      notifyPad();
      return { ok: true, conflict };
    }
    function clearPadBinding(id, slot) {
      if (!padMap[id] || !(slot === 0 || slot === 1)) return false;
      padMap[id][slot] = null; notifyPad(); return true;
    }
    const PAD_NAMES_XBOX = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW", "MENU", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
    const PAD_NAMES_PS = ["CROSS", "CIRCLE", "SQUARE", "TRIANGLE", "L1", "R1", "L2", "R2", "SHARE", "OPTIONS", "L3", "R3", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "PS"];
    const PAD_NAMES_NIN = ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "MINUS", "PLUS", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
    const PAD_NAME_SETS = { xbox: PAD_NAMES_XBOX, ps: PAD_NAMES_PS, nintendo: PAD_NAMES_NIN };
    let padLabelMode = "auto";
    function setPadLabelMode(m) {
      padLabelMode = PAD_NAME_SETS[m] ? m : "auto";
    }
    function padLabelModeOf() { return padLabelMode; }
    function padBrandAuto(known) {
      const pad = known || activePad();
      const id = String((pad && pad.id) || "");
      if (/playstation|dualshock|dualsense|\b054c\b|sony/i.test(id)) return "ps";
      if (/nintendo|switch\s*pro|joy-?con|\b057e\b/i.test(id)) return "nintendo";
      return "xbox";
    }
    const padBrand = (pad) => (padLabelMode === "auto" ? padBrandAuto(pad) : padLabelMode);
    function padLabel(index) {
      if (index == null) return "";
      const brand = padBrand();
      const names = PAD_NAME_SETS[brand] || PAD_NAMES_XBOX;
      return names[index] || `BTN ${index}`;
    }

    return {
      keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, loadLayoutMap,
      keyAction: (code) => codeToAction[normCode(code)] || null,
      padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad: resetPadPublic, padsAreDefault, padLabel,
      setPadLabelMode, padLabelMode: padLabelModeOf, padBrand,
      padButtons: (id) => padMap[id],
    };
  }

  return { create, holdModeDefaults, parseHoldMode };
})();
Object.freeze(InputBindings);
