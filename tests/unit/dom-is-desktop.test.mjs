// dom-is-desktop.test.mjs — Dom.isDesktop(), the ONE reader of body.desktop (#7053, #6548 item 5).
// Every HUD, settings and bridge branch that keys on the desktop tier asks Dom; a raw
// classList.contains("desktop") outside js/ui/dom.js is a second predicate for one concept.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/dom.js"), "utf8");

function load(document) {
  const ctx = vm.createContext(document === undefined ? {} : { document });
  vm.runInContext(SRC + "\n;globalThis.Dom = Dom;", ctx, { filename: absSrc("js/ui/dom.js") });
  return ctx.Dom;
}
const docWith = (classes) => ({ body: { classList: { contains: (c) => classes.includes(c) } } });

test("Dom.isDesktop: true only when body carries the desktop class", () => {
  assert.equal(load(docWith(["desktop"])).isDesktop(), true);
  assert.equal(load(docWith(["touch"])).isDesktop(), false);
});

test("Dom.isDesktop: no document, no body or no classList reads as not desktop", () => {
  assert.equal(load(undefined).isDesktop(), false);
  assert.equal(load({ body: null }).isDesktop(), false);
  assert.equal(load({ body: {} }).isDesktop(), false);
});

test("Dom.isDesktop(doc): a passed document wins over the page's", () => {
  const Dom = load(docWith([]));
  assert.equal(Dom.isDesktop(docWith(["desktop"])), true);
  assert.equal(Dom.isDesktop(docWith([])), false);
});

test("no raw classList.contains(\"desktop\") outside js/ui/dom.js", () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "vendor") walk(p); continue; }
      if (!e.name.endsWith(".js")) continue;
      const rel = path.relative(ROOT, p).split(path.sep).join("/");
      if (rel === "js/ui/dom.js") continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (/classList\??\.contains\(\s*["'`]desktop["'`]\s*\)/.test(line)) hits.push(`${rel}:${i + 1}`);
      });
    }
  };
  walk(path.join(ROOT, "js"));
  assert.deepEqual(hits, [], "call Dom.isDesktop() instead");
});
