import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TRACKS, TODS, WEATHERS, CAMERA_FRACTIONS, SHARDS, SLIDER_GROUPS, REGIONS,
  conditionKey, enumerateConditions, validateConfig,
} from "../../tools/lighting/campaign/config.mjs";
import { measurePixels, evaluateGates } from "../../tools/lighting/campaign/metrics.mjs";
import {
  validateProfile,
  validateRecord,
  mergeRecords,
  mergeFragments,
  readJsonLines,
  appendJsonLine,
} from "../../tools/lighting/campaign/io.mjs";
import {
  candidateValues,
  classifySensitivity,
  minimalProfile,
  buildConditionRecord,
} from "../../tools/lighting/campaign/tune.mjs";

const TEST_TUNE_DEFS = [
  { id: "ambientMul", min: 0, max: 4 },
  { id: "tint", min: -1, max: 1 },
];

function makeRecord(overrides = {}) {
  const condition = enumerateConditions([TRACKS[0]])[0];
  const record = {
    schema: "apex26.lighting-campaign/v1",
    track: condition.track,
    tod: condition.tod,
    weather: condition.weather,
    key: condition.key,
    views: [{ camera: 0 }, { camera: 1 }, { camera: 2 }],
    profile: { ambientMul: 1.2 },
    gates: { ok: true, failures: [] },
  };
  return { ...record, ...overrides };
}

async function importModifiedConfig(search, replacement) {
  const source = await readFile(new URL("../../tools/lighting/campaign/config.mjs", import.meta.url), "utf8");
  assert.ok(source.includes(search), `config fixture contains ${search}`);
  return import(`data:text/javascript,${encodeURIComponent(source.replace(search, replacement))}`);
}

const CAPTURE_MODULE_URL = new URL("../../tools/lighting/campaign/capture.mjs", import.meta.url);
const CAPTURE_MODULE_PATH = CAPTURE_MODULE_URL.pathname;

async function importCaptureModule() {
  return import(CAPTURE_MODULE_URL);
}

test("lighting campaign enumerates the complete unique matrix", () => {
  const rows = enumerateConditions();
  assert.equal(TRACKS.length, 40);
  assert.deepEqual(TODS, ["dawn", "day", "dusk", "night"]);
  assert.deepEqual(WEATHERS, ["dry", "wet", "rain", "fog", "overcast"]);
  assert.equal(rows.length, 800);
  assert.equal(new Set(rows.map((row) => row.key)).size, 800);
  assert.equal(rows.filter((row) => row.track === "monaco").length, 20);
  assert.deepEqual(
    rows.map((row) => row.key),
    TRACKS.flatMap((track) => TODS.flatMap((tod) =>
      WEATHERS.map((weather) => `${track}|${tod}|${weather}`))),
  );
  assert.deepEqual(rows.slice(0, 6).map((row) => row.key), [
    "abudhabi|dawn|dry",
    "abudhabi|dawn|wet",
    "abudhabi|dawn|rain",
    "abudhabi|dawn|fog",
    "abudhabi|dawn|overcast",
    "abudhabi|day|dry",
  ]);
  // Last in TRACKS is the final classic circuit, not the final season one.
  assert.deepEqual(rows.slice(-6).map((row) => row.key), [
    "jacarepagua|dusk|overcast",
    "jacarepagua|night|dry",
    "jacarepagua|night|wet",
    "jacarepagua|night|rain",
    "jacarepagua|night|fog",
    "jacarepagua|night|overcast",
  ]);
});

test("every track has exactly three legal camera fractions and one shard", () => {
  validateConfig();
  for (const track of TRACKS) {
    assert.equal(CAMERA_FRACTIONS[track].length, 3);
    assert.ok(CAMERA_FRACTIONS[track].every((v) => v >= 0 && v < 1));
    assert.equal(SHARDS.filter((ids) => ids.includes(track)).length, 1);
  }
  assert.equal(new Set(SHARDS.flat()).size, 40);
});

