// Matched before/after stall-reload probe on one VM (deploy tip vs fix head).
// @doc Matched deploy-tip vs fix-head stall watchdog stress (SwiftShader, three+GL).
// Usage: node tools/gfx/stall-reload-sw-oracle.mjs
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { exitIfHelp } from "../lib/cli-args.mjs";
import {
  stallReloadStressInitScript,
  runStressedStallProbe,
} from "../../tests/helpers/stall-reload-stress.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
exitIfHelp(argv, `stall-reload-sw-oracle — matched deploy-tip vs fix-head stall stress

  node tools/gfx/stall-reload-sw-oracle.mjs

Writes artifacts/stall-reload-sw/matched-pair.json`);

const OUT = process.env.APEX_ORACLE_OUT || join(REPO, "artifacts/stall-reload-sw/matched-pair.json");
const BEFORE_ROOT = process.env.APEX_ORACLE_BEFORE_ROOT
  ? resolve(process.env.APEX_ORACLE_BEFORE_ROOT)
  : join(REPO, "scratch/stall-reload-before");

function gitSha(root) {
  return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
}

function ensureBeforeWorktree() {
  execSync("git fetch origin claude/f1-game-project-26h3ng", { cwd: REPO, stdio: "pipe" });
  try {
    execSync(`git worktree add -f "${BEFORE_ROOT}" origin/claude/f1-game-project-26h3ng`, { cwd: REPO, stdio: "pipe" });
  } catch (_) { /* already present */ }
  if (!existsSync(join(BEFORE_ROOT, "js/track/circuit-meta.js"))) {
    execSync("npm run gen", { cwd: BEFORE_ROOT, stdio: "pipe" });
  }
}

async function runLeg(root, label) {
  const srv = await startStaticServer(root);
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(stallReloadStressInitScript);
    await page.goto(`${srv.url.replace(/\/$/, "")}/?stallwatch=1`);
    const result = await runStressedStallProbe(page, { bootMs: 120000, gridMs: 240000, stressMs: 300000 });
    return { label, sha: gitSha(root), root, result };
  } finally {
    await browser.close().catch(() => {});
    await shutdown();
    await srv.close();
  }
}

function summarize(leg) {
  const r = leg.result || {};
  const stall = (r.stall && r.stall.act) ? r.stall : (r.peak && r.peak.stall) || r.stall || {};
  return {
    label: leg.label,
    sha: leg.sha && leg.sha.slice(0, 12),
    backend: r.backend,
    gridMs: r.gridMs,
    reloads: r.reloads,
    act: stall.act,
    sheds: stall.sheds,
    slowFrames: stall.slowFrames,
    worstMs: stall.worstMs,
    reloaded: r.reloaded,
    state: r.state,
    timedOut: r.timedOut,
  };
}

async function main() {
  ensureBeforeWorktree();
  const afterRoot = process.env.APEX_ORACLE_ROOT ? resolve(process.env.APEX_ORACLE_ROOT) : REPO;
  const before = await runLeg(BEFORE_ROOT, "deploy-tip");
  const after = await runLeg(afterRoot, "fix-head");
  const payload = {
    at: new Date().toISOString(),
    settings: "three+tlxForceGL, apex26.swRaceShed=1, ?stallwatch=1, cold __apex.race(bahrain,day,wet), LoopHealth.clean 1500ms spin after #loading hidden (PostCommon loaded)",
    before: summarize(before),
    after: summarize(after),
    raw: { before, after },
  };
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log("= oracle", JSON.stringify({ before: payload.before, after: payload.after, out: OUT }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
