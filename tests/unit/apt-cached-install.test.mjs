// tools/ci/apt-cached-install.sh (#5519): a runner apt-mirror / DNS outage must not fail a CI
// set-up step that has what it needs (the image, or the cached .debs), and must fail in seconds
// with its own text when it has nothing. Every command it calls is a stub on PATH that keeps
// a fake dpkg database in a temp dir and logs each call; nothing touches the host's apt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.resolve("tools/ci/apt-cached-install.sh");

const STUBS = {
  // Installed = a file named after the package in $STATE/db.
  "dpkg-query": 'p="${@: -1}"; [ -e "$STATE/db/$p" ] && echo "install ok installed"; exit 0',
  // A fake .deb is a text file holding its package name.
  "dpkg-deb": 'cat "$2"', // dpkg-deb -f FILE Package
  dpkg: [
    'echo "dpkg $*" >> "$STATE/calls"',
    'case "$1" in',
    '  -i) shift; [ -e "$STATE/dpkg-broken" ] && exit 1; for f in "$@"; do touch "$STATE/db/$(cat "$f")"; done ;;',
    '  --configure) [ -e "$STATE/interrupted" ] || exit 0; [ -e "$STATE/repair-fails" ] && exit 1; rm -f "$STATE/interrupted"; for p in $(cat "$STATE/want"); do touch "$STATE/db/$p"; done ;;',
    '  --remove) ;;',
    "esac",
  ].join("\n"),
  getent: '[ -e "$STATE/dns-down" ] && exit 2; echo "10.0.0.1 $2"',
  "apt-get": [
    'echo "apt-get $*" >> "$STATE/calls"',
    '[ -e "$STATE/interrupted" ] && { echo "E: dpkg was interrupted"; exit 100; }',
    '[ -e "$STATE/apt-down" ] && exit 100',
    '[ -n "${APT_STALL:-}" ] && sleep "$APT_STALL"',
    'case " $* " in',
    '  *" update "*) exit 0 ;;',
    '  *" install "*)',
    '    [ -e "$STATE/apt-interrupts" ] && { touch "$STATE/interrupted"; exit 124; }',
    '    arch=""; prev=""; for a in "$@"; do case "$a" in Dir::Cache::Archives=*) arch="${a#Dir::Cache::Archives=}" ;; esac; done',
    '    for p in $(cat "$STATE/want"); do touch "$STATE/db/$p"; [ -n "$arch" ] && echo "$p" > "$arch/${p}_1.0_amd64.deb"; done; exit 0 ;;',
    "esac",
  ].join("\n"),
};

function fixture(t, { installed = [], want = [], cached = [], flags = [] } = {}) {
  const root = fs.mkdtempSync(path.resolve("scratch/apt-cached-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"), state = path.join(root, "state"), cache = path.join(root, "cache");
  for (const d of [bin, path.join(state, "db")]) fs.mkdirSync(d, { recursive: true });
  for (const [name, body] of Object.entries(STUBS)) fs.writeFileSync(path.join(bin, name), "#!/usr/bin/env bash\n" + body + "\n", { mode: 0o755 });
  for (const p of installed) fs.writeFileSync(path.join(state, "db", p), "");
  fs.writeFileSync(path.join(state, "want"), want.join("\n"));
  if (cached.length) {
    fs.mkdirSync(cache);
    for (const p of cached) fs.writeFileSync(path.join(cache, `${p}_1.0_amd64.deb`), p);
  }
  for (const f of flags) fs.writeFileSync(path.join(state, f), "");
  fs.writeFileSync(path.join(root, "sources.list"), "# deb http://commented.example/ubuntu x main\ndeb http://azure.archive.ubuntu.com/ubuntu noble main\n");
  fs.writeFileSync(path.join(root, "ubuntu.sources"), "Types: deb\nURIs: http://security.ubuntu.com/ubuntu/\n");
  const run = (args, env = {}) => {
    const out = path.join(root, "github_output");
    const r = spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8", timeout: 20000,
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, STATE: state, APT_SUDO: "", APT_RETRY_SLEEP: "0",
        APT_SOURCES: `${path.join(root, "sources.list")} ${path.join(root, "ubuntu.sources")}`, GITHUB_OUTPUT: out, ...env,
      },
    });
    const calls = fs.existsSync(path.join(state, "calls")) ? fs.readFileSync(path.join(state, "calls"), "utf8") : "";
    const output = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    const has = p => fs.existsSync(path.join(state, "db", p));
    return { r, calls, output, has, log: r.stdout + r.stderr + "\ncalls:\n" + calls };
  };
  return { run, cache };
}