test("validation rejects unknown, duplicate, missing, and illegal config entries", async () => {
  const unknownShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort", "unknown"]',
  );
  assert.throws(() => unknownShard.validateConfig(), /invalid shard coverage/);

  const duplicateShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort", "vegas"]',
  );
  assert.throws(() => duplicateShard.validateConfig(), /invalid shard coverage/);

  const missingShard = await importModifiedConfig(
    '["suzuka", "vegas", "zandvoort", "monza"]',
    '["suzuka", "vegas", "zandvoort"]',
  );
  assert.throws(() => missingShard.validateConfig(), /invalid shard coverage/);

  const illegalCamera = await importModifiedConfig(
    "monaco: [0.05, 0.22, 0.45]",
    "monaco: [0.05, 0.22, 1.00]",
  );
  assert.throws(() => illegalCamera.validateConfig(), /invalid camera coverage: monaco/);

  const duplicateCamera = await importModifiedConfig(
    "monaco: [0.05, 0.22, 0.45]",
    "monaco: [0.05, 0.22, 0.22]",
  );
  assert.throws(() => duplicateCamera.validateConfig(), /invalid camera coverage: monaco/);
});

test("nested exported configuration is immutable", () => {
  assert.ok(Object.values(CAMERA_FRACTIONS).every(Object.isFrozen));
  assert.ok(SLIDER_GROUPS.every((group) => Object.isFrozen(group) && Object.isFrozen(group.labels)));
  assert.ok(Object.values(REGIONS).every(Object.isFrozen));
});

test("condition keys use the shipped preset format", () => {
  assert.equal(conditionKey("monaco", "dusk", "wet"), "monaco|dusk|wet");
  assert.throws(() => conditionKey("../bad", "day", "dry"), /unknown track/);
});

test("profile validation rejects unknown and out-of-range controls", () => {
  assert.deepEqual(validateProfile({ ambientMul: 1.2 }, TEST_TUNE_DEFS), { ambientMul: 1.2 });
  assert.throws(() => validateProfile({ missing: 1 }, TEST_TUNE_DEFS), /unknown slider/i);
  assert.throws(() => validateProfile({ tint: 2 }, TEST_TUNE_DEFS), /out of range/i);
});

test("candidate values are bounded, distinct, and include baseline", () => {
  assert.deepEqual(candidateValues({ min: 0, max: 4, step: 0.02 }, 1), [0, 1, 2, 4]);
  assert.deepEqual(candidateValues({ min: -1, max: 1, step: 0.01 }, 0), [-1, -0.5, 0, 0.5, 1]);
  assert.deepEqual(candidateValues({ min: 0, max: 1, step: 0.2 }, 0.91), [0, 1]);
});

test("sensitivity requires all three views to remain below tolerance", () => {
  const same = [{ meanDelta: 0.01 }, { meanDelta: 0.02 }, { meanDelta: 0.01 }];
  const changed = [{ meanDelta: 0.01 }, { meanDelta: 0.40 }, { meanDelta: 0.01 }];
  assert.equal(classifySensitivity(same).active, false);
  assert.equal(classifySensitivity(changed).active, true);
  assert.equal(classifySensitivity(changed, changed, { controlChanged: false }).active, false);
});

test("minimal profile removes values that reproduce without an override", async () => {
  const seen = [];
  const profile = await minimalProfile(
    { ambientMul: 1, tint: 0 },
    { ambientMul: 1.2, tint: 0.1 },
    async (candidate) => {
      seen.push({ ...candidate });
      return candidate.ambientMul === 1.2 && candidate.tint === 0;
    },
  );
  assert.deepEqual(profile, { ambientMul: 1.2 });
  assert.deepEqual(seen, [
    { ambientMul: 1, tint: 0 },
    { ambientMul: 1, tint: 0.1 },
    { ambientMul: 1.2, tint: 0 },
    { ambientMul: 1, tint: 0 },
  ]);
});

