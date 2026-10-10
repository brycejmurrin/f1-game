/* InputBindings: keyboard and controller maps, conflict resolution and device-aware labels. Factory instances own their state. */
"use strict";

const InputBindings = (function () {
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
    // ---- key bindings ------------------------------------------------------
    // Every driving key is a BINDING, not a literal: KEY_ACTIONS is the list the
    // CONTROLS page (js/ui/key-binds.js) renders and HOW TO PLAY reads, keyMap is
    // the live table (two physical-key slots per action, e.code values so WASD
    // sits under the same fingers on an AZERTY board), and codeToAction is the
    // reverse index onKey() consults. Defaults are what the game always had.
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
      // LOOK BACK is a HELD control (the mirror is only useful while you hold
      // it); RECOVER is an edge. Both are standard racing binds we simply did
      // not have: Forza Horizon puts look-back on the arrow cluster, F1 on End,
      // iRacing on Z/X, and R is the near-universal recover/reset key across
      // Forza, PolyTrack and Slow Roads alike. In a game about defending a
      // position, not being able to look back is functional, not cosmetic.
      { id: "lookBack",  label: "LOOK BACK",   def: ["KeyB", null] },
      { id: "recover",   label: "RECOVER",     def: ["KeyR", null] },
      // RADIO CHECK: the driver keys the mic and the engineer answers with the
      // position and both gaps — Crew Chief's "how's my gap", on one key. T for
      // TALK; free in every default layout above.
      { id: "radio",     label: "RADIO CHECK", def: ["KeyT", null] },
      // REAR-VIEW MIRROR: the HUD mirror on and off mid-race, the same switch as
      // HUD > MIRROR in the settings. M is free in every default layout above.
      { id: "mirror",    label: "MIRROR",      def: ["KeyM", null] },
      /* PAUSE IS A BINDING NOW, not a literal. XAG 107 asks that a player be
         able to remap ALL of a game's controls "including the Esc key on PC
         games", and P being permanently off-limits meant a player who wanted
         pause under a different finger had no path at all — which bites hardest
         in fullscreen on Firefox and Safari, where Escape is spent exiting
         fullscreen before it can ever reach us (see lockEscape). Escape itself
         stays hardwired as BACK: it is the platform's gesture, not ours to
         hand out. */
      { id: "pause",     label: "PAUSE",       def: ["KeyP", null] },
    ];
    // Keys the game already answers to elsewhere: back, the menu walker's
    // confirm, the perf overlay, the OS. Refused by setKeyBinding.
    // Ctrl and Alt too: Alt is the key-release-all chord (Alt+Tab), and with Ctrl
    // bound a Ctrl+W on the default GAS closes the tab — browsers never hand those
    // chords to a page (https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock).
    const KEY_RESERVED = { Escape: 1, Enter: 1, NumpadEnter: 1, Tab: 1, Backquote: 1, F9: 1, MetaLeft: 1, MetaRight: 1, ContextMenu: 1,
      AltLeft: 1, AltRight: 1, ControlLeft: 1, ControlRight: 1 };
    const keyMap = {};
    let codeToAction = {};
    // Either Shift / Ctrl / Alt counts as the one key: the default SHIFT DOWN was
    // "Q or either Shift" and a rebind should not have to choose a side.
    const normCode = (c) => c === "ShiftRight" ? "ShiftLeft" : c === "ControlRight" ? "ControlLeft" : c === "AltRight" ? "AltLeft" : c;
    function rebuildKeyIndex() {
      codeToAction = {};
      for (const a of KEY_ACTIONS) for (const c of keyMap[a.id]) if (c && !codeToAction[c]) codeToAction[c] = a.id;
      onKeysChanged();   // never latch a key that just changed meaning
    }
    function resetKeys() { for (const a of KEY_ACTIONS) keyMap[a.id] = a.def.slice(); rebuildKeyIndex(); }
    resetKeys();
    // Adopt a saved map ({action: [code, code]}); anything malformed, reserved or
    // duplicated falls back to the default for that action.
    function setKeyMap(saved) {
      resetKeys();
      if (saved && typeof saved === "object") {
        const seen = {};
        for (const a of KEY_ACTIONS) {
          const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
          if (!v) continue;
          const slots = [0, 1].map((i) => {
            const c = v[i] == null ? null : normCode(String(v[i]));
            if (!c || !/^[A-Za-z0-9]{1,24}$/.test(c) || KEY_RESERVED[c] || seen[c]) return null;
            seen[c] = 1;
            return c;
          });
          keyMap[a.id] = slots;
        }
        // An action the save predates (new since it was written) keeps its
        // default — unless the player already put that key on something else.
        for (const a of KEY_ACTIONS) if (!Array.isArray(saved[a.id])) keyMap[a.id] = keyMap[a.id].map((c) => (c && seen[c] ? null : c));
        rebuildKeyIndex();
      }
      return getKeyMap();
    }
    function getKeyMap() { return snapshot(KEY_ACTIONS, keyMap); }
    function keyBindings() { return rows(KEY_ACTIONS, keyMap); }
    function keysAreDefault() { return isDefault(KEY_ACTIONS, keyMap); }
    // Bind `code` into slot 0/1 of an action. A key another action held is taken
    // from it (the caller shows the move); a reserved key is refused.
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
    /* WHAT IS PRINTED ON THE PLAYER'S KEY, not what the code is called.
       Binding on e.code is right and stays — it is what keeps WASD under the
       same three fingers on AZERTY, and MDN recommends exactly that for games.
       But it made the LABEL a lie: "KeyW" is the physical slot a French keyboard
       prints Z on, and the rebinding screen confidently showed "W". A player
       rebinding was reading a key that is not on their keyboard.
       navigator.keyboard.getLayoutMap() is the API for the other direction.
       Chromium-only and experimental, so it is a progressive enhancement:
       resolved once at init, consulted only for the alphanumeric codes whose
       label actually moves between layouts; everywhere else the label is the
       e.code name. */
    let kbLayout = null;
    function loadLayoutMap() {
      const kb = typeof navigator !== "undefined" && navigator.keyboard;
      if (!kb || typeof kb.getLayoutMap !== "function") return;
      try {
        Promise.resolve(kb.getLayoutMap()).then((m) => {
          kbLayout = m || null;
          if (kbLayout) { try { Log.info("input", "keyboard layout map available"); } catch (_) { /* Log absent */ } }
        }).catch(() => { /* SecurityError under Permissions Policy, or unsupported */ });
      } catch (_) { /* older Chromium shapes */ }
    }
    function layoutLabel(code) {
      if (!kbLayout || typeof kbLayout.get !== "function") return null;
      let v;
      try { v = kbLayout.get(code); } catch (_) { return null; }
      if (typeof v !== "string" || !v) return null;
      return v.toUpperCase();
    }
    // The name on a key chip: "X", "3", "SHIFT", an arrow — in the player's own
    // layout where the platform will tell us what that is.
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

    // ---- controller bindings -----------------------------------------------
    // The same shape for the pad: PAD_ACTIONS is the list the CONTROLS page
    // renders, padMap the live table (two button-index slots per action, W3C
    // "standard" mapping), the defaults the layout the game always had. Steering
    // (left stick, d-pad left/right) and pause (Menu/Start) are not bindings:
    // the stick is an axis and the d-pad/Start pair is what the menus answer to.
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
      { id: "radio",     label: "RADIO CHECK", def: [13, null] },   // d-pad down; d-pad up is ACTIVE AERO
      { id: "mirror",    label: "MIRROR",      def: [null, null] },   // every standard button is taken; bind one on CONTROLS
      { id: "pause",     label: "PAUSE",       def: [9, null] },
    ];
    // The d-pad's left/right are the digital STEER axis, not bindings — the same
    // reason the stick is not one. Pause left this set when it became a binding.
    const PAD_RESERVED = { 14: 1, 15: 1 };
    const padMap = {};
    const padIndexOk = (v) => Number.isInteger(v) && v >= 0 && v < 32;
    function resetPad() { for (const a of PAD_ACTIONS) padMap[a.id] = a.def.slice(); }
    resetPad();
    function setPadMap(saved) {
      resetPad();
      if (saved && typeof saved === "object") {
        const seen = {};
        for (const a of PAD_ACTIONS) {
          const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
          if (!v) continue;
          padMap[a.id] = [0, 1].map((i) => {
            const b = v[i] == null ? null : Number(v[i]);
            if (b == null || !padIndexOk(b) || PAD_RESERVED[b] || seen[b]) return null;
            seen[b] = 1;
            return b;
          });
        }
        for (const a of PAD_ACTIONS) if (!Array.isArray(saved[a.id])) padMap[a.id] = padMap[a.id].map((b) => (b != null && seen[b] ? null : b));
      }
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
      onPadBindingChanged();   // a held pedal whose button changed meaning
      return { ok: true, conflict };
    }
    function clearPadBinding(id, slot) {
      if (!padMap[id] || !(slot === 0 || slot === 1)) return false;
      padMap[id][slot] = null; return true;
    }
    const PAD_NAMES_XBOX = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW", "MENU", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
    const PAD_NAMES_PS = ["CROSS", "CIRCLE", "SQUARE", "TRIANGLE", "L1", "R1", "L2", "R2", "SHARE", "OPTIONS", "L3", "R3", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "PS"];
    // Nintendo's physical A/B and X/Y sit OPPOSITE the Xbox positions, so index 0
    // — the button the standard mapping calls "bottom of the right cluster" — is
    // physically labelled B on a Switch Pro. Sniffing cannot always tell, which
    // is why the override below exists.
    const PAD_NAMES_NIN = ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "MINUS", "PLUS", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
    const PAD_NAME_SETS = { xbox: PAD_NAMES_XBOX, ps: PAD_NAMES_PS, nintendo: PAD_NAMES_NIN };
    /* SNIFFING THE id STRING IS THE STATE OF THE ART, AND IT IS NOT GOOD ENOUGH
       ALONE. The Gamepad spec says outright that the id format is "left
       unspecified"; Chrome writes "Name (STANDARD GAMEPAD Vendor: 054c Product:
       05c4)" but an XInput pad becomes "Xbox 360 Controller (XInput STANDARD
       GAMEPAD)" with no vendor at all, Firefox writes "054c-05c4-Name", and
       Safari rewrites the name at the OS layer. Standardising vendorId/productId
       is still an open W3C issue. So: sniff by default, and let the player say
       when we get it wrong. */
    let padLabelMode = "auto";     // "auto" | "xbox" | "ps" | "nintendo"
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
    // The resolved brand: the player's override, else what the pad id suggests.
    // `pad` spares the activePad() scan to a caller that already holds it.
    const padBrand = (pad) => (padLabelMode === "auto" ? padBrandAuto(pad) : padLabelMode);
    // The name on a chip: the player's override, else what the pad id suggests.
    function padLabel(index) {
      if (index == null) return "";
      const brand = padBrand();
      const names = PAD_NAME_SETS[brand] || PAD_NAMES_XBOX;
      return names[index] || `BTN ${index}`;
    }


    return {
      keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, loadLayoutMap,
      keyAction: (code) => codeToAction[normCode(code)] || null,
      padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad, padsAreDefault, padLabel,
      setPadLabelMode, padLabelMode: padLabelModeOf, padBrand,
      padButtons: (id) => padMap[id],
    };
  }

  return { create };
})();
Object.freeze(InputBindings);
