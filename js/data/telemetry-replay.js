/* Apex 26 — width-aware telemetry replay sharing the chart's clock and lifecycle. */
const DataTelemetryReplay = (function () {
  "use strict";
  const clamp = M4.clamp;
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  function lower(rows, t, key = 0) {
    let a = 0, b = rows.length;
    while (a < b) { const m = (a + b) >> 1; if (rows[m][key] <= t) a = m + 1; else b = m; }
    return a - 1;
  }
  function interpolate(rows, t, col = 1) {
    const i = Math.max(0, lower(rows, t)), a = rows[i], b = rows[i + 1];
    if (!b || t <= a[0]) return a[col];
    const f = (t - a[0]) / (b[0] - a[0]);
    return a[col] + (b[col] - a[col]) * f;
  }
  function supports(lane) {
    const year = new Date(lane.lap?.dateStart).getUTCFullYear();
    return /^silverstone(?: circuit)?$/i.test(lane.circuit || "") && year >= 2023 && year <= 2026;
  }
  function validGeometry(g) {
    return g?.schemaVersion === 1 && g.circuit === "Silverstone" && g.units === "metres" && Array.isArray(g.bounds) && g.bounds.length === 2 &&
      [g.line, g.center, ...g.bounds].every((a) => Array.isArray(a) && a.length > 8 && a.length < 4000 && a.every((p) => p.length === 2 && p.every(finite))) &&
      g.arc?.length === g.line.length && g.arc[0] === 0 && g.arc.at(-1) === 1 && g.arc.every((s, i) => finite(s) && (!i || s > g.arc[i - 1])) &&
      g.anchors?.length === 4 && g.anchors[0] === 0 && g.anchors[3] === 1 && g.anchors.every((s, i) => finite(s) && (!i || s > g.anchors[i - 1])) &&
      g.width?.length === g.center.length && g.width.every((w) => finite(w) && w >= 6 && w <= 40);
  }
  // No driver-specific lateral offsets: integrate speed between sourced sector anchors.
  function motion(lane, geometry) {
    const lap = lane.lap, start = Date.parse(lap?.dateStart), duration = lap?.lapDuration;
    const sectors = [lap?.s1, lap?.s2, lap?.s3];
    if (!supports(lane) || !finite(start) || !finite(duration) || !sectors.every((s) => finite(s) && s > 0) ||
        Math.abs(sectors.reduce((a, b) => a + b, 0) - duration) > 0.05) return null;
    const samples = (lane.nativeCar || lane.car || []).map((s) => [finite(s.date) ? (s.date - start) / 1000 : s.t, s.speed])
      .filter((s) => finite(s[0]) && finite(s[1]) && s[1] >= 0).sort((a, b) => a[0] - b[0])
      .filter((s, i, a) => !i || s[0] !== a[i - 1][0]);
    if (samples.length < 8 || samples[0][0] > 0 || samples.at(-1)[0] < duration - 0.75) return null;
    if (samples.some((s, i) => i && s[0] > 0 && samples[i - 1][0] < duration && s[0] - samples[i - 1][0] > 1.5)) return null;
    const cuts = [0, sectors[0], sectors[0] + sectors[1], duration];
    const times = [...new Set([...cuts, ...samples.map((s) => s[0]).filter((t) => t > 0 && t < duration)])].sort((a, b) => a - b);
    const integral = [[0, 0]];
    for (let i = 1; i < times.length; i++) {
      const a = times[i - 1], b = times[i];
      integral.push([b, integral[i - 1][1] + (b - a) * (interpolate(samples, a) + interpolate(samples, b)) / 7.2]);
    }
    const distances = cuts.map((t) => interpolate(integral, t));
    if (distances.some((d, i) => i && d - distances[i - 1] <= 0)) return null;
    return integral.map(([t, d]) => {
      const i = t < cuts[1] ? 0 : t < cuts[2] ? 1 : 2;
      return [t, geometry.anchors[i] + (geometry.anchors[i + 1] - geometry.anchors[i]) *
        (d - distances[i]) / (distances[i + 1] - distances[i])];
    });
  }
  function point(g, f) {
    const rows = g.arcRows, i = Math.max(0, lower(rows, clamp(f, 0, 1))), a = g.line[i], b = g.line[i + 1];
    if (!b) return a;
    const q = (clamp(f, 0, 1) - g.arc[i]) / (g.arc[i + 1] - g.arc[i]);
    return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
  }
  function contextAt(lane, elapsed) {
    const context = lane.context, start = Date.parse(lane.lap?.dateStart), now = start + elapsed * 1000;
    if (!context || !finite(now)) return null;
    const before = (rows, filter) => (rows || []).reduce((best, r) => {
      const date = Date.parse(r.date);
      return date <= now && (!filter || filter(r, date)) && (!best || date > Date.parse(best.date)) ? r : best;
    }, null);
    return { tyre: context.summary.tyre, weather: before(context.sources.weather.rows),
      event: before(context.sources.raceControl.rows, (r, date) => date >= start && (r.driver_number == null || +r.driver_number === lane.d.num)) };
  }
  function create(view, { el, cssColor }, player) {
    if (typeof Path2D === "undefined") return { element: el("p", "dh-live-sub", "Replay drawing unavailable in this browser."), draw() {}, dispose() {} };
    const box = el("section", "dh-livecard"), heading = el("h3", "dh-section", "TRACK REPLAY");
    box.setAttribute("data-telemetry-replay", "");
    const controls = el("div", "dh-transport"), fields = el("div", "dh-pick-fields"), play = el("button", "bigbtn", "PLAY");
    const restart = el("button", "bigbtn alt", "RESTART"), expand = el("button", "bigbtn alt", "EXPAND");
    controls.setAttribute("data-replay-actions", "");
    fields.setAttribute("data-replay-fields", "");
    const rate = el("select"), mode = el("select"), zoom = el("select"), focus = el("select");
    for (const select of [rate, mode, zoom, focus]) select.className = "dh-pick-select";
    const label = (title, input) => { const l = el("label", "dh-pick-field"); l.appendChild(el("span", "dh-pick-label", title.toUpperCase())); input.setAttribute("aria-label", title); l.appendChild(input); fields.appendChild(l); };
    [[rate, [[1, "1×"], [2, "2×"], [4, "4×"]]], [mode, [["follow", "Follow car"], ["overview", "Whole circuit"]]],
      [zoom, [[80, "Close"], [140, "Medium"], [300, "Wide"]]], [focus, view.laps.map((l, i) => [i, l.d.name || "#" + l.d.num])]].forEach(([select, values]) => {
      values.forEach(([value, title]) => { const o = el("option", "", title); o.value = String(value); select.appendChild(o); });
    });
    zoom.value = "140";
    for (const button of [play, restart, expand]) { button.type = "button"; controls.appendChild(button); }
    label("Speed", rate); label("View", mode); label("Zoom", zoom); label("Follow", focus);
    const canvas = el("canvas", "dh-canvas"), seek = el("input"), seekLabel = el("label", "dh-pick-field");
    seekLabel.appendChild(el("span", "dh-pick-label", "LAP TIME"));
    canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Telemetry replay with circuit overview and following car detail");
    seek.type = "range"; seek.min = "0"; seek.max = String(view.tMax); seek.step = "0.01"; seek.value = "0";
    seek.setAttribute("aria-label", "Replay lap time in seconds"); seekLabel.appendChild(seek);
    const clock = el("output", "dh-live-title", "0.00 s"), note = el("p", "dh-live-sub"), rows = el("div", "dh-livecontrols");
    rows.setAttribute("data-replay-lanes", "");
    const cells = view.laps.map((lane, i) => {
      const cell = el("div", "dh-livecard"), title = el("strong", "dh-live-title", lane.d.name || "#" + lane.d.num);
      title.style.color = cssColor(view.laneCols[i]); cell.appendChild(title);
      const telemetry = el("p", "dh-live-sub"), context = el("p", "dh-live-sub"), event = el("p", "dh-live-sub");
      cell.append(telemetry, context, event); rows.appendChild(cell);
      return { telemetry, context, event };
    });
    const source = el("a", "dh-live-sub", "Geometry source and method"); source.href = "assets/telemetry/README.md"; source.target = "_blank"; source.rel = "noopener";
    box.append(heading, controls, fields, canvas, clock, seekLabel, note, rows, source);
    let geometry = null, models = [], disposed = false, dialog = null, placeholder = null, lastFrame = -Infinity, lastContext = "";
    let w = 320, h = 320, ratio = 1, timeout = 0;
    const abort = new AbortController();
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    const raw = view.primary.loc || [], fallbackLine = raw.map((p) => [p.x, p.y]);
    function path(points, close) {
      const p = new Path2D(); points.forEach((v, i) => i ? p.lineTo(...v) : p.moveTo(...v)); if (close) p.closePath(); return p;
    }
    let linePath = fallbackLine.length ? path(fallbackLine, false) : null, road = null, edges = null;
    function position(lane, i, t) {
      if (geometry) return models[i] ? point(geometry, interpolate(models[i], Math.min(t, lane.lap.lapDuration))) : null;
      const p = DataTelemetryModel.locationAtDate(lane.loc || [], Date.parse(lane.lap?.dateStart) + Math.min(t, lane.lap?.lapDuration || t) * 1000);
      return p ? [p.x, p.y] : null;
    }
    let bounds = null;
    function measureBounds(points) {
      if (!points.length) return null;
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    bounds = measureBounds(fallbackLine);
    function resize() {
      if (disposed || !box.isConnected) return;
      w = Math.max(1, canvas.clientWidth); h = Math.max(1, canvas.clientHeight);
      ratio = Math.min(2, (window.devicePixelRatio || 1) * (typeof CssZoom !== "undefined" ? CssZoom.of(canvas) : 1));
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); draw(true);
    }
    function draw(force = false) {
      if (disposed || !box.isConnected) return;
      const t = view.cursorT || 0, now = performance.now();
      if (!force && view.playing && now - lastFrame < 33) return;
      lastFrame = now;
      setText(play, view.playing ? "PAUSE" : "PLAY"); rate.value = String(view.rate);
      seek.value = String(t); setText(clock, t.toFixed(2) + " s");
      const c = canvas.getContext("2d"), colors = getComputedStyle(box);
      const ink = colors.getPropertyValue("--text").trim() || colors.color;
      c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, w, h);
      const positions = view.laps.map((lane, i) => position(lane, i, t));
      if (bounds && linePath) {
        const [x0, y0, x1, y1] = bounds, extent = Math.max(x1 - x0, y1 - y0, 1), selected = positions[+focus.value];
        const overview = mode.value === "overview" || !selected;
        const center = overview ? [(x0 + x1) / 2, (y0 + y1) / 2] : selected;
        const scale = overview ? Math.min((w - 24) / Math.max(1, x1 - x0), (h - 36) / Math.max(1, y1 - y0)) : Math.min(w, h) / (geometry ? +zoom.value : extent * +zoom.value / 1400);
        function scene(cx, cy, s, ox, oy, mini) {
          c.save(); c.translate(ox, oy); c.scale(s, -s); c.translate(-cx, -cy);
          if (road) { c.globalAlpha = .14; c.fillStyle = ink; c.fill(road, "evenodd"); c.globalAlpha = 1;
            c.strokeStyle = ink; c.lineWidth = (mini ? .5 : 1) / s; edges.forEach((p) => c.stroke(p)); }
          c.strokeStyle = ink; c.lineWidth = (mini ? 1 : 1.5) / s;
          if (geometry) c.setLineDash([5 / s, 4 / s]); c.stroke(linePath); c.setLineDash([]);
          positions.forEach((p, i) => {
            if (!p) return; c.save(); c.translate(...p); c.fillStyle = cssColor(view.laneCols[i]); c.strokeStyle = c.fillStyle;
            if (geometry && !mini && !overview) {
              const f = interpolate(models[i], Math.min(t, view.laps[i].lap.lapDuration)), next = point(geometry, Math.min(1, f + .0005)), prev = point(geometry, Math.max(0, f - .0005));
              c.rotate(Math.atan2(next[1] - prev[1], next[0] - prev[0])); c.lineWidth = 1.5 / s; c.strokeRect(-3, -1, 6, 2); c.fillRect(1.5, -.65, 1.5, 1.3);
            } else { c.beginPath(); c.arc(0, 0, (i ? 3 : 5) / s, 0, Math.PI * 2); i ? c.fill() : c.stroke(); }
            c.restore();
          }); c.restore();
        }
        scene(center[0], center[1], scale, w / 2, h / 2, false);
        if (!overview) {
          const size = Math.min(100, w * .27), s = Math.min((size - 12) / Math.max(1, x1 - x0), (size - 12) / Math.max(1, y1 - y0));
          c.clearRect(0, 0, size, size); scene((x0 + x1) / 2, (y0 + y1) / 2, s, size / 2, size / 2, true);
        }
        if (geometry && !overview) {
          c.fillStyle = ink; c.fillRect(12, h - 18, 20 * scale, 2); c.font = "12px system-ui"; c.fillText("20 m · approximate geometry", 12, h - 26);
        }
      }
      view.laps.forEach((lane, i) => {
        const at = Math.min(t, lane.lap?.lapDuration || t), samples = lane.nativeCar || lane.car;
        const sample = samples[lower(samples, Date.parse(lane.lap?.dateStart) + at * 1000, "date")];
        const state = sample && finite(sample.date) ? sample : null;
        const age = state ? (Date.parse(lane.lap.dateStart) + at * 1000 - state.date) / 1000 : null;
        setText(cells[i].telemetry, state ? DataTelemetryModel.speedText(state.speed) + " · gear " + (state.gear ?? "—") +
          " · throttle " + (state.throttle ?? "—") + "% · brake " + (state.brake == null ? "unknown" : state.brake ? "ON" : "off") +
          " · RPM " + (state.rpm ?? "—") + (view.hasDrs === false ? "" : " · DRS " + (state.drs == null ? "unknown" : DataTelemetryModel.drsOpen(state.drs) ? "open" : "closed")) +
          " · sample " + age.toFixed(2) + " s old" + (t >= lane.lap.lapDuration ? " · finished" : "") +
          (geometry && !models[i] ? " · estimated position unavailable" : "") : "Native telemetry sample unavailable");
      });
      const key = Math.floor(t * 4) + ":" + view.laps.map((l) => !!l.context).join();
      if (key !== lastContext) {
        lastContext = key;
        view.laps.forEach((lane, i) => {
          const state = contextAt(lane, Math.min(t, lane.lap?.lapDuration || t)), weather = state?.weather;
          setText(cells[i].context, state ? (state.tyre?.compound || "Tyres unknown") + " · tyre age at stint start " + (state.tyre?.ageAtStintStart ?? "—") +
            " · track " + (weather?.track_temperature ?? "—") + " °C · air " + (weather?.air_temperature ?? "—") + " °C · rain " +
            (weather?.rainfall == null ? "unknown" : weather.rainfall ? "yes" : "no") + " · wind " + (weather?.wind_speed ?? "—") + " m/s" : "Lap context loading or unavailable");
          setText(cells[i].event, state?.event ? "Race control: " + state.event.message : "No in-lap race-control message available");
        });
      }
    }
    function seekTo(t) { player.pauseAnim(view); view.cursorT = clamp(t, 0, view.tMax); view._last = 0; player.paintFrame(view); view.updateSummary?.(); }
    seek.addEventListener("input", () => seekTo(+seek.value)); restart.addEventListener("click", () => seekTo(0));
    play.addEventListener("click", () => { view.playing ? player.pauseAnim(view) : player.playAnim(view); draw(true); });
    rate.addEventListener("change", () => { view.rate = +rate.value; player.paintFrame(view); });
    [mode, zoom, focus].forEach((s) => s.addEventListener("change", () => draw(true)));
    function restore() {
      if (!dialog) return;
      const previous = dialog; dialog = null;
      if (!disposed && placeholder?.parentNode) { placeholder.replaceWith(box); expand.hidden = false; expand.focus(); }
      previous.remove(); if (!disposed) resize();
    }
    expand.addEventListener("click", () => {
      if (dialog) { dialog.close(); return; }
      placeholder = el("div"); placeholder.hidden = true; box.replaceWith(placeholder);
      dialog = el("dialog", "dh-tpopup"); dialog.setAttribute("data-replay-expanded", ""); dialog.setAttribute("aria-label", "Expanded telemetry replay");
      const card = el("div", "dh-tpopup-card fit-managed"), header = el("div", "dh-tpopup-hdr"), title = el("div", "dh-tpopup-title");
      title.appendChild(el("span", "", "TRACK REPLAY")); title.appendChild(el("span", "dh-tpopup-sub", view.primary.circuit || "Telemetry"));
      const close = el("button", "dh-close", "✕"); close.type = "button"; close.autofocus = true; close.setAttribute("aria-label", "Close replay");
      const opened = dialog; close.addEventListener("click", () => opened.close());
      header.append(title, close);
      const body = el("div", "dh-tpopup-body"); body.appendChild(box); card.append(header, body);
      dialog.appendChild(card); document.body.appendChild(dialog);
      dialog.addEventListener("pointerdown", (e) => { if (e.target === opened) opened.close(); });
      dialog.addEventListener("close", () => { if (dialog === opened) restore(); });
      expand.hidden = true; dialog.showModal(); resize(); close.focus();
    });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    const fallback = (raw.length > 1 ? "Feed-position replay · track width unavailable for this circuit." : "Location data unavailable for this lap.") + " Lap clocks aligned, not simultaneous race positions.";
    note.textContent = fallback;
    if (view.laps.every(supports)) {
      note.textContent = "Loading sourced Silverstone geometry…";
      timeout = setTimeout(() => abort.abort(), 8000);
      fetch("assets/telemetry/silverstone.json", { signal: abort.signal }).then((r) => { if (!r.ok) throw new Error("Geometry unavailable"); return r.json(); }).then((data) => {
        if (disposed) return;
        if (!validGeometry(data)) throw new Error("Invalid geometry");
        models = view.laps.map((lane) => motion(lane, data));
        if (!models.some(Boolean)) throw new Error("Insufficient telemetry coverage");
        geometry = data; geometry.arcRows = data.arc.map((f) => [f]);
        linePath = path(data.line, false); edges = data.bounds.map((b) => path(b, true)); road = new Path2D(); edges.forEach((p) => road.addPath(p));
        bounds = measureBounds(data.bounds.flat());
        note.textContent = "Estimated shared line · satellite-derived widths (TUM / OpenStreetMap). Speed-integrated progress anchored to recorded sectors. Not measured lateral positions. Lap clocks aligned.";
        resize();
      }).catch(() => { if (!disposed) { note.textContent = "Width-aware replay unavailable; showing feed positions. " + fallback; draw(true); } }).finally(() => clearTimeout(timeout));
    }
    return { element: box, draw, dispose() { disposed = true; abort.abort(); clearTimeout(timeout); observer?.disconnect(); if (dialog) { dialog.close(); restore(); } } };
  }
  return { supports, validGeometry, motion, interpolate, contextAt, create };
})();
Object.freeze(DataTelemetryReplay);
