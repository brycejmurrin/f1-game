// tools/ci/apt-cached-install.sh (#5519): a runner apt-mirror / DNS outage must not fail a CI
// set-up step that has what it needs (the image, or the cached .debs), and must fail in seconds
// with its own text when it has nothing. Every command it calls is a stub on PATH that keeps
// a fake dpkg database in a temp dir and logs each call; nothing touches the host's apt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

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
  // APT_REACH seam: HOST PORT answers unless the mirror is down.
  reach: 'echo "reach $1:$2" >> "$STATE/probes"; grep -q " $1$" "$STATE/hosts" && exit 0; [ -e "$STATE/dns-down" ] && exit 2; exit 0',
  // System resolver: answers unless dns-down; with dns-flaky, only the first of every three asks.
  resolve: [
    'echo "$1" >> "$STATE/resolves"',
    '[ -e "$STATE/dns-down" ] && exit 2',
    'if [ -e "$STATE/dns-flaky" ]; then n=$(grep -c "^$1$" "$STATE/resolves"); [ $((n % 3)) -eq 1 ] || exit 2; fi',
    'echo 10.0.0.7',
  ].join("\n"),
  doh: 'echo "$1" >> "$STATE/doh"; [ -e "$STATE/doh-ok" ] && echo "203.0.113.9 https://cloudflare-dns.com/dns-query" && exit 0; exit 1',
  "apt-config": '[ -e "$STATE/apt-proxy" ] && echo \'Acquire::http::Proxy "http://proxy:3128";\'; exit 0',
  "apt-get": [
    'echo "apt-get $*" >> "$STATE/calls"',
    '[ -e "$STATE/interrupted" ] && { echo "E: dpkg was interrupted"; exit 100; }',
    '[ -e "$STATE/apt-needs-pin" ] && ! grep -q " security.ubuntu.com$" "$STATE/hosts" && { echo "E: Temporary failure resolving \'security.ubuntu.com\'"; exit 100; }',
    '[ -e "$STATE/apt-down" ] && { echo "E: Failed to fetch https://security.ubuntu.com/x.deb  Temporary failure resolving \'security.ubuntu.com\'"; exit 100; }',
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

function fixture(t, { installed = [], want = [], cached = [], flags = [], sources, hostsExtra = "" } = {}) {
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
  fs.writeFileSync(path.join(state, "hosts"), "127.0.0.1 localhost\n" + hostsExtra);
  fs.writeFileSync(path.join(root, "sources.list"), "# deb http://commented.example/ubuntu x main\ndeb http://azure.archive.ubuntu.com/ubuntu noble main\n");
  // The runner image's shape (job 130569884615): URIs: mirror+file:/etc/apt/apt-mirrors.txt.
  fs.writeFileSync(path.join(root, "apt-mirrors.txt"), "http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n");
  fs.writeFileSync(path.join(root, "ubuntu.sources"), `Types: deb\nURIs: mirror+file:${path.join(root, "apt-mirrors.txt")}\n`);
  const sourceFiles = (sources ?? ["sources.list", "ubuntu.sources"]).map(f => path.join(root, f)).join(" ");
  const run = (args, env = {}) => {
    const out = path.join(root, "github_output");
    const r = spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8", timeout: 20000,
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, STATE: state, APT_SUDO: "", APT_RETRY_SLEEP: "0",
        APT_REACH: path.join(bin, "reach"), APT_RESOLVE: path.join(bin, "resolve"), APT_DOH: path.join(bin, "doh"),
        APT_HOSTS_FILE: path.join(state, "hosts"), RUNNER_TEMP: root,
        https_proxy: "", HTTPS_PROXY: "", http_proxy: "", HTTP_PROXY: "",
        APT_SOURCES: sourceFiles, GITHUB_OUTPUT: out, ...env,
      },
    });
    const calls = fs.existsSync(path.join(state, "calls")) ? fs.readFileSync(path.join(state, "calls"), "utf8") : "";
    const output = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    const read = f => fs.existsSync(path.join(state, f)) ? fs.readFileSync(path.join(state, f), "utf8") : "";
    const hosts = read("hosts"), doh = read("doh");
    const probes = fs.existsSync(path.join(state, "probes")) ? fs.readFileSync(path.join(state, "probes"), "utf8") : "";
    const has = p => fs.existsSync(path.join(state, "db", p));
    return { r, calls, output, has, probes, hosts, doh, log: r.stdout + r.stderr + "\ncalls:\n" + calls };
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

