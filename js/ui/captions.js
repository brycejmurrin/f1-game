/* Apex 26 — Captions: on-screen text for radio, spotter, and pre-race announcer.
   Presentation only — no physics, no circuit arc reads. Radio lines keep using #announce;
   non-radio sources use #captions. Speaker labels live here (moved from announce-banner).
   Plan slice 4: docs/plans/2026-10-04-colourblind-captions.md */
const Captions = (function () {
  "use strict";

  const K_MODE = "captions";
  const K_SIZE = "captionSize";
  const K_POS = "captionPos";
  const K_BG = "captionBg";
  const K_SPEAKER_INK = "captionSpeakerInk";

  const MODES = Object.freeze([["on", "ON"], ["off", "OFF"], ["spoken", "SPOKEN ONLY"]]);
  const SIZES = Object.freeze([["small", "SMALL"], ["medium", "MEDIUM"], ["large", "LARGE"]]);
  const POSITIONS = Object.freeze([["auto", "AUTO"], ["top", "TOP"], ["bottom", "BOTTOM"], ["mirror", "BESIDE MIRROR"]]);
  const SPEAKER_INK = Object.freeze([["on", "ON"], ["off", "OFF"]]);
  const BG_OPTS = Object.freeze([
    ["40", "40%"], ["55", "55%"], ["70", "70%"], ["82", "DEFAULT"], ["90", "90%"], ["100", "100%"],
  ]);

  const RING_MAX = 12;
  const TEXT_CH_MAX = 38;
  const WHO = Object.freeze({
    spotter: "SPOTTER",
    announcer: "ANNOUNCER",
    loading: "ANNOUNCER",
  });

  const store = () => (typeof GameStore !== "undefined" ? GameStore.store : null);
  const root = () => (typeof document !== "undefined" ? document.documentElement : null);
  const byId = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);

  function oneOf(v, allowed, fallback) {
    const s = String(v == null ? "" : v);
    for (const [id] of allowed) if (id === s) return s;
    return fallback;
  }

  let mode = "on";
  let size = "medium";
  let pos = "auto";
  let bg = 82;
  let speakerInk = "on";
  const ring = [];

  function readStore() {
    const s = store();
    if (!s || typeof s.get !== "function") return;
    mode = oneOf(s.get(K_MODE, "on"), MODES, "on");
    size = oneOf(s.get(K_SIZE, "medium"), SIZES, "medium");
    pos = oneOf(s.get(K_POS, "auto"), POSITIONS, "auto");
    const b = +s.get(K_BG, 82);
    bg = Number.isFinite(b) ? Math.max(40, Math.min(100, Math.round(b))) : 82;
    speakerInk = oneOf(s.get(K_SPEAKER_INK, "on"), SPEAKER_INK, "on");
  }
  readStore();

  function sizeMult() {
    const text = (typeof AppearanceOpts !== "undefined" && AppearanceOpts.textSize)
      ? AppearanceOpts.textSize() : "large";
    const textM = text === "larger" ? 1.12 : text === "large" ? 1.06 : 1;
    const capM = size === "large" ? 1.14 : size === "small" ? 0.92 : 1;
    return textM * capM;
  }

  /** WHO line for a radio `kind` (announce-banner calls this). */
  function radioWho(kind, player) {
    const speakers = (typeof RadioVoice !== "undefined" && RadioVoice.SPEAKERS) || {};
    const label = { control: "RACE CONTROL", coach: "COACH", announcer: "COMMENTARY" }[speakers[kind]];
    if (label) return label;
    const p = player;
    const who = p && p.name ? String(p.name).split(" ").pop().toUpperCase() : (p && p.code) || "";
    return (who ? who + " · " : "") + "RADIO";
  }

  function push(rec) {
    if (!rec || !rec.text) return;
    ring.push({ t: rec.t || Date.now(), who: rec.who || "", text: String(rec.text), kind: rec.kind || "" });
    while (ring.length > RING_MAX) ring.shift();
  }

  function stripVisible() {
    return mode === "on" || mode === "spoken";
  }

  function spotterSide(key) {
    if (key === "car left") return "left";
    if (key === "car right") return "right";
    if (key === "three wide") return "both";
    return "";
  }

  function paintStrip(who, text, side) {
    const el = byId("captions");
    if (!el || !stripVisible()) {
      if (el) el.hidden = true;
      return;
    }
    const w = el.querySelector(".cap-who");
    const t = el.querySelector(".cap-text");
    const chev = el.querySelector(".cap-side");
    if (w) w.textContent = who || "";
    if (t) t.textContent = text || "";
    if (chev) {
      chev.textContent = side === "left" ? "‹" : side === "right" ? "›" : side === "both" ? "‹ ›" : "";
      chev.hidden = !side;
    }
    el.hidden = !(text && String(text).trim());
    el.setAttribute("aria-hidden", el.hidden ? "true" : "false");
  }

  function paintLoading(who, text) {
    const el = byId("ld-caption");
    if (!el) return;
    if (!stripVisible() || mode === "off" || !text) {
      el.hidden = true;
      return;
    }
    const w = el.querySelector(".ld-caption-who");
    const t = el.querySelector(".ld-caption-text");
    if (w) w.textContent = who || WHO.announcer;
    if (t) t.textContent = text;
    el.hidden = false;
  }

  function clearLoading() {
    const el = byId("ld-caption");
    if (el) el.hidden = true;
  }

  function applyDom() {
    const r = root();
    if (!r) return;
    r.dataset.captions = mode;
    if (pos === "auto") r.removeAttribute("data-caption-pos");
    else r.dataset.captionPos = pos;
    r.style.setProperty("--caption-scale", String(sizeMult()));
    r.style.setProperty("--caption-bg-a", String(bg / 100));
    r.dataset.captionSpeakerInk = speakerInk === "off" ? "off" : "on";
    r.style.setProperty("--caption-ch", String(TEXT_CH_MAX));
    if (!stripVisible()) {
      paintStrip("", "");
      clearLoading();
    }
  }

  function onRadio(meta) {
    if (!meta || meta.quiet) return;
    push({ who: meta.who, text: meta.text, kind: meta.kind || "radio" });
  }

  function onSpotter(text, key) {
    if (mode === "off") return;
    const who = WHO.spotter;
    push({ who, text, kind: "spotter" });
    paintStrip(who, text, spotterSide(key));
  }

  function onAnnouncerLine(text) {
    if (mode === "off") return;
    const line = String(text || "").trim();
    if (!line) return;
    push({ who: WHO.announcer, text: line, kind: "announcer" });
    paintLoading(WHO.announcer, line);
  }

  function announcerDone() {
    clearLoading();
  }

  function setMode(v) {
    mode = oneOf(v, MODES, "on");
    const s = store();
    if (s) s.set(K_MODE, mode);
    applyDom();
    return mode;
  }
  function setSize(v) {
    size = oneOf(v, SIZES, "medium");
    const s = store();
    if (s) s.set(K_SIZE, size);
    applyDom();
    return size;
  }
  function setPos(v) {
    pos = oneOf(v, POSITIONS, "auto");
    const s = store();
    if (s) s.set(K_POS, pos);
    applyDom();
    return pos;
  }
  function setBg(v) {
    const n = Math.round(+v);
    bg = Number.isFinite(n) ? Math.max(40, Math.min(100, n)) : 82;
    const s = store();
    if (s) s.set(K_BG, bg);
    applyDom();
    return bg;
  }
  function setSpeakerInk(v) {
    speakerInk = oneOf(v, SPEAKER_INK, "on");
    const s = store();
    if (s) s.set(K_SPEAKER_INK, speakerInk);
    applyDom();
    return speakerInk;
  }

  function restore() {
    readStore();
    applyDom();
  }

  function initAppearanceRows() {
    if (typeof SettingRow === "undefined" || typeof SettingRow.build !== "function") return;
    const anchor = byId("pm-cvd-help") || byId("pm-cvd");
    if (!anchor || !anchor.parentNode) return;
    const parent = anchor.parentNode;
    const insertAfter = (node, after) => {
      parent.insertBefore(node, after ? after.nextSibling : null);
    };
    let last = anchor;
    if (!byId("pm-captions")) {
      const built = SettingRow.build("pm-captions", "CAPTIONS", MODES);
      const help = document.createElement("p");
      help.className = "adv-help";
      help.id = "pm-captions-help";
      help.textContent = "On-screen text for spotter calls and the pre-race announcer. Radio messages still use the radio card.";
      insertAfter(built.row, last);
      insertAfter(help, built.row);
      last = help;
    }
    const rows = [
      ["pm-caption-size", "CAPTION SIZE", SIZES, () => size, setSize],
      ["pm-caption-pos", "CAPTION POSITION", POSITIONS, () => pos, setPos],
      ["pm-caption-bg", "CAPTION BACKGROUND", BG_OPTS, () => String(bg), (v) => setBg(v)],
      ["pm-caption-speaker", "SPEAKER COLOUR", SPEAKER_INK, () => speakerInk, setSpeakerInk],
    ];
    for (const [id, label, values, read, write] of rows) {
      if (byId(id)) continue;
      const built = SettingRow.build(id, label, values);
      insertAfter(built.row, last);
      last = built.row;
      SettingRow.wire(id, { values, read, write });
    }
    if (byId("pm-captions")) {
      SettingRow.wire("pm-captions", { values: MODES, read: () => mode, write: setMode });
    }
  }

  applyDom();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { initAppearanceRows(); applyDom(); }, { once: true });
    } else initAppearanceRows();
  }

  return {
    K_MODE, K_SIZE, K_POS, K_BG, K_SPEAKER_INK,
    MODES, SIZES, POSITIONS, SPEAKER_INK, WHO, RING_MAX, TEXT_CH_MAX,
    radioWho, push, ring: () => ring.slice(),
    onRadio, onSpotter, onAnnouncerLine, announcerDone,
    setMode, setSize, setPos, setBg, setSpeakerInk, restore, applyDom,
    mode: () => mode, size: () => size, pos: () => pos, bg: () => bg,
    initAppearanceRows,
  };
})();
Object.freeze(Captions);
