/* Apex 26 — telemetry tab controller: selection, async lap loading and popup lifecycle. */
const DataTelemetry = (function () {
  "use strict";

  function create(ctx) {
    const { el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
            invalidateOther, cssColor, textColorOn, NO_TELEM_MSG } = ctx;

    const { driverColor, laneColors } = DataTelemetryModel.create(ctx);
    const { dcode, sessionShort, laneRole } = DataTelemetryModel;
    const { buildTelemetryView, pauseAnim } = DataTelemetryView.create(ctx, {
      stop: stopTelAnim,
      setView: function (view) { telView = view; }
    });

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

      F1API.sessionDrivers(meta.sessionKey).then(function (drivers) {
        if (myDriverGen !== driverGen) return;
        // Session info → left pane
        const info = el("div", "dh-livecard");
        const title = el("div", "dh-live-title");
        title.appendChild(el("span", null, meta.name || meta.type || "Session"));
        if (meta.type && meta.type !== meta.name) title.appendChild(el("span", "dh-live-type", meta.type));
        info.appendChild(title);
        const place = (typeof F1API !== "undefined" && F1API.placeLabel)
          ? F1API.placeLabel(meta.circuit, meta.country, " · ")
          : [meta.circuit, meta.country].filter(Boolean).join(" · ");
        if (place) info.appendChild(el("div", "dh-live-sub", place));
        // Two short lines — a single long ·-joined string was clipped mid-word
        // in the narrow split pane ("drag chart to .").
        info.appendChild(el("div", "dh-live-sub",
          "Select one driver for a fastest-lap trace. Select a second to compare; the first is the reference."));
        info.appendChild(el("div", "dh-live-sub",
          "A third or fourth driver adds speed markers. Switch SESSION to compare race vs quali."));
        leftPane.appendChild(info);

        clear(rightPane);

        drivers = (drivers || []).filter(function (d) { return d && d.num != null; });
        if (!drivers.length) { rightPane.appendChild(emptyMsg(NO_TELEM_MSG)); return; }

        const chipByNum = {};
        const pick = el("div", "dh-driverpick");
        const detail = el("div", "dh-telem-detail");
        const driverByNum = {};
        drivers.forEach(function (d) { driverByNum[d.num] = d; });

        function syncChips() {
          drivers.forEach(function (d) {
            const selected = trayHas(d.num, meta.sessionKey);
            chipByNum[d.num].classList.toggle("active", selected);
            chipByNum[d.num].setAttribute("aria-pressed", selected ? "true" : "false");
          });
          clear(detail);
          if (tray.length === 0) {
            detail.appendChild(emptyMsg("Select one driver to view a fastest lap. Select a second to compare; the first driver is the reference."));
            return;
          }
          const badges = trayNeedsBadges();
          const summary = el("div", "dh-livecard");
          summary.appendChild(el("h3", "dh-section", tray.length === 1 ? "SELECTED DRIVER" : "COMPARE DRIVERS (" + tray.length + ")"));
          const laneCols = laneColors(tray);
          tray.forEach(function (e, i) {
            const row = el("div", "dh-row");
            const chip = el("span", "dh-codechip", dcode(e.d));
            const col = laneCols[i];
            chip.style.background = cssColor(col);
            chip.style.color = textColorOn(col);
            row.appendChild(chip);
            row.appendChild(el("span", "dh-name", e.d.name || "—"));
            row.appendChild(el("span", "dh-tsect", laneRole(i)));
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
          if (tray.length > 2) {
            summary.appendChild(el("div", "dh-live-sub",
              "The first two lanes draw full traces; additional lanes add speed markers."));
          }
          const loadBtn = el("button", "dh-livebtn");
          loadBtn.textContent = tray.length === 1 ? "LOAD FASTEST LAP" : "COMPARE " + tray.length + " LAPS";
          loadBtn.dataset.block = "full";   // css/data.css .dh-livebtn[data-block]
          loadBtn.type = "button";
          loadBtn.addEventListener("click", function () {
            const focus = chipByNum[tray[0].d.num] || loadBtn;
            loadTelemetrySet(tray.slice(), detail, syncChips, focus);
          });
          summary.appendChild(loadBtn);
          if (tray.length > 1) {
            const clr = el("button", "dh-livebtn dh-lane-clear", "CLEAR SELECTION");
            clr.type = "button"; clr.dataset.block = "tight";
            clr.addEventListener("click", function () { tray = []; syncChips(); });
            summary.appendChild(clr);
          }
          detail.appendChild(summary);
        }

        const pickHead = el("h3", "dh-section", "SELECT DRIVERS");
        drivers.forEach(function (d) {
          const fullName = d.name || dcode(d);
          const parts = fullName.trim().split(/\s+/);
          const shortName = parts.length > 1 ? parts[parts.length - 1] : fullName;
          // The surname in its own span: a phone shows the code alone (css/data.css), and aria-label keeps the full name.
          const b = el("button", "dh-dchip", dcode(d));
          b.appendChild(el("span", null, " · " + shortName));
          b.type = "button";
          b.style.borderColor = cssColor(driverColor(d));
          b.setAttribute("aria-label", "Select " + fullName);
          b.addEventListener("click", function () {
            trayToggle(d, meta);
            syncChips();
          });
          chipByNum[d.num] = b;
          pick.appendChild(b);
        });

        syncChips();
        // Driver chips → left pane; chart detail → right pane
        leftPane.appendChild(pickHead);
        leftPane.appendChild(pick);
        rightPane.appendChild(detail);
      }, function () {
        if (myDriverGen !== driverGen) return;
        clear(rightPane);
        const failure = el("div", "dh-error");
        failure.setAttribute("role", "status");
        failure.setAttribute("data-state", "failed");
        failure.appendChild(el("div", "dh-error-msg", "Couldn't load telemetry drivers. Try again."));
        const retry = el("button", "dh-retry", "RETRY");
        retry.type = "button";
        retry.addEventListener("click", function () { renderTelemetryBody(meta, leftPane, rightPane); });
        failure.appendChild(retry);
        rightPane.appendChild(failure);
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
          // These two ARE the telemetry view. A rejected request is a failed
          // load, while a fulfilled [] is a valid "not published" answer.
          F1API.carData(sessionKey, d.num, start, end),
          F1API.locationData(sessionKey, d.num, start, end)
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
    let telLanes = 0;                   // lane fetches in flight (loadTelemetrySet): what closeTelemPopup(true) aborts
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

    // `leavingTab === true` (hub showTab; a click handler passes an Event, never
    // true): a COMPARE still fetching is aborted too, so the next tab does not
    // queue behind it in F1API's serialized OpenF1 lane (M24). Returns true when
    // it aborted anything, so the hub drops this tab's now half-failed node.
    function closeTelemPopup(leavingTab) {
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
      if (leavingTab !== true || !telLanes) return false;
      F1API.cancelAll();
      return true;
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
      const dupName = DataTabUtils.countsByDriver(tels);
      const label = tels.map(function (t) {
        const nm = t.d.name || dcode(t.d);
        return (dupName[t.d.num] > 1 && t.sessionLabel) ? nm + " " + t.sessionLabel : nm;
      }).join(" vs ");
      titleEl.appendChild(el("span", null, label));
      const oneSession = tels.every(function (t) { return !t.sessionLabel || t.sessionLabel === tels[0].sessionLabel; });
      // The LANES' session, not the one picked now: the tray keeps a
      // meeting's lanes across a session switch.
      const laneSes = tels[0] && tels[0].sessionName;
      if (sel.meta && oneSession) {
        const same = !laneSes || laneSes === (sel.meta.name || sel.meta.type);
        const sub = [laneSes || sel.meta.name || sel.meta.type, same ? sel.meta.circuit || sel.meta.country : null].filter(Boolean).join(" · ");
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
        telLanes++;
        return fetchDriverTel(e.sessionKey, e.d, i === 0).then(function (tel) {
          tel.sessionLabel = e.sessionLabel; tel.sessionName = e.sessionName;
          return tel;
        }).finally(function () { telLanes--; });
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
          const failure = el("div", "dh-error");
          failure.setAttribute("role", "status");
          failure.setAttribute("data-state", "failed");
          failure.appendChild(el("div", "dh-error-msg", msg));
          const retry = el("button", "dh-retry", "RETRY");
          retry.type = "button";
          retry.addEventListener("click", function () {
            loadTelemetrySet(lanes, detail, syncChips, returnFocus);
          });
          failure.appendChild(retry);
          detail.appendChild(failure);
          const backBtn = el("button", "dh-livebtn", "BACK");
          backBtn.dataset.block = "full";
          backBtn.addEventListener("click", function() { if (syncChips) syncChips(); });
          detail.appendChild(backBtn);
        });
    }

    return { loadTelemetry, closeTelemPopup };
  }

  // Retain the established diagnostic surface for existing callers and probes.
  const { dropStrays, locBounds, gapLimitMs, isGap, locAt, cumDist } = DataTelemetryModel;
  return { create, _dropStrays: dropStrays, _locBounds: locBounds,
           _gapLimitMs: gapLimitMs, _isGap: isGap, _locAt: locAt, _cumDist: cumDist };
})();
Object.freeze(DataTelemetry);