test("nothing available (no cache, no apt mirror answers): fails at once with the distinct mirror error", (t) => {
  const { run, cache } = fixture(t, { flags: ["apt-down", "dns-down"] });
  const started = Date.now();
  const { r, calls, probes, hosts, log } = run(["--label", "mesa-xvfb", "--cache", cache, "libegl1"]);
  assert.equal(r.status, 3, log);
  assert.equal(calls, "", "no apt attempt when no mirror answers:\n" + log);
  assert.equal(hosts, "127.0.0.1 localhost\n", "nothing pinned when no resolver answers");
  // Plain URIs and the mirror+file list, de-duplicated, each on its scheme's port.
  assert.deepEqual(probes.trim().split("\n").sort(), ["reach azure.archive.ubuntu.com:80", "reach security.ubuntu.com:443"]);
  assert.equal(r.stdout.trim().split("\n").at(-1),
    "::error::mesa-xvfb: runner package mirror unreachable: no apt mirror answers (azure.archive.ubuntu.com:80 security.ubuntu.com:443) and no cached .debs cover libegl1");
  assert.ok(Date.now() - started < 10000, "seconds, not the 300 s apt budget");
});

test("hosts listed only in a mirror+file list are probed (the runner image's shape)", (t) => {
  const { run } = fixture(t, { sources: ["ubuntu.sources"], flags: ["dns-down"] });
  const { r, probes, log } = run(["libegl1"]);
  assert.equal(r.status, 3, log);
  assert.match(probes, /reach security\.ubuntu\.com:443/);
});

test("behind an apt proxy the direct-connect probe is skipped and apt decides", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["dns-down", "apt-proxy"] });
  const { r, probes, log } = run(["libegl1"]);
  assert.equal(r.status, 0, log);
  assert.equal(probes, "", log);
});

test("a failed attempt names its step and prints the tail of apt's own output", (t) => {
  const { run } = fixture(t, { flags: ["apt-down"] });
  const { r, log } = run(["--label", "lint-bins glslang-tools", "glslang-tools"]);
  assert.equal(r.status, 1, log);
  assert.match(r.stdout, /::warning::lint-bins glslang-tools: apt attempt 1: apt-get update \(cap 120 s\) exited 100/);
  assert.match(r.stdout, /::group::lint-bins glslang-tools: last apt output \(attempt 1\)\nE: Failed to fetch \S+  Temporary failure resolving 'security\.ubuntu\.com'\n::endgroup::/);
});

test("a resolver that answers every time: no pin, no public-resolver call", (t) => {
  const { run } = fixture(t, { want: ["libegl1"] });
  const { r, hosts, doh, log } = run(["libegl1"]);
  assert.equal(r.status, 0, log);
  assert.equal(hosts, "127.0.0.1 localhost\n");
  assert.equal(doh, "");
});

test("system resolver fails, a public resolver answers: pinned for this job and apt proceeds", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["dns-down", "doh-ok"] });
  const { r, calls, hosts, log } = run(["--label", "mesa-xvfb", "libegl1"]);
  assert.equal(r.status, 0, log);
  assert.match(hosts, /^203\.0\.113\.9 azure\.archive\.ubuntu\.com$/m);
  assert.match(hosts, /^203\.0\.113\.9 security\.ubuntu\.com$/m);
  assert.match(r.stdout, /::warning::mesa-xvfb: security\.ubuntu\.com resolved 0\/3 times through the system resolver; pinned 203\.0\.113\.9 \(from https:\/\/cloudflare-dns\.com\/dns-query\)/);
  assert.match(calls, /^apt-get install /m);
});

