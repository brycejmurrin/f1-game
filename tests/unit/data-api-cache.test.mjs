import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(ROOT, "js/data/api.js"), "utf8");

test("F1 API cache evicts old responses instead of growing without bound", async () => {
  const values = new Map();
  globalThis.localStorage = {
    get length() { return values.size; },
    key(i) { return Array.from(values.keys())[i] || null; },
    getItem(k) { return values.get(k) || null; },
    setItem(k, v) { values.set(k, v); },
    removeItem(k) { values.delete(k); },
  };
  globalThis.Log = { warn() {} };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => (now += 500);
  try {
    const F1API = eval(source + "\n;F1API");
    for (let i = 1; i <= 60; i++) await F1API.positions(i);
    const keys = Array.from(values.keys()).filter((k) => k.startsWith("apex26.api."));
    assert.ok(keys.length <= 48, `cache retained ${keys.length} response entries`);
  } finally {
    Date.now = realNow;
    delete globalThis.fetch;
    delete globalThis.localStorage;
    delete globalThis.Log;
  }
});
