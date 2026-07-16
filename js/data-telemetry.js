/* Apex 26 — the data hub's TELEMETRY tab (trace viewer, delta, map, playback).
   Split out of js/data.js; instantiated once by the DataHub shell via
   DataTelemetry.create(ctx) with the shell helpers it needs (el/clear/
   emptyMsg/spinner DOM builders, ensureSession/buildPicker/invalidateOther
   session plumbing, COMPOUND, findTeam). Uses the F1API global directly.
   Must load BEFORE js/data.js (see index.html). */
const DataTelemetry = (function () {
  "use strict";

  function create(ctx) {
    const { el, clear, emptyMsg, spinner, ensureSession, buildPicker,
            invalidateOther, COMPOUND, findTeam, cssColor, NO_TELEM_MSG } = ctx;


  function driverColor(d) {
    if (d && d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
      return [parseInt(d.color.slice(0, 2), 16) / 255,
              parseInt(d.color.slice(2, 4), 16) / 255,
              parseInt(d.color.slice(4, 6), 16) / 255];
    }
    const t = findTeam(d && d.team);
    return t ? t.color : [0.6, 0.6, 0.6];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dcode(d) { return d.code || ("#" + d.num); }
  // OpenF1 DRS codes: 10/12/14 = wing open, everything else closed/eligible.
  function drsOpen(v) { return v === 10 || v === 12 || v === 14; }

  // Plottable car-data channels. `norm:"speed"|"rpm"` scales by that channel's
  // session peak; otherwise [lo,hi] maps linearly to the plot height. `step`
  // draws a staircase (gear / DRS). `off` = hidden until toggled on.
  const CHANNELS = [
    { id: "speed",    label: "SPEED",    color: "#39d0ff", w: 2,   norm: "speed", get: function (c) { return c.speed; },    fmt: function (v) { return Math.round(v) + " km/h"; } },
    { id: "throttle", label: "THR",      color: "#3fb950", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.throttle; }, fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "brake",    label: "BRAKE",    color: "#ff4d4d", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.brake; },    fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "gear",     label: "GEAR",     color: "#f6d200", w: 1.5, lo: 0, hi: 8, step: true, off: true, get: function (c) { return c.gear; }, fmt: function (v) { return v ? "G" + v : "N"; } },
    { id: "rpm",      label: "RPM",      color: "#c084fc", w: 1.5, norm: "rpm", off: true, get: function (c) { return c.rpm; }, fmt: function (v) { return Math.round(v); } },
    { id: "drs",      label: "DRS",      color: "#00e0c0", w: 1.5, lo: 0, hi: 1, step: true, off: true, get: function (c) { return c.drs === null || c.drs === undefined ? null : (drsOpen(c.drs) ? 1 : 0); }, fmt: function (v) { return v ? "OPEN" : "—"; } }
  ];

  function chanRaw(ch, c) {
    const v = ch.get(c);
    return (v === null || v === undefined || isNaN(v)) ? null : v;
  }
  // normalize a sample to 0..1 of the plot height for the given channel
  function chanNorm(ch, c, view) {
    const v = chanRaw(ch, c);
    if (v === null) return null;
    if (ch.norm === "speed") return clamp(v / view.speedMax, 0, 1);
    if (ch.norm === "rpm") return clamp(v / view.rpmMax, 0, 1);
    return clamp((v - ch.lo) / (ch.hi - ch.lo), 0, 1);
  }
  // nearest car sample (by lap time t) to a cursor time
  function sampleAt(car, t) {
    if (!car || !car.length) return null;
    let lo = 0, hi = car.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (car[mid].t < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(car[lo - 1].t - t) < Math.abs(car[lo].t - t)) lo--;
    return car[lo];
  }

  function loadTelemetry() {
    return ensureSession().then(function () {
      const wrap = el("div", "dh-tabbody dh-split");
      if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_TELEM_MSG)); return wrap; }
      const leftPane = el("div", "dh-split-L");
      const rightPane = el("div", "dh-split-R");
      leftPane.appendChild(buildPicker(function (meta) {
        renderTelemetryBody(meta, leftPane, rightPane);
        invalidateOther("telemetry");
      }));
      wrap.appendChild(leftPane);
      wrap.appendChild(rightPane);
      renderTelemetryBody(sel.meta, leftPane, rightPane);
      return wrap;
    });
  }

  function renderTelemetryBody(meta, leftPane, rightPane) {
    // Keep the picker (first child of leftPane); remove everything appended after it
    while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
    clear(rightPane);
    rightPane.appendChild(spinner());

    F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; }).then(function (drivers) {
      // Session info → left pane
      const info = el("div", "dh-livecard");
      const title = el("div", "dh-live-title");
      title.appendChild(el("span", null, meta.name || meta.type || "Session"));
      if (meta.type && meta.type !== meta.name) title.appendChild(el("span", "dh-live-type", meta.type));
      info.appendChild(title);
      const place = [meta.circuit, meta.country].filter(Boolean).join(" · ");
      if (place) info.appendChild(el("div", "dh-live-sub", place));
      info.appendChild(el("div", "dh-live-sub", "Tap up to 2 drivers · drag chart to scrub"));
      leftPane.appendChild(info);

      clear(rightPane);

      drivers = (drivers || []).filter(function (d) { return d && d.num !== null && d.num !== undefined; });
      if (!drivers.length) { rightPane.appendChild(emptyMsg(NO_TELEM_MSG)); return; }

      const picked = [];
      const chipByNum = {};
      const pick = el("div", "dh-driverpick");
      const detail = el("div", "dh-telem-detail");

      function syncChips() {
        drivers.forEach(function (d) {
          chipByNum[d.num].classList.toggle("dh-active", picked.indexOf(d) !== -1);
        });
      }
      drivers.forEach(function (d) {
        const b = el("button", "dh-dchip", dcode(d));
        b.type = "button";
        b.style.borderColor = cssColor(driverColor(d));
        b.addEventListener("click", function () {
          const idx = picked.indexOf(d);
          if (idx !== -1) picked.splice(idx, 1);
          else { picked.push(d); if (picked.length > 2) picked.shift(); }
          syncChips();
          loadTelemetrySet(meta.sessionKey, picked.slice(), detail);
        });
        chipByNum[d.num] = b;
        pick.appendChild(b);
      });

      // Driver chips → left pane; chart detail → right pane
      leftPane.appendChild(pick);
      detail.appendChild(emptyMsg("← Pick a driver to load their fastest lap."));
      rightPane.appendChild(detail);
    }, function () {
      clear(rightPane); rightPane.appendChild(emptyMsg(NO_TELEM_MSG));
    });
  }

  // fetch one driver's fastest-lap bundle (extras = stints + pits for primary)
  function fetchDriverTel(sessionKey, d, withExtras) {
    return F1API.fastestLap(sessionKey, d.num).then(function (lap) {
      if (!lap || !lap.dateStart) return { d: d, lap: null };
      const start = lap.dateStart;
      const dur = lap.lapDuration || 90;
      const ms = Date.parse(start);
      const end = isFinite(ms) ? new Date(ms + dur * 1000 + 1500).toISOString() : start;
      const jobs = [
        F1API.carData(sessionKey, d.num, start, end).catch(function () { return []; }),
        F1API.locationData(sessionKey, d.num, start, end).catch(function () { return []; })
      ];
      if (withExtras) {
        jobs.push(F1API.stints(sessionKey, d.num).catch(function () { return []; }));
        jobs.push(F1API.pits(sessionKey, d.num).catch(function () { return []; }));
      }
      return Promise.all(jobs).then(function (res) {
        return { d: d, lap: lap, car: res[0], loc: res[1], stints: res[2] || [], pits: res[3] || [] };
      });
    });
  }

  let telGen = 0;
  let telView = null;                 // the live telemetry view (for animation cleanup)
  let telemPopup = null;              // the full-screen player popup element

  function stopTelAnim() {
    if (telView) {
      pauseAnim(telView);
      if (telView._ro) { telView._ro.disconnect(); telView._ro = null; }
    }
  }

  function closeTelemPopup() {
    stopTelAnim();
    if (telemPopup) {
      if (telemPopup.parentNode) telemPopup.parentNode.removeChild(telemPopup);
      telemPopup = null;
    }
  }

  function openTelemPopup(tels) {
    closeTelemPopup();
    const overlay = el("div", "dh-tpopup");

    const card = el("div", "dh-tpopup-card");

    // Header: driver name(s) + session context + close button
    const hdr = el("div", "dh-tpopup-hdr");
    const titleEl = el("div", "dh-tpopup-title");
    titleEl.appendChild(el("span", null, tels.map(function (t) { return t.d.name || dcode(t.d); }).join(" vs ")));
    if (sel.meta) {
      const sub = [sel.meta.name || sel.meta.type, sel.meta.circuit || sel.meta.country].filter(Boolean).join(" · ");
      if (sub) titleEl.appendChild(el("span", "dh-tpopup-sub", sub));
    }
    hdr.appendChild(titleEl);
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.addEventListener("click", closeTelemPopup);
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    const body = el("div", "dh-tpopup-body");
    body.appendChild(spinner());
    card.appendChild(body);
    overlay.appendChild(card);

    // Close on backdrop click
    overlay.addEventListener("pointerdown", function (e) {
      if (e.target === overlay) closeTelemPopup();
    });

    // Close on Escape (cleaned up when popup closes)
    function onKey(e) {
      if (e.key === "Escape") { closeTelemPopup(); document.removeEventListener("keydown", onKey); }
    }
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
    telemPopup = overlay;

    // Build after layout so clientWidth measurements are real
    setTimeout(function () {
      if (telemPopup !== overlay) return;
      clear(body);
      buildTelemetryView(body, tels);
    }, 0);
  }

  function loadTelemetrySet(sessionKey, picked, detail) {
    const myGen = ++telGen;
    stopTelAnim();
    if (!picked.length) return;
    clear(detail);
    detail.appendChild(spinner());
    Promise.all(picked.map(function (d, i) { return fetchDriverTel(sessionKey, d, i === 0); }))
      .then(function (tels) {
        if (myGen !== telGen) return;
        clear(detail);
        detail.appendChild(emptyMsg("← Pick a driver to load their fastest lap."));
        openTelemPopup(tels);
      }, function () {
        if (myGen !== telGen) return;
        clear(detail);
        detail.appendChild(emptyMsg("Couldn't load telemetry."));
      });
  }

  function buildTelemetryView(detail, tels) {
    stopTelAnim();
    const primary = tels[0];
    const compare = tels[1] || null;

    // Main column: driver headers, transport, chart, legend, stints
    const mainArea = el("div", "dh-telem-main");
    // Side column: gauges + map
    const sideArea = el("div", "dh-telem-side");

    tels.forEach(function (t) {
      const head = el("div", "dh-livecard");
      const ht = el("div", "dh-live-title");
      ht.appendChild(el("span", null, (t.d.name || dcode(t.d))));
      const sw = el("span", "dh-swatch"); sw.style.background = cssColor(driverColor(t.d)); sw.style.marginLeft = "8px";
      ht.appendChild(sw);
      head.appendChild(ht);
      head.appendChild(el("div", "dh-live-sub", t.lap
        ? "Fastest lap " + (t.lap.lapNumber !== null ? "(L" + t.lap.lapNumber + ") " : "") + fmtLap(t.lap.lapDuration)
        : "No timed lap found in this session."));
      if (t.lap && t.lap.s1 !== null && t.lap.s2 !== null && t.lap.s3 !== null) {
        head.appendChild(el("div", "dh-live-sub dh-sectors",
          "S1 " + t.lap.s1.toFixed(3) + "  ·  S2 " + t.lap.s2.toFixed(3) + "  ·  S3 " + t.lap.s3.toFixed(3)));
      }
      mainArea.appendChild(head);
    });

    if (!primary.car || !primary.car.length) {
      mainArea.appendChild(emptyMsg("Car telemetry isn't available for this lap."));
      detail.appendChild(mainArea);
      appendStintsPits(mainArea, primary);
      return;
    }

    const view = {
      primary: primary,
      compare: (compare && compare.car && compare.car.length) ? compare : null,
      visible: {}, cursorT: 0,
      tMax: 0, speedMax: 1, rpmMax: 1,
      playing: false, rate: 2, _raf: 0, _last: 0, onboard: false,
      chart: null, map: null, delta: null,
      chartBase: null, mapBase: null, deltaBase: null, mapT: null,
      sectors: null, g: null, playBtn: null
    };
    CHANNELS.forEach(function (ch) { view.visible[ch.id] = !ch.off; });
    function scan(car) {
      for (let i = 0; i < car.length; i++) {
        if (car[i].t > view.tMax) view.tMax = car[i].t;
        if ((car[i].speed || 0) > view.speedMax) view.speedMax = car[i].speed;
        if ((car[i].rpm || 0) > view.rpmMax) view.rpmMax = car[i].rpm;
      }
    }
    scan(primary.car);
    if (view.compare) scan(view.compare.car);
    view.tMax = view.tMax || 1;
    primary.cum = cumDist(primary.car);
    if (view.compare) view.compare.cum = cumDist(view.compare.car);
    if (primary.lap && primary.lap.s1 !== null && primary.lap.s2 !== null) {
      view.sectors = [primary.lap.s1, primary.lap.s1 + primary.lap.s2];
    }

    // Transport bar → main
    mainArea.appendChild(buildTransport(view));

    // Canvas width: detail is the popup body, already in DOM (called via setTimeout).
    // In landscape the side panel takes 200px + 1px border + 24px padding = 225px.
    const isLS = typeof window !== "undefined" && window.innerWidth > window.innerHeight && window.innerHeight < 520;
    const sideW = isLS ? 225 : 0;
    const CW = detail.clientWidth > 40
      ? Math.min(600, Math.max(260, detail.clientWidth - sideW - 28))
      : (isLS ? 360 : 330);
    const CH_CHART = Math.round(CW * (220 / 600));

    const c1 = el("canvas", "dh-canvas");
    c1.width = CW; c1.height = CH_CHART; c1.style.touchAction = "none";
    mainArea.appendChild(c1);
    view.chart = c1;
    view.chartBase = makeOffscreen(CW, CH_CHART);

    if (view.compare) {
      const CD_H = Math.round(CW * (72 / 600));
      const cd = el("canvas", "dh-canvas dh-delta");
      cd.width = CW; cd.height = CD_H; cd.style.touchAction = "none";
      mainArea.appendChild(cd);
      view.delta = cd;
      view.deltaBase = makeOffscreen(CW, CD_H);
      attachScrub(cd, view);
    }

    const legend = el("div", "dh-legend");
    CHANNELS.forEach(function (ch) {
      const item = el("button", "dh-legend-item" + (view.visible[ch.id] ? "" : " dh-off"));
      item.type = "button";
      const dot = el("span", "dh-legend-dot"); dot.style.background = ch.color;
      item.appendChild(dot); item.appendChild(document.createTextNode(ch.label));
      item.addEventListener("click", function () {
        view.visible[ch.id] = !view.visible[ch.id];
        item.classList.toggle("dh-off", !view.visible[ch.id]);
        buildBases(view); paintFrame(view);
      });
      legend.appendChild(item);
    });
    if (view.compare) {
      const item = el("span", "dh-legend-item dh-legend-static");
      const dot = el("span", "dh-legend-dot"); dot.style.background = cssColor(driverColor(view.compare.d));
      item.appendChild(dot);
      item.appendChild(document.createTextNode(dcode(view.compare.d) + " SPEED"));
      legend.appendChild(item);
    }
    mainArea.appendChild(legend);

    // Stints/pits below the chart in the main column
    appendStintsPits(mainArea, primary);

    // Gauges + map → side column
    sideArea.appendChild(buildGauges(view));

    if (primary.loc && primary.loc.length > 8) {
      const c2 = el("canvas", "dh-canvas dh-map");
      c2.width = 320; c2.height = 320;
      sideArea.appendChild(c2);
      view.map = c2;
      view.mapBase = makeOffscreen(320, 320);
    }

    detail.appendChild(mainArea);
    detail.appendChild(sideArea);

    attachScrub(c1, view);
    buildBases(view);
    paintFrame(view);
    telView = view;

    // Resize canvases when the popup is resized (e.g. orientation change)
    if (typeof ResizeObserver !== "undefined") {
      let lastW = detail.clientWidth;
      const ro = new ResizeObserver(function () {
        const w = detail.clientWidth;
        if (Math.abs(w - lastW) > 20) {
          lastW = w;
          const ls = window.innerWidth > window.innerHeight && window.innerHeight < 520;
          const sw = ls ? 225 : 0;
          const newCW = Math.min(600, Math.max(260, w - sw - 28));
          if (view.chart && view.chart.width !== newCW) {
            const newCH = Math.round(newCW * (220 / 600));
            view.chart.width = newCW; view.chart.height = newCH;
            view.chartBase = makeOffscreen(newCW, newCH);
            if (view.delta) {
              const dh = Math.round(newCW * (72 / 600));
              view.delta.width = newCW; view.delta.height = dh;
              view.deltaBase = makeOffscreen(newCW, dh);
            }
          }
          buildBases(view); paintFrame(view);
        }
      });
      ro.observe(detail);
      view._ro = ro;
    }
  }

  function makeOffscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // cumulative distance (m) along the lap, sampled at each car-data time, so we
  // can compute a real position-based time delta between two laps.
  function cumDist(car) {
    const t = [], d = [];
    let acc = 0;
    for (let i = 0; i < car.length; i++) {
      if (i > 0) {
        const dt = car[i].t - car[i - 1].t;
        const v = (car[i].speed || 0) / 3.6;   // km/h -> m/s
        acc += v * dt;
      }
      t.push(car[i].t); d.push(acc);
    }
    return { t: t, d: d };
  }
  function interp(xs, ys, x) {
    if (!xs.length) return 0;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; }
    const x0 = xs[lo - 1], x1 = xs[lo], f = (x - x0) / ((x1 - x0) || 1);
    return ys[lo - 1] + (ys[lo] - ys[lo - 1]) * f;
  }
  function distAtT(cum, t) { return interp(cum.t, cum.d, t); }
  function timeAtDist(cum, dist) { return interp(cum.d, cum.t, dist); }

  function buildTransport(view) {
    const bar = el("div", "dh-transport");
    const play = el("button", "dh-tbtn dh-tplay", "▶ PLAY");
    play.type = "button";
    play.addEventListener("click", function () { if (view.playing) pauseAnim(view); else playAnim(view); });
    view.playBtn = play;
    const restart = el("button", "dh-tbtn dh-trestart", "⏮");
    restart.type = "button"; restart.title = "Restart lap";
    restart.addEventListener("click", function () { view.cursorT = 0; view._last = 0; paintFrame(view); });
    bar.appendChild(play); bar.appendChild(restart);

    const rates = el("div", "dh-trates");
    [1, 2, 4].forEach(function (r) {
      const b = el("button", "dh-ratebtn" + (r === view.rate ? " dh-active" : ""), r + "×");
      b.type = "button";
      b.addEventListener("click", function () {
        view.rate = r;
        const bs = rates.querySelectorAll(".dh-ratebtn");
        for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("dh-active", bs[i] === b);
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
    function valCell(cls, label) {
      const w = el("div", "dh-gcell " + cls);
      w.appendChild(el("div", "dh-glabel", label));
      const v = el("div", "dh-gval", "—"); w.appendChild(v);
      card.appendChild(w); return v;
    }
    function barCell(cls, label, color) {
      const w = el("div", "dh-gcell " + cls);
      w.appendChild(el("div", "dh-glabel", label));
      const track = el("div", "dh-gbar");
      const fill = el("div", "dh-gfill"); fill.style.background = color;
      track.appendChild(fill); w.appendChild(track);
      card.appendChild(w); return fill;
    }
    const g = {};
    g.speed = valCell("dh-gspeed", "SPEED km/h");
    g.gear = valCell("dh-ggear", "GEAR");
    g.thr = barCell("dh-gthr", "THROTTLE", "#3fb950");
    g.brk = barCell("dh-gbrk", "BRAKE", "#ff4d4d");
    g.rpm = barCell("dh-grpm", "RPM", "#c084fc");
    const drsCell = el("div", "dh-gcell dh-gdrscell");
    drsCell.appendChild(el("div", "dh-glabel", "DRS"));
    g.drs = el("div", "dh-gdrs-pill", "—");
    drsCell.appendChild(g.drs); card.appendChild(drsCell);
    if (view.compare) {
      const dcell = el("div", "dh-gcell dh-gdeltacell");
      dcell.appendChild(el("div", "dh-glabel", "Δ " + dcode(view.compare.d)));
      g.delta = el("div", "dh-gval dh-gdelta", "—");
      dcell.appendChild(g.delta); card.appendChild(dcell);
    }
    view.g = g;
    return card;
  }
  function updateGauges(view) {
    const g = view.g; if (!g) return;
    const t = view.cursorT === null ? 0 : view.cursorT;
    const c = sampleAt(view.primary.car, t);
    if (!c) return;
    g.speed.textContent = c.speed === null ? "—" : Math.round(c.speed);
    g.gear.textContent = (c.gear === null || c.gear === undefined) ? "—" : (c.gear ? "G" + c.gear : "N");
    g.thr.style.width = (c.throttle === null ? 0 : clamp(c.throttle, 0, 100)) + "%";
    g.brk.style.width = (c.brake === null ? 0 : clamp(c.brake, 0, 100)) + "%";
    g.rpm.style.width = (c.rpm === null ? 0 : clamp(c.rpm / view.rpmMax * 100, 0, 100)) + "%";
    const open = c.drs !== null && c.drs !== undefined && drsOpen(c.drs);
    g.drs.textContent = open ? "OPEN" : "—";
    g.drs.classList.toggle("dh-on", open);
    if (g.delta && view.compare) {
      const dP = distAtT(view.primary.cum, t);
      const delta = timeAtDist(view.compare.cum, dP) - t;   // >0: compare is behind
      g.delta.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(2) + "s";
      g.delta.classList.toggle("dh-pos", delta > 0.02);
      g.delta.classList.toggle("dh-neg", delta < -0.02);
    }
  }

  // drag the trace chart to scrub (pauses playback)
  function attachScrub(canvas, view) {
    function at(ev) {
      const r = canvas.getBoundingClientRect();
      view.cursorT = clamp((ev.clientX - r.left) / (r.width || 1), 0, 1) * view.tMax;
      paintFrame(view);
    }
    canvas.addEventListener("pointerdown", function (ev) {
      pauseAnim(view);
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      at(ev);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (ev.buttons) at(ev);
    });
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
  }

  // nearest location sample to lap time t (matched on car-data timestamp)
  function locAt(view, tel, t) {
    const cs = sampleAt(tel.car, t);
    const loc = (tel.loc && tel.loc.length) ? tel.loc : view.primary.loc;
    if (!cs || !loc || !loc.length) return loc && loc[0];
    let best = loc[0], bd = Infinity;
    for (let i = 0; i < loc.length; i++) {
      const dd = Math.abs(loc[i].date - cs.date);
      if (dd < bd) { bd = dd; best = loc[i]; }
    }
    return best;
  }

  // composite one frame: cached bases + moving cursor, car dots, delta, gauges
  function paintFrame(view) {
    const T = view.cursorT === null ? 0 : view.cursorT;
    // ---- trace chart ----
    const cg = view.chart.getContext("2d");
    const W = view.chart.width, H = view.chart.height, pad = 6;
    cg.clearRect(0, 0, W, H);
    cg.drawImage(view.chartBase, 0, 0);
    const X = pad + (T / view.tMax) * (W - 2 * pad);
    cg.strokeStyle = "rgba(255,255,255,0.55)"; cg.lineWidth = 1;
    cg.beginPath(); cg.moveTo(X, pad); cg.lineTo(X, H - pad); cg.stroke();
    const c = sampleAt(view.primary.car, T);
    const f = chanNorm(CHANNELS[0], c, view);
    if (f !== null) {
      cg.fillStyle = CHANNELS[0].color;
      cg.beginPath(); cg.arc(X, H - pad - f * (H - 2 * pad), 3.5, 0, Math.PI * 2); cg.fill();
    }
    // ---- delta strip ----
    if (view.delta) {
      const dgx = view.delta.getContext("2d");
      const DW = view.delta.width, DH = view.delta.height;
      dgx.clearRect(0, 0, DW, DH);
      dgx.drawImage(view.deltaBase, 0, 0);
      const dx = pad + (T / view.tMax) * (DW - 2 * pad);
      dgx.strokeStyle = "rgba(255,255,255,0.55)"; dgx.lineWidth = 1;
      dgx.beginPath(); dgx.moveTo(dx, 0); dgx.lineTo(dx, DH); dgx.stroke();
    }
    // ---- track map (with optional onboard rotation) ----
    if (view.map) {
      const mg = view.map.getContext("2d");
      const MW = view.map.width, MH = view.map.height;
      mg.clearRect(0, 0, MW, MH);
      if (view.onboard && view.mapT) {
        const here = locAt(view, view.primary, T);
        const ahead = locAt(view, view.primary, Math.min(view.tMax, T + 0.6));
        const p0 = mapPoint(view, here), p1 = mapPoint(view, ahead);
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const ZOOM = 2.6;
        mg.save();
        mg.translate(MW / 2, MH / 2);
        mg.scale(ZOOM, ZOOM);
        mg.rotate(-ang - Math.PI / 2);     // heading -> up
        mg.translate(-p0[0], -p0[1]);
        mg.drawImage(view.mapBase, 0, 0);
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(driverColor(view.compare.d)), 1 / ZOOM);
        drawCarDot(mg, view, view.primary, T, "#fff", 1 / ZOOM);
        mg.restore();
      } else {
        mg.drawImage(view.mapBase, 0, 0);
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(driverColor(view.compare.d)), 1);
        drawCarDot(mg, view, view.primary, T, "#fff", 1);
      }
    }
    updateGauges(view);
  }
  function drawCarDot(g, view, tel, t, fill, rscale) {
    const best = locAt(view, tel, t);
    if (!best) return;
    const p = mapPoint(view, best);
    const r = 5.5 * (rscale || 1);
    g.fillStyle = fill; g.strokeStyle = "rgba(0,0,0,0.65)"; g.lineWidth = 2 * (rscale || 1);
    g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  function appendStintsPits(detail, b) {
    const d = b.d;
    const myStints = (b.stints || []).filter(function (s) { return s.num === d.num; });
    if (myStints.length) {
      const sec = el("div", "dh-livecard");
      sec.appendChild(el("h3", "dh-section", "TYRE STINTS"));
      myStints.sort(function (a, c) { return (a.stint || 0) - (c.stint || 0); });
      myStints.forEach(function (s) {
        const row = el("div", "dh-row");
        const chip = el("span", "dh-codechip", (s.compound || "—").slice(0, 4));
        chip.style.background = COMPOUND[s.compound] || "#888";
        chip.style.color = (s.compound === "HARD") ? "#111" : "#fff";
        row.appendChild(chip);
        row.appendChild(el("span", "dh-name", "Laps " + (s.lapStart || "?") + "–" + (s.lapEnd || "?")));
        if (s.age !== null && s.age !== undefined) row.appendChild(el("span", "dh-wins", "age " + s.age));
        sec.appendChild(row);
      });
      detail.appendChild(sec);
    }
    const myPits = (b.pits || []).filter(function (p) { return p.num === d.num || p.num === null; });
    if (myPits.length) {
      const sec = el("div", "dh-livecard");
      sec.appendChild(el("h3", "dh-section", "PIT STOPS"));
      myPits.forEach(function (p) {
        const row = el("div", "dh-row");
        row.appendChild(el("span", "dh-pos", "L" + (p.lap !== null && p.lap !== undefined ? p.lap : "?")));
        row.appendChild(el("span", "dh-name", p.duration !== null && p.duration !== undefined ? p.duration.toFixed(1) + "s" : "—"));
        sec.appendChild(row);
      });
      detail.appendChild(sec);
    }
  }

  function fmtLap(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
  }

  // rebuild the cached static layers (chart traces + coloured track map + delta)
  function buildBases(view) {
    renderTraces(view.chartBase.getContext("2d"), view.chartBase.width, view.chartBase.height, view);
    if (view.map) {
      computeMapTransform(view);
      renderMap(view.mapBase.getContext("2d"), view.mapBase.width, view.mapBase.height, view);
    }
    if (view.delta) renderDelta(view.deltaBase.getContext("2d"), view.deltaBase.width, view.deltaBase.height, view);
  }

  // multi-channel traces for the primary driver (+ compare speed overlay),
  // with faint sector-boundary markers.
  function renderTraces(g, W, H, view) {
    const pad = 6;
    g.clearRect(0, 0, W, H);
    const X = function (t) { return pad + (t / view.tMax) * (W - 2 * pad); };
    const Y = function (f) { return H - pad - f * (H - 2 * pad); };
    // sector dividers + labels
    if (view.sectors) {
      g.font = "9px system-ui, sans-serif"; g.textBaseline = "top";
      const bounds = [0].concat(view.sectors).concat([view.tMax]);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      view.sectors.forEach(function (sb) {
        const x = X(sb);
        g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke();
        g.setLineDash([]);
      });
      g.fillStyle = "rgba(255,255,255,0.4)";
      for (let s = 0; s < 3; s++) {
        const mid = X((bounds[s] + bounds[s + 1]) / 2);
        g.fillText("S" + (s + 1), mid - 6, pad + 1);
      }
    }
    function line(car, ch, color, width) {
      g.beginPath();
      let started = false, prevY = 0;
      for (let i = 0; i < car.length; i++) {
        const f = chanNorm(ch, car[i], view);
        if (f === null) { started = false; continue; }
        const x = X(car[i].t), y = Y(f);
        if (!started) { g.moveTo(x, y); started = true; }
        else { if (ch.step) g.lineTo(x, prevY); g.lineTo(x, y); }
        prevY = y;
      }
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.stroke();
    }
    if (view.compare) {
      g.setLineDash([4, 3]);
      line(view.compare.car, CHANNELS[0], cssColor(driverColor(view.compare.d)), 1.5);
      g.setLineDash([]);
    }
    for (let k = CHANNELS.length - 1; k >= 0; k--) {
      const ch = CHANNELS[k];
      if (view.visible[ch.id]) line(view.primary.car, ch, ch.color, ch.w);
    }
  }

  // gap-to-compare across the lap: delta(t) = time for compare to reach the
  // same track distance, minus t. Filled green where the primary is ahead.
  function deltaSamples(view) {
    const car = view.primary.car, out = [];
    let mn = 0, mx = 0;
    for (let i = 0; i < car.length; i++) {
      const t = car[i].t;
      const dP = distAtT(view.primary.cum, t);
      const dl = timeAtDist(view.compare.cum, dP) - t;
      out.push(dl);
      if (dl < mn) mn = dl; if (dl > mx) mx = dl;
    }
    return { d: out, mn: mn, mx: mx };
  }
  function renderDelta(g, W, H, view) {
    const pad = 6, car = view.primary.car;
    g.clearRect(0, 0, W, H);
    const ds = deltaSamples(view);
    view._delta = ds;
    const span = Math.max(0.15, ds.mx - ds.mn);
    const X = function (t) { return pad + (t / view.tMax) * (W - 2 * pad); };
    const Y = function (v) { return pad + (ds.mx - v) / span * (H - 2 * pad); };
    const y0 = Y(0);
    // zero line
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, y0); g.lineTo(W - pad, y0); g.stroke();
    // filled gap area, split at the zero crossing colour-wise
    const col = cssColor(driverColor(view.primary.d));
    g.beginPath();
    g.moveTo(X(0), y0);
    for (let i = 0; i < car.length; i++) g.lineTo(X(car[i].t), Y(ds.d[i]));
    g.lineTo(X(view.tMax), y0); g.closePath();
    g.fillStyle = "rgba(63,185,80,0.18)"; g.fill();
    g.beginPath();
    let started = false;
    for (let i = 0; i < car.length; i++) {
      const x = X(car[i].t), y = Y(ds.d[i]);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.strokeStyle = col; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.font = "9px system-ui, sans-serif";
    g.textBaseline = "top"; g.fillText("GAP TO " + dcode(view.compare.d) + " (s)", pad + 2, 2);
  }

  // screen transform for the track map (from the primary lap's x/y bounds)
  function computeMapTransform(view) {
    const loc = view.primary.loc, W = view.mapBase.width, H = view.mapBase.height, pad = 14;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < loc.length; i++) {
      if (loc[i].x < minx) minx = loc[i].x; if (loc[i].x > maxx) maxx = loc[i].x;
      if (loc[i].y < miny) miny = loc[i].y; if (loc[i].y > maxy) maxy = loc[i].y;
    }
    const spanx = (maxx - minx) || 1, spany = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    view.mapT = { minx: minx, miny: miny, sc: sc, ox: (W - spanx * sc) / 2, oy: (H - spany * sc) / 2, W: W, H: H };
  }
  function mapPoint(view, p) {
    const m = view.mapT;
    return [m.ox + (p.x - m.minx) * m.sc, m.H - (m.oy + (p.y - m.miny) * m.sc)];
  }

  // track map from x/y, coloured by speed (slow = blue, fast = red)
  function renderMap(g, W, H, view) {
    const loc = view.primary.loc, car = view.primary.car;
    g.clearRect(0, 0, W, H);
    let vMax = 1;
    for (let i = 0; i < (car ? car.length : 0); i++) if ((car[i].speed || 0) > vMax) vMax = car[i].speed;
    function speedAtDate(date) {
      if (!car || !car.length) return null;
      let ci = 0;
      while (ci < car.length - 1 && car[ci].date < date) ci++;
      return car[ci].speed;
    }
    g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 1; i < loc.length; i++) {
      const v = speedAtDate(loc[i].date);
      const f = v === null ? 0.5 : clamp(v / vMax, 0, 1);
      const r = Math.round(255 * Math.min(1, f * 1.6));
      const b = Math.round(255 * Math.min(1, (1 - f) * 1.6));
      const gr = Math.round(180 * (1 - Math.abs(f - 0.5) * 2));
      g.strokeStyle = "rgb(" + r + "," + gr + "," + b + ")";
      const p0 = mapPoint(view, loc[i - 1]), p1 = mapPoint(view, loc[i]);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    }
    // sector-boundary ticks
    if (view.sectors) {
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1;
      g.font = "9px system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "center";
      view.sectors.forEach(function (sb, idx) {
        const lp = locAt(view, view.primary, sb);
        if (!lp) return;
        const p = mapPoint(view, lp);
        g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillText("S" + (idx + 2), p[0], p[1] - 9);
        g.fillStyle = "rgba(255,255,255,0.9)";
      });
      g.textAlign = "left";
    }
  }


    return { loadTelemetry, closeTelemPopup };
  }

  return { create };
})();
