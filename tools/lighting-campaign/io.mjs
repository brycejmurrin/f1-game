// @doc lighting-campaign: JSONL record store (schema `apex26.lighting-campaign/v1`) — validate, append, merge fragments.
// @skill lighting-tuner
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { conditionKey, enumerateConditions } from "./config.mjs";

const SCHEMA = "apex26.lighting-campaign/v1";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tuneDefMap(tuneDefs) {
  if (!Array.isArray(tuneDefs)) throw new Error("tune defs must be an array");
  const defs = new Map();
  for (const def of tuneDefs) {
    if (!isPlainObject(def) || typeof def.id !== "string" || !Number.isFinite(def.min) || !Number.isFinite(def.max))
      throw new Error("invalid tune def");
    if (defs.has(def.id)) throw new Error(`duplicate tune def: ${def.id}`);
    defs.set(def.id, def);
  }
  return defs;
}

function normalizeExpectedConditions(expectedConditions) {
  const conditions = expectedConditions ?? enumerateConditions();
  if (!Array.isArray(conditions)) throw new Error("expected conditions must be an array");
  const entries = conditions.map((condition) => {
    if (!isPlainObject(condition)) throw new Error("invalid expected condition");
    const key = typeof condition.key === "string"
      ? condition.key
      : conditionKey(condition.track, condition.tod, condition.weather);
    return { key };
  });
  const keys = entries.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate expected condition");
  return keys.sort();
}

function canonicalRecord(record, tuneDefs) {
  validateRecord(record);
  return {
    ...record,
    schema: SCHEMA,
    key: conditionKey(record.track, record.tod, record.weather),
    profile: validateProfile(record.profile, tuneDefs),
  };
}

export function validateProfile(profile, tuneDefs) {
  if (!isPlainObject(profile)) throw new Error("profile must be an object");
  const defs = tuneDefMap(tuneDefs);
  const entries = Object.entries(profile)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const def = defs.get(id);
      if (!def) throw new Error(`unknown slider: ${id}`);
      if (!Number.isFinite(value)) throw new Error(`invalid slider value: ${id}`);
      if (value < def.min || value > def.max) throw new Error(`slider out of range: ${id}`);
      return [id, value];
    });
  return Object.fromEntries(entries);
}

export function validateRecord(record) {
  if (!isPlainObject(record)) throw new Error("record must be an object");
  if (record.schema !== SCHEMA) throw new Error(`invalid schema: ${record.schema}`);
  const expectedKey = conditionKey(record.track, record.tod, record.weather);
  if (record.key !== expectedKey) throw new Error(`record key mismatch: expected ${expectedKey}`);
  if (!Array.isArray(record.views) || record.views.length !== 3) throw new Error("record must include exactly three views");
  if (!isPlainObject(record.profile)) throw new Error("record profile must be an object");
  if (!isPlainObject(record.gates) || !Array.isArray(record.gates.failures)) throw new Error("record gates must include failures");
  if (record.gates.ok !== true || record.gates.failures.length !== 0) throw new Error("record gate failures must be empty");
}

export function mergeRecords(records, tuneDefs, options = {}) {
  if (!Array.isArray(records)) throw new Error("records must be an array");
  const expectedKeys = normalizeExpectedConditions(options.expectedConditions);
  const expectedSet = new Set(expectedKeys);
  const seen = new Map();
  for (const record of records) {
    const canonical = canonicalRecord(record, tuneDefs);
    if (!expectedSet.has(canonical.key)) throw new Error(`unexpected condition: ${canonical.key}`);
    if (seen.has(canonical.key)) throw new Error(`duplicate condition: ${canonical.key}`);
    seen.set(canonical.key, canonical);
  }
  const missing = expectedKeys.filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`missing condition: ${missing[0]}`);

  const presets = Object.fromEntries(expectedKeys.map((key) => [key, seen.get(key).profile]));
  const orderedRecords = expectedKeys.map((key) => seen.get(key));
  return {
    presets,
    records: orderedRecords,
    summary: {
      totalRecords: orderedRecords.length,
      totalConditions: expectedKeys.length,
      missingConditions: missing.length,
    },
  };
}

export function readJsonLines(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendJsonLine(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

export function mergeFragments(fragmentPaths, tuneDefs, options = {}) {
  if (!Array.isArray(fragmentPaths)) throw new Error("fragment paths must be an array");
  const records = fragmentPaths.flatMap((path) => readJsonLines(path));
  const result = mergeRecords(records, tuneDefs, options);
  return {
    ...result,
    summary: {
      ...result.summary,
      fragmentCount: fragmentPaths.length,
    },
  };
}
