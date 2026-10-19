// Existing server pin tests still inspect the original upstream launch. The
// separate output config test asserts the gateway itself and every mirrored route.
import assert from "node:assert/strict";

export function nativeMcpConfig(config) {
  return { ...config, mcpServers: Object.fromEntries(Object.entries(config.mcpServers).map(([name, row]) => {
    if (row.args?.[0] !== "tools/mcp/output-level-mcp.sh") return [name, row];
    assert.deepEqual(row.args.slice(1, 4), ["--server", name, "--"], `${name}: malformed output gateway route`);
    assert.equal(row.args[4], "bash", `${name}: upstream must retain its pinned bash wrapper`);
    return [name, { ...row, command: row.args[4], args: row.args.slice(5) }];
  })) };
}
