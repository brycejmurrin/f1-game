/* Apex 26 — the data hub's RESULTS tab: classification for ANY session of any 2023+ weekend (practice, qualifying, sprint, race), not just the latest Grand Prix. */
const DataResults = (function () {
  "use strict";

  // Practice, race and sprint report one scalar; qualifying reports the
  // [Q1,Q2,Q3] triple. The SHAPE of `duration` is what picks the columns —
  // session_name is free text ("Sprint Qualifying", "Practice 2") and the
  // OpenF1 session_type collapses Sprint into "Race", so neither is enough
  // on its own.
  function kindOf(meta) {
    const t = (String((meta && meta.name) || "") + " " +
               String((meta && meta.type) || "")).toLowerCase();
    if (t.indexOf("qual") !== -1) return "qualifying";
    if (t.indexOf("practice") !== -1) return "practice";
    return "race";                       // Race and Sprint both classify on points
  }

  // Lap time: 1:21.163, or 58.402 under the minute.
  function fmtLap(s) {
    if (typeof s !== "number" || !isFinite(s) || s <= 0) return null;
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m ? m + ":" + (r < 10 ? "0" : "") + r.toFixed(3) : r.toFixed(3);
  }

  // Race distance: 2:04:44.859 (an hour is not guaranteed — a red-flagged
  // sprint can come in under one).
  function fmtClock(s) {
    if (typeof s !== "number" || !isFinite(s) || s <= 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s - h * 3600) / 60);
    const r = s - h * 3600 - m * 60;
    const mm = (h && m < 10 ? "0" : "") + m;
    return (h ? h + ":" : "") + mm + ":" + (r < 10 ? "0" : "") + r.toFixed(3);
  }

  function fmtGap(v) {
    if (typeof v === "string") return v;          // "+1 LAP" and friends arrive pre-formatted
    if (typeof v !== "number" || !isFinite(v)) return null;
    if (v <= 0) return "—";                       // the leader's own gap
    return "+" + v.toFixed(3);
  }

  function statusOf(r) {
    if (r.dsq) return "DSQ";
    if (r.dns) return "DNS";
    if (r.dnf) return "DNF";
    return null;
  }

  // Qualifying's arrays are [Q1,Q2,Q3]; anything else reads the scalar.
  function qSlot(r, i) {
    return Array.isArray(r.duration) ? r.duration[i] : null;
  }

  const FETCH_FAIL_MSG = "Couldn't load this session's classification. " +
    "Pick it again in a moment — the free F1 API rate-limits hard.";

  function create({ el, clear, emptyMsg, spinner, sel, ensureSession, buildPicker,
                    invalidateOther, teamChip, fmtDateTime, NO_RESULT_MSG }) {
    let bodyGen = 0;

    function loadResults() {
      return ensureSession(false).then(function () {
        const wrap = el("div", "dh-tabbody");
        const body = el("div", "dh-res-body");
        wrap.appendChild(buildPicker(function (meta) {
          renderBody(meta, body);
          invalidateOther("results");
        }));
        wrap.appendChild(body);
        if (sel.sessionKey === null) {
          body.appendChild(emptyMsg(NO_RESULT_MSG));
          return wrap;
        }
        renderBody(sel.meta, body);
        return wrap;
      });
    }

    // Async and re-entrant: every pick in the picker lands here, so an
    // in-flight fetch for the session the player just moved off must not
    // paint over the newer one.
    function renderBody(meta, body) {
      const myGen = ++bodyGen;
      clear(body);
      if (!meta || meta.sessionKey === null || meta.sessionKey === undefined) {
        body.appendChild(emptyMsg(NO_RESULT_MSG));
        return;
      }
      body.appendChild(header(meta));
      const slot = el("div");
      slot.appendChild(spinner());
      body.appendChild(slot);

      const key = meta.sessionKey;
      // The driver list is a nicety (names, teams, colours) — a session whose
      // /drivers has not been published still classifies by car number.
      Promise.all([
        F1API.sessionResult(key),
        F1API.sessionDrivers(key).then(null, function () { return null; })
      ]).then(function (both) {
        if (myGen !== bodyGen) return;
        clear(slot);
        slot.appendChild(table(meta, both[0] || [], both[1] || []));
      }, function () {
        // NOT the empty-tab copy. "Nothing published yet" and "OpenF1 rate-limited
        // that request" look identical to a player, and only one of them is worth
        // pressing the tab again for — api.js resolves the unpublished case with
        // an empty list, so a REJECTION here always means the fetch itself failed.
        if (myGen !== bodyGen) return;
        clear(slot);
        slot.appendChild(emptyMsg(FETCH_FAIL_MSG));
      });
    }

    function header(meta) {
      const head = el("div");
      head.id = "dh-lr-head";
      head.appendChild(el("div", "dh-lr-name", meta.name || meta.type || "Session"));
      const parts = [];
      const place = [meta.circuit, meta.country].filter(Boolean).join(", ");
      if (place) parts.push(place);
      if (meta.dateStart) parts.push(fmtDateTime(meta.dateStart));
      head.appendChild(el("div", "dh-lr-meta", parts.join(" · ")));
      return head;
    }

    function columns(kind) {
      const cols = [["POS", null], ["DRIVER", null], ["TEAM", "dh-th-team"]];
      if (kind === "qualifying") return cols.concat([["Q1", null], ["Q2", null], ["Q3", null]]);
      if (kind === "practice") return cols.concat([["LAPS", "dh-th-grid"], ["BEST", null], ["GAP", null]]);
      return cols.concat([["LAPS", "dh-th-grid"], ["TIME", null], ["GAP", null], ["PTS", null]]);
    }

    function table(meta, rows, drivers) {
      if (!rows.length) return emptyMsg(NO_RESULT_MSG);
      const kind = kindOf(meta);
      const byNum = {};
      drivers.forEach(function (d) { if (d && d.num !== null) byNum[d.num] = d; });

      const wrap = el("div");
      const t = el("table", "dh-table");
      const thead = el("thead");
      const hr = el("tr");
      columns(kind).forEach(function (h) { hr.appendChild(el("th", h[1], h[0])); });
      thead.appendChild(hr);
      t.appendChild(thead);

      // A null position is "not classified" (retired, withdrawn). Those sort
      // to the bottom in the order OpenF1 sent them, which is furthest-first.
      const sorted = rows.slice().sort(function (a, b) {
        if (a.pos === b.pos) return 0;
        if (a.pos === null) return 1;
        if (b.pos === null) return -1;
        return a.pos - b.pos;
      });

      const tbody = el("tbody");
      sorted.forEach(function (r) {
        const d = byNum[r.num] || {};
        const tr = el("tr");
        if (r.pos === 1) tr.classList.add("dh-lr-p1");
        else if (r.pos === 2) tr.classList.add("dh-lr-p2");
        else if (r.pos === 3) tr.classList.add("dh-lr-p3");

        tr.appendChild(el("td", "dh-td-pos", r.pos !== null ? r.pos : "—"));
        const who = d.name || (r.num !== null ? "Car " + r.num : "—");
        const tdDrv = el("td", "dh-td-driver");
        tdDrv.appendChild(teamChip(d.code || (r.num !== null ? "#" + r.num : "—"), d.team));
        tdDrv.appendChild(el("span", "dh-name", who));
        // Qualifying is three time columns wide, so the fixed table layout can
        // ellipsize a long name — the same `title` fallback the schedule rows use.
        tdDrv.title = who;
        tr.appendChild(tdDrv);
        const tdTeam = el("td", "dh-td-team", d.team || "—");
        tdTeam.title = d.team || "";
        tr.appendChild(tdTeam);

        if (kind === "qualifying") {
          for (let i = 0; i < 3; i++) {
            tr.appendChild(el("td", "dh-td-time", fmtLap(qSlot(r, i)) || "—"));
          }
        } else {
          tr.appendChild(el("td", "dh-td-grid", r.laps !== null ? r.laps : "—"));
          const status = statusOf(r);
          const time = kind === "practice" ? fmtLap(r.duration) : fmtClock(r.duration);
          // A retirement has no duration: the status takes the TIME cell so
          // the row still says WHY, and the gap column stays empty.
          tr.appendChild(el("td", "dh-td-time", time || status || "—"));
          tr.appendChild(el("td", "dh-td-time", (time && fmtGap(r.gap)) || "—"));
          if (kind === "race") {
            tr.appendChild(el("td", "dh-td-pts", r.points !== null ? r.points : ""));
          }
        }
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
      wrap.appendChild(t);
      return wrap;
    }

    return { loadResults };
  }

  return { create };
})();
