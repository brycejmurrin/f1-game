/* Apex 26 — transform-only DOM painter for overlay.html. */
const OverlayRender = (function () {
  "use strict";

  const MAX_ROWS = 20;
  const FLASH_MS = 1200;

  function options(search) {
    const q = new URLSearchParams(search || "");
    const scale = Math.min(2, Math.max(.5, Number(q.get("scale")) || 1));
    const rows = Math.min(MAX_ROWS, Math.max(1, Number(q.get("rows")) | 0 || MAX_ROWS));
    const side = q.get("side") === "right" ? "right" : "left";
    const chroma = ["green", "blue", "magenta"].includes(q.get("chroma")) ? q.get("chroma") : "";
    return { scale, rows, side, chroma, demo: q.get("demo") === "1", only: q.get("only") === "captions" ? "captions" : "" };
  }

  // WCAG 2 relative luminance / contrast of "#rgb", "#rrggbb" or "rgb(r,g,b)".
  function rgbOf(colour) {
    const c = String(colour || "").trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
    return m ? [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v)))) : null;
  }
  function luminance(rgb) {
    const lin = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  function contrast(a, b) {
    const la = luminance(rgbOf(a)), lb = luminance(rgbOf(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // THE TEAM PLATE: the position number sits on the team colour, in whichever ink
  // reads better. Pure black or white always clears 4.5:1 on one of them (the
  // worst case, a mid-luminance colour, is ~4.58:1), so every team's plate meets WCAG AA.
  const INK_DARK = "#000000", INK_LIGHT = "#ffffff";   // pure black: #0b0c10 drops the worst case to 4.4:1
  function ink(colour) {
    if (!rgbOf(colour)) return "";
    return contrast(colour, INK_DARK) >= contrast(colour, INK_LIGHT) ? INK_DARK : INK_LIGHT;
  }

  function node(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }
  function text(el, value) {
    const next = value == null ? "" : String(value);
    if (el.textContent !== next) el.textContent = next;
  }

  function create(root, config) {
    config = config || {};
    const limit = Math.min(MAX_ROWS, Math.max(1, config.rows | 0 || MAX_ROWS));
    const tower = root.querySelector(".ov-tower");
    const battle = root.querySelector(".ov-battle");
    const sectors = root.querySelector(".ov-sectors");
    const caption = root.querySelector(".ov-caption");
    const rows = [];
    for (let i = 0; i < MAX_ROWS; i++) {
      const el = node("div", "ov-row");
      const pos = node("b", "ov-pos"), team = node("i", "ov-team");
      const code = node("strong", "ov-code"), gap = node("span", "ov-gap"), tyre = node("em", "ov-tyre");
      el.append(pos, team, code, gap, tyre);
      el.hidden = i >= limit;
      tower.appendChild(el);
      rows.push({ el, pos, team, code, gap, tyre, key: "" });
    }
    const battleWho = battle.querySelector("strong"), battleGap = battle.querySelector("span");
    const sec = sectors.querySelectorAll("span");
    const capWho = caption.querySelector("strong"), capText = caption.querySelector("span");
    // Last fully-merged frame. createDiffer patches omit unchanged keys; painting
    // a patch with `rows || []` used to wipe the tower, and omitting `battle`
    // left the BATTLE chrome stuck after the race ended.
    let current = null;

    function merge(frame) {
      if (frame.full || !current) {
        current = {
          v: frame.v, seq: frame.seq, t: frame.t,
          state: frame.state, track: frame.track, lap: frame.lap, laps: frame.laps,
          flag: frame.flag, rows: frame.rows || [], battle: frame.battle || null,
          sectors: frame.sectors || null, caption: frame.caption || null,
        };
        return current;
      }
      current = {
        v: frame.v, seq: frame.seq, t: frame.t,
        state: frame.state !== undefined ? frame.state : current.state,
        track: frame.track !== undefined ? frame.track : current.track,
        lap: frame.lap !== undefined ? frame.lap : current.lap,
        laps: frame.laps !== undefined ? frame.laps : current.laps,
        flag: frame.flag !== undefined ? frame.flag : current.flag,
        rows: frame.rows !== undefined ? frame.rows : current.rows,
        battle: frame.battle !== undefined ? frame.battle : current.battle,
        sectors: frame.sectors !== undefined ? frame.sectors : current.sectors,
        caption: frame.caption !== undefined ? frame.caption : current.caption,
      };
      return current;
    }

    function paint(frame) {
      if (!frame || frame.v !== 1) return false;
      const view = merge(frame);
      const live = view.state === "race" || view.state === "count";
      const list = view.rows || [];
      for (let i = 0; i < rows.length; i++) {
        const out = rows[i], row = list[i];
        out.el.hidden = i >= limit || !row;
        if (!row || i >= limit) continue;
        const key = [row.pos, row.code, row.team, row.interval, row.tyre, row.pit, row.you].join("|");
        out.el.style.transform = "translate3d(0," + ((Math.max(1, row.pos) - 1) * 34) + "px,0)";
        if (key === out.key) continue;
        out.key = key;
        text(out.pos, row.pos);
        text(out.code, row.code);
        text(out.gap, row.pos === 1 ? "LEADER" : row.pit ? "PIT" : row.interval == null ? "" : "+" + Number(row.interval).toFixed(2));
        text(out.tyre, row.tyre || "");
        out.team.style.background = row.team || "";
        const plate = rgbOf(row.team) ? row.team : "";
        out.pos.style.background = plate;
        out.pos.style.color = plate ? ink(plate) : "";
        out.el.dataset.you = row.you ? "1" : "";
      }
      // Battles are race/count only — hide once the session leaves those states
      // even if a stale patch omitted the battle key (stuck after the flag).
      if (!live) {
        battle.hidden = true;
        if (current) current.battle = null;
      } else {
        battle.hidden = !view.battle;
        if (view.battle) {
          text(battleWho, view.battle.ahead + "  ·  " + view.battle.behind);
          text(battleGap, Number(view.battle.gapS).toFixed(2) + "s");
        }
      }
      if (view.sectors && view.sectors.last) {
        for (let i = 0; i < sec.length; i++) {
          const s = view.sectors.last[i] || {};
          const label = s.value == null ? "S" + (i + 1) : s.glyph + Number(s.value).toFixed(3);
          // SECTOR FLASH: a new time flashes its cell for FLASH_MS (overlay.html
          // animates it; under prefers-reduced-motion it is a static outline).
          if (s.value != null && sec[i].textContent !== label) flash(sec[i]);
          text(sec[i], label);
          sec[i].dataset.tone = s.tone || "";
        }
      }
      if (view.caption !== undefined) {
        caption.hidden = !view.caption;
        if (view.caption) {
          text(capWho, view.caption.n ? view.caption.n + "  " + view.caption.who : view.caption.who);
          text(capText, view.caption.text);
          caption.dataset.kind = view.caption.kind || "";
        }
      }
      return true;
    }

    const flashTimers = new Map();
    function flash(el) {
      el.dataset.flash = "1";
      clearTimeout(flashTimers.get(el));
      flashTimers.set(el, setTimeout(() => { el.dataset.flash = ""; flashTimers.delete(el); }, FLASH_MS));
    }
    // Dispose the painted chrome (feed stopped, race quit). Mirrors createDiffer.reset.
    function clear() {
      current = null;
      for (let i = 0; i < rows.length; i++) {
        rows[i].el.hidden = true;
        rows[i].key = "";
      }
      battle.hidden = true;
      caption.hidden = true;
      caption.dataset.kind = "";
      for (let i = 0; i < sec.length; i++) {
        text(sec[i], "S" + (i + 1));
        sec[i].dataset.tone = "";
        sec[i].dataset.flash = "";
      }
    }

    return { paint, clear, rows };
  }

  function demoFrame(elapsed) {
    const phase = Math.floor(elapsed / 4) % 2;
    const leader = { code: phase ? "NOR" : "LEC", pos: 1, prog: 5050, speed: 76, team: phase ? "#ff8700" : "#e8002d" };
    const chaser = { code: phase ? "LEC" : "NOR", pos: 2, prog: 4996, speed: 76, team: phase ? "#e8002d" : "#ff8700", you: true };
    const ranked = [leader, chaser,
      { code: "VER", pos: 3, prog: 4870, speed: 74, team: "#3671c6" },
      { code: "RUS", pos: 4, prog: 4710, speed: 72, team: "#27f4d2" },
      { code: "PIA", pos: 5, prog: 4590, speed: 73, team: "#ff8700" }];
    return OverlayFeed.frame({
      seq: Math.floor(elapsed * 4), t: elapsed, state: "race", track: "monza", lap: 18, laps: 53,
      flag: "green", ranked, sectorLast: [25.104, 28.471, 23.992],
      sectorBests: [25.104, 28.471, 23.8], fieldSectorBests: [25.104, 28.2, 23.7],
      caption: elapsed % 8 < 4 ? { id: "demo-" + Math.floor(elapsed / 8), n: "04", who: "NOR", text: "That was a decisive move.", kind: "radio" } : null,
    });
  }

  function boot() {
    const root = typeof document !== "undefined" && document.querySelector('main#overlay[role="region"]');
    if (!root) return null;
    const config = options(typeof location !== "undefined" ? location.search : "");
    if (config.chroma) document.documentElement.dataset.chroma = config.chroma;
    else delete document.documentElement.dataset.chroma;
    document.body.dataset.side = config.side;
    document.body.dataset.only = config.only;
    root.style.setProperty("--ov-scale", String(config.scale));
    const painter = create(root, config);
    if (!config.demo) {
      painter.paint(OverlayFeed.frame({
        seq: 0, state: "waiting", ranked: [],
        caption: { id: "waiting", who: "APEX 26", text: "Waiting for a broadcast feed", kind: "status" },
      }));
      return painter;
    }
    const started = performance.now();
    if (typeof TvGraphics !== "undefined") {
      const demoRanked = [
        { code: "LEC", pos: 1, prog: 5050, speed: 76 },
        { code: "NOR", pos: 2, prog: 4996, speed: 76 },
      ];
      const demoG = { hudProfile: "broadcast", state: "race", raceT: 18, lap: 18, laps: 53, ranked: demoRanked };
      const tv = TvGraphics.create(demoG);
      tv.tick(.25, true);
      window.setTimeout(() => {
        demoRanked[0] = { code: "NOR", pos: 1, prog: 5055, speed: 77, fastest: true };
        demoRanked[1] = { code: "LEC", pos: 2, prog: 5002, speed: 76 };
        tv.tick(.25, true);
      }, 900);
    }
    const paint = () => painter.paint(demoFrame((performance.now() - started) / 1000));
    paint();
    window.setInterval(paint, 250);
    return painter;
  }

  return { MAX_ROWS, FLASH_MS, options, create, demoFrame, boot, contrast, ink };
})();
Object.freeze(OverlayRender);
if (typeof document !== "undefined" && document.querySelector('main#overlay[role="region"]')) OverlayRender.boot();
