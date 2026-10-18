/* Apex 26 — transform-only DOM painter for overlay.html. */
const OverlayRender = (function () {
  "use strict";

  const MAX_ROWS = 20;

  function options(search) {
    const q = new URLSearchParams(search || "");
    const scale = Math.min(2, Math.max(.5, Number(q.get("scale")) || 1));
    const rows = Math.min(MAX_ROWS, Math.max(1, Number(q.get("rows")) | 0 || MAX_ROWS));
    const side = q.get("side") === "right" ? "right" : "left";
    const chroma = ["green", "blue", "magenta"].includes(q.get("chroma")) ? q.get("chroma") : "";
    return { scale, rows, side, chroma, demo: q.get("demo") === "1", only: q.get("only") === "captions" ? "captions" : "" };
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

    function paint(frame) {
      if (!frame || frame.v !== 1) return false;
      const list = frame.rows || [];
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
        out.el.dataset.you = row.you ? "1" : "";
      }
      if (frame.battle !== undefined) {
        battle.hidden = !frame.battle;
        if (frame.battle) {
          text(battleWho, frame.battle.ahead + "  ·  " + frame.battle.behind);
          text(battleGap, Number(frame.battle.gapS).toFixed(2) + "s");
        }
      }
      if (frame.sectors && frame.sectors.last) {
        for (let i = 0; i < sec.length; i++) {
          const s = frame.sectors.last[i] || {};
          text(sec[i], s.value == null ? "S" + (i + 1) : s.glyph + Number(s.value).toFixed(3));
          sec[i].dataset.tone = s.tone || "";
        }
      }
      if (frame.caption !== undefined) {
        caption.hidden = !frame.caption;
        if (frame.caption) {
          text(capWho, frame.caption.n ? frame.caption.n + "  " + frame.caption.who : frame.caption.who);
          text(capText, frame.caption.text);
          caption.dataset.kind = frame.caption.kind || "";
        }
      }
      return true;
    }

    return { paint, rows };
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
    document.documentElement.dataset.chroma = config.chroma;
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

  return { MAX_ROWS, options, create, demoFrame, boot };
})();
Object.freeze(OverlayRender);
if (typeof document !== "undefined" && document.querySelector('main#overlay[role="region"]')) OverlayRender.boot();
