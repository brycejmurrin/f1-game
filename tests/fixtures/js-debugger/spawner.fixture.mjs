// js-debugger-node.test.mjs fixture: a test that runs a Node child (auto-attach target).
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("child computes", () => {
  execFileSync(process.execPath, ["-e", "const { scale } = require(process.argv[1]); scale(5);", fileURLToPath(new URL("./lib.fixture.cjs", import.meta.url))], { stdio: "pipe" });
});
