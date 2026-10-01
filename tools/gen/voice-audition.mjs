#!/usr/bin/env node
// @doc Generate a 12-call voice audition with Kokoro, OpenAI or ElevenLabs; credentials stay author-side.
// @skill audio-debug
// API docs checked 2026-10-01:
// https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
// https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (k, fallback) => { const i = process.argv.indexOf("--" + k); return i < 0 ? fallback : process.argv[i + 1]; };
export const SAMPLES = Object.freeze([
  { speaker: "radio", text: "Box, box. We're going onto the mediums.", delivery: "Calm, concise race engineer over a headset. Natural British English, no theatrical delivery." },
  { speaker: "radio", text: "P three. Nice move.", delivery: "Quietly pleased race engineer. Brief encouragement, then leave space." },
  { speaker: "radio", text: "Norris is one point four seconds ahead. You're in range.", delivery: "Focused race engineer, clear numbers, one continuous sentence." },
  { speaker: "radio", text: "Yellow flag. Slow down, no overtaking.", delivery: "Urgent and clear. Firm instructions without shouting." },
  { speaker: "radio", text: "Car left. Still there. Clear.", delivery: "Quick, clear spotter calls with distinct pauses. No extra words." },
  { speaker: "radio", text: "Last lap. Bring it home.", delivery: "Reassuring race engineer, warm but focused." },
  { speaker: "announcer", text: "Welcome to Apex 26. This is Silverstone, home of the British Grand Prix.", delivery: "Warm motorsport broadcaster opening a live programme. Relaxed, unhurried British English." },
  { speaker: "announcer", text: "And it's lights out and away we go!", delivery: "Excited motorsport commentator. A short energetic burst, clear words." },
  { speaker: "announcer", text: "Norris gets past Piastri for P three!", delivery: "Live play-by-play as a decisive overtake happens. Build excitement through the sentence." },
  { speaker: "announcer", text: "The safety car is out. The field bunches up.", delivery: "Measured factual broadcast update, controlled energy." },
  { speaker: "announcer", text: "By just one point four seconds! Norris wins it!", delivery: "Celebratory close finish. Sound delighted without turning into a scream." },
  { speaker: "announcer", text: "Heavy rain, and it is going to decide this one.", delivery: "Thoughtful colour commentary. Natural pause, understated suspense." },
]);

export function requestFor(provider, voice, model, sample) {
  if (provider === "openai") return { url: "https://api.openai.com/v1/audio/speech", body: {
    model, voice, input: sample.text, instructions: sample.delivery, response_format: "mp3",
  } };
  if (provider === "elevenlabs") return { url: "https://api.elevenlabs.io/v1/text-to-dialogue", body: {
    model_id: model, inputs: [{ voice_id: voice, text: "[" + sample.delivery + "] " + sample.text }],
  } };
  throw new Error("Unsupported API provider");
}

async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write("Usage: node tools/gen/voice-audition.mjs --provider kokoro|openai|elevenlabs --voice <id> [--speaker radio|announcer] [--model <id>]\nOpenAI requires OPENAI_API_KEY; ElevenLabs requires ELEVENLABS_API_KEY. Output: artifacts/voice-audition/.\n");
    return;
  }
  const provider = arg("provider", "kokoro");
  if (!["kokoro", "openai", "elevenlabs"].includes(provider)) throw new Error("Unknown provider");
  const voice = arg("voice", provider === "kokoro" ? "bm_george" : provider === "openai" ? "cedar" : "");
  const model = arg("model", provider === "openai" ? "gpt-4o-mini-tts-2025-12-15" : provider === "elevenlabs" ? "eleven_v4" : "Kokoro-82M-q4");
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : provider === "elevenlabs" ? process.env.ELEVENLABS_API_KEY : null;
  if (!voice || (provider !== "kokoro" && !key)) throw new Error("Configure the provider API key and --voice before generating an audition");
  const speaker = arg("speaker", "all");
  if (!["all", "radio", "announcer"].includes(speaker)) throw new Error("Unknown speaker");
  const samples = SAMPLES.filter((s) => speaker === "all" || s.speaker === speaker);
  const slug = (provider + "-" + voice + "-" + model + "-" + speaker).replace(/[^a-zA-Z0-9_-]/g, "_");
  const out = path.join(ROOT, "artifacts", "voice-audition", slug);
  fs.mkdirSync(out, { recursive: true });
  let tts;
  if (provider === "kokoro") {
    const req = createRequire(path.join(ROOT, arg("kokoro", "scratch/voicepack"), "package.json"));
    const { KokoroTTS } = await import(req.resolve("kokoro-js"));
    tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q4", device: "cpu", session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    });
  }
  const rendered = [];
  for (const sample of samples) {
    const hash = createHash("sha256").update(JSON.stringify({ provider, voice, model, sample })).digest("hex").slice(0, 16);
    const file = hash + (tts ? ".wav" : ".mp3"), dest = path.join(out, file);
    if (!fs.existsSync(dest)) {
      if (tts) { const audio = await tts.generate(sample.text, { voice, speed: 1.08 }); await audio.save(dest); }
      else {
        const req = requestFor(provider, voice, model, sample);
        const headers = { "Content-Type": "application/json" };
        if (provider === "openai") headers.Authorization = "Bearer " + key;
        else headers["xi-api-key"] = key;
        const response = await fetch(req.url, { method: "POST", headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(provider + " generation failed (HTTP " + response.status + ")");
        fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
      }
    }
    rendered.push({ ...sample, file });
  }
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ provider, voice, model, samples: rendered }, null, 2) + "\n");
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  fs.writeFileSync(path.join(out, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Voice audition</title><style>body{font:18px system-ui;max-width:760px;margin:40px auto;padding:20px}article{margin:32px 0}audio{width:100%}</style><h1>' + escape(provider + " · " + voice) + '</h1><p>AI-generated speech. Compare pronunciation, pacing, urgency and listening fatigue.</p>' + rendered.map((s) => '<article><p>' + escape(s.text) + '</p><audio controls preload="none" src="' + s.file + '"></audio></article>').join(""));
  process.stdout.write("Audition: " + path.relative(ROOT, path.join(out, "index.html")) + "\n");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
