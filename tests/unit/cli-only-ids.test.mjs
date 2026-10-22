// An id filter that selects nothing must fail loudly. `menu-fit --only=title`
// matched no screen (the id is `menu`), ran zero cells, printed nothing and
// exited 0, so a clipped screen looked clean (#3305).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pickIds, CliArgError } from "../../tools/lib/cli-args.mjs";
import { pickScreens, pickViewports, SCREENS, VIEWPORTS } from "../../tools/ui/menu-screens.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const run = (tool, ...args) => spawnSync(process.execPath, [`tools/ui/${tool}`, ...args],
  { cwd: ROOT, encoding: "utf8", timeout: 20000 });

test("pickIds: absent flag is no filter; matches by substring, exact or prefix", () => {
  const ids = ["menu", "select-gp", "select-tt", "pause"];
  assert.equal(pickIds(null, ids), null);
  assert.deepEqual(pickIds("sel,pause", ids), ["sel", "pause"]);
  assert.deepEqual(pickIds("select*", ids), ["select*"]);
  assert.throws(() => pickIds("sel", ids, { match: "exact" }), CliArgError);
});

test("pickIds: an unknown or empty id throws and lists the valid ids", () => {
  const ids = ["menu", "pause"];
  assert.throws(() => pickIds("title", ids), (e) => e instanceof CliArgError
    && /--only: no match for "title"/.test(e.message) && /valid ids: menu pause/.test(e.message));
  assert.throws(() => pickIds("menu,nope", ids), /"nope"/);
  assert.throws(() => pickIds("", ids), /at least one id/);
  assert.throws(() => pickIds("x", ids, { flag: "--screens" }), /--screens:/);
});

test("pickScreens / pickViewports: a pattern matching nothing throws, valid ones still work", () => {
  assert.throws(() => pickScreens(SCREENS, "no-such-screen"), /valid ids:/);
  assert.throws(() => pickViewports(VIEWPORTS, "ios-iphone-landscape,bogus"), /"bogus"/);
  assert.equal(pickScreens(SCREENS, null), SCREENS);
  assert.equal(pickScreens(SCREENS, SCREENS[0].id).length, 1);
  assert.ok(pickViewports(VIEWPORTS, "ios-*").length > 1);
});

for (const [tool, flag, good] of [["menu-fit.mjs", "--only", "menu"], ["fit-audit.mjs", "--only", "menu"],
  ["layout-audit.mjs", "--screens", "title"]]) {
  test(`${tool} ${flag}=<unknown> exits non-zero with the valid ids, before any browser`, () => {
    const r = run(tool, `${flag}=nonexistent-screen`, ...(tool === "layout-audit.mjs" ? ["--list"] : []));
    assert.notEqual(r.status, 0, "silent success on an unknown id");
    assert.ok(r.stderr.includes('no match for "nonexistent-screen"'), r.stderr);
    assert.ok(r.stderr.includes(`valid ids: `) && r.stderr.includes(good), "valid ids must be listed");
  });
}
