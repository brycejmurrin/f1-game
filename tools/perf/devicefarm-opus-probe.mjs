// @doc A·H18's Opus decodeAudioData probe (#3710): the function devicefarm-iphone.mjs `opus` serialises into Safari.
// Self-contained: three 0.06 s Opus clips (Ogg, WebM, CAF) are embedded and the only fetch is an MP3 control, one real
// clip from the live george pack by Range request. It runs in the PAGE, not in node: it is sent as source text through
// WebDriver execute/async, so it may touch only browser globals and nothing from this module.
export default async function opusProbe() {
  const B64 = { ogg: "T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAAAASZW+VAEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABHgMAAAAAAAAAAAAAAIAAAB5JR4OBEU7Mh94ggG3bEck6gJGb/q2A4yBNNboXgHrG7Fe78l4GPIKsyFBzNGmn+GKm4ada4HqBJ7rQIorR1AoCdBGUwB0TbafesP0APl4oz/3rJiFA1wmClefivKNPWyFTMAT6kG2Yed3+3cUzFh1rzUSx/cLIQV4W+FGeLL14n2PtXj6aSnTy3iboxJRRQCs41GbcyG875GH/caGJGY0Sci32GDsrhkNeobIkg5fhZVJgoXdRj72lCmLeAZNpoExSNLAZ4ssddqo352sB/U6sgIJS3M97fBiZw==", webm: "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAKXEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEwTbuMU6uEHFO7a1OsggKB7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBRAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQOdwAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBgLsAAAAAABJUw2fRc3POY8CLY8WIAAAAAAAAAAFnyJlFo4dFTkNPREVSRIeMTGF2YyBsaWJvcHVzZ8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4wNjgwMDAwMDAAH0O2dUD154EAo8mBAACAeIIBt2xHJOoCRm/6tgOMgTTW6F4B6xuxXu/JeBjyCrMhQczRpp/hipuGnWuB6gSe60CKK0dQKAnQRlMAdE22n3rD9AD5o7+BABWAeKM/96yYhQNcJgpXn4ryjT1shUzAE+pBtmHnd/t3FMxYda81Esf3CyEFeFvhRniy9eJ9j7V4+mkp08ujtoEAKYB4m6MSUUUArONRm3MhvO+Rh/3GhiRmNEnIt9hg7K4ZDXqGyJIOX4WVSYKF3UY+9pQpi6CsoaOBAD0AeAZNpoExSNLAZ4ssddqo352sB/U6sgIJS3M97fBiZ3WihADN/mAcU7trkbuPs4EAt4r3gQHxggGG8IED", caf: "Y2FmZgABAABkZXNjAAAAAAAAACBA53AAAAAAAG9wdXMAAAAAAAAAAAAAA8AAAAABAAAAAGNoYW4AAAAAAAAADABkAAEAAAAAAAAAAGluZm8AAAAAAAAAGgAAAAFlbmNvZGVyAExhdmY2MC4xNi4xMDAAZGF0YQAAAAAAAADVAAAAAHiCAbdsRyTqAkZv+rYDjIE01uheAesbsV7vyXgY8gqzIUHM0aaf4Yqbhp1rgeoEnutAiitHUCgJ0EZTAHRNtp96w/QA+XijP/esmIUDXCYKV5+K8o09bIVMwBPqQbZh53f7dxTMWHWvNRLH9wshBXhb4UZ4svXifY+1ePppKdPLeJujElFFAKzjUZtzIbzvkYf9xoYkZjRJyLfYYOyuGQ16hsiSDl+FlUmChd1GPvaUKYt4Bk2mgTFI0sBniyx12qjfnawH9TqyAglLcz3t8GJncGFrdAAAAAAAAAAcAAAAAAAAAAQAAAAAAAAPAAAAAAAAAAAARTsyHw==" };
  const out = { ua: navigator.userAgent, offline: typeof OfflineAudioContext === "function", webkitOffline: typeof webkitOfflineAudioContext === "function", canPlay: {}, decode: {} };
  const a = document.createElement("audio");
  for (const [k, t] of Object.entries({ ogg: 'audio/ogg; codecs="opus"', webm: 'audio/webm; codecs="opus"', caf: 'audio/x-caf; codecs="opus"', mp4: 'audio/mp4; codecs="opus"', mp3: "audio/mpeg" })) out.canPlay[k] = a.canPlayType(t);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const dec = (buf) => new Promise((res) => {
    const t0 = performance.now(); let done = false;
    const fin = (ok, extra) => { if (done) return; done = true; res(Object.assign({ ok, ms: +(performance.now() - t0).toFixed(1) }, extra || {})); };
    try {
      const ctx = new OAC(1, 4800, 48000);
      setTimeout(() => fin(false, { err: "timeout 3s" }), 3000);
      const p = ctx.decodeAudioData(buf, (b) => fin(!!(b && b.length), { len: b && b.length, sr: b && b.sampleRate, dur: b && +b.duration.toFixed(3) }), (e) => fin(false, { err: String(e && (e.name || e.message) || e) }));
      if (p && p.catch) p.catch((e) => fin(false, { err: String(e && (e.name || e.message) || e) }));
    } catch (e) { fin(false, { err: "throw " + String(e && e.message) }); }
  });
  for (const [k, s] of Object.entries(B64)) out.decode[k] = await dec(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);
  try {
    const base = "https://brycejmurrin.github.io/f1-game/assets/voice/";
    const man = await (await fetch(base + "george.json", { cache: "no-store" })).json();
    const key = Object.keys(man.clips).find((x) => x === "box box box") || Object.keys(man.clips)[0];
    const [off, len] = man.clips[key];
    const r = await fetch(base + "george.bin", { headers: { Range: `bytes=${off}-${off + len - 1}` }, cache: "no-store" });
    let ab = await r.arrayBuffer();
    if (ab.byteLength !== len) ab = ab.slice(off, off + len);   // the server ignored the Range header
    out.decode.mp3 = Object.assign(await dec(ab), { key, status: r.status });
  } catch (e) { out.decode.mp3 = { ok: false, err: "fetch " + String(e && e.message) }; }
  if (window.VoicePack && VoicePack.codecs) { try { out.gameProbe = await VoicePack.codecs(); } catch (e) { out.gameProbe = "err " + e.message; } }
  return JSON.stringify(out);
}
