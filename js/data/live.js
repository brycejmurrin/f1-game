/* Apex 26 — the data hub's LIVE tab: polls OpenF1 for the running session's
   positions/gaps/weather. mergePositionBatch/mergeIntervalBatch fold a delta
   batch onto per-driver state so a live/liveIntervals cursor never replays. */
const DataLive = (function () {
  "use strict";

  function mergePositionBatch(state, batch) {
    const values = batch && (Array.isArray(batch.values) ? batch.values : (Array.isArray(batch) ? batch : []));
    (values || []).forEach((p) => { if (p && p.num != null) state.positions.set(p.num, p); });
    if (batch && batch.cursor && (!state.positionCursor || batch.cursor > state.positionCursor)) {
      state.positionCursor = batch.cursor;
    }
    return Array.from(state.positions.values()).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  }

  function mergeIntervalBatch(state, batch) {
    if (batch) {
      // `values: null` is typeof "object" is false, so the old ternary fell
      // through to the whole batch and wrote keys "values"/"cursor" into gaps.
      let values;
      if (batch.values != null && typeof batch.values === "object" && !Array.isArray(batch.values)) {
        values = batch.values;
      } else if (!Object.prototype.hasOwnProperty.call(batch, "values") && typeof batch === "object") {
        values = batch;
      } else {
        values = {};
      }
      Object.keys(values).forEach((k) => {
        if (k === "cursor" || k === "values") return;
        state.intervals[k] = values[k];
      });
      if (batch.cursor && (!state.intervalCursor || batch.cursor > state.intervalCursor)) {
        state.intervalCursor = batch.cursor;
      }
    }
    return state.intervals;
  }

  // OpenF1's own live window: 30 min before date_start until 30 min after
  // date_end (https://openf1.org/ FAQ). Without a date_end (an old cached
  // session row) the length is guessed: a race 4 h, anything else 2 h.
  const LIVE_PAD_MS = 30 * 60 * 1000;
  function sessionStatus(meta, now) {
    const start = Date.parse(meta && meta.dateStart);
    if (!isFinite(start)) return "LIVE";
    const at = now == null ? Date.now() : now;
    let end = Date.parse(meta && meta.dateEnd);
    if (isFinite(end) && end >= start) {
      if (at < start - LIVE_PAD_MS) return "UPCOMING";
      return at <= end + LIVE_PAD_MS ? "LIVE" : "COMPLETED";
    }
    if (start > at) return "UPCOMING";
    const type = String((meta && meta.type) || "").toLowerCase();
    end = start + (type === "race" ? 4 : 2) * 60 * 60 * 1000;
    return at <= end ? "LIVE" : "COMPLETED";
  }

  function sessionTimeLabel(meta, phase, fmtDateTime, now) {
    if (!meta || !meta.dateStart) return "";
    // The LIVE badge opens 30 min before the start: the verb follows the clock.
    const at = now == null ? Date.now() : now;
    const verb = phase === "UPCOMING" || Date.parse(meta.dateStart) > at ? "Starts " : "Started ";
    return verb + fmtDateTime(meta.dateStart);
  }

  // Which requests one LIVE refresh makes. A FINISHED session's first build
  // reads the cached whole-session snapshots (several MB on a phone, so never
  // re-downloaded per build); their cursor then seeds liveState through
  // mergePositionBatch / mergeIntervalBatch, and every later refresh is a delta.
  function liveFeedRequests(api, sessionKey, state, phase) {
    const seed = phase === "COMPLETED";
    return {
      position: seed && !state.positionCursor && api.sessionPositions
        ? api.sessionPositions(sessionKey)
        : api.livePositions(sessionKey, state.positionCursor),
      interval: seed && !state.intervalCursor && api.sessionIntervals
        ? api.sessionIntervals(sessionKey)
        : api.liveIntervals(sessionKey, state.intervalCursor)
    };
  }

  function create({
    el, clear, emptyMsg, spinner, ensureSession, sel, buildPicker,
    invalidateOther, fmtDateTime, findTeam, cssColor, textColorOn, NO_LIVE_MSG
  }) {
    const LIVE_REFRESH = 30 * 1000;
    let liveTimer = null;
    let liveRefreshGen = 0;
    const liveOpts = { auto: false, sort: "pos" };
    let armAuto = null;

    function stopLiveAuto() {
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    }

    // Hub close: an in-flight refresh's settlement arm re-schedules through
    // armAuto, and on CLOSE (unlike a tab switch) the live DOM stays attached
    // under the hidden root — so every guard passed and the 30 s OpenF1 loop
    // ran forever. Nulling armAuto fails the identity check in both the
    // settlement arm and the timer; reopening re-arms via renderLiveBody.
    function disarmLiveAuto() {
      stopLiveAuto();
      armAuto = null;
    }

    function resumeLiveAuto() {
      if (!liveOpts.auto || liveTimer || !armAuto) return;
      armAuto();
    }

    const SENTINEL = "dh-live-sentinel";
    function makeSentinel() {
      if (typeof customElements === "undefined") return null;
      if (!customElements.get(SENTINEL)) {
        customElements.define(SENTINEL, class extends HTMLElement {
          connectedCallback() {
            // Fires mid-appendChild — a resume failure must not break the
            // hub's tab switch, and there is nothing to tell the player.
            try { resumeLiveAuto(); } catch (e) { /* see above */ }
          }
        });
      }
      const s = document.createElement(SENTINEL);
      s.hidden = true;
      return s;
    }

    function loadLive() {
      return ensureSession(true).then(function () {
        const wrap = el("div", "dh-tabbody dh-split");
        const leftPane = el("div", "dh-split-L");
        const rightPane = el("div", "dh-split-R");
        leftPane.appendChild(buildPicker(function (meta) {
          renderLiveBody(meta, leftPane, rightPane);
          invalidateOther("live");
        }));
        wrap.appendChild(leftPane);
        wrap.appendChild(rightPane);
        renderLiveBody(sel.meta, leftPane, rightPane);
        return wrap;
      });
    }

    function renderLiveBody(meta, leftPane, rightPane) {
      stopLiveAuto();
      ++liveRefreshGen;
      while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
      clear(rightPane);
      if (!meta || meta.sessionKey == null) { armAuto = null; rightPane.appendChild(emptyMsg(NO_LIVE_MSG)); return; }

      const info = el("div", "dh-livecard");
      const infoTitle = el("div", "dh-live-title");
      infoTitle.appendChild(el("span", null, meta.name || meta.type || "Session"));
      if (meta.type && meta.type !== meta.name) infoTitle.appendChild(el("span", "dh-live-type", meta.type));
      const stateBadge = el("span", "dh-live-state");
      infoTitle.appendChild(stateBadge);
      info.appendChild(infoTitle);
      const place = DataTabUtils.placeLabel(meta.circuit, meta.country, " · ");
      if (place) info.appendChild(el("div", "dh-live-sub", place));
      const timeLabel = el("div", "dh-live-sub");
      if (meta.dateStart) info.appendChild(timeLabel);
      leftPane.appendChild(info);
      function paintPhase() {
        const phase = sessionStatus(meta);
        stateBadge.textContent = phase;
        stateBadge.setAttribute("data-state", phase.toLowerCase());
        timeLabel.textContent = sessionTimeLabel(meta, phase, fmtDateTime);
        return phase;
      }

      const bar = el("div", "dh-livecontrols");
      const refreshBtn = el("button", "dh-livebtn", "↻ REFRESH");
      refreshBtn.type = "button";
      const autoBtn = el("button", "dh-livebtn" + (liveOpts.auto ? " active" : ""), "AUTO");
      autoBtn.type = "button";
      autoBtn.title = "Auto-refresh every 30s";
      autoBtn.setAttribute("data-aria-toggle", "");
      autoBtn.setAttribute("aria-pressed", liveOpts.auto ? "true" : "false");
      const stamp = el("span", "dh-live-updated", "");
      bar.appendChild(refreshBtn);
      bar.appendChild(autoBtn);
      bar.appendChild(stamp);
      leftPane.appendChild(bar);

      const dataEl = el("div", "dh-tabbody");
      rightPane.appendChild(dataEl);

      let refreshPromise = null;
      let scheduleAuto = null;
      let sortControls = {};
      const liveState = {
        positionCursor: null, intervalCursor: null,
        positions: new Map(), intervals: Object.create(null),
        okAt: 0,          // when a position or interval request last settled ok
      };

      function refresh() {
        if (refreshPromise) return refreshPromise;
        const phase = paintPhase();
        if (liveOpts.auto) stopLiveAuto();
        const myGen = ++liveRefreshGen;
        const priorState = dataEl.getAttribute("data-state");
        const hadData = priorState === "ready" || priorState === "empty" || priorState === "partial" || priorState === "stale";
        if (!hadData) { clear(dataEl); dataEl.appendChild(spinner()); }
        dataEl.setAttribute("aria-busy", "true");
        const settle = (promise) => promise.then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        );
        // AUTO (and manual refresh) must not hit the 10 min TTL_LATEST cache —
        // otherwise a 30 s loop silently re-serves the same payload. ttl:0
        // bypasses the read (api.js request) while still writing on success.
        const ttl = 0;
        const feed = liveFeedRequests(F1API, meta.sessionKey, liveState, phase);
        const positionReq = feed.position;
        const intervalReq = feed.interval;
        refreshPromise = Promise.all([
          settle(F1API.weather(meta.sessionKey, ttl)),
          settle(positionReq),
          settle(F1API.sessionDrivers(meta.sessionKey)),
          settle(intervalReq)
        ]).then(batch => {
          if (myGen !== liveRefreshGen) return;
          paintPhase();
          dataEl.setAttribute("aria-busy", "false");
          const failed = batch.filter((x) => !x.ok);
          if (batch[1].ok || batch[3].ok) liveState.okAt = Date.now();
          const gate = failed.find((x) => DataTabUtils.liveLockout(x.error));
          if (failed.length === batch.length || gate) {
            if (!hadData) clear(dataEl);
            else {
              const oldFailure = dataEl.querySelector && dataEl.querySelector(".dh-error[data-refresh-error]");
              if (oldFailure && oldFailure.parentNode) oldFailure.parentNode.removeChild(oldFailure);
            }
            const failure = el("div", "dh-error");
            failure.setAttribute("role", "status");
            failure.setAttribute("data-refresh-error", "");
            failure.setAttribute("data-state", hadData ? "stale" : "failed");
            if (gate) {
              const title = el("div", "dh-error-msg", DataTabUtils.LOCKOUT_TITLE);
              title.dataset.role = "title";
              failure.dataset.reason = "live-auth";
              failure.appendChild(title);
            }
            failure.appendChild(el("div", "dh-error-msg", gate
              ? DataTabUtils.LOCKOUT_MSG
              : (hadData ? "Couldn't refresh live data. Showing the last update."
                : "Couldn't load live data. Try again.")));
            if (hadData && dataEl.firstChild) dataEl.insertBefore(failure, dataEl.firstChild);
            else dataEl.appendChild(failure);
            dataEl.setAttribute("data-state", hadData ? "stale" : "failed");
            if (gate) {
              liveOpts.auto = false;
              autoBtn.classList.remove("active");
              autoBtn.setAttribute("aria-pressed", "false");
              stopLiveAuto();
            }
            return;
          }
          // Ownership is checked at settlement: the player may have moved
          // focus while this batch was loading, or closed/left the LIVE tab.
          const focusedSort = dataEl.isConnected && armAuto === scheduleAuto
            ? Object.keys(sortControls).find(key => sortControls[key] === document.activeElement) : null;
          clear(dataEl);
          if (failed.length) {
            const partial = el("div", "dh-error");
            partial.setAttribute("role", "status");
            partial.setAttribute("data-state", "partial");
            partial.appendChild(el("div", "dh-error-msg", "Some live data couldn't refresh."));
            dataEl.appendChild(partial);
          }
          const res = batch.map((x) => x.ok ? x.value : null);
          const positions = mergePositionBatch(liveState, res[1]);
          const gaps = mergeIntervalBatch(liveState, res[3]);
          if (positions && gaps) {
            positions.forEach(p => {
              if (p.num != null && Object.prototype.hasOwnProperty.call(gaps, p.num)) {
                p.timeDiff = gaps[p.num];
              }
            });
          }
          sortControls = fillLive(dataEl, res[0], positions, res[2]) || {};
          if (focusedSort && sortControls[focusedSort]) sortControls[focusedSort].focus({ preventScroll: true });
          dataEl.setAttribute("data-state", failed.length ? "partial"
            : (positions && positions.length ? "ready" : "empty"));
          // The stamp is the last position/interval answer, not this paint:
          // a batch where only weather or drivers came back keeps the old time.
          if (liveState.okAt) {
            stamp.textContent = "updated " + new Date(liveState.okAt)
              .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          }
        }).finally(() => {
          dataEl.setAttribute("aria-busy", "false");
          refreshPromise = null;
          // Settlement-driven scheduling: the 30 seconds starts after this
          // batch finishes, never while it is still occupying F1API's queue.
          if (liveOpts.auto && armAuto === scheduleAuto && dataEl.isConnected) scheduleAuto();
        });
        return refreshPromise;
      }

      refreshBtn.addEventListener("click", refresh);
      autoBtn.addEventListener("click", () => {
        liveOpts.auto = !liveOpts.auto;
        autoBtn.classList.toggle("active", liveOpts.auto);
        autoBtn.setAttribute("aria-pressed", liveOpts.auto ? "true" : "false");
        stopLiveAuto();
        resumeLiveAuto();
      });
      scheduleAuto = () => {
        stopLiveAuto();
        if (!liveOpts.auto || armAuto !== scheduleAuto) return;
        // An in-flight batch owns scheduling through its finally arm above.
        if (refreshPromise) return;
        liveTimer = setTimeout(() => {
          liveTimer = null;
          if (!liveOpts.auto || armAuto !== scheduleAuto || !dataEl.isConnected) return;
          if (document.hidden) { scheduleAuto(); return; }
          refresh();
        }, LIVE_REFRESH);
      };
      armAuto = scheduleAuto;
      const sentinel = makeSentinel();
      if (sentinel) bar.appendChild(sentinel);
      resumeLiveAuto();
      refresh();
    }

    function fillLive(body, weather, positions, drivers) {
      if (weather) {
        const wx = el("div", "dh-livecard dh-weather");
        wx.appendChild(el("h3", "dh-section", "WEATHER"));
        const grid = el("div", "dh-wx-grid");
        const items = [
          ["AIR", weather.airT !== null ? weather.airT + "°C" : null],
          ["TRACK", weather.trackT !== null ? weather.trackT + "°C" : null],
          ["HUMIDITY", weather.humidity !== null ? weather.humidity + "%" : null],
          ["RAIN", weather.rainfall !== null ? (weather.rainfall > 0 ? "YES" : "NO") : null],
          ["WIND", weather.windSpeed !== null ? weather.windSpeed + " m/s" : null]
        ];
        items.forEach(it => {
          if (it[1] === null) return;
          const cell = el("div", "dh-wx-cell");
          cell.appendChild(el("div", "dh-wx-label", it[0]));
          cell.appendChild(el("div", "dh-wx-value", it[1]));
          grid.appendChild(cell);
        });
        wx.appendChild(grid);
        body.appendChild(wx);
      }

      if (!positions || !positions.length) {
        body.appendChild(emptyMsg(NO_LIVE_MSG));
        return;
      }
      const byNum = {};
      (drivers || []).forEach(d => {
        if (d && d.num != null) byNum[d.num] = d;
      });

      const sec = el("div", "dh-livecard");
      const head = el("div", "dh-class-head");
      head.appendChild(el("h3", "dh-section", "CLASSIFICATION"));
      const sorts = el("div", "dh-sorts");
      const sortBtns = {};
      [["pos", "POS"], ["team", "TEAM"]].forEach(s => {
        const b = el("button", "dh-sortbtn", s[1]);
        b.type = "button";
        b.addEventListener("click", () => { liveOpts.sort = s[0]; renderRows(); });
        sortBtns[s[0]] = b;
        sorts.appendChild(b);
      });
      head.appendChild(sorts);
      sec.appendChild(head);

      const rows = el("div", "dh-class-rows");
      sec.appendChild(rows);
      body.appendChild(sec);

      function teamOf(p) { return (byNum[p.num] || {}).team || ""; }
      function posOf(p) { return (p.pos === null || p.pos === undefined) ? 999 : p.pos; }

      function renderRows() {
        for (const k in sortBtns) {
          const on = k === liveOpts.sort;
          sortBtns[k].classList.toggle("active", on);
          sortBtns[k].setAttribute("aria-pressed", on ? "true" : "false");
        }
        clear(rows);
        const list = positions.slice();
        if (liveOpts.sort === "team") {
          list.sort((a, b) => teamOf(a).localeCompare(teamOf(b)) || (posOf(a) - posOf(b)));
        } else {
          list.sort((a, b) => posOf(a) - posOf(b));
        }

        let maxGap = 0;
        if (liveOpts.sort === "pos" && list.length > 0) {
          list.forEach(p => {
            if (typeof p.timeDiff === "number" && p.timeDiff > maxGap) maxGap = p.timeDiff;
          });
        }

        list.forEach(p => {
          const d = byNum[p.num] || {};
          const row = el("div", "dh-row");

          const mainInfo = el("div", "dh-cons-main");
          mainInfo.appendChild(el("span", "dh-pos", p.pos != null ? p.pos : "—"));
          const chip = el("span", "dh-codechip", d.code || (p.num != null ? "#" + p.num : "—"));
          const col = DataTabUtils.driverColor(d, findTeam, null);
          chip.style.background = cssColor(col);
          chip.style.color = textColorOn(col);
          mainInfo.appendChild(chip);
          mainInfo.appendChild(el("span", "dh-name", d.name || "—"));
          mainInfo.appendChild(el("span", "dh-td-team dh-live-team", d.team || ""));
          row.appendChild(mainInfo);

          if (liveOpts.sort === "pos" && p.pos !== 1 && typeof p.timeDiff === "number" && maxGap > 0) {
            const gapWrap = el("div", "dh-live-gapwrap");
            const gapBar = el("div", "dh-live-gapbar");
            gapBar.style.width = Math.min(100, (p.timeDiff / maxGap) * 100) + "%";
            gapBar.style.backgroundColor = cssColor(col);
            gapWrap.appendChild(gapBar);
            const gapLbl = el("span", "dh-live-gaplbl", "+" + p.timeDiff.toFixed(3));
            gapWrap.appendChild(gapLbl);
            row.appendChild(gapWrap);
          } else if (liveOpts.sort === "pos" && typeof p.timeDiff === "string") {
            const gapWrap = el("div", "dh-live-gapwrap");
            gapWrap.appendChild(el("span", "dh-live-gaplbl", p.timeDiff));
            row.appendChild(gapWrap);
          }

          rows.appendChild(row);
        });
      }
      renderRows();
      return sortBtns;
    }

    return { loadLive, stopLiveAuto, disarmLiveAuto };
  }
  return {
    create,
    _mergePositionBatch: mergePositionBatch,
    _mergeIntervalBatch: mergeIntervalBatch,
    _sessionStatus: sessionStatus,
    _sessionTimeLabel: sessionTimeLabel,
    _liveFeedRequests: liveFeedRequests
  };
})();
Object.freeze(DataLive);