test("a flaky system resolver: its own answer is pinned, no public resolver asked", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["dns-flaky"] });
  const { r, hosts, doh, log } = run(["libegl1"]);
  assert.equal(r.status, 0, log);
  assert.match(hosts, /^10\.0\.0\.7 security\.ubuntu\.com$/m);
  assert.match(r.stdout, /pinned 10\.0\.0\.7 \(from the system resolver \(1\/3 answers\)\)/);
  assert.equal(doh, "");
});

test("the probe reads 3/3 (cache), attempt 1 fails: every mirror is pinned, attempt 2 succeeds", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["apt-needs-pin"] });
  const { r, calls, hosts, doh, log } = run(["--label", "mesa-xvfb", "libegl1"]);
  assert.equal(r.status, 0, log);
  assert.equal((calls.match(/^apt-get update/gm) || []).length, 2, log);
  assert.match(hosts, /^10\.0\.0\.7 security\.ubuntu\.com$/m);
  assert.match(hosts, /^10\.0\.0\.7 azure\.archive\.ubuntu\.com$/m);
  assert.match(r.stdout, /pinned 10\.0\.0\.7 \(from the system resolver \(3\/3 answers\)\) in \S+ for this job \(after a failed apt attempt\)/);
  assert.equal(doh, "");
});

test("forced pin with no resolver at all: unchanged, exit 1 with the apt text", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["apt-needs-pin"] });
  // The probe passes (reach is answered), then every resolver fails before the forced pin.
  const { r, hosts, log } = run(["--label", "mesa-xvfb", "libegl1"], { APT_RESOLVE: "false", APT_DOH: "false" });
  assert.equal(r.status, 1, log);
  assert.equal(hosts, "127.0.0.1 localhost\n");
  assert.match(r.stdout, /::error::mesa-xvfb: apt could not install libegl1 within 300 s and up to 3 attempts/);
});

test("an existing hosts entry is matched as a whole name, not a regex", (t) => {
  const { run } = fixture(t, { want: ["libegl1"], flags: ["dns-down", "doh-ok"], hostsExtra: "192.0.2.1 securityxubuntuxcom\n# 192.0.2.2 security.ubuntu.com\n" });
  const { r, hosts, log } = run(["libegl1"]);
  assert.equal(r.status, 0, log);
  // "securityxubuntuxcom" and a commented-out line matched the old unanchored grep; neither counts as pinned.
  assert.match(hosts, /^203\.0\.113\.9 security\.ubuntu\.com$/m);
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
  assert.match(r.stdout, /apt attempt 1: apt-get update \(cap 1 s\) was killed by its cap/);
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

test("every job that uses the mesa-xvfb action checks this repo out whole at the workspace root first", () => {
  // The action runs "$GITHUB_WORKSPACE/tools/ci/apt-cached-install.sh": a `path:` or sparse checkout
  // before it would leave the script missing and fail every leg in set-up.
  const users = [];
  for (const file of fs.readdirSync(".github/workflows").filter(f => /\.ya?ml$/.test(f))) {
    const wf = parseYaml(fs.readFileSync(path.join(".github/workflows", file), "utf8"));
    for (const [name, job] of Object.entries(wf.jobs || {})) {
      const steps = job.steps || [];
      const at = steps.findIndex(s => s.uses === "./.github/actions/mesa-xvfb");
      if (at < 0) continue;
      users.push(`${file}:${name}`);
      const checkouts = steps.slice(0, at).filter(s => /^actions\/checkout@/.test(s.uses || ""));
      assert.ok(checkouts.length > 0, `${file}:${name} runs mesa-xvfb before any checkout`);
      for (const c of checkouts) {
        assert.equal(c.with?.path, undefined, `${file}:${name}: a path: checkout moves tools/ci`);
        assert.equal(c.with?.["sparse-checkout"], undefined, `${file}:${name}: a sparse checkout can omit tools/ci`);
      }
    }
  }
  assert.deepEqual(users.sort(), ["browser-group.yml:group", "car-shot.yml:shot", "ci.yml:selected", "ci.yml:smoke", "ci.yml:staged-boot"]);
});
