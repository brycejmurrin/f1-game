/* Apex 26 — optional lap context, retained separately from interpolated display samples. */
const DataTelemetryContext = (function () {
  "use strict";
  const BASE = "https://api.openf1.org/v1/";
  const number = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const at = (r) => Date.parse(r && r.date);
  const rows = (r) => Array.isArray(r) ? r : [];
  function ordered(list) { return rows(list).filter((r) => Number.isFinite(at(r))).slice().sort((a, b) => at(a) - at(b)); }
  function query(endpoint, params, ttl) {
    const q = Object.keys(params).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])).join("&");
    const url = BASE + endpoint + "?" + q;
    return Promise.resolve().then(() => F1API.request(url, ttl)).then((data) => ({ status: "available", url, rows: rows(data) }),
      (error) => ({ status: error && error.cancelled ? "cancelled" : "unavailable", url, rows: [] }));
  }
  function quality(samples, start, end) {
    const dates = (samples || []).map((r) => +r.date).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 1000).sort((a, b) => a - b);
    return { samples: dates.length, maxGapSeconds: gaps.length ? gaps[gaps.length - 1] : null,
      medianGapSeconds: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      bracketsLap: dates.length > 1 ? dates[0] <= start && dates[dates.length - 1] >= end : false };
  }
  function summarize(tel, sources) {
    const lap = tel.lap, start = Date.parse(lap.dateStart), end = start + lap.lapDuration * 1000;
    const stints = sources.stints.rows.filter((r) => number(r.driver_number) === tel.d.num &&
      number(r.lap_start) !== null && number(r.lap_end) !== null && lap.lapNumber >= +r.lap_start && lap.lapNumber <= +r.lap_end);
    const stint = stints.length === 1 ? stints[0] : null;
    const weather = ordered(sources.weather.rows), previous = weather.filter((r) => at(r) <= start).pop() || null;
    const events = ordered(sources.raceControl.rows);
    // Keep pre-lap messages for flag-state interpretation and post-lap deletions.
    // Absence of a message is never a claim that the lap was clean.
    const deleted = events.filter((r) => number(r.driver_number) === tel.d.num && number(r.lap_number) === lap.lapNumber &&
      /DELETED|REINSTATED/i.test(r.message || ""));
    const finalDeletion = deleted.length ? /DELETED/i.test(deleted[deleted.length - 1].message) : null;
    const sectors = [lap.s1, lap.s2, lap.s3];
    return { tyre: stint ? { compound: stint.compound || null, ageAtStintStart: number(stint.tyre_age_at_start),
      lapsSinceStintStart: lap.lapNumber - Number(stint.lap_start), stint: number(stint.stint_number) } : null,
      weatherAtStart: previous, weatherAgeSeconds: previous ? (start - at(previous)) / 1000 : null,
      weatherDuringLap: weather.filter((r) => at(r) >= start && at(r) <= end),
      eventsDuringLap: events.filter((r) => at(r) >= start && at(r) <= end),
      deletionReported: finalDeletion,
      sectorSumErrorSeconds: sectors.every((s) => number(s) !== null) ? sectors.reduce((a, b) => a + b, 0) - lap.lapDuration : null,
      speedTraps: { sector1: lap.i1Speed ?? null, sector2: lap.i2Speed ?? null, speedTrap: lap.stSpeed ?? null },
      carQuality: quality(tel.nativeCar || tel.car, start, end), locationQuality: quality(tel.nativeLoc || tel.loc, start, end),
      traffic: traffic(tel, sources.traffic.rows, start, end),
      lapValidity: "Not certified: timing consistency and messages do not validate lateral position or clean running." };
  }
  function traffic(tel, data, start, end) {
    const groups = {};
    for (const r of ordered(data)) {
      const id = number(r.driver_number), x = number(r.x), y = number(r.y);
      if (id === null || x === null || y === null || (x === 0 && y === 0)) continue;
      (groups[id] || (groups[id] = [])).push({ date: at(r), x, y });
    }
    const own = groups[tel.d.num] || [], observations = [];
    for (const a of own) {
      if (a.date < start || a.date > end) continue;
      let best = null;
      for (const id of Object.keys(groups)) {
        if (+id === tel.d.num) continue;
        const b = groups[id]; let lo = 0, hi = b.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (b[m].date < a.date) lo = m + 1; else hi = m; }
        const near = [b[lo - 1], b[lo]].filter(Boolean).sort((u, v) => Math.abs(u.date - a.date) - Math.abs(v.date - a.date))[0];
        if (!near || Math.abs(near.date - a.date) > 500) continue;
        const distance = Math.hypot(a.x - near.x, a.y - near.y);
        if (!best || distance < best.distanceSourceUnits) best = { date: a.date, driverNumber: +id,
          distanceSourceUnits: distance, timestampSkewSeconds: Math.abs(near.date - a.date) / 1000 };
      }
      if (best) observations.push(best);
    }
    return { observations, interpretation: "Approximate map proximity in source units; not metres, racing order, tow or proof of interference." };
  }
  function load(tel) {
    const start = Date.parse(tel.lap.dateStart), end = start + tel.lap.lapDuration * 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return Promise.reject(new Error("Lap timing unavailable"));
    const session = { session_key: tel.sessionKey }, driver = { ...session, driver_number: tel.d.num };
    const ttl = Date.now() - end > 21600000 ? 604800000 : 60000;
    const window = { ...session, "date>": new Date(start - 1500).toISOString(), "date<": new Date(end + 1500).toISOString() };
    const requests = {
      laps: query("laps", driver, ttl), stints: query("stints", driver, ttl), pits: query("pit", driver, ttl),
      weather: query("weather", session, ttl), raceControl: query("race_control", session, ttl),
      // All drivers, same UTC window; lap-relative comparison clocks cannot establish traffic.
      traffic: query("location", window, ttl)
    };
    const names = Object.keys(requests);
    return Promise.all(names.map((k) => requests[k])).then((values) => {
      const sources = {}; names.forEach((k, i) => { sources[k] = values[i]; });
      return { schemaVersion: 1, provider: "OpenF1", sessionKey: tel.sessionKey, driverNumber: tel.d.num,
        fetchedAt: new Date().toISOString(), sources, summary: summarize(tel, sources),
        unavailableChannels: ["steering", "lateralAcceleration", "yawRate", "brakePressure", "fuelMass", "ERSDeployment", "FastF1IsAccurate"] };
    });
  }
  function panel(tel, el) {
    const box = el("details", "dh-livecard"), title = el("summary", null, (tel.d.name || "#" + tel.d.num) + " · Lap context");
    box.appendChild(title);
    const content = el("div", "dh-live-sub", "Loading tyres, weather, timing, race-control and traffic context…"); box.appendChild(content);
    function line(text) { content.appendChild(el("p", null, text)); }
    // Reopening the popup reuses the lane's completed request instead of refetching.
    if (!tel.contextPromise) tel.contextPromise = load(tel);
    tel.contextPromise.then((context) => {
      tel.context = context; content.textContent = ""; const s = context.summary;
      line(s.tyre ? "Tyres: " + s.tyre.compound + " · age at stint start: " + (s.tyre.ageAtStintStart ?? "unknown") +
        " laps · " + s.tyre.lapsSinceStintStart + " laps since stint start" : "Tyres: unavailable or ambiguous stint");
      const w = s.weatherAtStart;
      line(w ? "Weather at lap start: track " + (w.track_temperature ?? "unknown") + " °C · air " + (w.air_temperature ?? "unknown") +
        " °C · rainfall " + (w.rainfall ?? "unknown") + " · sample age " + Math.round(s.weatherAgeSeconds) + " s" : "Weather at lap start: unavailable");
      line("Timing: sector sum difference " + (s.sectorSumErrorSeconds === null ? "unavailable" : s.sectorSumErrorSeconds.toFixed(3) + " s") +
        " · deletion report: " + (s.deletionReported === null ? "unknown" : s.deletionReported ? "deleted" : "reinstated"));
      line("Speed traps (km/h): S1 " + (s.speedTraps.sector1 ?? "—") + " · S2 " + (s.speedTraps.sector2 ?? "—") + " · ST " + (s.speedTraps.speedTrap ?? "—"));
      line("Native car samples: " + s.carQuality.samples + " · largest gap " + (s.carQuality.maxGapSeconds ?? "unknown") + " s");
      line("Traffic: " + s.traffic.observations.length + " approximate proximity observations. Map units, not metres or confirmed interference.");
      line("Race-control messages during lap: " + s.eventsDuringLap.length + ". Full session history is retained in the download; clean running is not certified.");
      s.eventsDuringLap.forEach((event) => line(event.date + " · " + (event.message || event.flag || "Event")));
      const missing = Object.keys(context.sources).filter((k) => context.sources[k].status !== "available");
      if (missing.length) line("Unavailable sources: " + missing.join(", "));
      const save = el("button", "dh-livebtn", "Download telemetry + context JSON"); save.type = "button"; content.appendChild(save);
      save.addEventListener("click", async function () {
        save.disabled = true;
        try {
          const blob = new Blob([JSON.stringify({ lap: tel.lap, car: tel.nativeCar || tel.car, location: tel.nativeLoc || tel.loc, context }, null, 2)], { type: "application/json" });
          const name = "apex-telemetry-" + tel.sessionKey + "-" + tel.d.num + ".json";
          if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) await NativeDownload.saveBlob(blob, name);
          else {
            const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
          }
        } catch (error) { line("Download failed. Try again."); Log.warn("data", "telemetry context download failed", error); }
        finally { save.disabled = false; }
      });
    }, () => { content.textContent = "Lap context unavailable. Reopen telemetry to retry."; tel.contextPromise = null; });
    return box;
  }
  return { load, summarize, quality, traffic, panel };
})();
Object.freeze(DataTelemetryContext);
