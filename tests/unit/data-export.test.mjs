/* data-export.test.mjs — the Data Hub EXPORT zip, unzipped in Node.
 *
 * Gather runs the real F1API (api-transport + api) against the OpenF1 fixture
 * in tests/helpers/f1-api-mock.js. Download builds the hand-rolled ZIP. This
 * reads that archive back: file list, stored sizes, CRC-32 in both headers,
 * every JSON file's top-level shape, and an empty or failed feed.
 *
 * The gather paces itself with multi-second sleeps. The clock below fires
 * those timers in order and moves Date.now with them, so a 2-minute miss
 * retry does not wait on the wall clock. Fetch timeouts are cleared by
 * draining microtasks before the next timer fires.
 *
 * Run: node --test tests/unit/data-export.test.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { crc32 } from "node:zlib";
import { openF1Fixture } from "../helpers/f1-api-mock.js";
import { seedLog } from "../helpers/seed-log.mjs";

const sources = (await Promise.all(
  ["api-transport.js", "api.js", "export.js"].map((name) =>
    readFile(new URL(`../../js/data/${name}`, import.meta.url), "utf8")),
)).join("\n");

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const EPOCH = Date.parse("2026-10-14T22:00:00.000Z");

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

function openF1Fetch(decide) {
  return async (url) => {
    const custom = decide ? decide(String(url)) : undefined;
    if (custom && custom.fail) {
      const error = new Error(custom.message || "HTTP " + (custom.status || 500));
      if (custom.status) error.status = custom.status;
      throw error;
    }
    if (custom && custom.status && custom.status !== 200) {
      return jsonResponse(custom.body ?? { detail: "failed" }, custom.status);
    }
    const body = custom && Object.prototype.hasOwnProperty.call(custom, "body")
      ? custom.body
      : openF1Fixture(url);
    return jsonResponse(body, 200);
  };
}

class El {
  constructor(tag, cls, text) {
    this.tagName = String(tag).toUpperCase();
    this.className = cls || "";
    this.textContent = text || "";
    this.children = [];
    this.disabled = false;
    this.on = {};
    const set = new Set(this.className.split(" ").filter(Boolean));
    this.classList = {
      toggle: (c, v) => (v ? set.add(c) : set.delete(c)),
      contains: (c) => set.has(c),
    };
  }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute() {}
  addEventListener(type, fn) { this.on[type] = fn; }
  click() { if (this.on.click) this.on.click(); }
  remove() {}
}

function boot(fetchImpl) {
  let now = EPOCH;
  let seq = 0;
  const timers = new Map();
  const store = new Map();
  let zipBlob = null;
  let downloadName = null;
  function Clock(...args) {
    const date = args.length ? new Date(...args) : new Date(now);
    Object.setPrototypeOf(date, Clock.prototype);
    return date;
  }
  Clock.prototype = Object.create(Date.prototype);
  Clock.prototype.constructor = Clock;
  Clock.now = () => now;
  Clock.parse = Date.parse;
  Clock.UTC = Date.UTC;

  const context = vm.createContext({
    console,
    Date: Clock,
    fetch: fetchImpl,
    AbortController,
    TextEncoder,
    Uint8Array,
    Uint32Array,
    Blob,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { fn, at: now + (Number(ms) || 0) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    localStorage: {
      get length() { return store.size; },
      key(i) { return [...store.keys()][i] ?? null; },
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(String(k), String(v)); },
      removeItem(k) { store.delete(k); },
    },
    URL: {
      createObjectURL(blob) { zipBlob = blob; return "blob:export"; },
      revokeObjectURL() {},
    },
    document: {
      body: {
        appendChild(node) { downloadName = node && node.download; },
      },
      createElement(tag) {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
            toBlob(cb) { cb(new Blob([PNG], { type: "image/png" })); },
          };
        }
        return new El(tag);
      },
    },
  });
  seedLog(context);
  vm.runInContext(sources + "\nglobalThis.DataExport=DataExport;\nglobalThis.F1API=F1API;", context, {
    filename: "data-export-harness.js",
  });

  const flush = () => new Promise((resolve) => { setImmediate(resolve); });
  async function pump(done, limit = 20000) {
    for (let i = 0; i < limit; i++) {
      await flush();
      if (done()) return;
      let best = null;
      for (const [id, timer] of timers) {
        if (!best || timer.at < best.timer.at || (timer.at === best.timer.at && id < best.id)) {
          best = { id, timer };
        }
      }
      if (!best) {
        await flush();
        if (done()) return;
        if (timers.size === 0) break;
        continue;
      }
      timers.delete(best.id);
      now = best.timer.at;
      best.timer.fn();
    }
    if (!done()) {
      const error = new Error("export did not settle");
      error.timers = timers.size;
      throw error;
    }
  }

  return {
    context,
    pump,
    blob: () => zipBlob,
    downloadName: () => downloadName,
  };
}

function find(node, className) {
  if (!node) return null;
  if (node.className === className) return node;
  for (const child of node.children || []) {
    const hit = find(child, className);
    if (hit) return hit;
  }
  return null;
}

async function runExport(fetchImpl) {
  const harness = boot(fetchImpl);
  const wrap = await harness.context.DataExport.create({
    el: (tag, cls, text) => new El(tag, cls, text),
    clear() {},
    isOpen: () => true,
  }).loadExport();
  const row = find(wrap, "dh-export-row");
  const status = find(wrap, "dh-export-status");
  const [gather, download] = row.children;
  const year = Number(find(wrap, "dh-pick-years").children[0].textContent);
  gather.click();
  try {
    await harness.pump(() => gather.textContent === "Gather" && status.textContent.includes("ERROR")
      || (!download.disabled && gather.textContent === "Gather"));
  } catch (error) {
    error.message += "\nstatus: " + status.textContent;
    throw error;
  }
  if (!download.disabled) {
    download.click();
    await harness.pump(() => harness.blob() && download.textContent === "Download");
  }
  return {
    year,
    status: status.textContent,
    download,
    blob: harness.blob(),
    downloadName: harness.downloadName(),
  };
}

function unzip(bytes) {
  const z = Buffer.from(bytes);
  const local = [];
  let offset = 0;
  while (offset + 30 <= z.length && z.readUInt32LE(offset) === 0x04034b50) {
    const flags = z.readUInt16LE(offset + 6);
    const method = z.readUInt16LE(offset + 8);
    const crc = z.readUInt32LE(offset + 14);
    const compressed = z.readUInt32LE(offset + 18);
    const uncompressed = z.readUInt32LE(offset + 22);
    const nameLen = z.readUInt16LE(offset + 26);
    const extraLen = z.readUInt16LE(offset + 28);
    const name = z.toString("utf8", offset + 30, offset + 30 + nameLen);
    const start = offset + 30 + nameLen + extraLen;
    const data = z.subarray(start, start + compressed);
    assert.equal(flags, 0, `${name}: no data descriptor`);
    assert.equal(method, 0, `${name}: stored, not deflated`);
    assert.equal(compressed, uncompressed, `${name}: header compressed size`);
    assert.equal(uncompressed, data.length, `${name}: header size matches payload`);
    assert.equal(crc, crc32(data) >>> 0, `${name}: local CRC-32`);
    local.push({ name, offset, data, crc, size: uncompressed });
    offset = start + compressed;
  }
  const eocd = z.length - 22;
  assert.ok(eocd >= offset, "EOCD fits after the entries");
  assert.equal(z.readUInt32LE(eocd), 0x06054b50, "end of central directory");
  assert.equal(z.readUInt16LE(eocd + 8), local.length, "disk entry count");
  assert.equal(z.readUInt16LE(eocd + 10), local.length, "total entry count");
  const cdSize = z.readUInt32LE(eocd + 12);
  let cursor = z.readUInt32LE(eocd + 16);
  assert.equal(cursor, offset, "central directory starts where local entries end");
  assert.equal(cursor + cdSize, eocd, "central directory ends at the EOCD");
  for (const entry of local) {
    assert.equal(z.readUInt32LE(cursor), 0x02014b50, `${entry.name}: central signature`);
    const nameLen = z.readUInt16LE(cursor + 28);
    const extraLen = z.readUInt16LE(cursor + 30);
    const commentLen = z.readUInt16LE(cursor + 32);
    assert.equal(z.toString("utf8", cursor + 46, cursor + 46 + nameLen), entry.name);
    assert.equal(z.readUInt32LE(cursor + 16), entry.crc, `${entry.name}: central CRC-32`);
    assert.equal(z.readUInt32LE(cursor + 20), entry.size, `${entry.name}: central compressed size`);
    assert.equal(z.readUInt32LE(cursor + 24), entry.size, `${entry.name}: central uncompressed size`);
    assert.equal(z.readUInt32LE(cursor + 42), entry.offset, `${entry.name}: central offset`);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  assert.equal(cursor, eocd, "central directory consumed");
  return local;
}

function assertStartlines(parsed, { year, keys }) {
  assert.deepEqual(Object.keys(parsed).sort(), ["circuits", "generatedAt", "year"]);
  assert.equal(parsed.year, year);
  assert.equal(typeof parsed.generatedAt, "string");
  assert.equal(Number.isNaN(Date.parse(parsed.generatedAt)), false);
  assert.equal(Array.isArray(parsed.circuits), false);
  assert.equal(parsed.circuits && typeof parsed.circuits, "object");
  assert.deepEqual(Object.keys(parsed.circuits), keys);
  for (const [key, circuit] of Object.entries(parsed.circuits)) {
    assert.deepEqual(Object.keys(circuit).sort(),
      ["circuit", "country", "driver", "lapDur", "nLoc", "sf", "trace"]);
    assert.equal(circuit.circuit, key);
    assert.equal(typeof circuit.country, "string");
    assert.ok(circuit.country.length > 0);
    assert.equal(circuit.driver, "NOR");
    assert.equal(typeof circuit.lapDur, "number");
    assert.ok(circuit.lapDur > 0);
    assert.equal(typeof circuit.nLoc, "number");
    assert.ok(circuit.nLoc >= 20);
    assert.ok(Array.isArray(circuit.trace));
    assert.ok(circuit.trace.length >= 2 && circuit.trace.length <= 240);
    assert.ok(circuit.trace.every((point) =>
      Array.isArray(point) && point.length === 2 && Number.isInteger(point[0]) && Number.isInteger(point[1])));
    assert.deepEqual(circuit.sf, circuit.trace[0]);
  }
}

function jsonFiles(entries) {
  return entries.filter((entry) => entry.name.endsWith(".json"));
}

test("export zip lists every circuit from the OpenF1 mock, with CRC-32 and JSON shape", async () => {
  const out = await runExport(openF1Fetch());
  assert.equal(out.year, 2026);
  assert.match(out.status, /Ready to download/);
  assert.doesNotMatch(out.status, /ERROR/);
  assert.equal(out.downloadName, "apex-startlines-2026.zip");
  assert.equal(out.blob.type, "application/zip");
  const entries = unzip(await out.blob.arrayBuffer());
  const meetings = openF1Fixture("https://api.openf1.org/v1/meetings?year=2026");
  const safe = (name) => String(name || "circuit").replace(/[^a-z0-9_-]+/gi, "_");
  assert.deepEqual(entries.map((entry) => entry.name), [
    "startlines-2026.json",
    ...meetings.map((meeting) => "img/" + safe(meeting.circuit_short_name) + ".png"),
  ]);
  const parsedFiles = jsonFiles(entries).map((entry) => JSON.parse(entry.data.toString("utf8")));
  assert.equal(parsedFiles.length, 1);
  assertStartlines(parsedFiles[0], {
    year: 2026,
    keys: meetings.map((meeting) => meeting.circuit_short_name),
  });
  const laps = openF1Fixture("https://api.openf1.org/v1/laps?session_key=9997&driver_number=1");
  const best = laps.filter((lap) => lap.lap_duration && lap.date_start && !lap.is_pit_out_lap)
    .reduce((a, b) => (a.lap_duration < b.lap_duration ? a : b));
  const location = openF1Fixture("https://api.openf1.org/v1/location?session_key=9997&driver_number=1");
  for (const [key, circuit] of Object.entries(parsedFiles[0].circuits)) {
    const meeting = meetings.find((item) => item.circuit_short_name === key);
    assert.equal(circuit.country, meeting.country_name);
    assert.equal(circuit.lapDur, best.lap_duration);
    assert.equal(circuit.nLoc, location.length);
    assert.equal(circuit.trace.length, location.length);
    assert.deepEqual(circuit.sf, [Math.round(location[0].x), Math.round(location[0].y)]);
  }
  for (const entry of entries) {
    if (entry.name.endsWith(".png")) assert.deepEqual(Buffer.from(entry.data), Buffer.from(PNG));
  }
});

test("an empty meetings body still downloads a valid zip with no circuits", async () => {
  const out = await runExport(openF1Fetch((url) => (
    url.includes("/meetings") ? { body: [] } : undefined
  )));
  assert.match(out.status, /meetings: 0/);
  assert.match(out.status, /0 circuits captured/);
  assert.doesNotMatch(out.status, /ERROR/);
  assert.equal(out.download.disabled, false);
  const entries = unzip(await out.blob.arrayBuffer());
  assert.deepEqual(entries.map((entry) => entry.name), ["startlines-2026.json"]);
  const parsed = jsonFiles(entries).map((entry) => JSON.parse(entry.data.toString("utf8")));
  assert.equal(parsed.length, 1);
  assertStartlines(parsed[0], { year: 2026, keys: [] });
});

test("an empty location body skips every circuit and still zips", async () => {
  const out = await runExport(openF1Fetch((url) => (
    url.includes("/location") ? { body: [] } : undefined
  )));
  assert.match(out.status, /no lap\/loc/);
  assert.match(out.status, /0 circuits captured/);
  assert.doesNotMatch(out.status, /ERROR/);
  const entries = unzip(await out.blob.arrayBuffer());
  assert.deepEqual(entries.map((entry) => entry.name), ["startlines-2026.json"]);
  const parsed = JSON.parse(jsonFiles(entries)[0].data.toString("utf8"));
  assertStartlines(parsed, { year: 2026, keys: [] });
});

test("a failed OpenF1 response leaves Download disabled and records the error", async () => {
  const out = await runExport(openF1Fetch(() => ({ status: 404, body: { detail: "not found" } })));
  assert.equal(out.blob, null);
  assert.equal(out.download.disabled, true);
  assert.equal(out.download.textContent, "Download");
  assert.match(out.status, /ERROR: not found/);
});

for (const defect of ["start", "end", "middle"]) {
  test(`export rejects a timestamp-${defect} partial trace despite sufficient samples`, async () => {
    const out = await runExport(openF1Fetch((url) => {
      if (!url.includes("/location")) return;
      const rows = openF1Fixture(url);
      return { body: rows.filter((_, i) => defect === "start" ? i >= 38 :
        defect === "end" ? i < 102 : i < 45 || i >= 83) };
    }));
    const parsed = JSON.parse(jsonFiles(unzip(await out.blob.arrayBuffer()))[0].data.toString("utf8"));
    assert.deepEqual(parsed.circuits, {});
  });
}

test("export tries the next driver after a partial trace, independent of coordinate scale", async () => {
  const out = await runExport(openF1Fetch((url) => {
    if (!url.includes("/location")) return;
    const rows = openF1Fixture(url);
    return { body: new URL(url).searchParams.get("driver_number") === "1" ? rows.slice(38) :
      rows.map((p) => ({ ...p, x: p.x * 10, y: p.y * 10 })) };
  }));
  const parsed = JSON.parse(jsonFiles(unzip(await out.blob.arrayBuffer()))[0].data.toString("utf8"));
  assert.ok(Object.keys(parsed.circuits).length > 0);
  const rows = openF1Fixture("https://api.openf1.org/v1/location");
  for (const circuit of Object.values(parsed.circuits)) {
    assert.deepEqual(circuit.sf, [rows[0].x * 10, rows[0].y * 10]);
    assert.equal(circuit.nLoc, rows.length);
  }
});
