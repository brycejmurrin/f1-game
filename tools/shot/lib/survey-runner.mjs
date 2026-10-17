// survey-runner.mjs — one survey loop for the CLI and the synchronous MCP adapter.
// @doc Shared shot-survey runner: identical plans, failure state and gallery rows for CLI and MCP.
// @skill survey-track
import fs from "node:fs";
import path from "node:path";
import { buildSurveyGallery } from "../build-gallery.cjs";
import {
  buildSurveyPlans,
  estimateSurveyMs,
  filterResumeShots,
  normalizeSurveyTracks,
  scoreShotFindings,
  writeCompareIndex,
  writeSurveyFindings,
  writeSurveyProgress,
} from "../../lib/track-shot-survey.mjs";
import { captureIdentity } from "../../lib/survey-scenarios.mjs";

function pctTag(frac) {
  return String(Math.round(Number(frac) * 100)).padStart(2, "0");
}

function uniqueName(name, n) {
  const suffix = `--${n}`;
  return name.slice(0, Math.max(1, 80 - suffix.length)) + suffix;
}

function draftNames(args) {
  const label = String(args.label || args.prefix || "survey");
  const cams = Array.isArray(args.cam) ? args.cam : Array.isArray(args.cams) ? args.cams : [args.cam || args.cams || "orbit"];
  const draft = [];
  for (const frac of args.fracs) {
    for (const cam of cams) draft.push({ frac: Number(frac), cam: String(cam), name: `${label}-${pctTag(frac)}-${cam}` });
  }
  return draft;
}

/** Give colliding cells distinct file names before the planner rejects or overwrites them (#1983). */
export function disambiguateSurveyArgs(args = {}) {
  if (Array.isArray(args.shots) && args.shots.length) {
    const seen = new Map();
    let clash = false;
    for (const shot of args.shots) {
      const name = shot.name ? String(shot.name) : "";
      if (!name) continue;
      const n = (seen.get(name) || 0) + 1;
      seen.set(name, n);
      if (n > 1) clash = true;
    }
    if (!clash) return args;
    const occ = new Map();
    return {
      ...args,
      shots: args.shots.map((shot, i) => {
        const name = shot.name ? String(shot.name) : `shot-${i + 1}`;
        const n = (occ.get(name) || 0) + 1;
        occ.set(name, n);
        return n === 1 ? shot : { ...shot, name: uniqueName(name, n) };
      }),
    };
  }
  if (!Array.isArray(args.fracs) || !args.fracs.length || args.location || args.locations) return args;
  const draft = draftNames(args);
  const totals = new Map();
  for (const row of draft) totals.set(row.name, (totals.get(row.name) || 0) + 1);
  if (![...totals.values()].some((n) => n > 1)) return args;
  const occ = new Map();
  const shots = draft.map((row) => {
    const n = (occ.get(row.name) || 0) + 1;
    occ.set(row.name, n);
    return {
      name: n === 1 ? row.name : uniqueName(row.name, n),
      frac: row.frac,
      cam: row.cam,
      tod: args.tod,
      weather: args.weather,
      az: args.az,
      el: args.el,
      dist: args.dist,
      h: args.h,
      side: args.side,
      hud: args.hud,
    };
  });
  return { ...args, preset: args.preset || "custom", shots };
}

export function prepareSurveyPlans(args, tracks) {
  return buildSurveyPlans(disambiguateSurveyArgs(args), tracks);
}

