import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildSurveyGallery, galleryEntries } from "../../tools/shot/build-gallery.cjs";
import {
  canonicalSurveyOutput,
  normalizeSurveyRequest,
} from "../../tools/shot/lib/survey-runner.mjs";

// Scratch dirs live under the ignored artifacts/ tree, never the system tmp (AGENTS.md).
const TMP_BASE = (() => {
  const d = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "artifacts", "tmp");
  fs.mkdirSync(d, { recursive: true });
  return d;
})();


const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

// The fake host both REAL entry points load: the CLI through APEX_SURVEY_HOST_MODULE (tools/shot/shot-survey.mjs),
// the MCP handler through ctx.surveyHost (tools/mcp/apex-extras.mjs). Written under artifacts/tmp, one file per run.
const FAKE_HOST_SRC = `
import fs from "node:fs";
import path from "node:path";
export default function fakeHost({ outRoot }) {
  const failNames = (process.env.APEX_FAKE_FAIL || "").split(",").filter(Boolean);
  return {
    async sessionFor(track, dir) {
      return {
        boot: { ready: true, diagnostics: { renderer: "test" } },
        record: { ready: true, reusedSession: false },
        async send(cmd) {
          if (cmd.sheet) return { ok: true, png: path.join(dir, cmd.sheet + ".png") };
          if (cmd.track) return { ok: true };
          if (failNames.includes(cmd.shot)) return { ok: false, error: "injected failure" };
          const png = path.join(dir, cmd.shot + ".png");
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
`;

const SPEC = { preset: "custom", fracs: [0.101, 0.104], cam: "orbit", label: "repro", panel: false, index: true };

/** Run the REAL CLI (tools/shot/shot-survey.mjs) with the fake host injected; returns {status, outRoot}. */
function runCli(root, name, { fail = [], fracs = SPEC.fracs } = {}) {
  const outRoot = path.join(root, name);
  const hostFile = path.join(root, `${name}-host.mjs`);
  fs.writeFileSync(hostFile, FAKE_HOST_SRC);
  const r = spawnSync(process.execPath, ["tools/shot/shot-survey.mjs", "--tracks", "monza", "--preset", "custom",
    "--fracs", fracs.join(","), "--plan-json", JSON.stringify({ cam: SPEC.cam }), "--label", SPEC.label, "--no-panel", "--out", outRoot], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
    env: { ...process.env, APEX_SURVEY_HOST_MODULE: hostFile, APEX_FAKE_FAIL: fail.join(",") },
  });
  return { status: r.status, outRoot, stderr: r.stderr };
}

/** Run the REAL MCP handler (createExtras → apex_shot_survey) with the same fake host injected via ctx.surveyHost. */
async function runMcp(root, name, { fail = [], fracs = SPEC.fracs } = {}) {
  const outRoot = path.join(root, name);
  const hostFile = path.join(root, `${name}-host.mjs`);
  fs.writeFileSync(hostFile, FAKE_HOST_SRC);
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const toolResult = (value, { isError = false } = {}) => ({
    content: [{ type: "text", text: JSON.stringify(value) }], ...(isError || value.ok === false ? { isError: true } : {}),
  });
  const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix }, { isError: true });
  const before = new Set(process.listeners("exit"));
  const prevFail = process.env.APEX_FAKE_FAIL;
  process.env.APEX_FAKE_FAIL = fail.join(",");
  try {
    const fake = (await import(`${hostFile}?${name}`)).default;
    const extras = createExtras({ ROOT, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, log() {}, mockMode: () => false,
      surveyHost: ({ outRoot: o }) => fake({ outRoot: o }) });
    const res = await extras.handlers.apex_shot_survey({ track: "monza", ...SPEC, fracs, out: outRoot, async: false, image: false });
    return { body: JSON.parse(res.content[0].text), outRoot };
  } finally {
    if (prevFail === undefined) delete process.env.APEX_FAKE_FAIL; else process.env.APEX_FAKE_FAIL = prevFail;
    for (const l of process.listeners("exit")) if (!before.has(l)) process.removeListener("exit", l);
  }
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

test("#1982: the real CLI and the real MCP handler produce the same survey manifest", async () => {
  const cli = normalizeSurveyRequest({ tracks: "monza", ...SPEC });
  assert.equal(cli.plans.get("monza").shots.length, 2);
  assert.notEqual(cli.plans.get("monza").shots[0].name, cli.plans.get("monza").shots[1].name);

  const root = fs.mkdtempSync(path.join(TMP_BASE, "apex-survey-par-"));
  try {
    const c = runCli(root, "cli");
    assert.equal(c.status, 0, c.stderr);
    const m = await runMcp(root, "mcp");
    assert.equal(m.body.ok, true, JSON.stringify(m.body));
    const a = canonicalSurveyOutput(c.outRoot);
    const b = canonicalSurveyOutput(m.outRoot);
    assert.deepEqual(a, b);
    assert.equal(a.state, "done");
    assert.equal(a.shots.length, 2);
    assert.equal(new Set(a.srcs).size, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("#1982: a failed shot is a failed manifest for both real transports", async () => {
  const spec = normalizeSurveyRequest({ track: "monza", ...SPEC, fracs: [0.1, 0.5] });
  const failName = spec.plans.get("monza").shots[1].name;
  const root = fs.mkdtempSync(path.join(TMP_BASE, "apex-survey-fail-"));
  try {
    const c = runCli(root, "cli", { fail: [failName], fracs: [0.1, 0.5] });
    assert.equal(c.status, 1, "the CLI exits non-zero when a shot failed");
    const m = await runMcp(root, "mcp", { fail: [failName], fracs: [0.1, 0.5] });
    assert.equal(m.body.ok, false);
    const a = canonicalSurveyOutput(c.outRoot);
    const b = canonicalSurveyOutput(m.outRoot);
    assert.deepEqual(a, b);
    assert.equal(a.state, "failed");
    assert.equal(a.ok, false);
    assert.equal(a.failed, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