test("minimal profile rejects capture results with failed gates", async () => {
  const profile = await minimalProfile(
    { ambientMul: 1 },
    { ambientMul: 1.2 },
    async () => ({
      gates: { ok: false, failures: ["white-clip"] },
      views: [
        { meanDelta: 0.01, blackClipDelta: 0, whiteClipDelta: 0 },
        { meanDelta: 0.01, blackClipDelta: 0, whiteClipDelta: 0 },
        { meanDelta: 0.01, blackClipDelta: 0, whiteClipDelta: 0 },
      ],
    }),
  );
  assert.deepEqual(profile, { ambientMul: 1.2 });
});

test("minimal profile removes coupled overrides when the complete baseline reproduces", async () => {
  const baseline = { lift: 0, offset: 0 };
  const selected = { lift: 1, offset: -1 };
  const seen = [];
  const profile = await minimalProfile(baseline, selected, async (candidate) => {
    seen.push({ ...candidate });
    return candidate.lift + candidate.offset === 0;
  });

  assert.deepEqual(profile, {});
  assert.deepEqual(seen, [baseline]);
});

test("minimal profile repeats deterministic passes after a successful removal", async () => {
  const baseline = { alpha: 0, beta: 0, gamma: 0 };
  const selected = { alpha: 1, beta: 1, gamma: 1 };
  const seen = [];
  const profile = await minimalProfile(baseline, selected, async (candidate) => {
    seen.push({ ...candidate });
    const active = Object.keys(candidate)
      .filter((key) => candidate[key] !== baseline[key])
      .join(",");
    return active === "alpha,gamma" || active === "gamma";
  });

  assert.deepEqual(profile, { gamma: 1 });
  assert.deepEqual(seen, [
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 0, beta: 1, gamma: 1 },
    { alpha: 1, beta: 0, gamma: 1 },
    { alpha: 1, beta: 0, gamma: 0 },
    { alpha: 0, beta: 0, gamma: 1 },
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 0, beta: 0, gamma: 0 },
  ]);
});

test("condition records preserve tuning evidence and canonical condition data", () => {
  const condition = enumerateConditions(["monza"])[0];
  const baselineViews = [{ camera: 0 }, { camera: 1 }, { camera: 2 }];
  const finalViews = [{ camera: 0, final: true }, { camera: 1, final: true }, { camera: 2, final: true }];
  const record = buildConditionRecord({
    condition,
    baseline: { ambientMul: 1, tint: 0 },
    selected: { ambientMul: 1.2, tint: 0.1 },
    profile: { ambientMul: 1.2 },
    sensitivity: {
      control: "ambientMul",
      active: true,
      gateExplanation: "all three views exceeded the mean delta tolerance",
      views: [{ meanDelta: 0.3 }, { meanDelta: 0.25 }, { meanDelta: 0.22 }],
    },
    rejectedCandidates: [{ value: 4, gateExplanation: "white-clip" }],
    rationale: "ambient lift helped dusk road readability",
    baselineViews,
    finalViews,
    gates: { ok: true, failures: [] },
  });

  assert.equal(record.schema, "apex26.lighting-campaign/v1");
  assert.equal(record.key, condition.key);
  assert.deepEqual(record.profile, { ambientMul: 1.2 });
  assert.deepEqual(record.baseline, { ambientMul: 1, tint: 0 });
  assert.deepEqual(record.selected, { ambientMul: 1.2, tint: 0.1 });
  assert.equal(record.sensitivity.gateExplanation, "all three views exceeded the mean delta tolerance");
  assert.deepEqual(record.rejectedCandidates, [{ value: 4, gateExplanation: "white-clip" }]);
  assert.deepEqual(record.baselineViews, baselineViews);
  assert.deepEqual(record.views, finalViews);
});

test("record validation requires schema, canonical key, three views, and passing gates", () => {
  assert.doesNotThrow(() => validateRecord(makeRecord()));
  assert.throws(() => validateRecord(makeRecord({ schema: "wrong" })), /schema/i);
  assert.throws(() => validateRecord(makeRecord({ key: "wrong|key|value" })), /key/i);
  assert.throws(() => validateRecord(makeRecord({ views: [{}, {}] })), /three views/i);
  assert.throws(() => validateRecord(makeRecord({ gates: { ok: false, failures: ["black-clip"] } })), /gate/i);
});

