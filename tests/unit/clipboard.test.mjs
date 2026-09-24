/* clipboard.test.mjs — ApexClipboard.write / read behaviour in a Node VM. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedClipboard } from "../helpers/seed-clipboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot(opts = {}) {
  const order = [];
  const dom = makeDom();
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Promise,
    document: dom.document,
    navigator: {
      clipboard: {
        writeText(text) {
          order.push("clipboard:" + text);
          return opts.clipboardRejects
            ? Promise.reject(new Error("no"))
            : Promise.resolve();
        },
        readText() {
          order.push("read");
          if (opts.readRejects) return Promise.reject(new Error("denied"));
          return Promise.resolve(opts.readText || "pasted");
        },
      },
    },
  };
  if (opts.noClipboard) sb.navigator = {};
  sb.document.execCommand = (c) => { order.push("execCommand:" + c); return !!opts.execOk; };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedClipboard(ctx);
  return { ApexClipboard: vm.runInContext("ApexClipboard", ctx), order, dom };
}

test("write prefers the async clipboard API then falls back to execCommand", async () => {
  const h = boot({ execOk: true, clipboardRejects: true });
  const ok = await h.ApexClipboard.write("hello");
  assert.equal(ok, true);
  assert.deepEqual(h.order, ["clipboard:hello", "execCommand:copy"]);
});

test("write succeeds on clipboard alone when execCommand is gone", async () => {
  const h = boot({ execOk: false });
  h.ApexClipboard; // seeded
  // Remove execCommand after seed... it's on document already returning false
  const ok = await h.ApexClipboard.write("x");
  assert.equal(ok, true);
  assert.equal(h.order[0], "clipboard:x");
});

test("preferSync runs execCommand before the clipboard promise", async () => {
  const h = boot({ execOk: true, clipboardRejects: true });
  const ok = await h.ApexClipboard.write("sync-first", { preferSync: true });
  assert.equal(ok, true);
  assert.equal(h.order[0], "execCommand:copy");
  assert.ok(h.order.indexOf("clipboard:sync-first") > 0);
});

test("read returns clipboard text and surfaces denial", async () => {
  const h = boot({ readText: "APEX1.z.abc" });
  assert.equal(await h.ApexClipboard.read(), "APEX1.z.abc");
  const denied = boot({ readRejects: true });
  await assert.rejects(() => denied.ApexClipboard.read());
  const missing = boot({ noClipboard: true });
  await assert.rejects(() => missing.ApexClipboard.read(), /clipboard unavailable/);
});

test("clipboard.js is on the shell roster", () => {
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  assert.match(man, /js\/core\/clipboard\.js/);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /src="js\/core\/clipboard\.js\?v=/);
});
