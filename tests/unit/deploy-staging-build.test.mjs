/* deploy-staging-build.test.mjs — ONE copy of the shell-generation formula.
 *
 * R3-ARCHITECTURE-10 (2026-10-10): pages.yml computed the build as
 * `2000 + git rev-list --count HEAD` in inline bash, and tools/desktop/stage.mjs
 * (the desktop and Android stamper) defaulted to the COMMITTED version.json
 * build — frozen at 1695 since Pages stopped committing builds — with no
 * apex-sha. Every desktop/Android package was v1.0.1695 whatever commit it
 * came from. The formula now lives in stage.mjs (`pagesBuild`, `headSha`) and
 * pages.yml calls it; this file pins the formula, the shallow-clone refusal,
 * that pages.yml carries no second copy, and that the stamped bytes are the
 * ones the old bash step produced.
 *
 * Run: node --test tests/unit/deploy-staging-build.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headSha, pagesBuild, stageSite, stampStaged } from "../../tools/desktop/stage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const COMMITTED = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build;

/** A fake `git` for a full clone at `count` commits whose HEAD is SHA. */
const fakeGit = (count, shallow = false) => (args) => {
  const k = args.join(" ");
  if (k === "rev-parse --is-shallow-repository") return shallow ? "true" : "false";
  if (k === "rev-list --count HEAD") return String(count);
  if (k === "rev-parse HEAD") return SHA;
  throw new Error(`unexpected git ${k}`);
};

function tmpDir(t, tag) {
  const base = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, `${tag}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("pagesBuild is 2000 + the commit count and refuses a shallow clone", () => {
  assert.equal(pagesBuild({ git: fakeGit(1234) }), 3234);
  assert.throws(() => pagesBuild({ git: fakeGit(399, true) }), /shallow clone/,
    "a shallow clone counts its depth (this box: 399), not the history");
  assert.equal(headSha({ git: fakeGit(1) }), SHA);
});

test("stampStaged with no `at` stamps the Pages build and HEAD's apex-sha, never the committed placeholder", (t) => {
  const dest = path.join(tmpDir(t, "stamp-default"), "site");
  stageSite(dest, { root: ROOT });
  const build = stampStaged(dest, { git: fakeGit(4321) });
  assert.equal(build, 6321);
  assert.notEqual(build, COMMITTED, `the committed version.json build (${COMMITTED}) is a frozen placeholder`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dest, "version.json"), "utf8")).build, 6321);
  assert.match(fs.readFileSync(path.join(dest, "index.html"), "utf8"),
    new RegExp(`<meta name="apex-build" content="6321">\\n<meta name="apex-sha" content="${SHA}">`));
});

test("stampStaged writes the bytes pages.yml's former inline bash stamp wrote", (t) => {
  // The bash below is the step this change replaced, verbatim but for paths.
  // Both copies start from one stage; every staged file must match.
  const base = tmpDir(t, "stamp-parity");
  const a = path.join(base, "bash"), b = path.join(base, "node");
  stageSite(a, { root: ROOT });
  fs.cpSync(a, b, { recursive: true });
  const BUILD = 5123;
  const bash = `set -eu
PUBLISH_SHA="${SHA}"
BUILD=${BUILD}
node tools/ci/bump-cache.mjs --apply --at "$BUILD" --root "$SITE"
sed -i "s|<meta name=\\"apex-build\\" content=\\"$BUILD\\">|<meta name=\\"apex-build\\" content=\\"$BUILD\\">\\n<meta name=\\"apex-sha\\" content=\\"$PUBLISH_SHA\\">|" "$SITE/index.html"
grep -q 'name="apex-sha"' "$SITE/index.html"
node tools/ci/bump-cache.mjs --check --json --root "$SITE" > /dev/null`;
  const r = spawnSync("bash", ["-c", bash], { cwd: ROOT, encoding: "utf8", env: { ...process.env, SITE: a } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stampStaged(b, { at: BUILD, sha: SHA }), BUILD);
  const walk = (dir, rel = "") => fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(dir, path.join(rel, e.name)) : [path.join(rel, e.name)]);
  const files = walk(a).sort();
  assert.deepEqual(walk(b).sort(), files);
  let changed = 0;
  for (const f of files) {
    const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f));
    assert.ok(x.equals(y), `${f} differs between the bash stamp and stampStaged`);
    if (!x.equals(fs.readFileSync(path.join(ROOT, f)))) changed++;
  }
  assert.ok(changed >= 2, `the stamp must have rewritten index.html and version.json at least (changed ${changed})`);
});

test("pages.yml stamps through stage.mjs and carries no second copy of the formula", () => {
  const pages = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
  const code = pages.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.doesNotMatch(code, /rev-list --count/, "the formula lives in tools/desktop/stage.mjs pagesBuild()");
  assert.doesNotMatch(code, /bump-cache\.mjs --apply/, "stage.mjs runs bump-cache; a second call is a second stamper");
  const step = pages.slice(pages.indexOf("- name: Stamp the shell generation"));
  assert.match(step.slice(0, 800), /node tools\/desktop\/stage\.mjs --out _site --stamp-only --sha "\$PUBLISH_SHA"/);
});

test("stage.mjs --stamp-only stamps the tree already at --out and prints the build", (t) => {
  const dest = path.join(tmpDir(t, "stamp-only"), "site");
  stageSite(dest, { root: ROOT });
  const r = spawnSync(process.execPath, ["tools/desktop/stage.mjs", "--out", dest, "--stamp-only", "--at", "4100", "--sha", SHA],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.stamped, 4100);
  assert.equal(out.desktopVersion, "1.0.4100");
  assert.match(fs.readFileSync(path.join(dest, "index.html"), "utf8"), new RegExp(`apex-sha" content="${SHA}"`));
  const empty = path.join(path.dirname(dest), "nothing");
  const refused = spawnSync(process.execPath, ["tools/desktop/stage.mjs", "--out", empty, "--stamp-only", "--at", "4100", "--sha", SHA],
    { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(refused.status, 0, "--stamp-only on an empty destination has nothing to stamp");
});