test("every package already installed: no apt, no dpkg, no network", (t) => {
  const { run, cache } = fixture(t, { installed: ["xvfb", "libegl1"], flags: ["apt-down", "dns-down"] });
  const { r, calls, log } = run(["--label", "mesa-xvfb", "--cache", cache, "xvfb", "libegl1"]);
  assert.equal(r.status, 0, log);
  assert.equal(calls, "", log);
  assert.match(r.stdout, /mesa-xvfb: all 2 packages already installed \(no apt, no network\)/);
});

test("--plan lists the missing packages for the cache step and installs nothing", (t) => {
  const { run } = fixture(t, { installed: ["xvfb"] });
  const { r, calls, output, log } = run(["--plan", "xvfb", "libegl1", "libgles2"]);
  assert.equal(r.status, 0, log);
  assert.equal(calls, "");
  assert.equal(output, "missing=libegl1 libgles2\n");
});

test("mirror down + cache hit: installs the cached .debs offline and never calls apt", (t) => {
  const { run, cache } = fixture(t, { installed: ["xvfb"], cached: ["libegl1", "libgles2"], flags: ["apt-down", "dns-down"] });
  const { r, calls, output, has, log } = run(["--label", "mesa-xvfb", "--cache", cache, "xvfb", "libegl1", "libgles2"]);
  assert.equal(r.status, 0, log);
  assert.doesNotMatch(calls, /apt-get/, log);
  assert.match(calls, /^dpkg -i .*libegl1_1\.0_amd64\.deb .*libgles2_1\.0_amd64\.deb$/m);
  assert.ok(has("libegl1") && has("libgles2"));
  assert.match(r.stdout, /installed 2 cached \.debs offline/);
  assert.equal(output.includes("populated=1"), false, "a cache hit is not re-saved");
});

test("a cached .deb for a package the image already has is not reinstalled (no downgrade)", (t) => {
  const { run, cache } = fixture(t, { installed: ["libegl1"], cached: ["libegl1", "libgles2"], flags: ["apt-down", "dns-down"] });
  const { r, calls, log } = run(["--cache", cache, "libegl1", "libgles2"]);
  assert.equal(r.status, 0, log);
  assert.match(calls, /^dpkg -i \S*libgles2_1\.0_amd64\.deb$/m, log);
});

test("nothing available (no cache, no apt host resolves): fails at once with the distinct mirror error", (t) => {
  const { run, cache } = fixture(t, { flags: ["apt-down", "dns-down"] });
  const started = Date.now();
  const { r, calls, log } = run(["--label", "mesa-xvfb", "--cache", cache, "libegl1"]);
  assert.equal(r.status, 3, log);
  assert.equal(calls, "", "no apt attempt when no host resolves:\n" + log);
  assert.equal(r.stdout.trim().split("\n").at(-1),
    "::error::mesa-xvfb: runner package mirror unreachable: no apt host resolves (azure.archive.ubuntu.com security.ubuntu.com) and no cached .debs cover libegl1");
  assert.ok(Date.now() - started < 10000, "seconds, not the 300 s apt budget");
});

