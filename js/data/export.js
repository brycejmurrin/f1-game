/* Apex 26 — the data hub's EXPORT tab (dev tool): gathers one fast-lap GPS trace per circuit from OpenF1 and downloads a ZIP (traces JSON + labelled map PNG per c… */
const DataExport = (function () {
  "use strict";

  function create(ctx) {
    const { el, clear } = ctx;
    const hubOpen = ctx.isOpen || function () { return true; };

  /* Runs in the browser (where OpenF1 is reachable) and downloads a JSON file.
     For each circuit of the chosen season it pulls ONE clean fast-lap location
     trace. An OpenF1 lap STARTS at the start/finish line, so trace[0] is the
     real S/F point — used offline to validate/correct each circuit's start
     line (s=0 / startFrac) against the game's centreline. */

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function gatherStartLines(year, log) {
    const out = { year: year, generatedAt: new Date().toISOString(), circuits: {} };
    const GAP = 5000;
    const DRIVERS = 3;

    // Cancel checkpoint: a gather must not keep hammering OpenF1 for ~10 min
    // after the hub is closed. Checked around every pacing sleep; a quick
    // close-and-reopen that spans no checkpoint deliberately survives.
    function ck() {
      if (!hubOpen()) { const e = new Error("cancelled"); e.cancelled = true; throw e; }
    }
    function sleepCk(ms) { ck(); return sleep(ms).then(ck); }

    function tryMeeting(m, retrying) {
      const key = m.circuit || m.name;
      return F1API.sessionsForMeeting(m.meetingKey).then(function (ss) {
        const s = ss.find(function (x) { return /quali/i.test(x.name || ""); }) ||
                  ss.find(function (x) { return /race/i.test(x.name || ""); }) ||
                  ss[ss.length - 1];
        if (!s) { log("· no session: " + key); return false; }
        return sleepCk(2000).then(function () {
          return F1API.sessionDrivers(s.sessionKey);
        }).then(function (drv) {
          if (!drv || !drv.length) { log("· no drivers: " + key); return false; }
          const cand = drv.slice(0, DRIVERS);
          let dc = Promise.resolve(false);
          cand.forEach(function (d) {
            dc = dc.then(function (done) {
              if (done) return true;
              // 3 s before each laps request to stay within rate limit
              return sleepCk(3000).then(function () {
                return F1API.fastestLap(s.sessionKey, d.num);
              }).then(function (fl) {
                if (!fl || !fl.dateStart) return false;
                const endISO = new Date(Date.parse(fl.dateStart) + (fl.lapDuration + 1) * 1000).toISOString();
                // 3 s before location (large response — give the server breathing room)
                return sleepCk(3000).then(function () {
                  return F1API.locationData(s.sessionKey, d.num, fl.dateStart, endISO);
                }).then(function (loc) {
                  if (!loc || loc.length < 20) return false;
                  const step = Math.max(1, Math.floor(loc.length / 240));
                  const trace = loc.filter(function (_, i) { return i % step === 0; })
                                   .map(function (p) { return [Math.round(p.x), Math.round(p.y)]; });
                  out.circuits[key] = {
                    circuit: m.circuit, country: m.country, driver: d.code,
                    lapDur: fl.lapDuration, sf: trace[0], nLoc: loc.length, trace: trace
                  };
                  log("✓ " + key + "  pts=" + trace.length + " (" + (d.code || ("#" + d.num)) + ")");
                  return true;
                });
              }).catch(function (e) { if (e && e.cancelled) throw e; return false; });
            });
          });
          return dc.then(function (done) { if (!done) log("· no lap/loc: " + key); return done; });
        });
      }).catch(function (e) {
        if (e && e.cancelled) throw e;
        const msg = e && e.message || String(e);
        // On 429 wait 90 s then retry once — longer than OpenF1's sliding window
        if (!retrying && /429/.test(msg)) {
          log("· rate limited for " + key + " — waiting 90 s…");
          return sleepCk(90000).then(function () { return tryMeeting(m, true); });
        }
        log("· skip " + key + ": " + msg);
        return false;
      });
    }

    function pass(list, label) {
      let chain = Promise.resolve();
      const missed = [];
      list.forEach(function (m, i) {
        chain = chain.then(function () {
          return tryMeeting(m, false).then(function (ok) { if (!ok) missed.push(m); });
        }).then(function () { return i < list.length - 1 ? sleepCk(GAP) : null; });
      });
      return chain.then(function () { return missed; });
    }

    return F1API.meetings(year).then(function (ms) {
      log("meetings: " + ms.length + " — gathering (~10 min, paced to avoid rate limits)…");
      return pass(ms, "pass 1").then(function (missed) {
        if (!missed.length) return;
        log("retrying " + missed.length + " missed circuit(s) — waiting 2 min for rate limit to clear…");
        return sleepCk(120000).then(function () { return pass(missed, "pass 2"); });
      });
    }).then(function () {
      log("done — " + Object.keys(out.circuits).length + " circuits captured");
      return out;
    });
  }

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  }
  function makeZip(files) {  // files: [{name, data: Uint8Array}]
    const enc = new TextEncoder();
    const u16 = function (n) { return [n & 255, (n >>> 8) & 255]; };
    const u32 = function (n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; };
    const parts = [], central = [];
    let offset = 0;
    files.forEach(function (f) {
      const nameB = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0));
      parts.push(new Uint8Array(local), nameB, f.data);
      central.push({ nameB: nameB, crc: crc, sz: sz, offset: offset });
      offset += local.length + nameB.length + sz;
    });
    const cdStart = offset;
    const cd = [];
    central.forEach(function (c) {
      const hdr = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.sz), u32(c.sz), u16(c.nameB.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.offset));
      cd.push(new Uint8Array(hdr), c.nameB);
      offset += hdr.length + c.nameB.length;
    });
    const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0),
      u16(central.length), u16(central.length), u32(offset - cdStart), u32(cdStart), u16(0)));
    return new Blob(parts.concat(cd, [end]), { type: "application/zip" });
  }

  function safeName(s) { return String(s || "circuit").replace(/[^a-z0-9_-]+/gi, "_"); }

  function traceToPng(circ) {
    const t = circ.trace || [];
    const W = 560, H = 560, pad = 48;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0c0c12"; g.fillRect(0, 0, W, H);
    if (t.length < 2) { return canvasPng(cv); }
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    t.forEach(function (p) {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    });
    const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
    const sc = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    const X = function (x) { return pad + (x - minx) * sc; };
    const Y = function (y) { return H - (pad + (y - miny) * sc); };  // flip Y → north-up
    g.strokeStyle = "#4da3ff"; g.lineWidth = 3; g.lineJoin = "round"; g.beginPath();
    t.forEach(function (p, i) { const x = X(p[0]), y = Y(p[1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    // initial-direction arrow (trace[0] → a few points along)
    const a = t[0], b = t[Math.min(10, t.length - 1)];
    g.strokeStyle = "#ffd54a"; g.lineWidth = 4; g.beginPath();
    g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke();
    // S/F marker at trace[0]
    g.fillStyle = "#e10600"; g.beginPath(); g.arc(X(a[0]), Y(a[1]), 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 18px sans-serif";
    g.fillText((circ.circuit || "?") + "  [" + (circ.driver || "") + "]", 14, 28);
    g.font = "13px sans-serif"; g.fillStyle = "#e10600"; g.fillText("● start/finish (lap start)", 14, H - 30);
    g.fillStyle = "#ffd54a"; g.fillText("→ initial direction", 14, H - 12);
    return canvasPng(cv);
  }
  function canvasPng(cv) {
    return new Promise(function (res) {
      cv.toBlob(function (blob) {
        if (!blob) { res(new Uint8Array(0)); return; }
        // A rejection here (detached buffer, OOM) must not hang the ZIP chain —
        // that leaves `running` true and kills Download for the whole session.
        blob.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); },
                                function () { res(new Uint8Array(0)); });
      }, "image/png");
    });
  }

  function loadExport() {
    const wrap = el("div", "dh-export");
    wrap.appendChild(el("div", "dh-export-note",
      "Pulls one fast-lap GPS trace per circuit from OpenF1 (runs in your browser). " +
      "The lap starts at the start/finish line, so it captures where each S/F really is. " +
      "Pick a season, Gather (~10 min — paced to avoid rate limits), then Download a ZIP " +
      "(traces JSON + a labelled map image per circuit) and send it to me."));

    const yearRow = el("div", "dh-pick-years");
    const OPENF1_FIRST_YEAR = 2023;
    const years = [];
    for (let y = Math.max(new Date().getFullYear(), OPENF1_FIRST_YEAR); y >= OPENF1_FIRST_YEAR; y--) years.push(y);
    const sel = { year: years[0] };
    years.forEach(function (y) {
      const b = el("button", "dh-pill" + (y === sel.year ? " active" : ""), String(y));
      b.addEventListener("click", function () {
        sel.year = y;
        for (let i = 0; i < yearRow.children.length; i++)
          yearRow.children[i].classList.toggle("active", yearRow.children[i] === b);
      });
      yearRow.appendChild(b);
    });
    wrap.appendChild(yearRow);

    const row = el("div", "dh-export-row");
    const gatherBtn = el("button", "dh-pill active", "Gather");
    const dlBtn = el("button", "dh-pill", "Download");
    gatherBtn.setAttribute("data-aria-action", "");
    dlBtn.setAttribute("data-aria-action", "");
    dlBtn.disabled = true;
    row.appendChild(gatherBtn);
    row.appendChild(dlBtn);
    wrap.appendChild(row);

    const status = el("pre", "dh-export-status", "Ready.");
    wrap.appendChild(status);

    let result = null, running = false;
    const logs = [];
    const log = function (m) { logs.push(String(m)); status.textContent = logs.slice(-200).join("\n"); status.scrollTop = status.scrollHeight; };

    gatherBtn.addEventListener("click", function () {
      if (running) return;
      running = true; result = null; dlBtn.disabled = true; logs.length = 0;
      gatherBtn.textContent = "Gathering…";
      log("Gathering " + sel.year + " — this can take ~10 min…");
      Log.info("data", "export gather " + sel.year);
      gatherStartLines(sel.year, log).then(function (res) {
        result = res; dlBtn.disabled = false;
        log("Ready to download.");
        Log.info("data", "export gather done");
      }).catch(function (e) {
        if (e && e.cancelled) { log("Cancelled — data hub closed."); Log.info("data", "export gather cancelled"); return; }
        log("ERROR: " + (e && e.message || e));
        Log.warn("data", "export gather fail");
      }).then(function () { running = false; gatherBtn.textContent = "Gather"; });
    });

    function triggerDownload(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    dlBtn.addEventListener("click", function () {
      if (!result || running) return;
      running = true; dlBtn.disabled = true; dlBtn.textContent = "Zipping…";
      const enc = new TextEncoder();
      const json = JSON.stringify(result, null, 1);
      const files = [{ name: "startlines-" + sel.year + ".json", data: enc.encode(json) }];
      const keys = Object.keys(result.circuits);
      log("rendering " + keys.length + " circuit map image(s)…");
      let chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          return traceToPng(result.circuits[k]).then(function (png) {
            if (png && png.length) files.push({ name: "img/" + safeName(k) + ".png", data: png });
          });
        });
      });
      chain.then(function () {
        const zip = makeZip(files);
        triggerDownload(zip, "apex-startlines-" + sel.year + ".zip");
        log("Downloaded apex-startlines-" + sel.year + ".zip — " + files.length +
            " file(s), " + Math.round(zip.size / 1024) + " KB");
      }).catch(function (e) {
        log("ZIP ERROR: " + (e && e.message || e));
      }).then(function () { running = false; dlBtn.disabled = false; dlBtn.textContent = "Download"; });
    });

    return Promise.resolve(wrap);
  }

    return { loadExport };
  }

  return { create };
})();
