/* Apex 26 — telemetry transport, scrub interaction, playback, gauges and accessible summary. */
const DataTelemetryPlayer = (function () {
  "use strict";

  function create({ el, cssColor }, renderer) {
    const { clamp, laneRole, summaryTime, signed, summaryValue, dcode, drsOpen, sampleAt,
            PADL, PADR, distAtT, timeAtDist } = DataTelemetryModel;

    function paintFrame(view) {
      renderer.paintFrame(view);
      updateGauges(view);
    }

    function updateTextSummary(view) {
      if (!view || !view.a11ySummary) return;
      const selected = view.laps.map(function (t, i) {
        return dcode(t.d) + " (" + laneRole(i).toLowerCase() + ")";
      }).join(", ");
      const bits = ["Selected drivers: " + (selected || "none") + ".",
        "Time " + summaryTime(view.cursorT) + "."];
      view.laps.forEach(function (lane, i) {
        // The full text is useful to assistive technology and also gives the
        // parent CSS a stable, concise diagnostic line without putting dynamic
        // values into the canvas bitmap.
        const c = sampleAt(lane.car, view.cursorT === null ? 0 : view.cursorT);
        if (!c) {
          bits.push(dcode(lane.d) + ": no current sample.");
          return;
        }
        bits.push(dcode(lane.d) + " " + laneRole(i).toLowerCase() + ": " +
          "speed " + summaryValue(c.speed, " km/h") + ", gear " +
          (typeof c.gear === "number" && isFinite(c.gear) ? (c.gear ? "G" + c.gear : "N") : "—") +
          ", throttle " + summaryValue(c.throttle, "%") + ", brake " + summaryValue(c.brake, "%") +
          ", rpm " + summaryValue(c.rpm, "") + ", DRS " +
          (c.drs == null ? "—" : (drsOpen(c.drs) ? "open" : "closed")) + ".");
      });
      if (view.laps.length > 2) bits.push("Additional lanes are speed markers only.");
      view.a11ySummary.textContent = bits.join(" ");
    }

    function buildTransport(view) {
      const bar = el("div", "dh-transport");
      const play = el("button", "dh-tbtn dh-tplay", "▶ PLAY");
      play.type = "button";
      play.addEventListener("click", function () { if (view.playing) pauseAnim(view); else playAnim(view); });
      view.playBtn = play;
      const restart = el("button", "dh-tbtn dh-trestart", "⏮");
      restart.type = "button"; restart.title = "Restart lap";
      restart.addEventListener("click", function () { view.cursorT = 0; view._last = 0; paintFrame(view); if (view.updateSummary) view.updateSummary(); });
      bar.appendChild(play); bar.appendChild(restart);

      const rates = el("div", "dh-trates");
      [1, 2, 4].forEach(function (r) {
        const b = el("button", "dh-ratebtn" + (r === view.rate ? " active" : ""), r + "×");
        b.type = "button";
        b.addEventListener("click", function () {
          view.rate = r;
          const bs = rates.querySelectorAll(".dh-ratebtn");
          for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("active", bs[i] === b);
        });
        rates.appendChild(b);
      });
      bar.appendChild(rates);

      if (view.primary.loc && view.primary.loc.length > 8) {
        const ob = el("button", "dh-tbtn dh-onboard", "ONBOARD");
        ob.type = "button";
        ob.title = "Rotate the map so the car always points up";
        ob.addEventListener("click", function () {
          view.onboard = !view.onboard;
          ob.classList.toggle("dh-tplaying", view.onboard);
          paintFrame(view);
        });
        bar.appendChild(ob);
      }

      bar.appendChild(el("span", "dh-thint", "drag chart to scrub"));
      return bar;
    }
    function setPlayLabel(view) {
      if (!view.playBtn) return;
      view.playBtn.textContent = view.playing ? "⏸ PAUSE" : "▶ PLAY";
      view.playBtn.classList.toggle("dh-tplaying", view.playing);
    }

    function buildGauges(view) {
      const card = el("div", "dh-dash");
      const cmp = view.compare;
      function valCell(cls, label) {
        const w = el("div", "dh-gcell " + cls);
        w.appendChild(el("div", "dh-glabel", label));
        if (!cmp) {
          const v = el("div", "dh-gval", "—"); w.appendChild(v);
          card.appendChild(w); return [v];
        }
        const row = el("div", "dh-gvalrow");
        const v1 = el("span", "dh-gval", "—"); v1.style.color = cssColor(view.colP);
        const v2 = el("span", "dh-gval dh-gval2", "—"); v2.style.color = cssColor(view.colC);
        row.appendChild(v1); row.appendChild(v2);
        w.appendChild(row); card.appendChild(w); return [v1, v2];
      }
      function barCell(cls, label, color) {
        const w = el("div", "dh-gcell " + cls);
        w.appendChild(el("div", "dh-glabel", label));
        const out = [];
        const track = el("div", "dh-gbar");
        const fill = el("div", "dh-gfill"); fill.style.background = color;
        track.appendChild(fill); w.appendChild(track); out.push(fill);
        if (cmp) {
          const track2 = el("div", "dh-gbar dh-gbar2");
          const fill2 = el("div", "dh-gfill dh-gfill2"); fill2.style.background = color;
          track2.appendChild(fill2); w.appendChild(track2); out.push(fill2);
        }
        card.appendChild(w); return out;
      }
      const g = {};
      g.speed = valCell("dh-gspeed", "SPEED km/h");
      g.gear = valCell("dh-ggear", "GEAR");
      g.thr = barCell("dh-gthr", "THROTTLE", "#3fb950");
      g.brk = barCell("dh-gbrk", "BRAKE", "#ff4d4d");
      g.rpm = barCell("dh-grpm", "RPM", "#c084fc");
      const drsCell = el("div", "dh-gcell dh-gdrscell");
      drsCell.appendChild(el("div", "dh-glabel", "DRS"));
      g.drs = [el("div", "dh-gdrs-pill", "—")];
      drsCell.appendChild(g.drs[0]);
      if (cmp) {
        const p2 = el("div", "dh-gdrs-pill dh-gdrs2", "—");
        drsCell.appendChild(p2); g.drs.push(p2);
      }
      card.appendChild(drsCell);
      if (cmp) {
        const dcell = el("div", "dh-gcell dh-gdeltacell");
        dcell.appendChild(el("div", "dh-glabel", "Δ " + dcode(view.compare.d)));
        g.delta = el("div", "dh-gval dh-gdelta", "—");
        dcell.appendChild(g.delta); card.appendChild(dcell);
      }
      if (view.multi) {
        const board = el("div", "dh-laneboard");
        g.board = [];
        view.laps.forEach(function (t, i) {
          const row = el("div", "dh-laneboard-row");
          const dot = el("span", "dh-legend-dot dh-mapdot"); dot.style.background = cssColor(view.laneCols[i]);
          row.appendChild(dot);
          const badge = (view._dup && view._dup[t.d.num] > 1 && t.sessionLabel) ? " " + t.sessionLabel : "";
          row.appendChild(el("span", "dh-laneboard-code", dcode(t.d) + badge));
          const spd = el("span", "dh-laneboard-spd", "—");
          const dl = el("span", "dh-laneboard-dl", i === 0 ? "REF" : "—");
          row.appendChild(spd); row.appendChild(dl);
          board.appendChild(row);
          g.board.push({ spd: spd, dl: dl, ref: i === 0 });
        });
        card.appendChild(board);
      }
      view.g = g;
      return card;
    }
    function updateGauges(view) {
      const g = view.g; if (!g) return;
      const t = view.cursorT === null ? 0 : view.cursorT;
      const cars = [sampleAt(view.primary.car, t),
                    view.compare ? sampleAt(view.compare.car, t) : null];
      if (!cars[0]) return;
      for (let i = 0; i < g.speed.length; i++) {
        const c = cars[i]; if (!c) continue;
        g.speed[i].textContent = c.speed === null ? "—" : Math.round(c.speed);
        g.gear[i].textContent = (c.gear == null) ? "—" : (c.gear ? "G" + c.gear : "N");
        g.thr[i].style.width = (c.throttle === null ? 0 : clamp(c.throttle, 0, 100)) + "%";
        g.brk[i].style.width = (c.brake === null ? 0 : clamp(c.brake, 0, 100)) + "%";
        g.rpm[i].style.width = (c.rpm === null ? 0 : clamp(c.rpm / view.rpmMax * 100, 0, 100)) + "%";
        const open = c.drs != null && drsOpen(c.drs);
        g.drs[i].textContent = open ? "OPEN" : "—";
        g.drs[i].classList.toggle("dh-on", open);
      }
      if (g.delta && view.compare) {
        const dP = distAtT(view.primary.cum, t);
        const delta = timeAtDist(view.compare.cum, dP) - t;   // >0: compare is behind
        g.delta.textContent = signed(delta, 2) + "s";
        g.delta.classList.toggle("dh-pos", delta > 0.02);
        g.delta.classList.toggle("dh-neg", delta < -0.02);
      }
      // lane board (3-4 lanes): live speed + gap to the reference for every lane
      if (g.board) {
        const dRef = distAtT(view.primary.cum, t);
        view.laps.forEach(function (lane, i) {
          const cell = g.board[i]; if (!cell) return;
          const cc = sampleAt(lane.car, t);
          cell.spd.textContent = (cc && cc.speed !== null) ? Math.round(cc.speed) : "—";
          if (cell.ref) return;
          const dl = timeAtDist(lane.cum, dRef) - t;   // >0: this lane is behind the ref
          cell.dl.textContent = signed(dl, 2);
          cell.dl.classList.toggle("dh-pos", dl > 0.02);
          cell.dl.classList.toggle("dh-neg", dl < -0.02);
        });
      }
    }

    // drag the trace chart to scrub (pauses playback)
    function attachScrub(canvas, view) {
      let srect = null;   // measured once per drag: the canvas is pointer-captured, it cannot move mid-gesture
      function at(ev) {
        const r = srect || (window.CssZoom && CssZoom.viewportRect(canvas)) || canvas.getBoundingClientRect();
        // map into bitmap px, then invert the plot-area (axis gutter) transform
        // view.cw, NOT canvas.width: the buffer is layout x ratio now, while
        // PADL/PADR and chartX speak layout px. Chart and delta share one width.
        const bx = (ev.clientX - r.left) / (r.width || 1) * view.cw;
        view.cursorT = clamp((bx - PADL) / ((view.cw - PADL - PADR) || 1), 0, 1) * view.tMax;
        paintFrame(view);
      }
      /* ONE POINTER OWNS THE SCRUB, AND IT HAS TO SURVIVE A CANCEL.
         `ev.buttons` is the mouse's question — a touch drag reports 1 while down,
         which worked, but nothing here released the capture or noticed the drag
         being taken away. On iPadOS the hub's own scroller claims a vertical drag
         over the chart and Safari answers with `pointercancel` and no
         `pointerup`, so the scrub died mid-gesture and the panel scrolled
         instead. `touch-action: none` on the canvas (css/data.css) is what
         actually stops that claim — setPointerCapture never did — and tracking
         the pointerId is what keeps a second finger from yanking the cursor. */
      let pid = null;
      canvas.addEventListener("pointerdown", function (ev) {
        if (pid !== null) return;
        pid = ev.pointerId;
        pauseAnim(view);
        try { canvas.setPointerCapture && canvas.setPointerCapture(pid); } catch (e) {}
        srect = (window.CssZoom && CssZoom.viewportRect(canvas)) || canvas.getBoundingClientRect();
        at(ev);
      });
      canvas.addEventListener("pointermove", function (ev) {
        if (ev.pointerId !== pid) return;
        at(ev);
      });
      function endScrub(ev) {
        if (pid === null || (ev && ev.pointerId !== pid)) return;
        try { canvas.releasePointerCapture && canvas.releasePointerCapture(pid); } catch (e) {}
        pid = null; srect = null;
        if (view.updateSummary) view.updateSummary();
      }
      canvas.addEventListener("pointerup", endScrub);
      canvas.addEventListener("pointercancel", endScrub);
      canvas.addEventListener("lostpointercapture", endScrub);
    }

    function playAnim(view) {
      if (view.playing) return;
      if (view.cursorT === null || view.cursorT >= view.tMax) view.cursorT = 0;
      view.playing = true; view._last = 0; setPlayLabel(view);
      view._raf = requestAnimationFrame(function step(ts) {
        if (!view.playing) return;
        if (!view._last) view._last = ts;
        const dt = (ts - view._last) / 1000; view._last = ts;
        let nt = (view.cursorT || 0) + dt * view.rate;
        if (nt >= view.tMax) nt = 0;        // loop the lap
        view.cursorT = nt;
        paintFrame(view);
        view._raf = requestAnimationFrame(step);
      });
    }
    function pauseAnim(view) {
      if (!view.playing) return;
      view.playing = false;
      if (view._raf) { cancelAnimationFrame(view._raf); view._raf = 0; }
      setPlayLabel(view);
      if (view.updateSummary) view.updateSummary();
    }

    return { buildTransport, buildGauges, attachScrub, pauseAnim, paintFrame, updateTextSummary };
  }

  return { create };
})();
Object.freeze(DataTelemetryPlayer);