test("a broken cached set is removed and apt installs instead", (t) => {
  const { run, cache } = fixture(t, { cached: ["libegl1"], want: ["libegl1"], flags: ["dpkg-broken"] });
  const { r, calls, has, log } = run(["--cache", cache, "libegl1"]);
  assert.equal(r.status, 0, log);
  assert.match(calls, /^dpkg --remove --force-depends libegl1$/m, log);
  assert.match(calls, /^apt-get install /m);
  assert.ok(has("libegl1"));
  assert.match(r.stdout, /::warning::apt: the cached \.debs did not install cleanly/);
});

test("mirror up, cache empty: apt installs, keeps the .debs in the cache and asks the caller to save", (t) => {
  const { run, cache } = fixture(t, { installed: ["xvfb"], want: ["libegl1", "libgles2"] });
  const { r, calls, output, log } = run(["--label", "mesa-xvfb", "--cache", cache, "--budget", "300", "xvfb", "libegl1", "libgles2"]);
  assert.equal(r.status, 0, log);
  assert.match(calls, /^apt-get install -y -qq --no-install-recommends libegl1 libgles2 .*Dir::Cache::Archives=.*APT::Keep-Downloaded-Packages=true/m, log);
  assert.deepEqual(fs.readdirSync(cache).sort(), ["libegl1_1.0_amd64.deb", "libgles2_1.0_amd64.deb"], "partial/ and lock are not saved");
  assert.equal(output, "populated=1\n");
});

test("apt finishing without the packages is still a failure (post-condition)", (t) => {
  const { run } = fixture(t, { want: [] });
  const { r, log } = run(["--label", "x", "libegl1"]);
  assert.equal(r.status, 1, log);
  assert.match(r.stdout, /::error::x: apt finished but dpkg still lacks: libegl1/);
});

test("retries share one budget instead of exhausting the caller job", (t) => {
  const { run } = fixture(t, { want: ["libegl1"] });
  const { r, calls, log } = run(["--budget", "1", "libegl1"], { APT_STALL: "3" });
  assert.equal(r.status, 1, log);
  assert.equal((calls.match(/^apt-get /gm) || []).length, 1, "no retry after the budget is spent:\n" + log);
  assert.match(r.stdout, /::error::apt: apt could not install libegl1 within 1 s and up to 3 attempts \(runner mirror down\?\)/);
});

test("repairs a dpkg its own cap interrupted instead of failing every retry", (t) => {
  // Job 129623589272: the cap killed attempt 1 mid-dpkg; attempts 2 and 3 died on "dpkg was interrupted".
  const { run } = fixture(t, { want: ["libegl1"], flags: ["apt-interrupts"] });
  const { r, calls, log } = run(["--label", "mesa-xvfb", "libegl1"]);
  assert.equal(r.status, 0, log);
  assert.equal((calls.match(/^apt-get install/gm) || []).length, 1, log);
  assert.equal((calls.match(/^dpkg --configure -a$/gm) || []).length, 1, log);
  assert.match(r.stdout, /apt attempt 1 was cut short; dpkg --configure -a finished the install/);
});

test("still fails when the repair cannot complete the packages", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["apt-down"] });
  const { r, calls, log } = run(["--label", "mesa-xvfb", "libegl1"]);
  assert.equal(r.status, 1, log);
  assert.match(r.stdout, /::error::mesa-xvfb: apt could not install libegl1 within 300 s and up to 3 attempts/);
  assert.equal((calls.match(/^dpkg --configure -a$/gm) || []).length, 3, "a repair after each failed attempt");
});

test("the lint installer takes its apt packages through the cached installer", () => {
  const src = fs.readFileSync(path.resolve("tools/env/install-lint-bins.sh"), "utf8");
  assert.match(src, /bash "\$ROOT\/tools\/ci\/apt-cached-install\.sh" --label "lint-bins \$PKG" --cache "\$BIN\/debs"/);
  assert.doesNotMatch(src, /apt-get install/, "no direct apt call left");
});
