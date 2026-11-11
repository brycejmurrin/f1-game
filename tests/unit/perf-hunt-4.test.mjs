// perf-hunt-4 — behaviour checks for the 2026-10-29 code-survey perf sweep (PR #4190). The shader
// gates are bit-identical and covered by the backend parity tests (puddles.test.mjs) and the
// gpu-census; source pins for them are not added here (the tree-wide assertPins ratchet).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Behaviour, not source: SOUND OFF suspends the (fake) context and a later tap does not wake it;
// SFX OFF builds no engine graph and SFX ON builds it. Game VM + tests/unit/fake-audio-vm.cjs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

async function bootAudio() {
  const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
  const { install } = require("./fake-audio-vm.cjs");
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  const ctx = fa.made[fa.made.length - 1];
  const calls = { suspend: 0, resume: 0 };
  ctx.suspend = () => { calls.suspend++; ctx.state = "suspended"; if (ctx.onstatechange) ctx.onstatechange(); return Promise.resolve(); };
  ctx.resume = () => { calls.resume++; ctx.state = "running"; if (ctx.onstatechange) ctx.onstatechange(); return Promise.resolve(); };
  return { g, sb, fa, ctx, calls };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("SOUND OFF suspends the context; a tap leaves it suspended; SOUND ON resumes it", async () => {
  const { g, sb, ctx, calls } = await bootAudio();
  try {
    assert.equal(ctx.state, "running");
    sb.GameAudio.setEnabled(false);
    g.flushTimers();   // the VM queues setTimeout; fire the post-glide suspend
    await wait(5);
    assert.equal(ctx.state, "suspended", "muted context is suspended after the gain glide");
    sb.dispatchEvent({ type: "pointerdown", pointerType: "touch", isTrusted: true });
    await wait(20);
    assert.equal(ctx.state, "suspended", "a gesture must not wake a context muted on purpose");
    sb.GameAudio.setEnabled(true);
    await wait(20);
    assert.equal(ctx.state, "running", "SOUND ON resumes");
    assert.ok(calls.suspend === 1 && calls.resume >= 1, JSON.stringify(calls));
  } finally { g.close(); }
});

test("SFX OFF builds no engine graph; SFX ON mid-race builds it", async () => {
  const { g, sb, fa } = await bootAudio();
  try {
    const oscs = () => [...fa.live].filter((n) => (n.kind === "osc" || n.kind === "src") && n.started && n.stopAt === undefined).length;
    sb.GameAudio.setSfxEnabled(false);
    const before = oscs();
    sb.GameAudio.startEngine();
    assert.equal(oscs(), before, "no engine sources start with SFX off");
    sb.GameAudio.setSfxEnabled(true);
    assert.ok(oscs() > before + 5, "SFX ON builds the engine graph: " + (oscs() - before));
    sb.GameAudio.setSfxEnabled(false);
    sb.GameAudio.stopEngine();
  } finally { g.close(); }
});
