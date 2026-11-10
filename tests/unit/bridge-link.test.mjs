/* BridgeLink (js/agent/bridge-link.js, #5259): SETTINGS > CLAUDE LINK starts the phone bridge from inside an installed
   Home Screen app. Pins the entry's state machine, the token's one home (the bridge's storage slot: never the address,
   a log line or the thread), that LINK from the start_url with display-mode standalone emulated posts the real
   bridge's hello, and that UNLINK takes the link back out. VM with a fake GitHub; no network, no browser.
   What a VM cannot prove (WebKit's standalone window, its storage, the keyboard): the PR asks for it on the phone. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const SRC = read("js/agent/bridge-link.js");
const BRIDGE_SRC = read("js/agent/apex-bridge.js");
const TOKEN = "github_pat_SECRETSECRETSECRET";
const flush = () => new Promise((r) => setImmediate(r));

function fakeGitHub() {
  const calls = [], thread = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const json = (status, body) => ({ status, ok: status < 300, json: async () => body, headers: { get: () => null } });
    if (opts.headers.Authorization !== "Bearer " + TOKEN) return json(401, { message: "Bad credentials" });
    if (opts.method === "POST") {
      const c = { id: 1000 + thread.length, created_at: "2026-11-10T04:00:00Z", author_association: "OWNER", body: JSON.parse(opts.body).body };
      thread.push(c);
      return json(201, c);
    }
    return json(200, thread.slice());
  };
  return { fetch, calls, thread };
}

// The installed app as it launches: start_url (no query), standalone, its own (empty unless `tok`) storage.
function app({ search = "", tok = "" } = {}) {
  const store = new Map(tok ? [["apex26.bridgeToken", tok]] : []);
  const gh = fakeGitHub(), logs = [], urls = [];
  const location = { pathname: "/f1-game/", search, hash: "", href: "https://brycejmurrin.github.io/f1-game/" + search, reload() {} };
  const ctx = vm.createContext({
    window: { __apex: { info: () => ({ state: "title" }) }, devicePixelRatio: 3, innerWidth: 852, innerHeight: 393 },
    location,
    history: { state: null, replaceState(_s, _t, url) { urls.push(url); const q = url.indexOf("?"); location.search = q < 0 ? "" : url.slice(q); location.href = "https://brycejmurrin.github.io" + url; } },
    navigator: { userAgent: "iPhone standalone", standalone: true, gpu: {} },
    matchMedia: (q) => ({ matches: /display-mode: standalone/.test(q) }),
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    performance: { now: () => 0 },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    fetch: gh.fetch,
    Log: { info: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push(a.join(" ")) },
    URLSearchParams, Object, Array, JSON, Math, Number, String, Set, Promise, Error, Date, encodeURIComponent,
  });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/agent/bridge-link.js") });
  const api = vm.runInContext("BridgeLink", ctx);
  // LazyBundles.loadAgentSurface: the bridge file evaluates (and boots itself from the address) on the first ask.
  let loads = 0;
  const loadAgentSurface = async () => { loads++; if (!vm.runInContext("typeof ApexBridge", ctx).startsWith("o")) vm.runInContext(BRIDGE_SRC, ctx, { filename: absSrc("js/agent/apex-bridge.js") }); };
  const bridge = () => vm.runInContext("typeof ApexBridge === 'undefined' ? null : ApexBridge", ctx);
  return { api, ctx, gh, store, logs, urls, location, loadAgentSurface, bridge, loads: () => loads };
}

test("the issue field takes a number, with or without #, and nothing else", () => {
  const { api } = app();
  assert.equal(api.parseIssue("5168"), 5168);
  assert.equal(api.parseIssue(" #5168 "), 5168);
  for (const bad of ["", "0", "abc", "51 68", "5168&x=1", "-3", "1e3", null, undefined]) assert.equal(api.parseIssue(bad), 0, String(bad));
  assert.ok(api.DEFAULT_ISSUE > 0);
});

test("the link address carries the issue only, keeps other parameters and drops a spent ?b= shell bust", () => {
  const { api } = app();
  assert.equal(api.linkedSearch("", 5168), "?apex=1&bridge=5168");
  assert.equal(api.linkedSearch("?gfx=three&b=4242&bridge=7", 5168), "?gfx=three&apex=1&bridge=5168");
  assert.equal(api.unlinkedSearch("?gfx=three&apex=1&bridge=5168"), "?gfx=three");
  assert.equal(api.unlinkedSearch("?apex=1&bridge=5168"), "");
});

test("the panel's state machine: idle → loading → connecting → live → ended", () => {
  const { api } = app();
  const v = (s) => api.view({ active: false, loading: false, badge: "", hasToken: false, note: "", issue: 5168, ...s });
  let s = v({});
  assert.deepEqual([s.phase, s.primary, s.tokenField, s.issueField, s.forget], ["idle", "LINK", true, true, false]);
  s = v({ hasToken: true });
  assert.deepEqual([s.phase, s.primary, s.tokenField, s.forget], ["idle", "LINK", false, true], "a stored token is never asked for again; FORGET TOKEN removes it");
  s = v({ loading: true, hasToken: true });
  assert.deepEqual([s.phase, s.busy, s.issueField, s.forget], ["loading", true, false, false]);
  s = v({ active: true, badge: "CLAUDE LINK …", hasToken: true });
  assert.deepEqual([s.phase, s.primary, s.issueField, s.tokenField], ["connecting", "UNLINK", false, false]);
  s = v({ active: true, badge: "CLAUDE LINK · 3 · TAP TO END", hasToken: true });
  assert.deepEqual([s.phase, s.primary], ["live", "UNLINK"]);
  assert.equal(s.status, "LINKED to issue #5168 · 3 commands answered. Keep the app in front.");
  s = v({ badge: "CLAUDE LINK OFF — GitHub rejected the token (401 Bad credentials; pasted text: 93 chars)" });
  assert.deepEqual([s.phase, s.primary, s.tokenField], ["ended", "LINK", true]);
  assert.equal(s.status, "Link ended: GitHub rejected the token (401 Bad credentials; pasted text: 93 chars).");
  assert.equal(v({ note: "Paste the GitHub token first." }).status, "Paste the GitHub token first.", "an error replaces the status line");
});

test("LINK refuses without an issue or a token and touches nothing", async () => {
  const a = app();
  assert.deepEqual({ ...(await a.api.link("", TOKEN, a)) }, { ok: false, error: "Enter the bridge issue number." });
  assert.deepEqual({ ...(await a.api.link("5168", "  ", a)) }, { ok: false, error: "Paste the GitHub token first." });
  assert.equal(a.loads(), 0);
  assert.equal(a.gh.calls.length, 0);
  assert.equal(a.urls.length, 0);
  assert.equal(a.store.size, 0);
});

test("LINK from the installed app's start_url (standalone) forms the real bridge link in place; the token stays in storage", async () => {
  const a = app();
  assert.equal(a.bridge(), null, "the agent surface is not loaded in a player's app");
  const r = await a.api.link("5168", "  " + TOKEN + "\n", a);
  await flush(); await flush();
  assert.deepEqual({ ...r }, { ok: true, issue: 5168 });
  assert.equal(a.store.get(a.api.TOKEN_KEY), TOKEN, "trimmed, under the bridge's own key");
  assert.equal(a.api.TOKEN_KEY, "apex26.bridgeToken");
  assert.deepEqual(a.urls, ["/f1-game/?apex=1&bridge=5168"], "one same-document address change, no navigation");
  assert.equal(a.loads(), 1);
  assert.equal(a.bridge().active(), true);
  // The hello went to the issue in the field, authorised by the token, and carries the standalone app's facts.
  assert.equal(a.gh.calls.length, 1);
  assert.equal(a.gh.calls[0].url, "https://api.github.com/repos/brycejmurrin/f1-game/issues/5168/comments");
  assert.equal(a.gh.calls[0].opts.headers.Authorization, "Bearer " + TOKEN);
  const hello = JSON.parse(/```apex-result\n([\s\S]*?)\n```/.exec(a.gh.thread[0].body)[1]);
  assert.equal(hello.hello, true);
  assert.equal(hello.facts.href, "https://brycejmurrin.github.io/f1-game/?apex=1&bridge=5168");
  assert.deepEqual([hello.facts.w, hello.facts.h], [852, 393]);
  // The secret is in exactly two places: storage and the Authorization header.
  const leaks = JSON.stringify([a.urls, a.logs, a.gh.thread, a.gh.calls.map((c) => [c.url, c.opts.body]), a.location]);
  assert.equal(leaks.includes(TOKEN), false, "the token is in an address, a log line or a comment");
  assert.equal(leaks.includes("SECRET"), false);
  // The standalone ledger the first reads need answers through the unchanged command set.
  const d = await a.bridge().handle({ cmd: "display" });
  assert.equal(d.ok, true);
  assert.deepEqual({ ...d.value.standalone }, { nav: true, mq: true, fullscreen: false });
  assert.deepEqual(d.value.inner, [852, 393]);
});

test("a stored token links without asking; a second LINK in the session re-boots the loaded bridge", async () => {
  const a = app({ tok: TOKEN });
  assert.equal((await a.api.link("#5168", "", a)).ok, true);
  await flush();
  assert.equal(a.bridge().active(), true);
  assert.equal((await a.api.link("5168", "", a)).error, "Already linked. UNLINK first.");
  a.api.unlink();
  assert.equal(a.bridge().active(), false);
  assert.equal(a.location.search, "", "UNLINK takes the issue back out of the address: a later reload does not link");
  assert.equal((await a.api.link("5200", "", a)).ok, true);
  await flush();
  assert.equal(a.bridge().active(), true);
  assert.equal(a.gh.calls[a.gh.calls.length - 1].url.endsWith("/issues/5200/comments"), true);
  a.api.unlink();
  a.api.forget();
  assert.equal(a.store.has("apex26.bridgeToken"), false, "FORGET TOKEN removes it from this device");
});

test("the link code not loading (offline, stale shell) restores the address and says nothing was sent", async () => {
  const a = app();
  const r = await a.api.link("5168", TOKEN, { loadAgentSurface: async () => { throw new Error("offline"); } });
  assert.equal(r.ok, false);
  assert.equal(r.error, "The link code did not load (offline, or the app needs its update). Nothing was sent.");
  assert.equal(a.location.search, "");
  assert.equal(a.gh.calls.length, 0);
});

test("a wrong token ends the link with GitHub's reason and is forgotten (the bridge's own 401 path)", async () => {
  const a = app();
  assert.equal((await a.api.link("5168", "github_pat_WRONG", a)).ok, true);
  await flush(); await flush();
  assert.equal(a.bridge().active(), false);
  assert.equal(a.store.has("apex26.bridgeToken"), false);
  assert.equal(JSON.stringify(a.logs).includes("github_pat_WRONG"), false);
});

test("wiring: a LAZY_AGENT file, a runtime SETTINGS hub door, fixed-size CSS, and a loader that fetches this one file first", () => {
  const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.equal(manifest.LAZY_AGENT.filter((f) => f === "js/agent/bridge-link.js").length, 1, "no eager <script>: a player who never opens the panel never downloads it");
  const css = read("css/settings-controls.css");
  const rule = /#pm-settings-index > #pm-claude-link \{[^}]*\}/.exec(css)[0];
  const decl = Object.fromEntries([...rule.matchAll(/^\s*([\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2]]));
  assert.equal(decl["min-height"], "calc(48px / var(--sheet-scale, var(--ui-scale)))", "48 px PAINTED at every UI SIZE (the sheet zoom divided back out)");
  assert.equal(decl["font-size"], "calc(16px / var(--sheet-scale, var(--ui-scale)))");
  // Two tracks: the whole row two-up, beside PROGRESS three-up (measured 844x390: the hub's scroll height stays 421 px).
  assert.equal(decl["grid-column"], "span 2");
  const lb = read("js/core/lazy-bundles.js");
  assert.match(lb, /AGENT_FILES\.filter\(\(f\) => \/\\\/bridge-link\\\.js\$\/\.test\(f\)\), \[\], \{ loaded: agentScriptsLoaded \}/);
  assert.match(lb, /BridgeLink\.open\(\{ loadAgentSurface \}\)/);
  assert.match(lb, /getElementById\("pm-settings-index"\)[\s\S]{0,400}door\.id = "pm-claude-link"[\s\S]{0,600}hub\.appendChild\(door\)/, "the door is built into the SETTINGS hub at boot");
  // The panel never prints or logs the token, and never builds an address from it.
  assert.equal(/Log\.|console\./.test(SRC), false);
  assert.equal(/token\.value[^;]*textContent|textContent[^;]*token\.value/.test(SRC), false);
  // The bridge's command set is untouched by this module.
  assert.equal(/CMDS|CALL_OK/.test(SRC), false);
});