test("record merge requires one unique complete matrix record per key", () => {
  const rows = enumerateConditions().map((condition) => ({
    schema: "apex26.lighting-campaign/v1",
    ...condition,
    views: [{ camera: 0 }, { camera: 1 }, { camera: 2 }],
    profile: {},
    gates: { ok: true, failures: [] },
  }));
  const result = mergeRecords(rows.slice().reverse(), TEST_TUNE_DEFS);
  const keys = Object.keys(result.presets);
  assert.equal(keys.length, 800);
  assert.deepEqual(keys, keys.slice().sort());
  assert.equal(result.records.length, 800);
  assert.equal(result.summary.totalRecords, 800);
  assert.equal(result.summary.totalConditions, 800);
  assert.equal(result.summary.missingConditions, 0);
  assert.throws(() => mergeRecords([...rows, rows[0]], TEST_TUNE_DEFS), /duplicate condition/i);
  assert.throws(() => mergeRecords(rows.slice(1), TEST_TUNE_DEFS), /missing condition/i);
});

test("json line fragments append, reread, and merge deterministically", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "lighting-campaign-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const shardA = join(dir, "a.jsonl");
  const shardB = join(dir, "b.jsonl");
  const rows = enumerateConditions();

  appendJsonLine(shardA, makeRecord(rows[1]));
  appendJsonLine(shardB, makeRecord(rows[0]));

  assert.deepEqual(readJsonLines(shardA), [makeRecord(rows[1])]);
  const merged = mergeFragments([shardA, shardB], TEST_TUNE_DEFS, { expectedConditions: rows.slice(0, 2) });
  assert.deepEqual(Object.keys(merged.presets), [rows[0].key, rows[1].key]);
  assert.equal(merged.summary.fragmentCount, 2);
});

test("capture module exports the isolated WebGL campaign contract with no fixed port", async () => {
  const source = await readFile(CAPTURE_MODULE_PATH, "utf8");
  assert.match(source, /export\s+async\s+function\s+startStaticServer\b/);
  assert.match(source, /export\s+async\s+function\s+launchCampaignBrowser\b/);
  assert.match(source, /export\s+async\s+function\s+createCampaignPage\b/);
  assert.match(source, /export\s+async\s+function\s+captureCondition\b/);
  assert.doesNotMatch(source, /3456|last-port|campaign port/i);

  const capture = await importCaptureModule();
  assert.equal(typeof capture.startStaticServer, "function");
  assert.equal(typeof capture.launchCampaignBrowser, "function");
  assert.equal(typeof capture.createCampaignPage, "function");
  assert.equal(typeof capture.captureCondition, "function");
});

