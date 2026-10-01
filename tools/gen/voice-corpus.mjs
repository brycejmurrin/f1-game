#!/usr/bin/env node
/*
 * @doc Author-time: races the game VM and writes every radio line it spoke, by channel → `tools/gen/voice-corpus.json` (voicepack.mjs records from it).
 * @skill audio-debug
 * EVERY LINE THE GAME ACTUALLY HANDS THE VOICE in a race, by speaker. Race
 * control, the coach and much of the engineer are built in code (penalties,
 * track limits, coaching cues, pit calls), not from the phrasebook, so the only
 * honest list of what they say is what they said: real races in the game VM
 * (tools/lib/game-vm.cjs), whole frames (the card countdown lives in the frame
 * loop), a rough road-follower at the wheel so it crashes and runs wide like a
 * player, and a recording speechSynthesis with the pack off. The speaker is
 * read back from the channel's pitch (js/audio/radio-voice.js TONE).
 *
 * Usage: node tools/gen/voice-corpus.mjs [out.json] [laps]   (~10 min at 3 laps)
 */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGame } = require("../lib/game-vm.cjs");
const out = process.argv[2] || "tools/gen/voice-corpus.json";
const laps = +(process.argv[3] || 4);
const corpus = { control: new Map(), coach: new Map(), radio: new Map(), announcer: new Map(), other: new Map() };
const TRACKS = [["monza", "day", "clear"], ["spa", "day", "rain"], ["monaco", "day", "clear"], ["silverstone", "dusk", "mixed"], ["bahrain", "night", "clear"], ["singapore", "night", "rain"]];

for (const [track, tod, wx] of TRACKS) {
  const g = await createGame({
    track, tod, wx,
    storage: { radioVoice: true, announcer: true, commentary: "on", radioChat: "chatty", radioPack: false, spotter: true, raceLaps: laps, tyreWear: "real", soundOn: true },
    onSandbox: (sb, ctx) => {
      // The channel by its pitch, read from the game's own table (each is distinct).
      let pitchOf = null;
      const speakerOf = (p) => {
        if (!pitchOf) pitchOf = new Map(Object.entries(vm.runInContext("RadioVoice.TONE", ctx)).map(([k, t]) => [+(+t.pitch).toFixed(2), k]));
        return pitchOf.get(+(+p).toFixed(2)) || "other";
      };
      sb.SpeechSynthesisUtterance = function (text) { this.text = text; this.pitch = 1; this.rate = 1; };
      sb.speechSynthesis = { speaking: false, pending: false, getVoices: () => [], cancel() {}, resume() {}, pause() {},
        speak(u) {
          const sp = speakerOf(u.pitch);
          const m = corpus[sp]; m.set(u.text, (m.get(u.text) || 0) + 1);
          if (u.onend) try { u.onend(); } catch (e) { /* the game's */ }
        } };
    },
  });
  try {
    const { G } = g;
    if (G.setSound) G.setSound(true);
    g.apex.headless(true);
    g.apex.go();
    // WHOLE FRAMES (the card countdown and every per-frame system live in the
    // frame loop, not apex.step). The player follows the road roughly: steer
    // toward the centre and into the curve ahead, lift for the tight ones.
    let now = 1000;
    for (let f = 0; f < 60 * 60 * 3 * laps && G.state !== "results"; f++) {
      if (f % 6 === 0 && G.player && G.player.px != null) {
        try {
          const ph = g.apex.physState(), sc = g.apex.scan([15, 40]);
          const x = ph.x || 0, hw = sc[0].hw || 6, k = sc[0].k || 0, kFar = Math.abs(sc[1].k || 0);
          const steer = Math.max(-1, Math.min(1, -x / hw * 0.9 + k * 25));
          const slow = kFar > 0.02 && (ph.speed || 0) > G.vTop() * 0.45;
          g.apex.setInput({ throttle: !slow, brake: slow, steer });
        } catch (e) { g.apex.setInput({ throttle: true }); }
      }
      now += 1000 / 60;
      g.pumpFrame(now);
      if (f % 30 === 0) g.flushTimers(true);
    }
    console.log(track, "state", G.state, "said", Object.fromEntries(Object.entries(corpus).map(([k, m]) => [k, m.size])));
  } catch (e) { console.log(track, "error", e && e.message); }
  finally { g.close(); }
}
fs.writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(corpus).map(([k, m]) => [k, [...m.keys()].sort()])), null, 1));
console.log("wrote", out);
