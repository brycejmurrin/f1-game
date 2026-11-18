// capture-tools-agent.test.mjs — tools/shot/agent.mjs, imported and run through its real main() with injected collaborators.
// One of five per-tool files split from capture-tools-regressions.test.mjs (T1-10, #3043); no browser.
// It used to regex-strip agent.mjs's imports and run the text in a VM, so it passed while a real import broke.
// Now it imports the module (which runs nothing on import) and calls main() with stubbed browser collaborators;
// parseFlags is the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../tools/shot/agent.mjs';

test('agent help boots once with the selected seed and measured startup budget', async () => {
  const calls = []; let cleaned = 0;
  const page = {
    goto: async (url) => calls.push(['goto', url]),
    waitForFunction: async (_fn, _args, options) => calls.push(['wait', options.timeout, options.polling]),
    evaluate: async () => ({ commands: ['help'] }),
  };
  const processStub = { argv: ['node', 'agent.mjs', 'help', '--seed', '0'], exitCode: 0,
    exit: (code) => { throw new Error(`unexpected exit ${code}`); } };
  await main(processStub.argv.slice(2), {
    process: processStub, console: { log() {}, error() {} },
    startStaticServer: async () => ({ url: 'http://fixture/' }),
    launchChromium: async () => ({ newPage: async () => page }),
    installProbeInit: async () => calls.push(['init']),
    chromiumArgsForBackend: () => [], sleep: async () => {},
    shutdown: async () => { cleaned++; },
  });
  assert.deepEqual(calls, [['init'], ['goto', 'http://fixture/?seed=0'], ['wait', 45000, 100]]);
  assert.equal(processStub.exitCode, 0);
  assert.equal(cleaned, 1);
});
