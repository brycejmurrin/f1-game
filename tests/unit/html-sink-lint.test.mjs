// html-sink-lint — every innerHTML / outerHTML / insertAdjacentHTML in js/
// writes a source constant, or is in tests/data/html-sink-allowlist.json with
// a reason its dynamic parts cannot carry player text.
//
// The class this holds: a custom team's driver name (settable by an imported
// garage file) reached `el.innerHTML` through js/ui/aria-state.js paintOnOff —
// stored XSS, fixed 2026-09-24 by escaping. The audit that followed read every
// sink by hand; this makes the NEXT one fail here instead of in a player's
// browser. Stale and miscounted allowlist entries fail too, so the list cannot
// quietly outlive the code it vouches for.
//
// Run: node --test tests/unit/html-sink-lint.test.mjs   (pure source scan, ~1 s)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lintSource, isConstantHtml, audit, readAllowlist, rhsHash, rehash } from "../../tools/check/html-sink-lint.mjs";

const TOOL = fileURLToPath(new URL("../../tools/check/html-sink-lint.mjs", import.meta.url));

const keys = (src) => lintSource(src, "f.js").sites.map((s) => s.key);

test("constant markup is not a site", () => {
  for (const src of [
    `el.innerHTML = "";`,
    `el.innerHTML = "<b>x</b>";`,
    "el.innerHTML = `<i>${1}</i>`;",
    "el.innerHTML = `<i>plain</i>`;",
    `el.innerHTML = '<a>' + "b" + '</a>';`,
    `el.innerHTML = on ? "&#9654;" : "&#10074;";`,
    `document.body.insertAdjacentHTML("afterbegin", '<aside>' + '</aside>');`,
    `el.textContent = name;`,
  ]) assert.deepEqual(keys(src), [], src);
});

test("anything that interpolates a value is a site, keyed by receiver and sink", () => {
  assert.deepEqual(keys(`el.innerHTML = name;`), ["f.js::el.innerHTML"]);
  assert.deepEqual(keys("el.innerHTML = `<b>${name}</b>`;"), ["f.js::el.innerHTML"]);
  assert.deepEqual(keys(`a.b.innerHTML = "<b>" + t.name + "</b>";`), ["f.js::a.b.innerHTML"]);
  assert.deepEqual(keys(`el.innerHTML += x;`), ["f.js::el.innerHTML"], "+= appends markup too");
  assert.deepEqual(keys(`el["innerHTML"] = x;`), ["f.js::el.innerHTML"], "the computed spelling is the same sink");
  assert.deepEqual(keys(`el.outerHTML = x;`), ["f.js::el.outerHTML"]);
  assert.deepEqual(keys(`el.insertAdjacentHTML("beforeend", row);`), ["f.js::el.insertAdjacentHTML"]);
  assert.deepEqual(keys(`$("x").innerHTML = f(t);`), ['f.js::$("x").innerHTML']);
  assert.deepEqual(keys(`el.innerHTML = on ? name : "";`), ["f.js::el.innerHTML"],
    "a ternary is constant only when BOTH arms are");
});

test("srcdoc, createContextualFragment and document.write are sinks too", () => {
  assert.deepEqual(keys(`f.srcdoc = html;`), ["f.js::f.srcdoc"]);
  assert.deepEqual(keys(`f["srcdoc"] += x;`), ["f.js::f.srcdoc"]);
  assert.deepEqual(keys(`range.createContextualFragment(html);`), ["f.js::range.createContextualFragment"]);
  assert.deepEqual(keys(`document.write(x);`), ["f.js::document.write"]);
  assert.deepEqual(keys(`document.writeln("<b>" + x);`), ["f.js::document.writeln"]);
  // constants and unrelated `.write` stay quiet (negative controls)
  assert.deepEqual(keys(`f.srcdoc = "<p>x</p>"; r.createContextualFragment("<i></i>"); document.write("<b>");`), []);
  assert.deepEqual(keys(`stream.write(x); res.write(chunk);`), [], "only document.write is an HTML sink");
  assert.deepEqual(keys(`n.toString(); o.constructor(x);`), [], "Object.prototype names are not sinks");
});

test("#5014: a call passing a sink name as a literal argument is a site (computed setter el[k] = v)", () => {
  const one = lintSource('const set=(e,k,v)=>{e[k]=v}; set(x,"innerHTML",y)', "f.js").sites;
  assert.deepEqual(one.map((s) => [s.sink, s.key, s.rhs]), [["innerHTML", 'f.js::set("innerHTML")', rhsHash("y")]]);
  assert.deepEqual(lintSource('put(el, "outerHTML", a + b); u.set(f, "srcdoc", html)', "f.js").sites.map((s) => s.key), ['f.js::put("outerHTML")', 'f.js::u.set("srcdoc")']);
  assert.deepEqual(lintSource('set(x, "innerHTML", "<b>ok</b>"); set(x, "textContent", y)', "f.js").sites, [], "constant HTML and a non-sink name are not sites");
});

