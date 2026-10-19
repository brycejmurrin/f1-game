import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSurveyGallery, galleryEntries } from "../../tools/shot/build-gallery.cjs";
import {
  canonicalSurveyOutput,
  normalizeSurveyRequest,
  prepareSurveyPlans,
  runSurvey,
} from "../../tools/shot/lib/survey-runner.mjs";

// Scratch dirs live under the ignored artifacts/ tree, never the system tmp (AGENTS.md).
const TMP_BASE = (() => {
  const d = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "artifacts", "tmp");
  fs.mkdirSync(d, { recursive: true });
  return d;
})();


const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function fakeHost(dir, { failNames = [] } = {}) {
  return {
    async sessionFor() {
      return {
        boot: { ready: true, diagnostics: { renderer: "test" } },
        record: { ready: true, reusedSession: false },
        async send(cmd) {
          if (cmd.sheet) return { ok: true, png: path.join(dir, `${cmd.sheet}.png`) };
          if (cmd.track) return { ok: true };
          if (failNames.includes(cmd.shot)) return { ok: false, error: "injected failure" };
          const png = path.join(dir, `${cmd.shot}.png`);
          fs.writeFileSync(png, "png");
          return { ok: true, png, spread: 20, kb: 120, timings: { ms: 1 }, frame: 2, track: "monza" };
        },
        async close() {},
      };
    },
    async close() {},
    log() {},
  };
}

test("#1983: a fixture with colliding names keeps distinct gallery entries", () => {
  const shots = [
    { name: "repro-10-orbit", frac: 0.101, cam: "orbit" },
    { name: "repro-10-orbit", frac: 0.104, cam: "orbit" },
  ];
  const entries = galleryEntries(shots);
  assert.equal(entries.length, 2);
  assert.notEqual(entries[0].cellId, entries[1].cellId);
  assert.notEqual(entries[0].image, entries[1].image);
  const dir = fs.mkdtempSync(path.join(TMP_BASE, "apex-gallery-collide-"));
  try {
    const built = buildSurveyGallery(dir, { track: "monza", label: "repro", shots });
    assert.equal(built.entries.length, 2);
    const html = fs.readFileSync(built.file, "utf8");
    assert.equal((html.match(/class="capture /g) || []).length, 2);
    assert.match(html, new RegExp(entries[0].image.replace(".", "\\.")));
    assert.match(html, new RegExp(entries[1].image.replace(".", "\\.")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("#1982: CLI-shaped and MCP-shaped inputs produce the same survey manifest", async () => {
  const cli = normalizeSurveyRequest({
    tracks: "monza", preset: "custom", fracs: [0.101, 0.104], cam: "orbit", label: "repro",
    panel: false, index: true,
  });
  const mcp = normalizeSurveyRequest({
    track: "monza", preset: "custom", fracs: [0.101, 0.104], cam: "orbit", label: "repro",
    panel: false, index: true,
  });
  assert.equal(cli.plans.get("monza").shots.length, 2);
  assert.notEqual(cli.plans.get("monza").shots[0].name, cli.plans.get("monza").shots[1].name);
  assert.deepEqual(
    cli.plans.get("monza").shots.map((s) => ({ name: s.name, frac: s.frac, cam: s.cam })),
    mcp.plans.get("monza").shots.map((s) => ({ name: s.name, frac: s.frac, cam: s.cam })),
  );

  const root = fs.mkdtempSync(path.join(TMP_BASE, "apex-survey-par-"));
  try {
    const { surveyTerminalState } = await import("../../tools/lib/track-shot-survey.mjs");
    const runOne = async (spec, name) => {
      const outRoot = path.join(root, name);
      fs.mkdirSync(outRoot);
      const run = await runSurvey({ ...spec, outRoot, source: { revision: "test" }, gpu: "swiftshader" }, fakeHost(outRoot));
      fs.writeFileSync(path.join(outRoot, "progress.json"), JSON.stringify({
        state: surveyTerminalState(run.trackResults, run.hardFail),
      }));
      return canonicalSurveyOutput(outRoot);
    };
    const a = await runOne(cli, "cli");
    const b = await runOne(mcp, "mcp");
    assert.deepEqual(a, b);
    assert.equal(a.state, "done");
    assert.equal(a.shots.length, 2);
    assert.equal(new Set(a.srcs).size, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  for (const file of ["tools/shot/shot-survey.mjs", "tools/mcp/apex-extras.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(src, /runSurvey\(/, file);
    assert.match(src, /state: surveyTerminalState\(/, file);
  }
});

test("#1982: a failed shot is a failed manifest for both transports", async () => {
  const spec = normalizeSurveyRequest({
    track: "monza", preset: "custom", fracs: [0.1, 0.5], cam: "orbit", label: "repro", panel: false,
  });
  const plans = prepareSurveyPlans(spec.planArgs, spec.tracks);
  const failName = plans.get("monza").shots[1].name;
  const root = fs.mkdtempSync(path.join(TMP_BASE, "apex-survey-fail-"));
  try {
    const outs = [];
    for (const name of ["cli", "mcp"]) {
      const outRoot = path.join(root, name);
      fs.mkdirSync(outRoot);
      const run = await runSurvey({
        ...spec, plans, outRoot, source: { revision: "test" }, gpu: "swiftshader",
      }, fakeHost(outRoot, { failNames: [failName] }));
      const { surveyTerminalState } = await import("../../tools/lib/track-shot-survey.mjs");
      const fs2 = await import("node:fs");
      fs2.writeFileSync(path.join(outRoot, "progress.json"), JSON.stringify({
        state: surveyTerminalState(run.trackResults, run.hardFail),
      }));
      outs.push(canonicalSurveyOutput(outRoot));
    }
    assert.deepEqual(outs[0], outs[1]);
    assert.equal(outs[0].state, "failed");
    assert.equal(outs[0].ok, false);
    assert.equal(outs[0].failed, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
