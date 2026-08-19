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
      const values = batch.values && typeof batch.values === "object" ? batch.values : batch;
      Object.keys(values || {}).forEach((k) => { state.intervals[k] = values[k]; });
      if (batch.cursor && (!state.intervalCursor || batch.cursor > state.intervalCursor)) {
        state.intervalCursor = batch.cursor;
      }
    }
    return state.intervals;
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

    function lastFetchedAt(sessionKey) {
      let newest = 0;
      try {
        const marker = "session_key=" + encodeURIComponent(sessionKey);
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf("apex26.api.") !== 0) continue;
          const at = key.indexOf(marker);
          if (at === -1) continue;
          const after = key.charAt(at + marker.length);
          if (after && after !== "&") continue;   // session_key=11 must not match =110
          if (!/\/(weather|position|drivers)\?/.test(key)) continue;
          const obj = JSON.parse(localStorage.getItem(key));
          if (obj && typeof obj.t === "number" && obj.t > newest) newest = obj.t;
        }
      } catch (e) { /* no storage: every response was a real fetch */ }
      return newest || null;
    }

    function loadLive() {
      return ensureSession(true).then(function () {
        const wrap = el("div", "dh-tabbody dh-split");
        if (sel.sessionKey === null) { wrap.appendChild(emptyMsg(NO_LIVE_MSG)); return wrap; }
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
      while (leftPane.children.length > 1) leftPane.removeChild(leftPane.lastChild);
      clear(rightPane);

      const info = el("div", "dh-livecard");
      const infoTitle = el("div", "dh-live-title");
      infoTitle.appendChild(el("span", null, meta.name || meta.type || "Session"));
      if (meta.type && meta.type !== meta.name) infoTitle.appendChild(el("span", "dh-live-type", meta.type));
      info.appendChild(infoTitle);
      const place = [meta.circuit, meta.country].filter(Boolean).join(" · ");
      if (place) info.appendChild(el("div", "dh-live-sub", place));
      if (meta.dateStart) info.appendChild(el("div", "dh-live-sub", "Starts " + fmtDateTime(meta.dateStart)));
      leftPane.appendChild(info);

      const bar = el("div", "dh-livecontrols");
      const refreshBtn = el("button", "dh-livebtn", "↻ REFRESH");
      refreshBtn.type = "button";
      const autoBtn = el("button", "dh-livebtn" + (liveOpts.auto ? " dh-active" : ""), "AUTO");
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
      const liveState = {
        positionCursor: null, intervalCursor: null,
        positions: new Map(), intervals: Object.create(null),
      };

      function refresh() {
        if (refreshPromise) return refreshPromise;
        if (liveOpts.auto) stopLiveAuto();
        const myGen = ++liveRefreshGen;
        clear(dataEl);
        dataEl.appendChild(spinner());
        let gateErr = null;
        function catchLive(err) {
          if (!err) return null;
          const msg = err.message || "";
          const status = err.status;
          if (status === 401 || status === 403 ||
              msg.indexOf("Live F1 session") !== -1 ||
              msg.indexOf("HTTP 401") !== -1 ||
              msg.indexOf("HTTP 403") !== -1) {
            gateErr = err;
          }
          return null;
        }
        // AUTO (and manual refresh) must not hit the 10 min TTL_LATEST cache —
        // otherwise a 30 s loop silently re-serves the same payload. ttl:0
        // bypasses the read (api.js request) while still writing on success.
        const ttl = 0;
        const positionReq = F1API.livePositions
          ? F1API.livePositions(meta.sessionKey, liveState.positionCursor)
          : F1API.positions(meta.sessionKey, ttl);
        const intervalReq = F1API.liveIntervals
          ? F1API.liveIntervals(meta.sessionKey, liveState.intervalCursor)
          : F1API.intervals(meta.sessionKey, ttl);
        refreshPromise = Promise.all([
          F1API.weather(meta.sessionKey, ttl).catch(catchLive),
          positionReq.catch(catchLive),
          F1API.sessionDrivers(meta.sessionKey).catch(catchLive),
          intervalReq.catch(catchLive)
        ]).then(res => {
          if (myGen !== liveRefreshGen) return;
          clear(dataEl);
          if (gateErr) {
            dataEl.appendChild(emptyMsg(gateErr.message));
            liveOpts.auto = false;
            autoBtn.classList.remove("dh-active");
            autoBtn.setAttribute("aria-pressed", "false");
            stopLiveAuto();
            return;
          }
          const positions = mergePositionBatch(liveState, res[1]);
          const gaps = mergeIntervalBatch(liveState, res[3]);
          if (positions && gaps) {
            positions.forEach(p => {
              if (p.num !== null && p.num !== undefined && Object.prototype.hasOwnProperty.call(gaps, p.num)) {
                p.timeDiff = gaps[p.num];
              }
            });
          }
          fillLive(dataEl, res[0], positions, res[2]);
          const fetchedAt = lastFetchedAt(meta.sessionKey);
          stamp.textContent = "updated " + new Date(fetchedAt || Date.now())
            .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        }).finally(() => {
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
        autoBtn.classList.toggle("dh-active", liveOpts.auto);
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
        if (d && d.num !== null && d.num !== undefined) byNum[d.num] = d;
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
          sortBtns[k].classList.toggle("dh-active", on);
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
          
          const mainInfo = el("div", "dh-live-row-main");
          mainInfo.appendChild(el("span", "dh-pos", p.pos !== null && p.pos !== undefined ? p.pos : "—"));
          const chip = el("span", "dh-codechip", d.code || (p.num !== null && p.num !== undefined ? "#" + p.num : "—"));
          let col = null;
          if (d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
            col = [parseInt(d.color.slice(0, 2), 16) / 255,
                   parseInt(d.color.slice(2, 4), 16) / 255,
                   parseInt(d.color.slice(4, 6), 16) / 255];
          } else {
            const t = findTeam(d.team);
            col = t ? t.color : null;
          }
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
    }

    return { loadLive, stopLiveAuto };
  }
  return { create, _mergePositionBatch: mergePositionBatch, _mergeIntervalBatch: mergeIntervalBatch };
})();