test("the constant test is structural, not a regex over the text", () => {
  const parse = (e) => lintSource(`x.innerHTML = ${e};`, "f.js").sites.length === 0;
  assert.equal(parse(`"a" + ("b" + "c")`), true);
  assert.equal(parse(`"a" + ("b" + c)`), false);
  assert.equal(parse(`"a" - "b"`), false, "only + concatenates");
  assert.equal(isConstantHtml(null), false);
});

test("a malicious-shaped site in a fixture is caught", () => {
  // The shape of the 2026-09-24 bug, before the escape.
  const src = `function paint(el){ const html = wrap(el.textContent); if (html) el.innerHTML = html; }`;
  assert.equal(lintSource(src, "fixture.js").sites.length, 1);
});

test("every HTML sink in js/ is constant or audited, and the allowlist is exact", () => {
  const a = audit();
  assert.deepEqual(a.parseErrors, [], "a js/ file failed to parse");
  assert.deepEqual(a.unaudited.map((s) => `${s.file}:${s.line} ${s.key}`), [],
    "unaudited HTML sink — build the node with Dom.el()/textContent or escape the " +
    "dynamic part; only a site that cannot carry player text belongs in the allowlist");
  assert.deepEqual(a.stale, [], "allowlist entries with no matching site — delete them");
  assert.deepEqual(a.miscounted, [], "an audited key gained or lost a site — re-audit it");
  assert.deepEqual(a.changed.map((c) => c.key), [],
    "an audited site's HTML expression changed — re-audit it (can it now carry player text or a URL?), " +
    "update the reason, then `node tools/check/html-sink-lint.mjs --rehash`");
  for (const [k, v] of Object.entries(readAllowlist())) {
    assert.ok(v && typeof v.reason === "string" && v.reason.length >= 20, `${k} needs a real reason`);
  }
  // Anti-vacuity: the walk really sees the audited population.
  assert.ok(Object.keys(readAllowlist()).length >= 5, "the allowlist should not be empty");
});

// The key says WHERE markup is written; `rhs` pins WHAT. An audited site whose
// expression later takes a URL or a driver name must not stay green on its key.
test("an audited site whose right-hand side changes fails as CHANGED", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-sink-"));
  const A = ["js", "a.js"].join("/"), B = ["js", "b.js"].join("/");   // fixture paths, not tree paths
  try {
    fs.mkdirSync(path.join(root, "js"));
    fs.mkdirSync(path.join(root, "tests", "data"), { recursive: true });
    const site = path.join(root, "js", "a.js");
    fs.writeFileSync(site, "el.innerHTML = MODES[i];\n");
    const row = { count: 1, reason: "a fixed MODES table of literals, never player text", rhs: [rhsHash("MODES[i]")] };
    fs.writeFileSync(path.join(root, "tests", "data", "html-sink-allowlist.json"),
      JSON.stringify({ sites: { [`${A}::el.innerHTML`]: row } }));
    assert.deepEqual(audit(root).changed, [], "the audited expression matches its hash");
    fs.writeFileSync(site, "el.innerHTML =\n   MODES[i];\n");
    assert.deepEqual(audit(root).changed, [], "a whitespace reflow is not a change");

    fs.writeFileSync(site, "el.innerHTML = location.hash;\n");     // same key, new (hostile) RHS
    const a = audit(root);
    assert.deepEqual(a.unaudited, [], "the key still matches — only the hash can catch this");
    assert.deepEqual(a.changed.map((c) => c.key), [`${A}::el.innerHTML`]);
    const r = spawnSync(process.execPath, [TOOL, "--root", root], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = r.stdout.split("\n").map((l) => l.trim());
    const at = out.findIndex((l) => l.startsWith("CHANGED "));
    assert.equal(out[at].split(": ")[0], `CHANGED ${A}::el.innerHTML`, "the CLI names the changed site");
    assert.equal(out[at + 1].split(":")[0], "RE-AUDIT it", "…and says what to do about it");

    // A row with no rhs vouches for nothing: CHANGED too.
    fs.writeFileSync(path.join(root, "tests", "data", "html-sink-allowlist.json"),
      JSON.stringify({ sites: { [`${A}::el.innerHTML`]: { count: 1, reason: row.reason } } }));
    assert.equal(audit(root).changed.length, 1);
    // --rehash refreshes an existing row (after a re-audit) and never adds a key.
    fs.writeFileSync(path.join(root, "js", "b.js"), "x.innerHTML = y;\n");
    rehash(root);
    const after = audit(root);
    assert.deepEqual(after.changed, []);
    assert.deepEqual(after.unaudited.map((s) => s.key), [`${B}::x.innerHTML`], "rehash must not audit a new site");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