/** The request both transports turn flags / tool args into, before a browser starts. */
export function normalizeSurveyRequest(input = {}) {
  const tracks = normalizeSurveyTracks({
    track: input.track,
    tracks: input.tracks == null ? undefined : (Array.isArray(input.tracks) ? input.tracks : String(input.tracks).split(",").map((s) => s.trim()).filter(Boolean)),
  });
  const planArgs = { ...input, track: tracks[0], tracks };
  delete planArgs.out;
  delete planArgs.resume;
  delete planArgs.panel;
  delete planArgs.index;
  delete planArgs.dryRun;
  delete planArgs.async;
  delete planArgs.keepSession;
  delete planArgs.closeSession;
  delete planArgs.image;
  delete planArgs.gl;
  const plans = prepareSurveyPlans(planArgs, tracks);
  const profile = input.profile || (input.location || input.locations ? "preview" : "comparison");
  return {
    tracks,
    planArgs,
    plans,
    profile,
    seed: input.seed == null ? 2391 : Number(input.seed),
    resume: !!input.resume,
    wantPanel: input.panel !== false && input.noPanel !== true,
    wantIndex: input.index !== false && input.noIndex !== true,
    coldSessions: !!input.coldSessions,
    estimateMs: [...plans.values()].reduce((sum, plan) => sum + estimateSurveyMs(plan.shots.length, 1), 0),
  };
}

function canonicalShot(shot) {
  const { png, kb, spread, timings, flags, resumed, file, ...rest } = shot;
  return { ...rest, flags: flags || [], png: png ? path.basename(png) : null };
}

/** Comparable manifest: progress state, findings rows, gallery image srcs. Absolute dirs are basenames. */
export function canonicalSurveyOutput(outDir) {
  const progress = JSON.parse(fs.readFileSync(path.join(outDir, "progress.json"), "utf8"));
  const findingsPath = path.join(outDir, "findings.json");
  const findings = fs.existsSync(findingsPath) ? JSON.parse(fs.readFileSync(findingsPath, "utf8")) : null;
  const htmlPath = path.join(outDir, "index.html");
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  return {
    state: progress.state,
    failed: findings ? findings.failed : null,
    ok: findings ? findings.ok : null,
    shots: findings ? findings.shots.map(canonicalShot) : [],
    srcs: [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]),
  };
}

/**
 * Capture, resume, sheet, gallery and findings. `host.sessionFor` is the only
 * transport difference between the CLI child and the MCP session.
 */
