const DataResults = (function () {
  "use strict";

  function kindOf(meta) {
    const t = (String((meta && meta.name) || "") + " " +
               String((meta && meta.type) || "")).toLowerCase();
    if (t.indexOf("qual") !== -1) return "qualifying";
    if (t.indexOf("practice") !== -1) return "practice";
    return "race";
  }

  function qLabel(meta, i) {
    const t = String((meta && meta.name) || "").toLowerCase();
    return (t.indexOf("sprint") !== -1 ? "SQ" : "Q") + (i + 1);
  }

  const fmtLap = (s) => Dom.fmtLap(s, null);

  function fmtClock(s) {
    if (typeof s !== "number" || !isFinite(s) || s <= 0) return null;
    return Dom.fmtRaceClock(s);
  }

  function fmtGap(v) {
    if (typeof v === "string") return v;
    if (typeof v !== "number" || !isFinite(v)) return null;
    if (v <= 0) return "—";
    return "+" + v.toFixed(3);
  }

  function statusOf(r) {
    if (r.dsq) return "DSQ";
    if (r.dns) return "DNS";
    if (r.dnf) return "DNF";
    return null;
  }

  function qSlot(r, i) {
    const v = Array.isArray(r.duration) ? r.duration[i] : null;
    return (typeof v === "number" && isFinite(v) && v > 0) ? v : null;
  }
  function qGap(r, i) {
    const v = Array.isArray(r.gap) ? r.gap[i] : null;
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }

  function deepest(r) {
    for (let i = 2; i >= 0; i--) if (qSlot(r, i) !== null) return i;
    return -1;
  }

  function roundsRan(rows) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (rows.some(function (r) { return qSlot(r, i) !== null; })) out.push(i);
    }
    return out;
  }

  const FETCH_FAIL_MSG = "Couldn't load this session's classification. " +
    "Pick it again in a moment — the free F1 API rate-limits hard.";

  function create({ el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
                    invalidateOther, teamChip, fmtDateTime, NO_RESULT_MSG, onOutcome }) {
    let bodyGen = 0;
    let round = "all";

    function loadResults() {
      return ensureSession(false).then(function () {
        const wrap = el("div", "dh-tabbody");
        const body = el("div", "dh-res-body");
        wrap.appendChild(buildPicker(function (meta) {
          renderBody(meta, body, wrap);
          invalidateOther("results");
        }));
        wrap.appendChild(body);
        if (sel.sessionKey === null) {
          body.appendChild(emptyMsg(NO_RESULT_MSG));
          return wrap;
        }
        renderBody(sel.meta, body, wrap);
        return wrap;
      });
    }

    function renderBody(meta, body, wrap) {
      const myGen = ++bodyGen;
      const staleApi = typeof F1API.staleMark === "function" && typeof F1API.staleSince === "function" ? F1API : null;
      const mark = staleApi ? staleApi.staleMark() : 0;
      function publish(status, error) {
        const dataAt = (status === "ready" || status === "empty") && staleApi ? staleApi.staleSince(mark) : null;
        wrap.tabOutcome = { status, error: error || null, at: Date.now(), dataAt, offlineCopy: dataAt != null,
          hasData: status === "ready" };
        if (onOutcome) onOutcome(wrap);
      }
      round = "all";
      clear(body);
      if (!meta || meta.sessionKey == null) {
        body.appendChild(emptyMsg(NO_RESULT_MSG));
        publish("empty");
        return;
      }
      body.appendChild(header(meta));
      const slot = el("div");
      slot.appendChild(spinner());
      body.appendChild(slot);
      publish("loading");

      const key = meta.sessionKey;
      Promise.all([
        F1API.sessionResult(key),
        F1API.sessionDrivers(key).then(null, function () { return null; })
      ]).then(function (both) {
        if (myGen !== bodyGen) return;
        paint(meta, both[0] || [], both[1] || [], slot);
        publish(both[0] && both[0].length ? "ready" : "empty");
      }, function (err) {
        if (myGen !== bodyGen) return;
        clear(slot);
        slot.appendChild(emptyMsg(FETCH_FAIL_MSG));
        publish("failed", err);
      });
    }

    function paint(meta, rows, drivers, slot) {
      clear(slot);
      if (!rows.length) { slot.appendChild(emptyMsg(NO_RESULT_MSG)); return; }
      const byNum = {};
      drivers.forEach(function (d) { if (d && d.num !== null) byNum[d.num] = d; });

      if (kindOf(meta) === "qualifying") {
        const ran = roundsRan(rows);
        if (ran.length > 1) {
          slot.appendChild(rounds(meta, ran, function (r) {
            round = r;
            paint(meta, rows, drivers, slot);
          }));
        }
        if (round !== "all" && ran.indexOf(round) === -1) round = "all";
        slot.appendChild(round === "all" ? qualiTable(meta, rows, byNum)
                                         : roundTable(meta, rows, byNum, round));
        return;
      }
      round = "all";
      slot.appendChild(flatTable(meta, rows, byNum));
    }

    function header(meta) {
      const head = el("div");
      head.id = "dh-lr-head";
      head.appendChild(el("div", "dh-lr-name", meta.name || meta.type || "Session"));
      const parts = [];
      const place = DataTabUtils.placeLabel(meta.circuit, meta.country);
      if (place) parts.push(place);
      if (meta.dateStart) parts.push(fmtDateTime(meta.dateStart));
      head.appendChild(el("div", "dh-lr-meta", parts.join(" · ")));
      return head;
    }

    function rounds(meta, ran, onPick) {
      const box = el("div", "dh-rounds");
      const opts = [["all", "OVERALL"]].concat(ran.map(function (i) {
        return [i, qLabel(meta, i)];
      }));
      opts.forEach(function (o) {
        const b = el("button", "dh-pill" + (o[0] === round ? " active" : ""), o[1]);
        b.type = "button";
        b.setAttribute("aria-pressed", o[0] === round ? "true" : "false");
        b.addEventListener("click", function () { if (o[0] !== round) onPick(o[0]); });
        box.appendChild(b);
      });
      return box;
    }

    function tableHead(cols) {
      const thead = el("thead");
      const hr = el("tr");
      cols.forEach(function (h) { hr.appendChild(el("th", h[1], h[0])); });
      thead.appendChild(hr);
      return thead;
    }

    function tableWrap(t) {
      const wrap = el("div");
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", "Classification");
      wrap.setAttribute("data-xscroll", "");
      wrap.appendChild(t);
      return wrap;
    }

    function cutRow(span, text) {
      const tr = el("tr", "dh-cut");
      const td = el("td", null, text);
      td.colSpan = span;
      tr.appendChild(td);
      return tr;
    }

    function driverTag(r, byNum) {
      const d = byNum[r.num] || {};
      return d.code || (r.num !== null ? "#" + r.num : "—");
    }

    function driverCells(tr, r, byNum) {
      const d = byNum[r.num] || {};
      const who = d.name || (r.num !== null ? "Car " + r.num : "—");
      const tdDrv = el("td", "dh-td-driver");
      tdDrv.appendChild(teamChip(d.code || (r.num !== null ? "#" + r.num : "—"), d.team));
      tdDrv.appendChild(el("span", "dh-name", who));
      tdDrv.title = who;
      tr.appendChild(tdDrv);
      const tdTeam = el("td", "dh-td-team", d.team || "—");
      tdTeam.title = d.team || "";
      tr.appendChild(tdTeam);
    }

    function podium(tr, pos) {
      if (pos === 1) tr.classList.add("dh-lr-p1");
      else if (pos === 2) tr.classList.add("dh-lr-p2");
      else if (pos === 3) tr.classList.add("dh-lr-p3");
    }

    function byPos(rows) {
      return rows.slice().sort(function (a, b) {
        if (a.pos === b.pos) return 0;
        if (a.pos === null) return 1;
        if (b.pos === null) return -1;
        return a.pos - b.pos;
      });
    }

    function flatTable(meta, rows, byNum) {
      const kind = kindOf(meta);
      const cols = [["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"],
                    ["LAPS", "dh-th-grid"]];
      cols.push(kind === "practice" ? ["BEST", null] : ["TIME", null]);
      cols.push(["GAP", null]);
      if (kind === "race") cols.push(["PTS", null]);

      const t = el("table", "dh-table");
      t.appendChild(tableHead(cols));
      const tbody = el("tbody");
      byPos(rows).forEach(function (r) {
        const tr = el("tr");
        podium(tr, r.pos);
        tr.appendChild(el("td", "dh-td-pos", r.pos !== null ? r.pos : "—"));
        driverCells(tr, r, byNum);
        tr.appendChild(el("td", "dh-td-grid", r.laps !== null ? r.laps : "—"));
        const status = statusOf(r);
        const time = kind === "practice" ? fmtLap(r.duration) : fmtClock(r.duration);
        tr.appendChild(el("td", "dh-td-time", status || time || "—"));
        const gap = typeof r.gap === "string" && r.gap && !status ? r.gap : (time && fmtGap(r.gap)) || "—";
        tr.appendChild(el("td", "dh-td-time", gap));
        if (kind === "race") tr.appendChild(el("td", "dh-td-pts", r.points !== null ? r.points : ""));
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
      return tableWrap(t);
    }

    function qualiTable(meta, rows, byNum) {
      const t = el("table", "dh-table");
      t.appendChild(tableHead([["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"],
                          [qLabel(meta, 0), null], [qLabel(meta, 1), null], [qLabel(meta, 2), null]]));
      const tbody = el("tbody");
      let prev = null;
      byPos(rows).forEach(function (r) {
        const dp = deepest(r);
        if (prev !== null && dp < prev) {
          tbody.appendChild(cutRow(6, dp < 0 ? "NO TIME SET"
            : "ELIMINATED IN " + qLabel(meta, dp) + " · P" + r.pos + " MAY HAVE ADVANCED WITHOUT A TIME"));
        }
        prev = dp;
        const tr = el("tr");
        podium(tr, r.pos);
        tr.appendChild(el("td", "dh-td-pos", r.pos !== null ? r.pos : "—"));
        driverCells(tr, r, byNum);
        for (let i = 0; i < 3; i++) {
          tr.appendChild(el("td", "dh-td-time", fmtLap(qSlot(r, i)) || "—"));
        }
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
      return tableWrap(t);
    }

    function roundTable(meta, rows, byNum, i) {
      const ran = rows.filter(function (r) { return qSlot(r, i) !== null; })
                      .sort(function (a, b) { return qSlot(a, i) - qSlot(b, i); });
      if (!ran.length) return emptyMsg(NO_RESULT_MSG);

      let lastThrough = -1;
      if (i < 2) {
        ran.forEach(function (r, n) { if (qSlot(r, i + 1) !== null) lastThrough = n; });
      }

      const t = el("table", "dh-table");
      t.appendChild(tableHead([["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"],
                          [qLabel(meta, i), null], ["GAP", null]]));
      const tbody = el("tbody");
      ran.forEach(function (r, n) {
        const tr = el("tr");
        podium(tr, n + 1);
        tr.appendChild(el("td", "dh-td-pos", n + 1));
        driverCells(tr, r, byNum);
        tr.appendChild(el("td", "dh-td-time", fmtLap(qSlot(r, i))));
        tr.appendChild(el("td", "dh-td-time", fmtGap(qGap(r, i)) || "—"));
        tbody.appendChild(tr);
        if (n === lastThrough) {
          const nx = ran[n + 1];
          tbody.appendChild(cutRow(5, "ELIMINATED IN " + qLabel(meta, i) +
            (nx ? " · " + (driverTag(nx, byNum)) + " MAY HAVE ADVANCED WITHOUT A TIME" : "")));
        }
      });
      t.appendChild(tbody);
      return tableWrap(t);
    }

    return { loadResults };
  }

  return { create };
})();
Object.freeze(DataResults);
