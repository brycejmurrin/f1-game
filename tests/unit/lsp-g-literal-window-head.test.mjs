// apex-lsp (#6760): G.<member> also names the member's row in the G literal; a window.X head is a [def], and an
// anonymous IIFE that assigns window.X is labelled with it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Lsp, callTool } from "../../tools/mcp/lsp-mcp.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

test("G.member adds the literal row; window.X head is a def; IIFE head named", { timeout: 60000 }, async () => {
  const dir = mkTmpDir("lsp-g-literal-");
  const at = n => `js/${n}.js`;
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  write("jsconfig.json", JSON.stringify({ compilerOptions: { allowJs: true, checkJs: false, noEmit: true }, typeAcquisition: { enable: false }, include: ["js/**/*.js"] }));
  write("types/game-ctx.d.ts", "interface GameCtx {\n  readonly openCareer: () => void;\n}\n");
  write(`js/game.js`, `"use strict";
const G = {
  $,
  openCareer: (...a) => openCareer(...a),
};
`);
  write(at("presets"), `window.LightPresets = {\n  day: 1,\n};\n`);
  write(at("fx"), `(function () {\n  function fx() { return 1; }\n  window.TLXShaders = Object.assign(window.TLXShaders || {}, { fx });\n})();\n`);
  const lsp = new Lsp({ root: dir, src: "js", anchor: `js/game.js`, idleMs: 0 });
  const text = async (tool, args) => {
    const r = await callTool(lsp, tool, args);
    assert.equal(r.isError, false, r.content[0].text);
    return r.content[0].text;
  };
  try {
    const g = await text("lsp_definition", { symbol: "G.openCareer" });
    assert.match(g, /types\/game-ctx\.d\.ts:2:\d+ {2}\[def\][\s\S]*js\/game\.js:4:3 {2}\[def\] openCareer:/);
    assert.match(await text("lsp_definition", { symbol: "LightPresets" }), /js\/presets\.js:1:8 {2}\[def\] window\.LightPresets/);
    const outline = (await text("lsp_outline", { file: at("fx") })).split("\n");
    assert.equal(outline.filter((l) => l.includes("(anonymous IIFE → window.TLXShaders)")).length, 1, outline.join("\n"));
  } finally { lsp.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
