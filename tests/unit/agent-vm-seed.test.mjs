// tools/shot/agent.mjs --vm honours --seed (#5674): the VM route used to drop it and boot game-vm's default ?seed=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../tools/shot/agent.mjs';

async function vmBootOpts(argv) {
  const booted = [];
  let exited = null;
  const apex = { go() {}, jump() {}, atmosphere: () => ({}) };
  await new Promise((resolve) => {
    const processStub = { argv: ['node', 'agent.mjs', ...argv], exitCode: 0, exit: (code) => { exited = code; resolve(); } };
    main(argv, {
      process: processStub, console: { log() {}, error() {} },
      createRequire: () => () => ({ createGame: async (opts) => { booted.push({ ...opts }); return { apex, close() {} }; } }),
      parseFlags: () => ({}),
    });
  });
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

test('agent help --vm and car --vm reach createGame with the seed instead of being refused (#5296 W25)', async () => {
  const help = await vmBootOpts(['help', '--vm', '--seed', '7']);
  assert.notEqual(help.exited, 2, 'help --vm was refused');
  assert.deepEqual(help.booted.map((o) => o.search), ['?seed=7']);
  const car = await vmBootOpts(['monza', 'car', '--vm', '--seed', '3']);
  assert.notEqual(car.exited, 2, 'car --vm was refused');
  assert.equal(car.booted.length, 1);
  assert.equal(car.booted[0].search, '?seed=3');
  assert.ok(car.booted[0].track);
});
