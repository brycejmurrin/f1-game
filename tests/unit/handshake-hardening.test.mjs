/* handshake-hardening.test.mjs — #6840: S5+r11 (decode shape), S4 (build), S6 (answer needs o), S10 (hash-only link). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const ctx = vm.createContext({
    console, Object, Array, String, Promise, Number, JSON, Math, URL,
    TextEncoder, TextDecoder, Uint8Array, Blob, Response, atob, btoa,
    DecompressionStream, CompressionStream,
    document: { querySelector: () => ({ content: "1700" }) },
    Log: { info() {}, warn() {}, error() {}, debug() {} },
    NetSdp: { identity: (sdp) => { const m = /ufrag:(\S+)/.exec(sdp); return m ? { ufrag: m[1], fp: "fp" } : null; },
      unpack: (x) => x, pack: (x) => x },
    Hash32: { fnv1a: (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) },
  });
  for (const f of ["js/net/bytes.js", "js/net/handshake.js"]) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  return vm.runInContext("NetHandshake", ctx);
}
const H = boot();

// Mode z/p bodies are plain JSON; build them by hand so an array can be encoded.
const pCode = (body) => "APEX1.p." + Buffer.from(JSON.stringify(body)).toString("base64url");

test("S5/r11: decodeCode refuses an array, a scalar or a kind-less object in mode p", async () => {
  for (const body of [[1, 2], 5, "x", { b: 1 }, null]) {
    const r = await H.decodeCode(pCode(body));
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.error, "corrupt_code");
  }
  const ok = await H.decodeCode(pCode({ k: "offer", b: 1 }));
  assert.equal(ok.ok, true);
});

test("S4: a non-numeric build is build_unknown; a numeric string equals the number", () => {
  assert.equal(H.checkBuild(1695, "1695").ok, true);
  assert.equal(H.checkBuild(1695, 1695).ok, true);
  for (const bad of ["abc", NaN, {}, [], "", "12x"]) {
    const r = H.checkBuild(1695, bad);
    assert.equal(r.error, "build_unknown", String(bad));
  }
  assert.equal(H.checkBuild(1695, 1700).message.includes("newer"), true);
  assert.equal(H.checkBuild(1695, 1600).message.includes("older"), true);
});

function answerFor(o) {
  const payload = { k: "answer", b: 1, s: "v=0\r\na=ice-ufrag:abcd\r\n" };
  if (o !== undefined) payload.o = o;
  return H.encodeCode(payload);
}
function fakeTransport(calls) {
  return { pc: { signalingState: "have-local-offer",
    localDescription: { sdp: "v=0\r\na=ice-ufrag:abcd\r\n" },
    setRemoteDescription: async (d) => { calls.push(d); } } };
}

