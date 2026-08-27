/* Apex 26 — the data hub's TELEMETRY tab (trace viewer, delta, map, playback). Split out of js/data/hub.js; instantiated once by the DataHub shell via DataTelemet… */
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

  function laneColors(entries) {
    const seen = {};
    return entries.map(function (e) {
      let base = driverColor(e.d || e);
      const key = base.map(function (v) { return Math.round(v * 16); }).join(",");
      const n = seen[key] || 0; seen[key] = n + 1;
      if (n > 0) {
        const f = Math.min(0.66, n * 0.30);   // lighten each repeat of a colour
        base = [base[0] * (1 - f) + f, base[1] * (1 - f) + f, base[2] * (1 - f) + f];
      }
      return base;
    });
  }
  function dcode(d) { return d.code || ("#" + d.num); }
  function sessionShort(meta) {
    if (!meta) return "";
    const name = String(meta.name || meta.type || "");
    const type = (name + " " + String(meta.type || "")).toLowerCase();
    if (type.indexOf("sprint") !== -1) return type.indexOf("qual") !== -1 ? "SQ" : "SPR";
    if (type.indexOf("qual") !== -1) return "Q";
    if (type.indexOf("race") !== -1) return "R";
    const m = name.match(/(\d+)/);
    if (type.indexOf("practice") !== -1) return "P" + (m ? m[1] : "");
    return name.slice(0, 3).toUpperCase();
  }
  // OpenF1 DRS codes: 10/12/14 = wing open, everything else closed/eligible.
  function drsOpen(v) { return v === 10 || v === 12 || v === 14; }

  const CHANNELS = [
    { id: "speed",    label: "SPEED",    color: "#39d0ff", w: 2,   norm: "speed", get: function (c) { return c.speed; },    fmt: function (v) { return Math.round(v) + " km/h"; } },
    { id: "throttle", label: "THR",      color: "#3fb950", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.throttle; }, fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "brake",    label: "BRAKE",    color: "#ff4d4d", w: 1.5, lo: 0, hi: 100, get: function (c) { return c.brake; },    fmt: function (v) { return Math.round(v) + "%"; } },
    { id: "gear",     label: "GEAR",     color: "#f6d200", w: 1.5, lo: 0, hi: 8, step: true, get: function (c) { return c.gear; }, fmt: function (v) { return v ? "G" + v : "N"; } },
    { id: "rpm",      label: "RPM",      color: "#c084fc", w: 1.5, norm: "rpm", get: function (c) { return c.rpm; }, fmt: function (v) { return Math.round(v); } },
    { id: "drs",      label: "DRS",      color: "#00e0c0", w: 3, lo: 0, hi: 1.1, step: true, get: function (c) { return c.drs === null || c.drs === undefined ? null : (drsOpen(c.drs) ? 1 : null); }, fmt: function (v) { return v ? "OPEN" : "—"; } }
  ];

  const PADL = 36, PADR = 8, PADY = 6;
  function chartX(view, t, W) { return PADL + (t / view.tMax) * (W - PADL - PADR); }
  function shortLS() {
    return typeof window !== "undefined" && window.innerHeight < 520 && window.innerWidth > window.innerHeight;
  }
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
  function chanNorm(ch, c, view) {
    const v = chanRaw(ch, c);
    if (v === null) return null;
    if (ch.norm === "speed") return clamp(v / view.speedMax, 0, 1);
    if (ch.norm === "rpm") return clamp(v / view.rpmMax, 0, 1);
    return clamp((v - ch.lo) / (ch.hi - ch.lo), 0, 1);
  }
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
  const MAX_LANES = 4;
  let tray = [];
  function trayHas(num, sk) { return tray.some(function (e) { return e.d.num === num && e.sessionKey === sk; }); }
  function trayToggle(d, meta) {
    const sk = meta.sessionKey;
    const i = tray.findIndex(function (e) { return e.d.num === d.num && e.sessionKey === sk; });
    if (i !== -1) { tray.splice(i, 1); return; }
    tray.push({ d: d, sessionKey: sk, meetingKey: meta.meetingKey, sessionLabel: sessionShort(meta),
                sessionName: meta.name || meta.type || "Session" });
    if (tray.length > MAX_LANES) tray.shift();   // oldest lane drops off
  }
  // The lanes overlay on ONE track map, so they must be the same circuit. A
  // session switch WITHIN a meeting is the cross-session flow (race vs quali);
  // switching to a different Grand Prix drops the now-mismatched lanes.
  function pruneTrayToMeeting(meta) {
    if (!meta || meta.meetingKey == null) return;
    tray = tray.filter(function (e) { return e.meetingKey == null || e.meetingKey === meta.meetingKey; });
  }
  function trayNeedsBadges() {
    const byNum = {};
    for (const e of tray) byNum[e.d.num] = (byNum[e.d.num] || 0) + 1;
    return tray.some(function (e) { return byNum[e.d.num] > 1; });
  }

  function renderTelemetryBody(meta, leftPane, rightPane) {
    const myDriverGen = ++driverGen;
    ++telGen;
    if (meta) pruneTrayToMeeting(meta);   // drop lanes from a different circuit
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
      info.appendChild(el("div", "dh-live-sub",
        "Tap up to " + MAX_LANES + " lanes · switch SESSION above to add a race-vs-quali lane · drag chart to scrub"));
      leftPane.appendChild(info);

      clear(rightPane);

      drivers = (drivers || []).filter(function (d) { return d && d.num !== null && d.num !== undefined; });
      if (!drivers.length) { rightPane.appendChild(emptyMsg(NO_TELEM_MSG)); return; }

      const chipByNum = {};
      const pick = el("div", "dh-driverpick");
      const detail = el("div", "dh-telem-detail");
      const driverByNum = {};
      drivers.forEach(function (d) { driverByNum[d.num] = d; });

      function syncChips() {
        drivers.forEach(function (d) {
          chipByNum[d.num].classList.toggle("dh-active", trayHas(d.num, meta.sessionKey));
        });
        clear(detail);
        if (tray.length === 0) {
          detail.appendChild(emptyMsg("← Pick 1–" + MAX_LANES + " lanes to view a lap. Switch the SESSION above and pick again to line a driver's race lap up against their qualifying lap."));
          return;
        }
        const badges = trayNeedsBadges();
        const summary = el("div", "dh-livecard");
        summary.appendChild(el("h3", "dh-section", tray.length === 1 ? "SELECTED LANE" : "COMPARE LANES (" + tray.length + ")"));
        const laneCols = laneColors(tray);
        tray.forEach(function (e, i) {
          const row = el("div", "dh-row");
          const chip = el("span", "dh-codechip", dcode(e.d));
          const col = laneCols[i];
          chip.style.background = cssColor(col);
          chip.style.color = textColorOn(col);
          row.appendChild(chip);
          row.appendChild(el("span", "dh-name", e.d.name || "—"));
          if (badges || tray.some(function (o) { return o.sessionKey !== e.sessionKey; })) {
            row.appendChild(el("span", "dh-lane-ses", e.sessionLabel || e.sessionName));
          }
          const rm = el("button", "dh-lane-x", "×");
          rm.type = "button"; rm.title = "Remove lane";
          rm.addEventListener("click", function () {
            const idx = tray.findIndex(function (o) { return o.d.num === e.d.num && o.sessionKey === e.sessionKey; });
            if (idx !== -1) tray.splice(idx, 1);
            syncChips();
          });
          row.appendChild(rm);
          summary.appendChild(row);
        });
        const loadBtn = el("button", "dh-livebtn");
        loadBtn.textContent = tray.length === 1 ? "LOAD LAP" : "COMPARE " + tray.length + " LANES";
        loadBtn.style.marginTop = "12px";
        loadBtn.style.width = "100%";
        loadBtn.type = "button";
        loadBtn.addEventListener("click", function () {
          const focus = chipByNum[tray[0].d.num] || loadBtn;
          loadTelemetrySet(tray.slice(), detail, syncChips, focus);
        });
        summary.appendChild(loadBtn);
        if (tray.length > 1) {
          const clr = el("button", "dh-livebtn dh-lane-clear", "CLEAR LANES");
          clr.type = "button"; clr.style.width = "100%"; clr.style.marginTop = "6px";
          clr.addEventListener("click", function () { tray = []; syncChips(); });
          summary.appendChild(clr);
        }
        detail.appendChild(summary);
      }

      drivers.forEach(function (d) {
        const b = el("button", "dh-dchip", dcode(d));
        b.type = "button";
        b.style.borderColor = cssColor(driverColor(d));
        b.addEventListener("click", function () {
          trayToggle(d, meta);
          syncChips();
        });
        chipByNum[d.num] = b;
        pick.appendChild(b);
      });

      syncChips();
      // Driver chips → left pane; chart detail → right pane
      leftPane.appendChild(pick);
      rightPane.appendChild(detail);
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
        // CLIP BACK TO THE LAP. The window above overshoots by 1.5s so the last
        // samples of the lap are certainly returned, but that tail must not be
        // drawn: it is ~100m of extra track past the line, and how much of it
        // there is depends on what the driver did NEXT. In a race they stay flat
        // out down the straight; in qualifying they lift for an in-lap and can
        // reach the pit entry, which spurs off the circuit, stretches the map's
        // x/y bounds and rescales everything — the same track, drawn as a
        // different shape in one session than the other.
        const endMs = isFinite(ms) ? ms + dur * 1000 : null;
        function clipToLap(list) {
          if (!endMs || !list || !list.length) return list || [];
          const kept = list.filter(function (s) {
            const at = +s.date;
            return !isFinite(at) || at <= endMs;
          });
          // never clip away the lap itself — if the timestamps don't line up the
          // way we assume, the unclipped series is still the better answer
          return kept.length > 8 ? kept : list;
        }
        return { d: d, lap: lap, car: clipToLap(res[0]), loc: dropStrays(clipToLap(res[1])),
                 stints: res[2] || [], pits: res[3] || [] };
      });
    });
  }

  let telGen = 0;
  let telView = null;                 // the live telemetry view (for animation cleanup)
  let telemPopup = null;              // the full-screen player popup <dialog>
  let telemReturnFocus = null;

  function stopTelAnim() {
    if (telView) {
      pauseAnim(telView);
      if (telView._ro) { telView._ro.disconnect(); telView._ro = null; }
      // Drop the reference too: the view holds canvases, offscreen bases and
      // every lane's sample arrays, and a stopped view is never resumed — a
      // new one is assigned on the next lap load.
      telView = null;
    }
  }

  function closeTelemPopup() {
    ++telGen;   // a lap load in flight must not resurrect the popup after close
    const restore = telemPopup ? telemReturnFocus : null;
    stopTelAnim();
    if (telemPopup) {
      // Null the tracker FIRST: close() fires the dialog's close event, whose
      // listener re-enters here — with telemPopup already null that pass is a
      // no-op, which is what makes cancel/close/backdrop all safe to overlap.
      const node = telemPopup;
      telemPopup = null;
      if (node.open) { try { node.close(); } catch (_) {} }
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    telemReturnFocus = null;
    if (restore && restore.isConnected && restore.focus) restore.focus();
  }

  function openTelemPopup(tels, returnFocus) {
    closeTelemPopup();
    telemReturnFocus = (returnFocus && returnFocus.isConnected)
      ? returnFocus : document.activeElement;
    // A REAL <dialog>, not a div claiming role=dialog: showModal() gives the
    // top layer, focus containment, inert background and Escape for free —
    // the platform asserts the role and aria-modal, so neither is written.
    const overlay = el("dialog", "dh-tpopup");
    overlay.setAttribute("aria-labelledby", "dh-tpopup-title");

    // fit-managed: SheetShape scans this class alongside .sheet, so a short
    // window at high UI SIZE shrinks the popup instead of starving the trace.
    const card = el("div", "dh-tpopup-card fit-managed");

    // Header: driver name(s) + session context + close button
    const hdr = el("div", "dh-tpopup-hdr");
    const titleEl = el("div", "dh-tpopup-title");
    titleEl.id = "dh-tpopup-title";
    const dupName = {};
    tels.forEach(function (t) { const k = t.d.num; dupName[k] = (dupName[k] || 0) + 1; });
    const label = tels.map(function (t) {
      const nm = t.d.name || dcode(t.d);
      return (dupName[t.d.num] > 1 && t.sessionLabel) ? nm + " " + t.sessionLabel : nm;
    }).join(" vs ");
    titleEl.appendChild(el("span", null, label));
    const oneSession = tels.every(function (t) { return !t.sessionLabel || t.sessionLabel === tels[0].sessionLabel; });
    if (sel.meta && oneSession) {
      const sub = [sel.meta.name || sel.meta.type, sel.meta.circuit || sel.meta.country].filter(Boolean).join(" · ");
      if (sub) titleEl.appendChild(el("span", "dh-tpopup-sub", sub));
    } else if (sel.meta) {
      const sub = [sel.meta.circuit || sel.meta.country].filter(Boolean).join(" · ");
      if (sub) titleEl.appendChild(el("span", "dh-tpopup-sub", sub + " · cross-session"));
    }
    hdr.appendChild(titleEl);
    const closeBtn = el("button", "dh-close", "✕");
    closeBtn.type = "button";
    // autofocus: showModal's focusing steps then GUARANTEE initial focus here,
    // instead of racing whatever the async body build makes focusable first.
    closeBtn.autofocus = true;
    closeBtn.setAttribute("aria-label", "Close telemetry");
    closeBtn.addEventListener("click", closeTelemPopup);
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    const body = el("div", "dh-tpopup-body");
    body.appendChild(spinner());
    card.appendChild(body);
    overlay.appendChild(card);

    // Close on backdrop click — the dialog element is styled full-viewport
    // (the scrim IS the element, css/data.css), so a press outside the card
    // targets the dialog itself.
    overlay.addEventListener("pointerdown", function (e) {
      if (e.target === overlay) closeTelemPopup();
    });
    // Escape arrives as `cancel`; route it through the real teardown (a bare
    // native close would leak the animation, the ResizeObserver and an
    // in-flight lap load — see closeTelemPopup). `close` is the backstop for
    // any other native close path; re-entry is a no-op by construction.
    overlay.addEventListener("cancel", function (e) {
      e.preventDefault();
      closeTelemPopup();
    });
    overlay.addEventListener("close", function () {
      if (telemPopup === overlay) closeTelemPopup();
    });

    const host = document.getElementById("datahub") || document.body;
    host.appendChild(overlay);
    telemPopup = overlay;
    overlay.showModal();
    closeBtn.focus();

    // Build after layout so clientWidth measurements are real
    setTimeout(function () {
      if (telemPopup !== overlay) return;
      clear(body);
      buildTelemetryView(body, tels);
    }, 0);
  }

  function loadTelemetrySet(lanes, detail, syncChips, returnFocus) {
    const myGen = ++telGen;
    stopTelAnim();
    if (!lanes.length) {
      if (syncChips) syncChips();
      return;
    }
    clear(detail);
    detail.appendChild(spinner());
    Promise.all(lanes.map(function (e, i) {
      return fetchDriverTel(e.sessionKey, e.d, i === 0).then(function (tel) {
        tel.sessionLabel = e.sessionLabel; tel.sessionName = e.sessionName;
        return tel;
      });
    }))
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
    const laps = tels.filter(function (t) { return t.car && t.car.length; });
    if (!laps[0]) {
      // No lane carries car telemetry — show headers + empty message then quit.
      const mainArea = el("div", "dh-telem-main");
      const laneCols0 = laneColors(tels);
      const dupNum0 = {};
      tels.forEach(function (t) { dupNum0[t.d.num] = (dupNum0[t.d.num] || 0) + 1; });
      tels.forEach(function (t, i) {
        const ht = el("div", "dh-live-title dh-thead");
        const sw = el("span", "dh-swatch"); sw.style.background = cssColor(laneCols0[i]);
        ht.appendChild(sw);
        const nameEl = el("span", "dh-tname", (t.d.name || dcode(t.d)));
        nameEl.title = t.d.name || dcode(t.d);
        ht.appendChild(nameEl);
        if (dupNum0[t.d.num] > 1 && t.sessionLabel) ht.appendChild(el("span", "dh-lane-ses", t.sessionLabel));
        ht.appendChild(el("span", "dh-tsect", "Car telemetry isn't available for this lap."));
        mainArea.appendChild(ht);
      });
      detail.appendChild(mainArea);
      appendStintsPits(mainArea, tels[0]);
      return;
    }
    const primary = laps[0];
    const compare = laps[1] || null;
    const laneCols = laneColors(tels);
    const dupNum = {};
    tels.forEach(function (t) { dupNum[t.d.num] = (dupNum[t.d.num] || 0) + 1; });
    // stash for the gauge lane board (built later, out of this scope)
    const _dupForView = dupNum;

    // Main column: driver headers, transport, chart, legend, stints
    const mainArea = el("div", "dh-telem-main");
    // Side column: gauges + map
    const sideArea = el("div", "dh-telem-side");

    tels.forEach(function (t, i) {
      // one-line header per lane: swatch · name (· session) · sectors · lap.
      const ht = el("div", "dh-live-title dh-thead");
      const sw = el("span", "dh-swatch"); sw.style.background = cssColor(laneCols[i]);
      ht.appendChild(sw);
      // title= so a name that still ellipsises at a narrow width is recoverable
      const nameEl = el("span", "dh-tname", (t.d.name || dcode(t.d)));
      nameEl.title = t.d.name || dcode(t.d);
      ht.appendChild(nameEl);
      if (dupNum[t.d.num] > 1 && t.sessionLabel) ht.appendChild(el("span", "dh-lane-ses", t.sessionLabel));
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

    const view = {
      laps: laps,
      // laneCols must be indexed the SAME way its consumers read it. The lane
      // HEADERS iterate `tels` (so they use laneCols over tels), but every
      // in-chart consumer (map dots, legend, extra-lane speed dots, delta lines)
      // iterates `view.laps` — the FILTERED array. Re-index laneCols onto `laps`
      // so a dropped middle lane (no car telemetry) doesn't shift every following
      // lane onto the next colour, disagreeing with its own header swatch.
      laneCols: laps.map(function (t) { return laneCols[tels.indexOf(t)]; }),
      primary: primary,
      compare: compare,          // already known to carry car telemetry (`laps`)
      multi: laps.length > 2,
      visible: {}, cursorT: 0,
      tMax: 0, speedMax: 1, rpmMax: 1,
      playing: false, rate: 1, _raf: 0, _last: 0, onboard: false,
      chart: null, map: null, delta: null,
      chartBase: null, mapBase: null, deltaBase: null, mapT: null,
      sectors: null, g: null, playBtn: null
    };
    // per-driver visibility: visible = primary (solid), visibleC = compare (dashed)
    view.visibleC = {};
    CHANNELS.forEach(function (ch) { view.visible[ch.id] = view.visibleC[ch.id] = !ch.off; });
    view.colP = view.laneCols[0]; view.colC = view.laneCols[1] || null;
    view._dup = _dupForView;
    function scan(car) {
      for (let i = 0; i < car.length; i++) {
        if (car[i].t > view.tMax) view.tMax = car[i].t;
        if ((car[i].speed || 0) > view.speedMax) view.speedMax = car[i].speed;
        if ((car[i].rpm || 0) > view.rpmMax) view.rpmMax = car[i].rpm;
      }
    }
    // tMax must span the LONGEST lane, or a slower lane's dot/line would be cut
    // off before the lap ended.
    laps.forEach(function (t) { scan(t.car); });
    view.tMax = view.tMax || 1;
    laps.forEach(function (t) { t.cum = cumDist(t.car); });
    if (primary.lap && primary.lap.s1 !== null && primary.lap.s2 !== null) {
      view.sectors = [primary.lap.s1, primary.lap.s1 + primary.lap.s2];
    }

    // Transport bar → main
    mainArea.appendChild(buildTransport(view));

    const isLS = shortLS();
    const sideW = isLS ? 225 : 0;
    const CW = detail.clientWidth > 40
      ? Math.min(600, Math.max(260, detail.clientWidth - sideW - 28))
      : (isLS ? 360 : 330);
    const CH_CHART = chartH(CW, !!view.compare);

    const c1 = el("canvas", "dh-canvas");
    c1.style.touchAction = "none";
    mainArea.appendChild(c1);
    view.chart = c1;
    // Layout dims live on the view; the buffers carry layout x ratio. Every
    // consumer below reads view.cw/ch/dw/dh/mw/mh, never canvas.width — the
    // buffer dimension stopped being a layout number when DPR joined it.
    view.ratio = viewRatio(c1);
    view.cw = CW; view.ch = CH_CHART;
    sizeCanvas(c1, CW, CH_CHART, view.ratio);
    view.chartBase = makeOffscreen(CW, CH_CHART, view.ratio);

    if (view.compare) {
      const CD_H = deltaH(CW);
      const cd = el("canvas", "dh-canvas dh-delta");
      cd.style.touchAction = "none";
      mainArea.appendChild(cd);
      view.delta = cd;
      view.dw = CW; view.dh = CD_H;
      sizeCanvas(cd, CW, CD_H, view.ratio);
      view.deltaBase = makeOffscreen(CW, CD_H, view.ratio);
      attachScrub(cd, view);
    }

    const legend = el("div", "dh-legend");
    if (view.compare) {
      // driver key: each lane's code chip in its own trace/dot colour
      view.laps.forEach(function (t, i) {
        const badge = (dupNum[t.d.num] > 1 && t.sessionLabel) ? " " + t.sessionLabel : "";
        const chip = el("span", "dh-codechip", dcode(t.d) + badge);
        const col = view.laneCols[i];
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
      sideArea.appendChild(c2);
      view.map = c2;
      view.mw = 320; view.mh = 320;
      sizeCanvas(c2, 320, 320, view.ratio);
      view.mapBase = makeOffscreen(320, 320, view.ratio);
      // colour key for the car dots on the map
      const mkey = el("div", "dh-maplegend");
      function mchip(col, code) {
        const item = el("span", "dh-legend-item dh-legend-static");
        const dot = el("span", "dh-legend-dot dh-mapdot"); dot.style.background = cssColor(col);
        item.appendChild(dot); item.appendChild(document.createTextNode(code));
        return item;
      }
      // one map-legend chip per lane, in that lane's colour
      view.laps.forEach(function (t, i) {
        const badge = (dupNum[t.d.num] > 1 && t.sessionLabel) ? " " + t.sessionLabel : "";
        mkey.appendChild(mchip(view.laneCols[i], dcode(t.d) + badge));
      });
      // track colouring key: slow (blue) -> fast (red), sectors marked S2/S3
      const gi = el("span", "dh-legend-item dh-legend-static");
      gi.appendChild(document.createTextNode("SLOW"));
      gi.appendChild(el("span", "dh-gradbar"));
      gi.appendChild(document.createTextNode("FAST"));
      mkey.appendChild(gi);
      sideArea.appendChild(mkey);
    }

    appendStintsPits(sideArea, primary);

    detail.appendChild(mainArea);
    detail.appendChild(sideArea);

    attachScrub(c1, view);
    buildBases(view);
    paintFrame(view);
    telView = view;

    // Resize canvases when the popup is resized (e.g. orientation change)
    if (typeof ResizeObserver !== "undefined") {
      let roPending = false;
      const ro = new ResizeObserver(() => {
        if (roPending) return;
        roPending = true;
        requestAnimationFrame(() => {
        roPending = false;
        if (!view.chart || !mainArea.isConnected) return;
        const mainW = mainArea.clientWidth - 32; // minus padding
        if (mainW <= 0) return;

        // Mirror buildTelemetryView's cap and css .dh-canvas's 600 max-width:
        // the old 800 cap allocated buffers the stylesheet then downscaled,
        // softening the DPR-crisp charts, and the formula mismatch made the
        // observer's first fire rebuild every layer a second time per open.
        const newCW = Math.min(600, Math.max(260, mainW));
        const newCH = chartH(newCW, !!view.compare);
        // The ratio joins the change test — the house lesson from the circuit
        // detail canvas: a DPR/zoom change under an unchanged box produced an
        // identical key and the early return skipped the refit.
        const newR = viewRatio(view.chart);

        let resized = false;
        if (view.cw !== newCW || view.ch !== newCH || view.ratio !== newR) {
          view.ratio = newR;
          view.cw = newCW; view.ch = newCH;
          sizeCanvas(view.chart, newCW, newCH, newR);
          view.chartBase = makeOffscreen(newCW, newCH, newR);
          if (view.delta) {
            const dh = deltaH(newCW);
            view.dw = newCW; view.dh = dh;
            sizeCanvas(view.delta, newCW, dh, newR);
            view.deltaBase = makeOffscreen(newCW, dh, newR);
          }
          resized = true;
        }

        if (view.map && sideArea.isConnected) {
          const sideW = sideArea.clientWidth - 24;
          if (sideW > 0 && (view.mw !== sideW || view.ratio !== newR)) {
            view.mw = sideW; view.mh = sideW;
            sizeCanvas(view.map, sideW, sideW, newR);
            view.mapBase = makeOffscreen(sideW, sideW, newR);
            resized = true;
          }
        }
        
        if (resized) {
          buildBases(view);
          paintFrame(view);
        }
        });   // requestAnimationFrame
      });
      ro.observe(detail);
      view._ro = ro;
    }
  }

  // The offscreen buffer allocates at layout x ratio and pre-transforms its
  // context, so every renderer keeps drawing in LAYOUT px — the same house
  // split the picker preview and minimap use (ratio = min(3, zoom x dpr)).
  function makeOffscreen(w, h, r) {
    const c = document.createElement("canvas");
    r = r || 1;
    c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
    c.getContext("2d").setTransform(r, 0, 0, r, 0, 0);
    return c;
  }
  function viewRatio(cv) {
    return Math.min(3, Math.max(1, ((cv && cv.currentCSSZoom) || 1) * (window.devicePixelRatio || 1)));
  }
  function sizeCanvas(cv, w, h, r) {
    cv.width = Math.max(1, Math.round(w * r));
    cv.height = Math.max(1, Math.round(h * r));
  }

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
    // lane board (3-4 lanes): live speed + gap to the reference for every lane
    if (g.board) {
      const dRef = distAtT(view.primary.cum, t);
      view.laps.forEach(function (lane, i) {
        const cell = g.board[i]; if (!cell) return;
        const cc = sampleAt(lane.car, t);
        cell.spd.textContent = (cc && cc.speed !== null) ? Math.round(cc.speed) : "—";
        if (cell.ref) return;
        const dl = timeAtDist(lane.cum, dRef) - t;   // >0: this lane is behind the ref
        cell.dl.textContent = (dl >= 0 ? "+" : "") + dl.toFixed(2);
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
  }

  // composite one frame: cached bases + moving cursor, car dots, delta, gauges
  function paintFrame(view) {
    const T = view.cursorT === null ? 0 : view.cursorT;
    const R = view.ratio || 1;
    const cg = view.chart.getContext("2d");
    const W = view.cw, H = view.ch;
    cg.setTransform(R, 0, 0, R, 0, 0);
    cg.clearRect(0, 0, W, H);
    cg.drawImage(view.chartBase, 0, 0, W, H);
    const X = chartX(view, T, W);
    cg.strokeStyle = "rgba(255,255,255,0.55)"; cg.lineWidth = 1;
    cg.beginPath(); cg.moveTo(X, PADY); cg.lineTo(X, H - PADY); cg.stroke();
    // a speed dot per lane at the cursor (extra lanes 3-4 too), reference last
    if (view.multi && view.visible.speed) {
      for (let i = 2; i < view.laps.length; i++) {
        const cm = sampleAt(view.laps[i].car, T);
        const fm = chanNorm(CHANNELS[0], cm, view);
        if (fm === null) continue;
        cg.fillStyle = cssColor(view.laneCols[i]);
        cg.beginPath(); cg.arc(X, H - PADY - fm * (H - 2 * PADY), 3, 0, Math.PI * 2); cg.fill();
      }
    }
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
    if (view.delta) {
      const dgx = view.delta.getContext("2d");
      const DW = view.dw, DH = view.dh;
      dgx.setTransform(R, 0, 0, R, 0, 0);
      dgx.clearRect(0, 0, DW, DH);
      dgx.drawImage(view.deltaBase, 0, 0, DW, DH);
      const dx = chartX(view, T, DW);
      dgx.strokeStyle = "rgba(255,255,255,0.55)"; dgx.lineWidth = 1;
      dgx.beginPath(); dgx.moveTo(dx, 0); dgx.lineTo(dx, DH); dgx.stroke();
    }
    if (view.map) {
      const mg = view.map.getContext("2d");
      const MW = view.mw, MH = view.mh;
      mg.setTransform(R, 0, 0, R, 0, 0);
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
        mg.drawImage(view.mapBase, 0, 0, MW, MH);
        // extra lanes first, reference last so it stays on top
        for (let i = view.laps.length - 1; i >= 0; i--)
          drawCarDot(mg, view, view.laps[i], T, cssColor(view.laneCols[i]), 1 / ZOOM);
        mg.restore();
      } else {
        mg.drawImage(view.mapBase, 0, 0, MW, MH);
        for (let i = view.laps.length - 1; i >= 0; i--)
          drawCarDot(mg, view, view.laps[i], T, cssColor(view.laneCols[i]), 1);
      }
    }
    updateGauges(view);
  }
  function drawCarDot(g, view, tel, t, fill, rscale) {
    const best = locAt(view, tel, t);
    if (!best) return;
    const p = mapPoint(view, best);
    const rs = rscale || 1, r = 5.5 * rs;
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
    // Layout dims, never base.width: the offscreens allocate at layout x
    // ratio with a pre-transformed context, so the renderers keep speaking
    // layout px on a denser bitmap.
    renderTraces(view.chartBase.getContext("2d"), view.cw, view.ch, view);
    if (view.map) {
      computeMapTransform(view);
      renderMap(view.mapBase.getContext("2d"), view.mw, view.mh, view);
    }
    if (view.delta) renderDelta(view.deltaBase.getContext("2d"), view.dw, view.dh, view);
  }

  function renderTraces(g, W, H, view) {
    g.clearRect(0, 0, W, H);
    const X = function (t) { return chartX(view, t, W); };
    const Y = function (f) { return H - PADY - f * (H - 2 * PADY); };
    g.font = "10px system-ui, sans-serif";
    // an axis shows while either driver's line for its unit is visible
    function anyVis(id) { return view.visible[id] || (view.compare && view.visibleC[id]); }
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
    if (view.multi && view.visible.speed) {
      g.setLineDash([2, 3]);
      for (let i = 2; i < view.laps.length; i++) line(view.laps[i].car, CHANNELS[0], cssColor(view.laneCols[i]), 1.6);
      g.setLineDash([]);
    }
    for (let k = CHANNELS.length - 1; k >= 0; k--) {
      const ch = CHANNELS[k];
      if (!view.visible[ch.id]) continue;
      const col = (ch.id === "speed" && view.compare) ? cssColor(view.colP) : ch.color;
      line(view.primary.car, ch, col, ch.w);
    }
  }

  function deltaSamplesFor(view, lane) {
    const car = view.primary.car, out = [];
    let mn = 0, mx = 0;
    for (let i = 0; i < car.length; i++) {
      const t = car[i].t;
      const dP = distAtT(view.primary.cum, t);
      const dl = timeAtDist(lane.cum, dP) - t;
      out.push(dl);
      if (dl < mn) mn = dl; if (dl > mx) mx = dl;
    }
    return { d: out, mn: mn, mx: mx };
  }
  function renderDelta(g, W, H, view) {
    const pad = 6, car = view.primary.car;
    g.clearRect(0, 0, W, H);
    const others = view.laps.slice(1);
    const series = others.map(function (lane) { return deltaSamplesFor(view, lane); });
    let mn = 0, mx = 0;
    series.forEach(function (s) { if (s.mn < mn) mn = s.mn; if (s.mx > mx) mx = s.mx; });
    const span = Math.max(0.15, mx - mn);
    const X = function (t) { return chartX(view, t, W); };
    const Y = function (v) { return pad + (mx - v) / span * (H - 2 * pad); };
    const y0 = Y(0);
    // zero line
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(PADL, y0); g.lineTo(W - PADR, y0); g.stroke();
    const fill = series.length === 1;
    series.forEach(function (ds, si) {
      const laneCol = cssColor(view.laneCols[si + 1]);
      if (fill) {
        g.beginPath(); g.moveTo(X(0), y0);
        for (let i = 0; i < car.length; i++) g.lineTo(X(car[i].t), Y(ds.d[i]));
        g.lineTo(X(view.tMax), y0); g.closePath();
        g.fillStyle = "rgba(63,185,80,0.18)"; g.fill();
      }
      g.beginPath();
      let started = false;
      for (let i = 0; i < car.length; i++) {
        const x = X(car[i].t), y = Y(ds.d[i]);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.strokeStyle = laneCol; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
    });
    g.fillStyle = "rgba(255,255,255,0.45)"; g.font = "9px system-ui, sans-serif";
    g.textBaseline = "top";
    g.fillText(series.length === 1 ? "GAP TO " + dcode(view.compare.d) + " (s)" : "GAP TO " + dcode(view.primary.d) + " (s) · +behind", PADL + 2, 2);
  }

  // screen transform for the track map (from the primary lap's x/y bounds)
  function computeMapTransform(view) {
    const b = locBounds(view.primary.loc);
    const W = view.mw, H = view.mh, pad = 14;
    const spanx = b.spanx, spany = b.spany;
    const sc = Math.min((W - 2 * pad) / spanx, (H - 2 * pad) / spany);
    view.mapT = { minx: b.minx, miny: b.miny, sc: sc, ox: (W - spanx * sc) / 2, oy: (H - spany * sc) / 2,
                  W: W, H: H, spanx: spanx, spany: spany };
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
    // Measured in TRACK units against the track's own span, not in canvas
    // pixels against the canvas height. The pixel scale is derived from the
    // bounds, so a pixel threshold moves whenever the bounds do — the same
    // physical gap passed in one session and failed in another, which is how a
    // fake closing straight appeared on one map and not the other.
    const dx = loc[0].x - loc[loc.length - 1].x, dy = loc[0].y - loc[loc.length - 1].y;
    const m = view.mapT;
    return Math.hypot(dx, dy) < Math.max(m.spanx, m.spany) * 0.18;
  }
  // one lap as a single polyline (used for the compare driver's flat-colour line)
  function strokeLap(g, view, loc) {
    const limit = gapLimitMs(loc);
    let open = false;
    g.beginPath();
    for (let i = 0; i < loc.length; i++) {
      const p = mapPoint(view, loc[i]);
      if (!open || (i > 0 && isGap(loc, i, limit))) { g.moveTo(p[0], p[1]); open = true; }
      else g.lineTo(p[0], p[1]);
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
    if (view.compare && view.compare.loc && view.compare.loc.length > 1) {
      g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
      g.strokeStyle = cssColor(view.colC);
      strokeLap(g, view, view.compare.loc);
    }
    g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    const N = loc.length;
    const limit = gapLimitMs(loc);
    for (let i = 1; i <= N; i++) {
      const a = loc[i - 1], b2 = loc[i % N];
      if (i === N && !closesLoop(view, loc)) break;   // partial lap: leave it open
      if (i < N && isGap(loc, i, limit)) continue;    // coverage gap: no invented straight
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

  const clamp = M4.clamp;                     // shared scalar helper (js/mat4.js)

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

  function lerpLoc(a, b, f) {
    if (!b) return a;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
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
  // inverse of dateAtT: lap-time for a wall-clock date
  function tAtDate(car, date) {
    if (!car || !car.length) return 0;
    const n = car.length;
    if (date <= +car[0].date) return car[0].t;
    if (date >= +car[n - 1].date) return car[n - 1].t;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (+car[mid].date <= date) lo = mid; else hi = mid;
    }
    const span = +car[hi].date - +car[lo].date;
    const f = span > 0 ? (date - +car[lo].date) / span : 0;
    return car[lo].t + f * (car[hi].t - car[lo].t);
  }

  function locAt(view, tel, t) {
    const own = !!(tel.loc && tel.loc.length);
    const loc = own ? tel.loc : (view.primary.loc || []);
    if (!loc.length) return null;
    if (!own) {
      const ownMax = (tel.car && tel.car.length) ? tel.car[tel.car.length - 1].t : 0;
      const f = clamp(t / (ownMax || view.tMax || 1), 0, 1) * (loc.length - 1);
      const i = Math.floor(f);
      return lerpLoc(loc[i], loc[i + 1], f - i);
    }
    const target = dateAtT(tel.car, t);
    if (target === null) return loc[0];
    const n = loc.length;
    if (target <= +loc[0].date) return loc[0];
    if (target >= +loc[n - 1].date) return loc[n - 1];
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (+loc[mid].date <= target) lo = mid; else hi = mid;
    }
    const span = +loc[hi].date - +loc[lo].date;
    let f = span > 0 ? (target - +loc[lo].date) / span : 0;
    // WHERE BETWEEN THE TWO FIXES? The fixes themselves are ground truth — the
    // car really was there, at those instants — so the dot stays anchored to
    // them and never drifts. What is NOT true is that it crossed the ~20m gap at
    // a constant rate: braking from 300 into a hairpin it covers most of that
    // gap in the first third of the interval. So take the fraction from the
    // car's own DISTANCE TRAVELLED (its speed trace integrated, the same series
    // the delta chart runs on) rather than from elapsed time.
    // Every lane already carries .cum (buildTelemetryView computes it for the
    // delta chart); the fallback only covers a lane locAt sees first.
    const cum = tel.cum || (tel.cum = cumDist(tel.car || []));
    if (cum.t.length > 1) {
      const dA = distAtT(cum, tAtDate(tel.car, +loc[lo].date));
      const dB = distAtT(cum, tAtDate(tel.car, +loc[hi].date));
      if (dB > dA) f = clamp((distAtT(cum, t) - dA) / (dB - dA), 0, 1);
    }
    return lerpLoc(loc[lo], loc[hi], f);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  const STRAY_MARGIN = 0.35;
  function dropStrays(loc) {
    if (!loc || loc.length < 24) return loc || [];   // too few to judge a distribution
    const xs = loc.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
    const ys = loc.map(function (p) { return p.y; }).sort(function (a, b) { return a - b; });
    const x0 = quantile(xs, 0.02), x1 = quantile(xs, 0.98);
    const y0 = quantile(ys, 0.02), y1 = quantile(ys, 0.98);
    const mx = ((x1 - x0) || 1) * STRAY_MARGIN, my = ((y1 - y0) || 1) * STRAY_MARGIN;
    const kept = loc.filter(function (p) {
      return p.x >= x0 - mx && p.x <= x1 + mx && p.y >= y0 - my && p.y <= y1 + my;
    });
    return kept.length >= loc.length * 0.9 ? kept : loc;
  }
  function locBounds(loc) {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < (loc ? loc.length : 0); i++) {
      if (loc[i].x < minx) minx = loc[i].x; if (loc[i].x > maxx) maxx = loc[i].x;
      if (loc[i].y < miny) miny = loc[i].y; if (loc[i].y > maxy) maxy = loc[i].y;
    }
    if (!isFinite(minx)) { minx = 0; maxx = 1; miny = 0; maxy = 1; }
    return { minx: minx, miny: miny, spanx: (maxx - minx) || 1, spany: (maxy - miny) || 1 };
  }
  function gapLimitMs(loc) {
    if (!loc || loc.length < 8) return Infinity;
    const dts = [];
    for (let i = 1; i < loc.length; i++) {
      const dt = loc[i].date - loc[i - 1].date;
      if (isFinite(dt) && dt > 0) dts.push(dt);
    }
    if (dts.length < 4) return Infinity;
    dts.sort(function (a, b) { return a - b; });
    return Math.max(quantile(dts, 0.5) * 8, 1500);   // 8x the median cadence, min 1.5 s
  }
  function isGap(loc, i, limit) {
    if (!isFinite(limit)) return false;
    const dt = loc[i].date - loc[i - 1].date;
    return isFinite(dt) && dt > limit;
  }

  return { create, _dropStrays: dropStrays, _locBounds: locBounds,
           _gapLimitMs: gapLimitMs, _isGap: isGap, _locAt: locAt, _cumDist: cumDist };
})();