export async function runSurvey(spec, host) {
  const {
    tracks, plans, outRoot, resume, wantPanel, wantIndex, profile, seed, source, gpu,
    coldSessions = false,
  } = spec;
  const trackResults = [];
  let hardFail = false;
  const log = host.log || (() => {});
  try {
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti];
      const plan = plans.get(track);
      if (!plan || !plan.shots.length) continue;
      const outDir = tracks.length === 1 ? outRoot : path.join(outRoot, track);
      fs.mkdirSync(outDir, { recursive: true });
      const identityContext = {
        extension: profile === "preview" ? "jpg" : "png",
        identities: Object.fromEntries(plan.shots.map((s) => [s.name, captureIdentity({ source, track, shot: s, profile, seed, gpu })])),
      };
      const { pending, resumed, invalid } = filterResumeShots(outDir, plan.shots, resume, identityContext);
      for (const bad of invalid) log(`shot-survey: ${track}/${bad.name}.${identityContext.extension} is not a valid image (${bad.reason}); recapturing\n`);
      const invalidNames = new Set(invalid.map((b) => b.name));
      for (const s of pending) {
        if (!invalidNames.has(s.name) && fs.existsSync(path.join(outDir, `${s.name}.${identityContext.extension}`))) {
          throw new Error("Existing capture does not match this plan/revision; choose a new output directory: " + s.name);
        }
      }
      writeSurveyProgress(outRoot, {
        state: "running", track, tracks, trackIndex: ti, pending: pending.length, resumed: resumed.length, invalid,
        shotsPerTrack: plan.shots.length, estimateMs: spec.estimateMs,
      });
      const captured = resumed.map((s) => ({ ...s, track, flags: scoreShotFindings(s) }));
      const failed = [];
      let panelPng = null;
      const existingPanel = path.join(outDir, `${plan.sheetName}.png`);
      if (fs.existsSync(existingPanel)) panelPng = existingPanel;
      try {
        if (pending.length) {
          const session = await host.sessionFor(track, outDir);
          fs.writeFileSync(path.join(outDir, "session.json"), JSON.stringify({
            source, profile, seed, ...(session.record || session.boot || {}),
          }, null, 2));
          for (let si = 0; si < pending.length; si++) {
            const s = pending[si];
            writeSurveyProgress(outRoot, {
              state: "shooting", track, tracks, trackIndex: ti, shotIndex: si,
              shot: s.name, pendingLeft: pending.length - si, captured: captured.length,
            });
            let reply;
            try {
              reply = await session.send({
                ...s, shot: s.name, frac: s.frac, cam: s.cam, az: s.az, el: s.el, dist: s.dist,
                h: s.h, side: s.side, tod: s.tod, weather: s.weather, hud: s.hud,
              });
            } catch (e) {
              failed.push({ ...s, track, error: String(e.message || e) });
              continue;
            }
            if (reply.ok) {
              if (host.onShot) host.onShot();
              const row = { ...s, track: reply.track || track, png: reply.png, spread: reply.spread, kb: reply.kb, timings: reply.timings };
              if (reply.png) {
                fs.writeFileSync(reply.png + ".capture.json", JSON.stringify({
                  identity: identityContext.identities[s.name], source, profile, seed,
                  job: { ...s, track }, timings: reply.timings, frame: reply.frame,
                  state: { plugin: { renderer: session.boot && session.boot.diagnostics } },
                }, null, 2));
              }
              row.flags = scoreShotFindings(row);
              captured.push(row);
            } else failed.push({ ...s, track, error: reply.error || "shot failed" });
          }
          if (wantPanel && captured.length) {
            try {
              const sh = await session.send({ sheet: plan.sheetName, cols: plan.cols || 0 });
              if (sh.ok) panelPng = sh.png;
            } catch (e) {
              log(`[shot-survey] panel failed: ${e.message}\n`);
            }
          }
        }
        let indexHtml = null;
        if (wantIndex && captured.length) {
          indexHtml = buildSurveyGallery(outDir, {
            track: captured[0]?.track || track, label: plan.label, preset: plan.preset, shots: captured,
          }).file;
        }
        const findings = writeSurveyFindings(outDir, {
          ok: failed.length === 0 && captured.length > 0, failed: failed.length, failures: failed,
          track: captured[0]?.track || track, label: plan.label, preset: plan.preset, shots: captured, panelPng, indexHtml,
        });
        trackResults.push({
          track: captured[0]?.track || track, out: outDir, captured: captured.length, failed: failed.length,
          panel: panelPng, indexHtml, shots: captured, findings: findings.file, findingsSummary: findings.findings,
          failures: failed.length ? failed : undefined,
          relIndex: indexHtml ? path.relative(outRoot, indexHtml) : `${track}/index.html`,
        });
        if (!captured.length || failed.length) hardFail = true;
      } catch (e) {
        hardFail = true;
        trackResults.push({ track, out: outDir, error: String(e.message || e) });
        log(`[shot-survey] ${track}: ${e.message || e}\n`);
        if (host.close) await host.close();
      } finally {
        if (coldSessions && host.close) await host.close();
      }
    }
  } finally {
    if (host.close) await host.close();
  }

  let compareIndex = null;
  if (tracks.length > 1 && wantIndex) {
    compareIndex = writeCompareIndex(outRoot, {
      label: plans.get(tracks[0])?.label, preset: plans.get(tracks[0])?.preset,
      tracks: trackResults.map((t) => ({
        track: t.track, captured: t.captured, shots: t.shots, failed: t.failed, failures: t.failures, error: t.error,
        panel: t.panel ? path.relative(outRoot, t.panel) : null,
        relIndex: t.indexHtml ? t.relIndex || `${t.track}/index.html` : null,
      })),
    });
  }
  return { trackResults, hardFail, compareIndex };
}
