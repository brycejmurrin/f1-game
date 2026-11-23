/* announce-life.mjs — the race-radio card's REAL life, from js/race/announce-banner.js.
 *
 * showAnnounce() sets the card's life (announceT) and hands that same number to
 * RadioVoice.say() as the utterance budget. Tests that check "a line fits its
 * card" used to recompute the life with their own copy of the expression; a
 * change to the banner's floor or pad then passed them. This runs the banner:
 *
 *   const life = announceLife(RadioVoice);   // RadioVoice from the caller's VM
 *   life("BOX BOX", 2.4, "box")              // -> the seconds the card stays up
 *
 * Each call uses a fresh banner (no queue, no floor from a previous card), at
 * state "menu" so no radio cue is played; the life does not depend on state.
 */
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";

export function announceLife(RadioVoice) {
  const file = "js/race/announce-banner.js";
  const ctx = vm.createContext({ RadioVoice, GameAudio: { radioLeadS: () => 0, radioSting() {} } });
  vm.runInContext(fs.readFileSync(absSrc(file), "utf8") + "\nglobalThis.AnnounceBanner = AnnounceBanner;", ctx, { filename: absSrc(file) });
  const el = () => ({ textContent: "", className: "", dataset: {}, hidden: true });
  return (msg, dur, kind) => {
    let said = null;
    const els = { announce: el(), announceText: el(), announceWho: el(), announceNum: el(), announceLive: el() };
    const banner = ctx.AnnounceBanner.create({
      els: () => els, player: () => ({ name: "Test Driver", num: 1 }), history: () => null, state: () => "menu",
      hudProfile: () => "broadcast", camModes: () => [{ id: "chase" }], camMode: () => 0,
      radioVoice: () => ({ say: (_m, life) => { said = life; } }),
    });
    banner.announce(msg, dur, kind);
    if (said !== banner.t) throw new Error(`showAnnounce gave the voice ${said} s but the card ${banner.t} s`);
    return banner.t;
  };
}
