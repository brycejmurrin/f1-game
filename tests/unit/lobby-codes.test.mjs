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
        const m = String(raw).match(/[#&]vs=([^&\s]+)/);   // as js/net/handshake.js: a link ends at whitespace...
        return m ? m[1].replace(/[^A-Za-z0-9_-]+$/, "") : null;   // ...and a code never ends in punctuation
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

test("codeFrom lifts a code out of a message and re-joins one a mail client hard-wrapped", () => {
  // 2026-09-27: peekCode strips whitespace, so a code copied with the sender's
  // words around it became body+prose — "corrupt" for a code that was fine —
  // and the MAKE ANSWER / ACCEPT buttons read the raw box, so a link that got
  // there without a paste event (keyboard clipboard chip) was "not a code".
  const { LobbyCodes } = boot();
  const body = "Q".repeat(60) + "_-" + "z".repeat(58);
  const code = "APEX1.s." + body;
  assert.equal(LobbyCodes.codeFrom("here you go: " + code + " thanks!"), code, "prose on both sides");
  assert.equal(LobbyCodes.codeFrom(code + "\nSent from my iPhone"), code, "a signature after the code");
  assert.equal(LobbyCodes.codeFrom(code + " thanks"), code, "one short word after an unwrapped code is not a fragment");
  // A 76-column hard wrap: long fragments, then a short tail as the LAST token.
  const wrapped = code.slice(0, 76) + "\n" + code.slice(76, 152) + "\n" + code.slice(152);
  assert.ok(code.slice(152).length < 20, "the fixture's tail is short on purpose");
  assert.equal(LobbyCodes.codeFrom(wrapped), code, "re-joined");
  assert.equal(LobbyCodes.codeFrom("code:\n" + wrapped), code, "wrapped, with a word before it");
  // Text with no code at all is handed on as-is for peekCode's verdict.
  assert.equal(LobbyCodes.codeFrom("not a code at all"), "not a code at all");
  assert.equal(LobbyCodes.codeFrom("nocode"), "nocode");
  // A link inside a message still wins as a link.
  assert.equal(LobbyCodes.codeFrom("join me https://x.test/play#vs=" + code + " now"), code);
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

test("codeFrom lifts a code out of a LINK inside a sentence, wrapped or followed by punctuation", () => {
  const { LobbyCodes } = boot();
  const body = "s." + "Q".repeat(60);
  const code = "APEX1." + body;
  // A sentence ends after the link: "…#vs=CODE." read as four dot-separated
  // parts and was refused as not an Apex code; "(…#vs=CODE)" as corrupt.
  assert.equal(LobbyCodes.codeFrom("Race me: https://x.test/#vs=" + code + "."), code);
  assert.equal(LobbyCodes.codeFrom("(https://x.test/#vs=" + code + ")"), code);
  // A plain-text mail client folds the link: the fragment after the fold is
  // re-joined exactly as a bare code's is (2026-09-27), instead of stopping
  // at the fold and handing on a truncated code.
  const head = code.slice(0, 40), tail = code.slice(40);
  assert.equal(LobbyCodes.codeFrom("https://x.test/#vs=" + head + "\n" + tail + "\nSent from my phone"), code);
  // Zero-width characters a chat client slips into a long string are not
  // whitespace to \s, and one of them made a good code "corrupt".
  assert.equal(LobbyCodes.codeFrom(code.slice(0, 20) + "\u200B" + code.slice(20) + "\u00AD"), code);
  assert.equal(LobbyCodes.codeFrom("https://x.test/#vs=" + code.slice(0, 20) + "\u2060" + code.slice(20)), code);
});

test("codeFrom lifts a BARE code out of brackets, quotes and a sentence's end", () => {
  // The link path trimmed trailing punctuation (inviteFromUrl); a bare code in
  // "(APEX1.\u2026)." or "\"APEX1.\u2026\"," started with a bracket, so it was never
  // found and the whole paste read as "not an invite code".
  const { LobbyCodes } = boot();
  const code = "APEX1.s." + "Q".repeat(60) + "_-" + "z".repeat(58);
  assert.equal(LobbyCodes.codeFrom("(" + code + ")."), code);
  assert.equal(LobbyCodes.codeFrom("Here: \"" + code + "\", thanks"), code);
  assert.equal(LobbyCodes.codeFrom("[" + code + "]"), code);
  assert.equal(LobbyCodes.codeFrom(code + "."), code);
  // Punctuation ends the code: a long word after it is not a fragment.
  assert.equal(LobbyCodes.codeFrom(code + ". " + "w".repeat(30)), code);
  // A bracketed, hard-wrapped code keeps its short tail without the bracket.
  const wrapped = code.slice(0, 76) + "\n" + code.slice(76, 152) + "\n" + code.slice(152);
  assert.equal(LobbyCodes.codeFrom("(" + wrapped + ")."), code);
  // \u2026an unbracketed one does not glue on a punctuated last word.
  assert.equal(LobbyCodes.codeFrom(code.slice(0, 76) + "\n" + code.slice(76, 152) + "\nok!"), code.slice(0, 152));
});

// L8-e: a share sheet that fails (not cancelled) has SPENT the tap; Safari then
// refuses a clipboard write. Try the copy once, and if it fails say which tap
// will work instead of "Could not copy".
function bootShare({ shareError, clipboardOk }) {
  const said = [];
  const sb = {
    console, Object, Array, String, Promise,
    navigator: { share: async () => { const e = new Error("x"); e.name = shareError; throw e; } },
    NetHandshake: { inviteFromUrl: () => null, inviteUrl: (c) => "https://x.test/#vs=" + c },
    NetQr: { draw: () => true },
    NetScan: { supported: () => false, create: () => ({ start: async () => ({ ok: false }), stop() {} }) },
  };
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "lobby-codes.js" });
  ctx.ApexClipboard = { write: async () => clipboardOk };
  const codes = vm.runInContext("LobbyCodes", ctx).create({
    els: () => ({}), $: () => null, say: (m, err) => said.push([m, !!err]),
    makeAnswer() {}, acceptAnswer() {}, cancelledResult: () => ({ ok: false }),
    has: () => false, focusInto() {}, shownStep: () => null,
  });
  return { codes, said };
}

test("a failed share copies if it still can, else asks for the COPY tap", async () => {
  const lost = bootShare({ shareError: "NotAllowedError", clipboardOk: false });
  assert.equal(await lost.codes.handOff({ url: "u" }, "CODE"), false);
  assert.deepEqual(lost.said.at(-1), ["Sharing failed — tap COPY to copy the code.", true]);
  const kept = bootShare({ shareError: "DataError", clipboardOk: true });
  assert.equal(await kept.codes.handOff({ url: "u" }, "CODE"), true);
  assert.match(kept.said.at(-1)[0], /copied instead/);
  const cancelled = bootShare({ shareError: "AbortError", clipboardOk: true });
  assert.equal(await cancelled.codes.handOff({ url: "u" }, "CODE"), false);
  assert.equal(cancelled.said.length, 0, "a cancelled sheet is the player's choice: nothing said, nothing copied");
});
