const DataLive = (function () {
  "use strict";

  function create({
    el, clear, emptyMsg, spinner, ensureSession, sel, buildPicker,
    invalidateOther, fmtDateTime, findTeam, cssColor, textColorOn, NO_LIVE_MSG
  }) {
    const LIVE_REFRESH = 30 * 1000;
    let liveTimer = null;
    let liveRefreshGen = 0;
    const liveOpts = { auto: false, sort: "pos" };

    function stopLiveAuto() {
      if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    }

    function loadLive() {
      return ensureSession().then(function () {
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
      const stamp = el("span", "dh-live-updated", "");
      bar.appendChild(refreshBtn);
      bar.appendChild(autoBtn);
      bar.appendChild(stamp);
      leftPane.appendChild(bar);

      const dataEl = el("div", "dh-tabbody");
      rightPane.appendChild(dataEl);

      function refresh() {
        const myGen = ++liveRefreshGen;
        clear(dataEl);
        dataEl.appendChild(spinner());
        let gateErr = null;
        function catchLive(err) {
          if (err && err.message && err.message.indexOf("Live F1 session") !== -1) gateErr = err;
          return null;
        }
        Promise.all([
          F1API.weather(meta.sessionKey).catch(catchLive),
          F1API.positions(meta.sessionKey).catch(catchLive),
          F1API.sessionDrivers(meta.sessionKey).catch(catchLive)
        ]).then(res => {
          if (myGen !== liveRefreshGen) return;
          clear(dataEl);
          if (gateErr) {
            dataEl.appendChild(emptyMsg(gateErr.message));
            return;
          }
          fillLive(dataEl, res[0], res[1], res[2]);
          stamp.textContent = "updated " + new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        }, () => {
          if (myGen !== liveRefreshGen) return;
          clear(dataEl); dataEl.appendChild(emptyMsg(NO_LIVE_MSG));
        });
      }

      refreshBtn.addEventListener("click", refresh);
      autoBtn.addEventListener("click", () => {
        liveOpts.auto = !liveOpts.auto;
        autoBtn.classList.toggle("dh-active", liveOpts.auto);
        stopLiveAuto();
        if (liveOpts.auto) {
          liveTimer = setInterval(() => { if (dataEl.isConnected) refresh(); }, LIVE_REFRESH);
        }
      });
      if (liveOpts.auto) {
        liveTimer = setInterval(() => { if (dataEl.isConnected) refresh(); }, LIVE_REFRESH);
      }
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
        for (const k in sortBtns) sortBtns[k].classList.toggle("dh-active", k === liveOpts.sort);
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
            if (p.timeDiff && p.timeDiff > maxGap) maxGap = p.timeDiff;
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

          if (liveOpts.sort === "pos" && p.pos !== 1 && p.timeDiff && maxGap > 0) {
            const gapWrap = el("div", "dh-live-gapwrap");
            const gapBar = el("div", "dh-live-gapbar");
            gapBar.style.width = Math.min(100, (p.timeDiff / maxGap) * 100) + "%";
            gapBar.style.backgroundColor = cssColor(col);
            gapWrap.appendChild(gapBar);
            const gapLbl = el("span", "dh-live-gaplbl", "+" + p.timeDiff.toFixed(3));
            gapWrap.appendChild(gapLbl);
            row.appendChild(gapWrap);
          }

          rows.appendChild(row);
        });
      }
      renderRows();
    }

    return { loadLive, stopLiveAuto };
  }
  return { create };
})();
