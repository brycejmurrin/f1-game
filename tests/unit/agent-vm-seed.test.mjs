// tools/shot/agent.mjs --vm honours --seed (#5674): the VM route used to drop it and boot game-vm's default ?seed=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function vmBootOpts(argv) {
  const source = readFileSync(ROOT + 'tools/shot/agent.mjs', 'utf8')
    .replace(/^#!.*$/m, '').replace(/^import .*;$/gm, '')
    .replace(/^const ROOT = .*;$/m, 'const ROOT = "/fixture";');
  const booted = [];
  let exited = null;
  const apex = { go() {}, jump() {}, atmosphere: () => ({}) };
  const done = new Promise((resolve) => {
    const processStub = { argv: ['node', 'agent.mjs', ...argv], exitCode: 0, exit: (code) => { exited = code; resolve(); } };
    vm.runInNewContext(source, {
      process: processStub, console: { log() {}, error() {} },
      createRequire: () => () => ({ createGame: async (opts) => { booted.push({ ...opts }); return { apex, close() {} }; } }),
      parseFlags: () => ({}),
    }, { filename: ROOT + 'tools/shot/agent.mjs' });
  });
  await done;
  return { booted, exited };
}

test('agent --vm boots the VM with the --seed it was given', async () => {
  const { booted, exited } = await vmBootOpts(['monza', 'atmosphere', '--vm', '--seed', '7']);
  assert.equal(exited, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(booted)), [{ track: 'monza', search: '?seed=7' }]);
});

test('agent --vm without --seed keeps the CLI default seed 1', async () => {
  const { booted } = await vmBootOpts(['spa', 'atmosphere', '--vm']);
  assert.equal(booted[0].search, '?seed=1');
});
