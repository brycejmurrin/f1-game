// index.html: while apex26.scriptRetry is sweeping caches and reloading, suppress
// the full-screen error overlay for cascading ReferenceErrors — still log them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { absSrc } from "../helpers/abs-src.mjs";

async function runErrorCatcher() {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes("ON-SCREEN ERROR CATCHER"));
  assert.ok(script, "the error catcher script is found");
  const listeners = {};
  let overlay = null;
  const win = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector: () => ({ content: "123" }),
      getElementById: () => overlay,
      createElement: () => ({ style: {}, textContent: "", onclick: null }),
      body: { appendChild: (d) => { overlay = d; } },
      documentElement: { appendChild: (d) => { overlay = d; } },
    },
    navigator: { onLine: true },
    location: { origin: "https://x.test" },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(script, ctx, { filename: absSrc("index.html") });
  return {
    win,
    fire: (type, ev) => { for (const fn of listeners[type] || []) fn(ev); },
    overlayVisible: () => !!(overlay && overlay.style.display === "block"),
    last: () => win.__apexErrors[win.__apexErrors.length - 1],
  };
}

test("index.html sets __apexScriptRepair when the one-shot scriptRetry repair starts", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const at = html.indexOf('sessionStorage.setItem(RETRY_KEY, "1")');
  assert.ok(at > 0);
  const snippet = html.slice(at, at + 120);
  assert.equal(snippet.includes("window.__apexScriptRepair = 1"), true);
});

test("with __apexScriptRepair set, rejections and errors are logged but the overlay stays hidden", async () => {
  const h = await runErrorCatcher();
  h.win.__apexScriptRepair = 1;
  const err = new ReferenceError("DriveTune is not defined");
  h.fire("unhandledrejection", { reason: err });
  assert.equal(h.last().kind, "rejection");
  assert.equal(h.last().msg, "DriveTune is not defined");
  assert.equal(h.overlayVisible(), false);
  h.fire("error", { message: "DriveTune is not defined", error: err, filename: "js/physics/drive-tune.js", lineno: 1, colno: 1 });
  assert.equal(h.last().kind, "error");
  assert.equal(h.last().msg, "DriveTune is not defined");
  assert.equal(h.overlayVisible(), false);
});

test("without __apexScriptRepair, the overlay still shows for rejections and errors", async () => {
  const h = await runErrorCatcher();
  h.fire("unhandledrejection", { reason: new ReferenceError("DriveTune is not defined") });
  assert.equal(h.overlayVisible(), true);
  h.fire("error", { message: "x", error: new Error("x"), filename: "a.js", lineno: 1, colno: 1 });
  assert.equal(h.overlayVisible(), true);
});

test("pinned overlay (second scriptRetry pass) still shows even if __apexScriptRepair were set", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const script = html.split("<script>").map((c) => c.split("</script>")[0])
    .find((c) => c.includes("ON-SCREEN ERROR CATCHER"));
  const listeners = {};
  let overlay = null;
  const win = { __apexScriptRepair: 1, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector: () => ({ content: "1" }),
      getElementById: () => overlay,
      createElement: () => ({ style: {}, textContent: "", onclick: null }),
      body: { appendChild: (d) => { overlay = d; } },
      documentElement: { appendChild: (d) => { overlay = d; } },
    },
    navigator: { onLine: true },
    location: { origin: "https://x.test" },
    sessionStorage: { getItem: () => "1", setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve({}),
    caches: { keys: async () => [], delete: async () => true },
  });
  vm.runInContext(script, ctx, { filename: absSrc("index.html") });
  for (const fn of listeners.error || []) {
    fn({ target: { tagName: "SCRIPT", src: "https://x.test/js/physics/drive-tune.js?v=1", dataset: {} } });
  }
  assert.equal(overlay && overlay.style.display, "block");
  assert.equal(overlay.textContent.indexOf("Module failed to load") >= 0, true);
});
