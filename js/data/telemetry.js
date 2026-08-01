/* Apex 26 — the data hub's TELEMETRY tab (trace viewer, delta, map, playback).
   Split out of js/data.js; instantiated once by the DataHub shell via
   DataTelemetry.create(ctx) with the shell helpers it needs (el/clear/
   emptyMsg/spinner DOM builders, sel selection state, ensureSession/
   buildPicker/invalidateOther session plumbing, COMPOUND, findTeam).
   Uses the F1API global directly.
   Must load BEFORE js/data.js (see index.html). */
const DataTelemetry = (function () {
  "use strict";

  function create(ctx) {
    const { el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
            invalidateOther, COMPOUND, findTeam, cssColor, textColorOn, NO_TELEM_MSG } = ctx;


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
  // Dot/trace colours for the two drivers on the map. Team-mates share a team
  // colour, so if the two picks are near-identical the compare one is lightened
  // toward white to stay tellable-apart.
  function pairColors(dP, dC) {
    const a = driverColor(dP);
    if (!dC) return { p: a, c: null };
    let b = driverColor(dC);
    const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    if (dist < 0.3) b = [b[0] * 0.4 + 0.6, b[1] * 0.4 + 0.6, b[2] * 0.4 + 0.6];
    return { p: a, c: b };
  }
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
    { id: "gear",     label: "GEAR",     color: "#f6d200", w: 1.5, lo: 0, hi: 8, step: true, get: function (c) { return c.gear; }, fmt: function (v) { return v ? "G" + v : "N"; } },
    { id: "rpm",      label: "RPM",      color: "#c084fc", w: 1.5, norm: "rpm", get: function (c) { return c.rpm; }, fmt: function (v) { return Math.round(v); } },
    // DRS draws as a thick strip just below the chart's top edge, present only
    // while the wing is OPEN (closed samples return null so nothing is drawn) —
    // a full-height 0/1 square wave would bury every other trace.
    { id: "drs",      label: "DRS",      color: "#00e0c0", w: 3, lo: 0, hi: 1.1, step: true, get: function (c) { return c.drs === null || c.drs === undefined ? null : (drsOpen(c.drs) ? 1 : null); }, fmt: function (v) { return v ? "OPEN" : "—"; } }
  ];

  // Chart plot-area insets: PADL leaves a gutter for the km/h axis labels,
  // PADY is the vertical inset. Shared by the trace chart, the delta strip
  // and the scrub mapping so the cursor stays aligned across all of them.
  const PADL = 36, PADR = 8, PADY = 6;
  function chartX(view, t, W) { return PADL + (t / view.tMax) * (W - PADL - PADR); }
  // short-landscape phone: the popup splits into columns and vertical space
  // is the scarce axis
  function shortLS() {
    return typeof window !== "undefined" && window.innerHeight < 520 && window.innerWidth > window.innerHeight;
  }
  // chart canvas height for a given width — slightly shorter on narrow
  // screens; in compare mode on a short-landscape phone, capped to the
  // viewport so chart + delta strip + legend fit together
  function chartH(w, compact) {
    const base = Math.round(w * (w < 480 ? 190 : 220) / 600);
    if (compact && shortLS()) return Math.min(base, Math.round(window.innerHeight * 0.38));
    return base;
  }
  function deltaH(w) {
    const base = Math.round(w * (72 / 600));
    if (shortLS()) return Math.min(base, Math.round(window.innerHeight * 0.12));
    return base;
  }

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

  let driverGen = 0;

  function renderTelemetryBody(meta, leftPane, rightPane) {
    const myDriverGen = ++driverGen;
    ++telGen;
    // Keep the picker (first child of leftPane); remove everything appended after it
    while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
    clear(rightPane);
    rightPane.appendChild(spinner());

    F1API.sessionDrivers(meta.sessionKey).catch(function () { return null; }).then(function (drivers) {
      if (myDriverGen !== driverGen) return;
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
        clear(detail);
        if (picked.length === 0) {
          detail.appendChild(emptyMsg("← Pick 1 or 2 drivers to view their fastest lap."));
        } else {
          const summary = el("div", "dh-livecard");
          summary.appendChild(el("h3", "dh-section", "SELECTED DRIVERS"));
          picked.forEach(function (d) {
            const row = el("div", "dh-row");
            const chip = el("span", "dh-codechip", dcode(d));
            const col = driverColor(d);
            chip.style.background = cssColor(col);
            chip.style.color = textColorOn(col);
            row.appendChild(chip);
            row.appendChild(el("span", "dh-name", d.name || "—"));
            summary.appendChild(row);
          });
          const loadBtn = el("button", "dh-livebtn");
          loadBtn.textContent = picked.length === 1 ? "LOAD LAP" : "COMPARE LAPS";
          loadBtn.style.marginTop = "12px";
          loadBtn.style.width = "100%";
          loadBtn.type = "button";
          loadBtn.addEventListener("click", function () {
            // Return focus to the primary driver's chip when the popup closes —
            // the LOAD button itself is destroyed while the popup is open.
            loadTelemetrySet(meta.sessionKey, picked.slice(), detail, syncChips,
              chipByNum[picked[0].num]);
          });
          summary.appendChild(loadBtn);
          detail.appendChild(summary);
        }
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
        });
        chipByNum[d.num] = b;
        pick.appendChild(b);
      });

      syncChips();
      // Driver chips → left pane; chart detail → right pane
      leftPane.appendChild(pick);
      rightPane.appendChild(detail);
    }, function () {
      if (myDriverGen !== driverGen) return;
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
  let telemKeyHandler = null;         // the Escape-to-close keydown listener (for cleanup)
  let telemReturnFocus = null;

  function stopTelAnim() {
    if (telView) {
      pauseAnim(telView);
      if (telView._ro) { telView._ro.disconnect(); telView._ro = null; }
    }
  }

  function closeTelemPopup() {
    const restore = telemPopup ? telemReturnFocus : null;
    stopTelAnim();
    if (telemKeyHandler) {
      document.removeEventListener("keydown", telemKeyHandler);
      telemKeyHandler = null;
    }
    if (telemPopup) {
      if (telemPopup.parentNode) telemPopup.parentNode.removeChild(telemPopup);
      telemPopup = null;
    }
    telemReturnFocus = null;
    if (restore && restore.isConnected && restore.focus) restore.focus();
  }

  function openTelemPopup(tels, returnFocus) {
    closeTelemPopup();
    // Prefer the caller-supplied element (the driver chip): the activeElement
    // here is usually the LOAD button, which syncChips/clear(detail) already
    // removed from the DOM, so closing would drop focus onto <body>.
    telemReturnFocus = (returnFocus && returnFocus.isConnected)
      ? returnFocus : document.activeElement;
    const overlay = el("div", "dh-tpopup");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "dh-tpopup-title");

    const card = el("div", "dh-tpopup-card");

    // Header: driver name(s) + session context + close button
    const hdr = el("div", "dh-tpopup-hdr");
    const titleEl = el("div", "dh-tpopup-title");
    titleEl.id = "dh-tpopup-title";
    titleEl.appendChild(el("span", null, tels.map(function (t) { return t.d.name || dcode(t.d); }).join(" vs ")));
    if (sel.meta) {
      const sub = [sel.meta.name || sel.meta.type, sel.meta.circuit || sel.meta.country].filter(Boolean).join(" · ");
      if (sub) titleEl.appendChild(el("span", "dh-tpopup-sub", sub));
    }
    hdr.appendChild(titleEl);
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close telemetry");
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

    // Close on Escape. Stored so closeTelemPopup() can remove it however the
    // popup is dismissed (Escape, backdrop click, ✕, or tab change) — otherwise
    // a document keydown listener leaks on every non-Escape close.
    telemKeyHandler = function (e) {
      if (e.key === "Escape") { closeTelemPopup(); return; }
      if (e.key !== "Tab" || !telemPopup) return;
      const items = Array.prototype.filter.call(
        telemPopup.querySelectorAll("button, select, input, textarea, [href], [tabindex]"),
        function (node) { return !node.disabled && node.tabIndex >= 0; }
      );
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", telemKeyHandler);

    document.body.appendChild(overlay);
    telemPopup = overlay;
    closeBtn.focus();

    // Build after layout so clientWidth measurements are real
    setTimeout(function () {
      if (telemPopup !== overlay) return;
      clear(body);
      buildTelemetryView(body, tels);
    }, 0);
  }

  function loadTelemetrySet(sessionKey, picked, detail, syncChips, returnFocus) {
    const myGen = ++telGen;
    stopTelAnim();
    if (!picked.length) {
      if (syncChips) syncChips();
      return;
    }
    clear(detail);
    detail.appendChild(spinner());
    Promise.all(picked.map(function (d, i) { return fetchDriverTel(sessionKey, d, i === 0); }))
      .then(function (tels) {
        if (myGen !== telGen) return;
        if (syncChips) syncChips();
        openTelemPopup(tels, returnFocus);
      }, function (err) {
        if (myGen !== telGen) return;
        clear(detail);
        let msg = "Couldn't load telemetry.";
        if (err && err.message && err.message.indexOf("Live F1 session") !== -1) msg = err.message;
        detail.appendChild(emptyMsg(msg));
        const backBtn = el("button", "dh-livebtn", "BACK");
        backBtn.style.marginTop = "12px";
        backBtn.addEventListener("click", function() { if (syncChips) syncChips(); });
        detail.appendChild(backBtn);
      });
  }

  function buildTelemetryView(detail, tels) {
    stopTelAnim();
    const primary = tels[0];
    const compare = tels[1] || null;
    const pcols = pairColors(primary.d, compare && compare.d);

    // Main column: driver headers, transport, chart, legend, stints
    const mainArea = el("div", "dh-telem-main");
    // Side column: gauges + map
    const sideArea = el("div", "dh-telem-side");

    tels.forEach(function (t, i) {
      // one-line header per driver: swatch · name · sectors · fastest lap.
      // The popup title bar already names the drivers, so this row only needs
      // to key the colour and carry the lap numbers — keep it short so the
      // chart gets the vertical space.
      const ht = el("div", "dh-live-title dh-thead");
      const sw = el("span", "dh-swatch"); sw.style.background = cssColor(i === 0 ? pcols.p : pcols.c);
      ht.appendChild(sw);
      ht.appendChild(el("span", "dh-tname", (t.d.name || dcode(t.d))));
      if (!t.lap) {
        ht.appendChild(el("span", "dh-tsect", "No timed lap found in this session."));
      } else {
        if (t.lap.s1 !== null && t.lap.s2 !== null && t.lap.s3 !== null) {
          ht.appendChild(el("span", "dh-tsect",
            "S1 " + t.lap.s1.toFixed(3) + " · S2 " + t.lap.s2.toFixed(3) + " · S3 " + t.lap.s3.toFixed(3)));
        }
        const lapEl = el("span", "dh-tlap",
          (t.lap.lapNumber !== null ? "L" + t.lap.lapNumber + " · " : "") + fmtLap(t.lap.lapDuration));
        lapEl.title = "Fastest lap";
        ht.appendChild(lapEl);
      }
      mainArea.appendChild(ht);
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
    // per-driver visibility: visible = primary (solid), visibleC = compare (dashed)
    view.visibleC = {};
    CHANNELS.forEach(function (ch) { view.visible[ch.id] = view.visibleC[ch.id] = !ch.off; });
    view.colP = pcols.p; view.colC = pcols.c;
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
    const CH_CHART = chartH(CW, !!view.compare);

    const c1 = el("canvas", "dh-canvas");
    c1.width = CW; c1.height = CH_CHART; c1.style.touchAction = "none";
    mainArea.appendChild(c1);
    view.chart = c1;
    view.chartBase = makeOffscreen(CW, CH_CHART);

    if (view.compare) {
      const CD_H = deltaH(CW);
      const cd = el("canvas", "dh-canvas dh-delta");
      cd.width = CW; cd.height = CD_H; cd.style.touchAction = "none";
      mainArea.appendChild(cd);
      view.delta = cd;
      view.deltaBase = makeOffscreen(CW, CD_H);
      attachScrub(cd, view);
    }

    const legend = el("div", "dh-legend");
    if (view.compare) {
      // driver key: each code chip in that driver's trace/dot colour
      tels.forEach(function (t, i) {
        const chip = el("span", "dh-codechip", dcode(t.d));
        const col = i === 0 ? view.colP : view.colC;
        chip.style.background = cssColor(col);
        chip.style.color = textColorOn(col);
        legend.appendChild(chip);
      });
    }
    CHANNELS.forEach(function (ch) {
      function toggleBtn(cls, on, title) {
        const b = el("button", "dh-legend-item " + cls + (on ? "" : " dh-off"));
        b.type = "button"; b.title = title;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        return b;
      }
      function setState(b, on) {
        b.classList.toggle("dh-off", !on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      if (!view.compare) {
        const item = toggleBtn("", view.visible[ch.id], "Show / hide " + ch.label);
        const dot = el("span", "dh-legend-dot"); dot.style.background = ch.color;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(ch.label));
        item.addEventListener("click", function () {
          view.visible[ch.id] = !view.visible[ch.id];
          setState(item, view.visible[ch.id]);
          buildBases(view); paintFrame(view);
        });
        legend.appendChild(item);
        return;
      }
      // Compare mode: one group per channel — the label toggles both lines,
      // each driver's line (solid / dashed) has its own toggle chip.
      const cP = ch.id === "speed" ? cssColor(view.colP) : ch.color;
      const cC = ch.id === "speed" ? cssColor(view.colC) : ch.color;
      const grp = el("span", "dh-leg-group");
      const lbl = toggleBtn("dh-leg-lbl", view.visible[ch.id] || view.visibleC[ch.id],
        "Show / hide " + ch.label + " for both drivers");
      lbl.appendChild(document.createTextNode(ch.label));
      const b1 = toggleBtn("dh-leg-line", view.visible[ch.id],
        "Show / hide " + dcode(view.primary.d) + " " + ch.label + " (solid)");
      const d1 = el("span", "dh-legend-dot"); d1.style.background = cP;
      b1.appendChild(d1);
      const b2 = toggleBtn("dh-leg-line", view.visibleC[ch.id],
        "Show / hide " + dcode(view.compare.d) + " " + ch.label + " (dashed)");
      const d2 = el("span", "dh-legend-dot");
      d2.style.background = "repeating-linear-gradient(90deg, " + cC + " 0 3px, transparent 3px 6px)";
      b2.appendChild(d2);
      function repaint() {
        setState(b1, view.visible[ch.id]);
        setState(b2, view.visibleC[ch.id]);
        setState(lbl, view.visible[ch.id] || view.visibleC[ch.id]);
        buildBases(view); paintFrame(view);
      }
      b1.addEventListener("click", function () { view.visible[ch.id] = !view.visible[ch.id]; repaint(); });
      b2.addEventListener("click", function () { view.visibleC[ch.id] = !view.visibleC[ch.id]; repaint(); });
      lbl.addEventListener("click", function () {
        const on = !(view.visible[ch.id] || view.visibleC[ch.id]);
        view.visible[ch.id] = on; view.visibleC[ch.id] = on;
        repaint();
      });
      grp.appendChild(lbl); grp.appendChild(b1); grp.appendChild(b2);
      legend.appendChild(grp);
    });
    mainArea.appendChild(legend);

    // Gauges + map → side column
    sideArea.appendChild(buildGauges(view));

    if (primary.loc && primary.loc.length > 8) {
      const c2 = el("canvas", "dh-canvas dh-map");
      c2.width = 320; c2.height = 320;
      sideArea.appendChild(c2);
      view.map = c2;
      view.mapBase = makeOffscreen(320, 320);
      // colour key for the car dots on the map
      const mkey = el("div", "dh-maplegend");
      function mchip(col, code) {
        const item = el("span", "dh-legend-item dh-legend-static");
        const dot = el("span", "dh-legend-dot dh-mapdot"); dot.style.background = cssColor(col);
        item.appendChild(dot); item.appendChild(document.createTextNode(code));
        return item;
      }
      mkey.appendChild(mchip(view.colP, dcode(primary.d)));
      if (view.compare) mkey.appendChild(mchip(view.colC, dcode(view.compare.d)));
      // track colouring key: slow (blue) -> fast (red), sectors marked S2/S3
      const gi = el("span", "dh-legend-item dh-legend-static");
      gi.appendChild(document.createTextNode("SLOW"));
      gi.appendChild(el("span", "dh-gradbar"));
      gi.appendChild(document.createTextNode("FAST"));
      mkey.appendChild(gi);
      sideArea.appendChild(mkey);
    }

    // Stints/pits last (below the map), so the lap player — chart, gauges,
    // map — stays together at the top on portrait phones
    appendStintsPits(sideArea, primary);

    detail.appendChild(mainArea);
    detail.appendChild(sideArea);

    attachScrub(c1, view);
    buildBases(view);
    paintFrame(view);
    telView = view;

    // Resize canvases when the popup is resized (e.g. orientation change)
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (!view.chart || !mainArea.isConnected) return;
        const mainW = mainArea.clientWidth - 32; // minus padding
        if (mainW <= 0) return;
        
        const newCW = Math.min(800, mainW);
        const newCH = chartH(newCW, !!view.compare);

        let resized = false;
        if (view.chart.width !== newCW || view.chart.height !== newCH) {
          view.chart.width = newCW;
          view.chart.height = newCH;
          view.chartBase = makeOffscreen(newCW, newCH);
          if (view.delta) {
            const dh = deltaH(newCW);
            view.delta.width = newCW;
            view.delta.height = dh;
            view.deltaBase = makeOffscreen(newCW, dh);
          }
          resized = true;
        }
        
        if (view.map && sideArea.isConnected) {
          const sideW = sideArea.clientWidth - 24;
          if (sideW > 0 && view.map.width !== sideW) {
            view.map.width = sideW;
            view.map.height = sideW;
            view.mapBase = makeOffscreen(sideW, sideW);
            resized = true;
          }
        }
        
        if (resized) {
          buildBases(view);
          paintFrame(view);
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
    const cmp = view.compare;
    // In compare mode every gauge is dual: primary first (driver colour /
    // full-height bar), compare second (dimmed / thin bar).
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
      g.gear[i].textContent = (c.gear === null || c.gear === undefined) ? "—" : (c.gear ? "G" + c.gear : "N");
      g.thr[i].style.width = (c.throttle === null ? 0 : clamp(c.throttle, 0, 100)) + "%";
      g.brk[i].style.width = (c.brake === null ? 0 : clamp(c.brake, 0, 100)) + "%";
      g.rpm[i].style.width = (c.rpm === null ? 0 : clamp(c.rpm / view.rpmMax * 100, 0, 100)) + "%";
      const open = c.drs !== null && c.drs !== undefined && drsOpen(c.drs);
      g.drs[i].textContent = open ? "OPEN" : "—";
      g.drs[i].classList.toggle("dh-on", open);
    }
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
      // map into bitmap px, then invert the plot-area (axis gutter) transform
      const bx = (ev.clientX - r.left) / (r.width || 1) * canvas.width;
      view.cursorT = clamp((bx - PADL) / ((canvas.width - PADL - PADR) || 1), 0, 1) * view.tMax;
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
  // Point between two samples. GPS arrives at ~4 Hz but the player runs on a
  // rAF clock, so anything that SNAPS to a sample steps ~15 times a second
  // instead of moving.
  function lerpLoc(a, b, f) {
    if (!b) return a;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  // The exact wall-clock date for lap-time t, interpolated across car samples —
  // the bridge between the chart's lap-relative clock and the GPS trace's
  // absolute one. Snapping to the nearest car sample here was the first of the
  // two quantisations that made the dots judder.
  function dateAtT(car, t) {
    if (!car || !car.length) return null;
    const n = car.length;
    if (t <= car[0].t) return +car[0].date;
    if (t >= car[n - 1].t) return +car[n - 1].date;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (car[mid].t <= t) lo = mid; else hi = mid;
    }
    const span = car[hi].t - car[lo].t;
    const f = span > 0 ? (t - car[lo].t) / span : 0;
    return +car[lo].date + f * (+car[hi].date - +car[lo].date);
  }

  function locAt(view, tel, t) {
    const own = !!(tel.loc && tel.loc.length);
    const loc = own ? tel.loc : (view.primary.loc || []);
    if (!loc.length) return null;
    if (!own) {
      // This driver has no GPS of their own, so they ride the primary's path.
      // Place them by how far through their OWN lap they are — matching on the
      // absolute timestamp (as this used to) looks a different lap's clock up in
      // this array, lands at whichever end is nearest in time, and parks the dot
      // there for the whole replay.
      const f = clamp(t / (view.tMax || 1), 0, 1) * (loc.length - 1);
      const i = Math.floor(f);
      return lerpLoc(loc[i], loc[i + 1], f - i);
    }
    const target = dateAtT(tel.car, t);
    if (target === null) return loc[0];
    const n = loc.length;
    if (target <= +loc[0].date) return loc[0];
    if (target >= +loc[n - 1].date) return loc[n - 1];
    // bracketing GPS samples, then interpolate between them: continuous motion
    // at the rAF clock instead of a ~4 Hz staircase
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (+loc[mid].date <= target) lo = mid; else hi = mid;
    }
    const span = +loc[hi].date - +loc[lo].date;
    return lerpLoc(loc[lo], loc[hi], span > 0 ? (target - +loc[lo].date) / span : 0);
  }

  // composite one frame: cached bases + moving cursor, car dots, delta, gauges
  function paintFrame(view) {
    const T = view.cursorT === null ? 0 : view.cursorT;
    // ---- trace chart ----
    const cg = view.chart.getContext("2d");
    const W = view.chart.width, H = view.chart.height;
    cg.clearRect(0, 0, W, H);
    cg.drawImage(view.chartBase, 0, 0);
    const X = chartX(view, T, W);
    cg.strokeStyle = "rgba(255,255,255,0.55)"; cg.lineWidth = 1;
    cg.beginPath(); cg.moveTo(X, PADY); cg.lineTo(X, H - PADY); cg.stroke();
    if (view.compare && view.visibleC.speed) {
      const c2 = sampleAt(view.compare.car, T);
      const f2 = chanNorm(CHANNELS[0], c2, view);
      if (f2 !== null) {
        cg.fillStyle = cssColor(view.colC);
        cg.beginPath(); cg.arc(X, H - PADY - f2 * (H - 2 * PADY), 3, 0, Math.PI * 2); cg.fill();
      }
    }
    if (view.visible.speed) {
      const c = sampleAt(view.primary.car, T);
      const f = chanNorm(CHANNELS[0], c, view);
      if (f !== null) {
        cg.fillStyle = view.compare ? cssColor(view.colP) : CHANNELS[0].color;
        cg.beginPath(); cg.arc(X, H - PADY - f * (H - 2 * PADY), 3.5, 0, Math.PI * 2); cg.fill();
      }
    }
    // ---- delta strip ----
    if (view.delta) {
      const dgx = view.delta.getContext("2d");
      const DW = view.delta.width, DH = view.delta.height;
      dgx.clearRect(0, 0, DW, DH);
      dgx.drawImage(view.deltaBase, 0, 0);
      const dx = chartX(view, T, DW);
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
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(view.colC), 1 / ZOOM);
        drawCarDot(mg, view, view.primary, T, cssColor(view.colP), 1 / ZOOM);
        mg.restore();
      } else {
        mg.drawImage(view.mapBase, 0, 0);
        if (view.compare) drawCarDot(mg, view, view.compare, T, cssColor(view.colC), 1);
        drawCarDot(mg, view, view.primary, T, cssColor(view.colP), 1);
      }
    }
    updateGauges(view);
  }
  function drawCarDot(g, view, tel, t, fill, rscale) {
    const best = locAt(view, tel, t);
    if (!best) return;
    const p = mapPoint(view, best);
    const rs = rscale || 1, r = 5.5 * rs;
    // dark halo + white ring keep a team-coloured dot readable on any
    // speed-coloured track segment
    g.strokeStyle = "rgba(0,0,0,0.65)"; g.lineWidth = 3.5 * rs;
    g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = fill; g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.5 * rs;
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

  // multi-channel traces for the primary driver (+ dashed compare overlays),
  // with a km/h axis, gear ticks and faint sector-boundary markers.
  function renderTraces(g, W, H, view) {
    g.clearRect(0, 0, W, H);
    const X = function (t) { return chartX(view, t, W); };
    const Y = function (f) { return H - PADY - f * (H - 2 * PADY); };
    g.font = "10px system-ui, sans-serif";
    // an axis shows while either driver's line for its unit is visible
    function anyVis(id) { return view.visible[id] || (view.compare && view.visibleC[id]); }
    // Per-unit axes, each in its channel's colour:
    //   left gutter = speed km/h · left inner = rpm · right gutter = gear ·
    //   right inner = % (throttle/brake)
    if (anyVis("speed")) {
      const step = view.speedMax > 260 ? 100 : (view.speedMax > 130 ? 50 : 25);
      g.textAlign = "right"; g.textBaseline = "middle";
      for (let v = step; v <= view.speedMax; v += step) {
        const y = Y(v / view.speedMax);
        g.strokeStyle = "rgba(255,255,255,0.09)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(PADL, y); g.lineTo(W - PADR, y); g.stroke();
        if (y < 17) continue;   // would collide with the km/h unit label
        g.fillStyle = "rgba(57,208,255,0.8)";
        g.fillText(String(v), PADL - 5, y);
      }
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = "rgba(57,208,255,0.6)";
      g.fillText("km/h", 2, 3);
    }
    if (anyVis("rpm")) {
      g.textAlign = "left"; g.textBaseline = "middle";
      g.fillStyle = "rgba(192,132,252,0.65)";
      [4000, 8000, 12000].forEach(function (v) {
        if (v > view.rpmMax) return;
        const y = Y(v / view.rpmMax);
        if (y < 26) return;   // keep clear of the unit labels
        g.fillText(Math.round(v / 1000) + "k", PADL + 4, y);
      });
      g.textBaseline = "top";
      g.fillText("rpm", 2, 15);
    }
    if (anyVis("gear")) {
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillStyle = "rgba(246,210,0,0.7)";
      [2, 4, 6, 8].forEach(function (gr) { g.fillText("G" + gr, W - 2, Y(gr / 8)); });
    }
    if (anyVis("throttle") || anyVis("brake")) {
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillStyle = "rgba(63,185,80,0.55)";
      [25, 50, 75].forEach(function (p) { g.fillText(p + "%", W - PADR - 22, Y(p / 100)); });
    }
    g.textAlign = "left"; g.font = "9px system-ui, sans-serif";
    // sector dividers + labels
    if (view.sectors) {
      g.textBaseline = "top";
      const bounds = [0].concat(view.sectors).concat([view.tMax]);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      view.sectors.forEach(function (sb) {
        const x = X(sb);
        g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x, PADY); g.lineTo(x, H - PADY); g.stroke();
        g.setLineDash([]);
      });
      g.fillStyle = "rgba(255,255,255,0.4)";
      for (let s = 0; s < 3; s++) {
        const mid = X((bounds[s] + bounds[s + 1]) / 2);
        g.fillText("S" + (s + 1), mid - 6, PADY + 1);
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
    // Compare mode: both drivers' SPEED traces in their own driver colours
    // (matching the map dots / header swatches); the compare driver's other
    // visible channels ghost underneath, dashed and dimmed, in the channel hue.
    if (view.compare) {
      g.setLineDash([5, 4]);
      g.globalAlpha = 0.5;
      for (let k = CHANNELS.length - 1; k >= 1; k--) {
        const ch = CHANNELS[k];
        if (!view.visibleC[ch.id]) continue;
        if (ch.id === "drs") {
          // nudge the compare DRS strip below the primary's so both read
          g.save(); g.translate(0, 5);
          line(view.compare.car, ch, ch.color, Math.max(1.2, ch.w - 0.4));
          g.restore();
        } else {
          line(view.compare.car, ch, ch.color, Math.max(1.2, ch.w - 0.4));
        }
      }
      g.globalAlpha = 1;
      if (view.visibleC.speed) line(view.compare.car, CHANNELS[0], cssColor(view.colC), 1.8);
      g.setLineDash([]);
    }
    for (let k = CHANNELS.length - 1; k >= 0; k--) {
      const ch = CHANNELS[k];
      if (!view.visible[ch.id]) continue;
      const col = (ch.id === "speed" && view.compare) ? cssColor(view.colP) : ch.color;
      line(view.primary.car, ch, col, ch.w);
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
    const X = function (t) { return chartX(view, t, W); };
    const Y = function (v) { return pad + (ds.mx - v) / span * (H - 2 * pad); };
    const y0 = Y(0);
    // zero line
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(PADL, y0); g.lineTo(W - PADR, y0); g.stroke();
    // filled gap area, split at the zero crossing colour-wise
    const col = cssColor(view.colP);
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
    g.textBaseline = "top"; g.fillText("GAP TO " + dcode(view.compare.d) + " (s)", PADL + 2, 2);
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

  // Would joining the last sample back to the first close a lap, or cut a chord
  // across the map? A fastest-lap window starts and ends at the line, so the two
  // ends sit within a few metres of each other; anything further apart is a
  // partial trace and must stay open rather than gain a fake straight.
  function closesLoop(view, loc) {
    if (!loc || loc.length < 8) return false;
    const a = mapPoint(view, loc[0]), b = mapPoint(view, loc[loc.length - 1]);
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    return gap < view.mapT.H * 0.18;
  }
  // one lap as a single polyline (used for the compare driver's flat-colour line)
  function strokeLap(g, view, loc) {
    g.beginPath();
    for (let i = 0; i < loc.length; i++) {
      const p = mapPoint(view, loc[i]);
      if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    if (closesLoop(view, loc)) g.closePath();
    g.stroke();
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
    // The COMPARE driver's line first, underneath, in their own colour — the
    // map is the one place you can see where the two laps actually diverge, and
    // it used to draw the primary only however many drivers were loaded.
    if (view.compare && view.compare.loc && view.compare.loc.length > 1) {
      g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
      g.strokeStyle = cssColor(view.colC);
      strokeLap(g, view, view.compare.loc);
    }
    g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    // A LAP IS A LOOP, so the trace has to close. Drawing only i=1..n-1 left the
    // start/finish junction open — a visible notch in the outline where the
    // sampled lap window began and ended a few metres apart.
    const N = loc.length;
    for (let i = 1; i <= N; i++) {
      const a = loc[i - 1], b2 = loc[i % N];
      if (i === N && !closesLoop(view, loc)) break;   // partial lap: leave it open
      const v = speedAtDate(b2.date);
      const f = v === null ? 0.5 : clamp(v / vMax, 0, 1);
      const r = Math.round(255 * Math.min(1, f * 1.6));
      const b = Math.round(255 * Math.min(1, (1 - f) * 1.6));
      const gr = Math.round(180 * (1 - Math.abs(f - 0.5) * 2));
      g.strokeStyle = "rgb(" + r + "," + gr + "," + b + ")";
      const p0 = mapPoint(view, a), p1 = mapPoint(view, b2);
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