test("each campaign server receives its own ephemeral port", async (t) => {
  const tmpRoot = join(process.cwd(), "artifacts", "tmp");
  await mkdir(tmpRoot, { recursive: true });
  const dir = await mkdtemp(join(tmpRoot, "lighting-campaign-server-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  await writeFile(join(dir, "index.html"), "ok");
  await access(CAPTURE_MODULE_PATH);
  const { startStaticServer } = await importCaptureModule();
  const a = await startStaticServer(dir);
  const b = await startStaticServer(dir);
  t.after(async () => {
    await a.close();
    await b.close();
  });
  assert.notEqual(a.port, b.port);
  assert.equal(await (await fetch(`http://127.0.0.1:${a.port}/`)).text(), "ok");
});

function fakePage(id) {
  return {
    id,
    closeCalls: 0,
    async close() {
      this.closeCalls++;
    },
  };
}

function failedCapture(page) {
  return {
    condition: { key: "monza|day|dry" },
    profile: {},
    resolved: {},
    lightState: {},
    views: [{ page: page.id }, { page: page.id }, { page: page.id }],
    gates: { ok: false, failures: ["tonal-range"] },
  };
}

test("configured capture visits exactly three camera fractions in order", async () => {
  const { captureConfiguredViews } = await importCaptureModule();
  const seen = [];
  const views = await captureConfiguredViews("monza", async (frac, index) => {
    seen.push({ frac, index });
    return `${index}:${frac}`;
  });
  assert.deepEqual(seen, CAMERA_FRACTIONS.monza.map((frac, index) => ({ frac, index })));
  assert.deepEqual(views, CAMERA_FRACTIONS.monza.map((frac, index) => `${index}:${frac}`));
  assert.equal(views.length, 3);
});

test("capture retries preserve the caller page and clean up fresh retry pages", async () => {
  const { captureCondition } = await importCaptureModule();
  const original = fakePage("original");
  const retries = [];
  const attempted = [];
  const result = await captureCondition(original, {}, {}, "unused", {
    captureAttempt: async (page) => {
      attempted.push(page.id);
      if (attempted.length < 3) return failedCapture(page);
      return { ...failedCapture(page), gates: { ok: true, failures: [] } };
    },
    createRetryPage: async () => {
      const page = fakePage(`retry-${retries.length + 1}`);
      retries.push(page);
      return page;
    },
  });

  assert.equal(result.gates.ok, true);
  assert.deepEqual(attempted, ["original", "retry-1", "retry-2"]);
  assert.equal(original.closeCalls, 0);
  assert.deepEqual(retries.map((page) => page.closeCalls), [1, 1]);
});

test("capture stops after three failed attempts and returns a blocked result", async () => {
  const { captureCondition } = await importCaptureModule();
  const original = fakePage("original");
  const retries = [];
  let attempts = 0;
  const result = await captureCondition(original, {}, {}, "unused", {
    captureAttempt: async (page) => {
      attempts++;
      return failedCapture(page);
    },
    createRetryPage: async () => {
      const page = fakePage(`retry-${retries.length + 1}`);
      retries.push(page);
      return page;
    },
  });

  assert.equal(attempts, 3);
  assert.equal(result.gates.ok, false);
  assert.deepEqual(result.gates.failures, ["blocked", "tonal-range"]);
  assert.equal(original.closeCalls, 0);
  assert.deepEqual(retries.map((page) => page.closeCalls), [1, 1]);
});

test("campaign page creation cleans up a page that fails to initialize", async () => {
  const { createCampaignPage } = await importCaptureModule();
  const page = {
    closeCalls: 0,
    on() {},
    async addInitScript() {},
    async goto() {},
    async waitForFunction() {
      throw new Error("WebGL readiness timed out");
    },
    async close() {
      this.closeCalls++;
    },
  };
  const browser = {
    async newPage() {
      return page;
    },
  };

  await assert.rejects(() => createCampaignPage(browser, 1234), /WebGL readiness timed out/);
  assert.equal(page.closeCalls, 1);
});

test("campaign page creation closes its context when newPage fails", async () => {
  const { createCampaignPage } = await importCaptureModule();
  const context = {
    closeCalls: 0,
    async newPage() {
      throw new Error("page allocation failed");
    },
    async close() {
      this.closeCalls++;
    },
  };
  const browser = {
    async newContext() {
      return context;
    },
  };

  await assert.rejects(() => createCampaignPage(browser, 1234), /page allocation failed/);
  assert.equal(context.closeCalls, 1);
});

test("campaign page creation gives navigation and WebGL readiness explicit timeouts", async () => {
  const { createCampaignPage } = await importCaptureModule();
  let gotoOptions;
  let waitOptions;
  const page = {
    on() {},
    async addInitScript() {},
    async goto(url, options) {
      gotoOptions = options;
    },
    async waitForFunction(fn, arg, options) {
      waitOptions = options;
    },
    async evaluate() {
      return false;
    },
    async close() {},
  };
  const browser = {
    async newPage() {
      return page;
    },
  };

  await createCampaignPage(browser, 1234);
  assert.equal(gotoOptions.timeout, 60_000);
  assert.equal(waitOptions.timeout, 60_000);
});

test("retry pages use an isolated owned browser that is cleaned up", async () => {
  const {
    createCampaignPage, createCampaignRetryPage, closeCampaignRetryPage,
  } = await importCaptureModule();
  const original = fakePage("original");
  const context = {
    async newPage() {
      original.on = () => {};
      original.addInitScript = async () => {};
      original.goto = async () => {};
      original.waitForFunction = async () => {};
      original.evaluate = async () => false;
      return original;
    },
  };
  await createCampaignPage(context, 1234);
  const retry = fakePage("retry");
  const retryBrowser = {
    closeCalls: 0,
    async close() {
      this.closeCalls++;
    },
  };
  const retryPage = await createCampaignRetryPage(original, {
    launchBrowser: async () => retryBrowser,
    createPage: async (browser, port) => {
      assert.equal(browser, retryBrowser);
      assert.equal(port, 1234);
      return retry;
    },
  });
  await closeCampaignRetryPage(retryPage);

  assert.equal(retryPage, retry);
  assert.equal(retryBrowser.closeCalls, 1);
  assert.equal(retry.closeCalls, 0);
  assert.equal(original.closeCalls, 0);
});

test("initial campaign pages use an explicit reusable browser context", async () => {
  const { createCampaignPage } = await importCaptureModule();
  const page = fakePage("original");
  page.on = () => {};
  page.addInitScript = async () => {};
  page.goto = async () => {};
  page.waitForFunction = async () => {};
  page.evaluate = async () => false;
  const context = {
    async newPage() {
      page.context = () => context;
      return page;
    },
  };
  const browser = {
    newContextOptions: null,
    async newContext(options) {
      this.newContextOptions = options;
      return context;
    },
    async newPage() {
      throw new Error("browser.newPage must not own the campaign context");
    },
  };

  const created = await createCampaignPage(browser, 1234);
  assert.equal(created, page);
  assert.deepEqual(browser.newContextOptions.viewport, { width: 960, height: 540 });
});

test("pixel metrics report percentiles, clipping, and named regions", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 32, 32, 32, 255,
    128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  const result = measurePixels(data, 2, 2, { frame: [0, 0, 1, 1] });
  assert.equal(result.frame.count, 4);
  assert.equal(result.frame.blackClipFraction, 0.25);
  assert.equal(result.frame.whiteClipFraction, 0.25);
  assert.ok(result.frame.p95 > result.frame.p05);
});

test("hard gates reject clipping, WebGL errors, and missing night lights", () => {
  const bad = evaluateGates({
    metrics: { frame: { blackClipFraction: 0.09, whiteClipFraction: 0, p05: 0, p95: 100 } },
    lightState: { numLights: 0, ambientSky: [0.1, 0.1, 0.1] },
    webglError: 1282, pageErrors: [], tod: "night",
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(new Set(bad.failures), new Set(["black-clip", "webgl-error", "night-lights"]));
});

test("pixel metrics bound regions beyond the frame to a deterministic edge pixel", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 32, 32, 32, 255,
    128, 128, 128, 255, 255, 255, 255, 255,
  ]);
  const result = measurePixels(data, 2, 2, { beyond: [1.2, 1.4, 0.1, 0.1] });
  assert.equal(result.beyond.count, 1);
  assert.ok(Math.abs(result.beyond.mean - 255) < 1e-12);
  assert.equal(result.beyond.p05, result.beyond.mean);
  assert.equal(result.beyond.p50, result.beyond.mean);
  assert.equal(result.beyond.p95, result.beyond.mean);
  assert.equal(result.beyond.blackClipFraction, 0);
  assert.equal(result.beyond.whiteClipFraction, 1);
  assert.equal(result.beyond.edgeEnergy, 0);
});

test("pixel metrics report mean absolute horizontal edge energy", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 10, 10, 10, 255, 40, 40, 40, 255,
  ]);
  const result = measurePixels(data, 3, 1, { frame: [0, 0, 1, 1] });
  assert.ok(Math.abs(result.frame.edgeEnergy - 20) < 1e-12);
});

test("hard gates report white clipping, narrow tonal range, and page errors", () => {
  const bad = evaluateGates({
    metrics: { frame: { blackClipFraction: 0, whiteClipFraction: 0.03, p05: 20, p95: 64 } },
    lightState: { numLights: 0, ambientSky: [0.1, 0.1, 0.1] },
    webglError: 0, pageErrors: ["render failed"], tod: "day",
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(new Set(bad.failures), new Set(["white-clip", "tonal-range", "page-error"]));
});
