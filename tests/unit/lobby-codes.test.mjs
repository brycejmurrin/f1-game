/* lobby-codes.test.mjs — LobbyCodes.codeFrom / paintQr / canShare in a VM. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedClipboard } from "../helpers/seed-clipboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/net/lobby-codes.js"), "utf8");

function boot(opts = {}) {
  const draws = [];
  const sb = {
    console, Object, Array, String, Promise,
    navigator: opts.share ? { share: async () => {} } : {},
    NetHandshake: {
      inviteFromUrl: (raw) => {
        if (String(raw).includes("#vs=")) return String(raw).split("#vs=")[1];
        return null;
      },
      inviteUrl: (code) => "https://x.test/#vs=" + code,
    },
    NetQr: {
      draw: (canvas, payload) => { draws.push(payload); return opts.qrOk !== false; },
    },
    NetScan: { supported: () => false, create: () => ({ start: async () => ({ ok: false }), stop() {} }) },
    ApexClipboard: null,
  };
  const ctx = vm.createContext(sb);
  seedClipboard(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "lobby-codes.js" });
  return { LobbyCodes: vm.runInContext("LobbyCodes", ctx), draws };
}

test("codeFrom trims and unwraps invite URLs", () => {
  const { LobbyCodes } = boot();
  assert.equal(LobbyCodes.codeFrom(""), "");
  assert.equal(LobbyCodes.codeFrom("  APEX1.z.abc  "), "APEX1.z.abc");
  assert.equal(LobbyCodes.codeFrom("https://x.test/play#vs=INVITE"), "INVITE");
});

test("paintQr hides the wrap when encoding fails", () => {
  const { LobbyCodes } = boot({ qrOk: false });
  const wrap = { hidden: true };
  const canvas = {};
  assert.equal(LobbyCodes.paintQr(wrap, canvas, "payload"), false);
  assert.equal(wrap.hidden, true);
  const ok = boot({ qrOk: true });
  const wrap2 = { hidden: true };
  assert.equal(ok.LobbyCodes.paintQr(wrap2, {}, "https://x.test/#vs=a"), true);
  assert.equal(wrap2.hidden, false);
  assert.deepEqual(ok.draws, ["https://x.test/#vs=a"]);
});

test("canShare reflects navigator.share", () => {
  assert.equal(boot().LobbyCodes.canShare(), false);
  assert.equal(boot({ share: true }).LobbyCodes.canShare(), true);
});

test("lobby-codes is on the lazy net roster ahead of lobby", () => {
  const man = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  const iCodes = man.indexOf('"js/net/lobby-codes.js"');
  const iLobby = man.indexOf('"js/net/lobby.js"');
  assert.ok(iCodes > 0 && iLobby > iCodes, "lobby-codes.js must load before lobby.js");
});
