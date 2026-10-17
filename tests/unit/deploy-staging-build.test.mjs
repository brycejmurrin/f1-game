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

const pages = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");

// Execute the workflow's actual shell, including curl exit handling and retries.
// Stub only the network and ten-second wait; parsing uses the real Node binary.
const livePoll = pages.slice(pages.indexOf("          set -eu\n", pages.indexOf("  verify-live:")), pages.indexOf("      # A BROKEN-BUT-LIVE"))
  .split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
const expectedSha = "a".repeat(40);
const goodHtml = `<meta name="apex-build" content="4242"><meta name="apex-sha" content="${expectedSha}">`;

function pollFixture(attempts) {
  // scratch/ is gitignored, so a fresh CI checkout has none unless an earlier test in the same shard made it.
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "live-poll-"));
  try {
    // Materialize the fake downloads once. Starting a fresh Node process for
    // each fake curl paid 48 extra runtimes over a 24-attempt refusal, on top
    // of the workflow's real Node parser; that setup cost exhausted the test's
    // 15 s deadline under parallel structural validation.
    attempts.forEach((fixture, i) => {
      const attemptDir = path.join(dir, String(i + 1));
      fs.mkdirSync(attemptDir);
      for (const kind of ["version", "html"]) {
        fs.writeFileSync(path.join(attemptDir, kind), fixture[kind]);
        fs.writeFileSync(path.join(attemptDir, kind + ".exit"), String(fixture[kind + "Exit"] || 0) + "\n");
      }
    });
    fs.writeFileSync(path.join(dir, "curl"), `#!/bin/sh
set -eu
output=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    *) url=$1; shift ;;
  esac
done
count=0
if [ -f "$FIXTURE_DIR/count" ]; then IFS= read -r count < "$FIXTURE_DIR/count"; fi
case "$url" in
  */version.json\\?*)
    count=$((count + 1))
    printf '%s\\n' "$count" > "$FIXTURE_DIR/count"
    kind=version ;;
  *) kind=html ;;
esac
index=$count
if [ "$index" -gt "$FIXTURE_COUNT" ]; then index=$FIXTURE_COUNT; fi
cp "$FIXTURE_DIR/$index/$kind" "$output"
IFS= read -r status < "$FIXTURE_DIR/$index/$kind.exit"
exit "$status"
`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-c", livePoll], {
      cwd: ROOT, encoding: "utf8", timeout: 15000,
      // TMPDIR pinned (#2354): the poll's `mktemp -d` honours it, and a caller (sync-pr's verify step) whose TMPDIR
      // names a missing directory made `set -eu` exit before the first curl.
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_DIR: dir, FIXTURE_COUNT: String(attempts.length), TMPDIR: dir,
        PAGE_URL: "https://fixture.invalid", GITHUB_RUN_ID: "123", BUILD: "4242", GITHUB_SHA: expectedSha },
    });
    assert.ok(fs.existsSync(path.join(dir, "count")), result.stdout + result.stderr);
    return { ...result, attempts: Number(fs.readFileSync(path.join(dir, "count"), "utf8")) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const goodLive = { version: '{"build":4242}', html: goodHtml };

test("#2354: a caller TMPDIR that does not exist does not break the live poll", () => {
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = path.join(ROOT, "scratch", "no-such-tmpdir");
  try {
    const result = pollFixture([goodLive]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved;
  }
});
test("live poll accepts the exact deployed SHA and numeric build", () => {
  const result = pollFixture([goodLive]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 1);
  assert.match(result.stdout, /live shell carries build 4242 and commit/);
});

for (const [label, fixture] of [
  ["wrong commit at the expected build", { ...goodLive, html: goodHtml.replace(expectedSha, "b".repeat(40)) }],
  ["missing provenance", { ...goodLive, html: '<meta name="apex-build" content="4242">' }],
  ["wrong shell build with correct provenance", { ...goodLive, html: goodHtml.replace('content="4242"', 'content="4241"') }],
  ["trailing malformed JSON", { ...goodLive, version: '{"build":4242}broken' }],
  ["string build instead of numeric build", { ...goodLive, version: '{"build":"4242"}' }],
  ["failed complete HTML download despite matching prefix", { ...goodLive, htmlExit: 23 }],
  ["failed version download despite valid bytes", { ...goodLive, versionExit: 18 }],
  ["duplicate conflicting provenance", { ...goodLive, html: goodHtml + '<meta name="apex-sha" content="bad">' }],
]) {
  test(`live poll rejects ${label} and retains bounded retries`, () => {
    const result = pollFixture([fixture]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.attempts, 24);
    assert.doesNotMatch(result.stdout, /live shell carries/);
  });
}

test("live poll tolerates deployment lag then verifies both responses", () => {
  const result = pollFixture([{ ...goodLive, html: goodHtml.replace(expectedSha, "b".repeat(40)) }, goodLive]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.attempts, 2);
});
