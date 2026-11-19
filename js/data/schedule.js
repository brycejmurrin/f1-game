const DataSchedule = (function () {
  "use strict";

  function raceInstant(r) {
    if (!r || !r.date || !r.time) return NaN;
    return Date.parse(`${r.date}T${r.time}`);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const dateOnly = iso.length === 10;
    const d = new Date(dateOnly ? iso + "T12:00:00Z" : iso);
    if (isNaN(d.getTime())) return iso;
    return I18n.date(d, dateOnly ? { day: "numeric", month: "short", timeZone: "UTC" }
                                  : { day: "numeric", month: "short" });
  }

  function dateLabel(r) {
    const at = raceInstant(r);
    return fmtDate(Number.isFinite(at) ? new Date(at).toISOString() : r && r.date);
  }

  const RACE_MS = 4 * 3600 * 1000;
  function isUpcoming(r, now) {
    if (!r || !r.date) return false;
    const at = raceInstant(r);
    if (Number.isFinite(at)) return at + RACE_MS > now;
    return r.date >= new Date(now).toISOString().slice(0, 10);
  }

  function nextRace(items, now) {
    for (const r of items || []) if (isUpcoming(r, now)) return r;
    return null;
  }

  const SESSION_META = Object.freeze({
    fp1: ["FP1", 60], fp2: ["FP2", 60], fp3: ["FP3", 60],
    sq: ["SQ", 45], s: ["S", 30], q: ["Q", 60], r: ["R", 120]
  });

  function weekendSessions(race) {
    if (!race) return [];
    const source = race.sessions || {};
    const out = [];
    for (const key of ["fp1", "fp2", "fp3", "sq", "s", "q", "r"]) {
      const session = source[key] || (key === "r" ? race : null);
      const startMs = raceInstant(session);
      if (!Number.isFinite(startMs)) continue;
      out.push({
        key,
        label: SESSION_META[key][0],
        startMs,
        endMs: startMs + SESSION_META[key][1] * 60 * 1000,
        est: true
      });
    }
    return out.sort(function (a, b) { return a.startMs - b.startMs; });
  }

  function countdown(ms) {
    if (!(ms > 0)) return "STARTED";
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    if (days) return days + "d " + String(hours).padStart(2, "0") + "h " + String(minutes).padStart(2, "0") + "m";
    if (hours) return hours + "h " + String(minutes).padStart(2, "0") + "m " + String(secs).padStart(2, "0") + "s";
    return minutes + "m " + String(secs).padStart(2, "0") + "s";
  }

  function nextFlipAt(items, now) {
    const r = nextRace(items, now);
    if (r) {
      const at = raceInstant(r);
      return Number.isFinite(at) ? at + RACE_MS : Date.parse(r.date + "T00:00:00Z") + 24 * 3600 * 1000;
    }
    return Infinity;
  }

  function bindOverflowTitle(node, text) {
    if (!node || !node.addEventListener) return;
    node.addEventListener("mouseenter", function () {
      if (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) return;
      if (node.scrollWidth > node.clientWidth + 1) node.title = text;
      else if (node.removeAttribute) node.removeAttribute("title");
    });
    node.addEventListener("mouseleave", function () {
      if (node.removeAttribute) node.removeAttribute("title");
    });
  }

  function create({ el, emptyMsg }) {
    function sessionTime(startMs) {
      return I18n.date(new Date(startMs), {
        weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short"
      });
    }

    function keepCountdownAlive(wrap, clock, targetMs) {
      let timer = null, observer = null, disposed = false, shownMinute = null, labelledMinute = null;
      const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

      function tick() {
        const left = targetMs - Date.now();
        const minute = left > 0 ? Math.floor(left / 60000) : -1;
        if (!reduced || minute !== shownMinute) {
          clock.textContent = countdown(left);
          shownMinute = minute;
        }
        if (minute !== labelledMinute) {
          clock.setAttribute("aria-label", left > 0 ? I18n.t("hub.raceStarts", {in: countdown(left)}, "Race starts in {in}") : I18n.t("hub.raceStarted", null, "Race started"));
          labelledMinute = minute;
        }
      }
      function visible() {
        if (!wrap.isConnected) return false;
        for (let n = wrap; n; n = n.parentElement) if (n.hidden) return false;
        return true;
      }
      function dispose() {
        disposed = true;
        if (timer !== null) { clearInterval(timer); timer = null; }
        if (observer) observer.disconnect();
      }
      function sync() {
        if (disposed) return;
        if (visible()) {
          if (timer === null) {
            tick();
            timer = setInterval(tick, 1000);
          }
        } else if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      }

      clock.setAttribute("aria-live", "off");
      clock.setAttribute("role", "timer");
      tick();
      if (typeof MutationObserver === "undefined" || typeof document === "undefined") return dispose;
      observer = new MutationObserver(sync);
      const hub = typeof document.getElementById === "function" ? document.getElementById("datahub") : null;
      if (hub && hub !== document.documentElement) {
        observer.observe(hub, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
        for (let n = hub.parentElement; n; n = n.parentElement) observer.observe(n, { attributes: true, attributeFilter: ["hidden"] });
      } else {
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
      }
      queueMicrotask(sync);
      return dispose;
    }

    function nextTile(race, wrap) {
      const tile = el("section");
      tile.setAttribute("data-nextgp", "tile");
      const kicker = el("div", null, "NEXT GP");
      kicker.setAttribute("data-nextgp", "kicker");
      tile.appendChild(kicker);
      const name = el("h3", null, race.name || "Grand Prix");
      name.setAttribute("data-nextgp", "name");
      tile.appendChild(name);
      const place = [race.circuit, [race.locality, race.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      if (place) {
        const venue = el("div", null, place);
        venue.setAttribute("data-nextgp", "place");
        tile.appendChild(venue);
      }

      const at = raceInstant(race);
      const clock = el("div", null, Number.isFinite(at) ? countdown(at - Date.now()) : "TIME TBC");
      clock.setAttribute("data-nextgp", "countdown");
      tile.appendChild(clock);
      if (Number.isFinite(at)) wrap.dispose = keepCountdownAlive(wrap, clock, at);

      const sessions = weekendSessions(race);
      if (sessions.length) {
        const list = el("div");
        list.setAttribute("data-nextgp", "sessions");
        for (const session of sessions) {
          const row = el("div");
          row.setAttribute("data-nextgp", "session");
          const label = el("span", null, session.label);
          label.setAttribute("data-nextgp", "session-label");
          row.appendChild(label);
          const time = el("time", null, sessionTime(session.startMs));
          time.setAttribute("data-nextgp", "session-time");
          row.appendChild(time);
          list.appendChild(row);
        }
        tile.appendChild(list);
      }
      return tile;
    }

    function raceRow(r, isNext) {
      const row = el("div", "dh-race");
      if (isNext) row.classList.add("dh-race-next");
      row.appendChild(el("div", "dh-race-round", r.round != null ? `R${r.round}` : "—"));

      const main = el("div", "dh-race-main");
      const nameLine = el("div", "dh-race-name");
      nameLine.appendChild(el("span", null, r.name || "Grand Prix"));
      if (r.hasSprint) {
        const sprint = el("span", "dh-chip-sprint", "S");
        sprint.title = "Sprint weekend";
        nameLine.appendChild(sprint);
      }
      if (isNext) nameLine.appendChild(el("span", "dh-chip-next", "NEXT"));
      main.appendChild(nameLine);

      const subParts = [];
      if (r.circuit) subParts.push(r.circuit);
      const place = [r.locality, r.country].filter(Boolean).join(", ");
      if (place) subParts.push(place);
      const subText = subParts.join(" · ") || "—";
      const subEl = el("div", "dh-race-sub", subText);
      bindOverflowTitle(subEl, subText);
      main.appendChild(subEl);
      if (r.time) {
        const t = new Date(Number.isFinite(raceInstant(r)) ? raceInstant(r) : `1970-01-01T${r.time}`);
        if (!isNaN(t.getTime())) {
          main.appendChild(el("div", "dh-race-time", I18n.date(t, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })));
        }
      }
      row.appendChild(main);

      row.appendChild(el("div", "dh-race-date", dateLabel(r)));
      return row;
    }

    function saveIcs(races, whole, alarmMin) {
      const text = DataIcs.build(races, { alarmMin, name: whole ? "F1 " + new Date().getFullYear() + " · Apex 26" : (races[0].name || "Grand Prix") });
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const name = DataIcs.fileName(races, whole);
      if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) return NativeDownload.saveBlob(blob, name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    }

    function icsBar(items, next) {
      const bar = el("div");
      bar.setAttribute("data-ics", "bar");
      const pick = el("select", "dh-pick-select");
      pick.setAttribute("data-ics", "alarm");
      pick.setAttribute("aria-label", I18n.t("hub.icsReminder", null, "Reminder before each session"));
      for (const [min, label] of [[0, "No reminder"], [15, "15 min before"], [30, "30 min before"], [60, "1 h before"], [1440, "1 day before"]]) {
        const opt = el("option", null, label);
        opt.value = String(min);
        if (min === 30) opt.selected = true;
        pick.appendChild(opt);
      }
      function button(label, kind, races, whole) {
        const b = el("button", null, label);
        b.type = "button";
        b.setAttribute("data-ics", kind);
        if (!races.length) b.disabled = true;
        b.addEventListener("click", function () {
          Promise.resolve(saveIcs(races, whole, Number(pick.value))).catch(function (e) { Log.warn("data", "apex26: ics export failed", e); });
        });
        return b;
      }
      bar.appendChild(button("ADD RACE WEEKEND", "weekend", next ? [next] : [], false));
      bar.appendChild(button("ADD WHOLE SEASON", "season", items, true));
      bar.appendChild(pick);
      const note = el("div", null, "Times: Jolpica F1 (CC BY-NC-SA 4.0), unofficial. Reminders depend on your calendar app.");
      note.setAttribute("data-ics", "note");
      bar.appendChild(note);
      return bar;
    }

    function seasonItems() {
      const year = new Date().getFullYear();
      return F1API.schedule().then((items) => {
        if (items && items.length) return { items, year, lastSeason: false };
        return Promise.resolve(F1API.schedule(year - 1)).then((prev) => ({
          items: prev || [], year: year - 1, lastSeason: !!(prev && prev.length), wanted: year
        }));
      });
    }

    function loadSchedule() {
      return seasonItems().then(({ items, year, lastSeason, wanted }) => {
        const wrap = el("div", "dh-tabbody");
        if (!items || !items.length) {
          wrap.appendChild(emptyMsg("No calendar data available yet."));
          return wrap;
        }
        const now = Date.now();
        if (lastSeason) {
          wrap.setAttribute("data-season", "last");
          const note = el("p", null, `The ${wanted} calendar isn't published yet. Showing the ${year} season.`);
          note.setAttribute("data-role", "last-season");
          wrap.appendChild(note);
          wrap.appendChild(el("h3", "dh-section", `LAST SEASON · ${year} CALENDAR`));
          const grid = el("div", "dh-race-grid");
          for (const r of items) grid.appendChild(raceRow(r, false));
          wrap.appendChild(grid);
          return wrap;
        }
        const next = nextRace(items, now);
        let nextMarked = false;
        if (next) wrap.appendChild(nextTile(next, wrap));
        wrap.appendChild(icsBar(items, next));
        wrap.appendChild(el("h3", "dh-section", `${year} CALENDAR`));
        const grid = el("div", "dh-race-grid");
        for (const r of items) {
          const isNext = !nextMarked && isUpcoming(r, now);
          if (isNext) nextMarked = true;
          grid.appendChild(raceRow(r, isNext));
        }
        wrap.appendChild(grid);
        wrap.nextFlipAt = nextFlipAt(items, now);
        return wrap;
      });
    }
    return { loadSchedule };
  }

  return { create, raceInstant, dateLabel, isUpcoming, nextRace, weekendSessions, countdown, nextFlipAt };
})();
Object.freeze(DataSchedule);
