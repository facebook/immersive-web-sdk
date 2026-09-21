/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkRepository,
  checkWorkspace,
  findUnsafeCliInvocations,
} from './check-cli-command-safety.mjs';

const unscopedPackage = ['iw', 'sdk'].join('');

test('rejects the unscoped IWSDK package through shell commands', () => {
  const examples = [
    `npx ${unscopedPackage} dev status`,
    `npx ${unscopedPackage}@latest scene state`,
    `npx --yes=true ${unscopedPackage} xr status`,
    `npx --offline ${unscopedPackage} xr status`,
    `npx --no-install ${unscopedPackage} --help`,
    `npx -- ${unscopedPackage} status`,
    `npx --registry https://registry.example ${unscopedPackage} status`,
    `npx --location global ${unscopedPackage} status`,
    `npx --yes false ${unscopedPackage} status`,
    `npx -p ${unscopedPackage} echo ok`,
    `npx -p=${unscopedPackage} echo ok`,
    `npx --package=${unscopedPackage} echo ok`,
    `npm exec ${unscopedPackage} --help`,
    `npm exec --offline -- ${unscopedPackage} xr status`,
    `npm exec --location global ${unscopedPackage} xr status`,
    `npm exec --yes false ${unscopedPackage} xr status`,
    `npm -- exec ${unscopedPackage} xr status`,
    `npm --package=${unscopedPackage} exec -- echo ok`,
    `npm --package ${unscopedPackage} exec -- echo ok`,
    `corepack npm@11 --package=${unscopedPackage} exec -- echo ok`,
    `npm x --yes ${unscopedPackage} dev status`,
    `npm exec --package=@${unscopedPackage}/cli --package=${unscopedPackage} -- ${unscopedPackage}`,
    `pnpm dlx ${unscopedPackage} dev status`,
    `pnpm dlx ${unscopedPackage} --package=@${unscopedPackage}/cli`,
    `pnpm --dir . dlx ${unscopedPackage} dev status`,
    `pnpm -w dlx ${unscopedPackage} dev status`,
    `pnpx.cmd ${unscopedPackage}@latest scene state`,
    `yarn dlx ${unscopedPackage} dev status`,
    `yarn dlx ${unscopedPackage} --package=@${unscopedPackage}/cli`,
    `yarn --cwd . dlx ${unscopedPackage} dev status`,
    `bunx ${unscopedPackage} dev status`,
    `bunx ${unscopedPackage} --package=@${unscopedPackage}/cli`,
    `bun --bun x ${unscopedPackage} dev status`,
    `corepack pnpm@10.18.3 dlx ${unscopedPackage} status`,
    `corepack npx ${unscopedPackage} status`,
    String.raw`"C:\Program Files\nodejs\pnpm.cmd" dlx ${unscopedPackage} status`,
    `npx ${unscopedPackage} --package=@${unscopedPackage}/cli`,
    `/usr/bin/npx ${unscopedPackage} status`,
    String.raw`"C:\Program Files\nodejs\npx.cmd" ${unscopedPackage} status`,
    String.raw`"C:\Program Files\nodejs\npx.ps1" ${unscopedPackage} status`,
    `"npx" ${unscopedPackage} status`,
    `npx.cmd ${unscopedPackage} status`,
    `npx.ps1 ${unscopedPackage} status`,
    `NPX ${unscopedPackage} status`,
    `NPX ${unscopedPackage.toUpperCase()} status`,
    `Run npx ${unscopedPackage}.`,
    ['npx \\', `  ${unscopedPackage} status`].join('\n'),
    ['npm exec \\', `  ${unscopedPackage} status`].join('\n'),
    ['npx ^', `  ${unscopedPackage} status`].join('\r\n'),
    ['npx `', `  ${unscopedPackage} status`].join('\r\n'),
  ];
  for (const example of examples) {
    assert.equal(findUnsafeCliInvocations(example).length, 1, example);
  }
});

test('rejects the unscoped IWSDK package in install and add commands', () => {
  const examples = [
    `npm install ${unscopedPackage}`,
    `npm add ${unscopedPackage}`,
    `npm in ${unscopedPackage}`,
    `npm ins ${unscopedPackage}`,
    `npm inst ${unscopedPackage}`,
    `npm insta ${unscopedPackage}`,
    `npm instal ${unscopedPackage}`,
    `npm isnt ${unscopedPackage}`,
    `npm isnta ${unscopedPackage}`,
    `npm isntal ${unscopedPackage}`,
    `npm isntall ${unscopedPackage}`,
    `npm install safe@npm:${unscopedPackage}`,
    `pnpm add -D ${unscopedPackage}`,
    `bun add --dev ${unscopedPackage}`,
    `corepack npm@11 install ${unscopedPackage}`,
    `corepack yarn add ${unscopedPackage}`,
  ];
  for (const example of examples) {
    assert.equal(findUnsafeCliInvocations(example).length, 1, example);
  }
});

test('rejects programmatic execution of the unscoped IWSDK package', () => {
  const examples = [
    `spawn('npx', ['${unscopedPackage}', 'status'])`,
    'spawn("npx", [`' + unscopedPackage + '`, `status`])',
    `spawnSync('npx', ['${unscopedPackage}@latest', 'status'])`,
    `execFile('npx', ['--offline', '${unscopedPackage}', 'status'])`,
    `execFileSync('/usr/bin/npx', ['${unscopedPackage}', 'status'])`,
    `execa('npx', ['${unscopedPackage}', 'status'])`,
    `spawn('pnpm', ['dlx', '${unscopedPackage}', 'status'])`,
    `spawn('corepack', ['pnpm', 'dlx', '${unscopedPackage}', 'status'])`,
    `spawn('corepack', ['npx', '${unscopedPackage}', 'status'])`,
    `spawn('npm', ['install', '${unscopedPackage}'])`,
    `spawn('npm', ['exec', '${unscopedPackage}', 'status'])`,
  ];
  for (const example of examples) {
    assert.equal(findUnsafeCliInvocations(example).length, 1, example);
  }
});

test('allows owned IWSDK packages and matching command arguments', () => {
  const examples = [
    `npx @${unscopedPackage}/cli dev status`,
    `npx --offline @${unscopedPackage}/cli scene state`,
    `/usr/bin/npx @${unscopedPackage}/cli --help`,
    `npx @${unscopedPackage}/create ${unscopedPackage}`,
    `npx cowsay ${unscopedPackage}`,
    `corepack npx @${unscopedPackage}/cli status`,
    `corepack npm exec --package=@${unscopedPackage}/cli -- ${unscopedPackage} status`,
    `pnpm dlx @${unscopedPackage}/cli dev status`,
    `pnpm dlx --package=@${unscopedPackage}/cli ${unscopedPackage} status`,
    `yarn dlx @${unscopedPackage}/create ${unscopedPackage}`,
    `yarn dlx -p @${unscopedPackage}/cli ${unscopedPackage} status`,
    `bun x --package=@${unscopedPackage}/cli ${unscopedPackage} status`,
    `pnpm run ${unscopedPackage}`,
    `pnpm --silent run dlx ${unscopedPackage}`,
    `pnpm exec ${unscopedPackage}`,
    `yarn ${unscopedPackage}`,
    `npm run exec ${unscopedPackage}`,
    `pnpm run add ${unscopedPackage}`,
    `pnpm --filter app run dlx ${unscopedPackage}`,
    `npm --global run exec ${unscopedPackage}`,
    `npm --if-present run install ${unscopedPackage}`,
    `npm install`,
    `npm install --prefix ${unscopedPackage} typescript`,
    `npm install --workspace ${unscopedPackage} typescript`,
    `pnpm install --filter ${unscopedPackage} typescript`,
    `bun install --cwd ${unscopedPackage} typescript`,
    `npm i --ignore-scripts`,
    `pnpm install --frozen-lockfile`,
    `yarn install --immutable`,
    `bun install --frozen-lockfile`,
    `npm install @${unscopedPackage}/cli`,
    `pnpm add typescript`,
    `pnpm install @${unscopedPackage}/core`,
    `bun add @${unscopedPackage}/create`,
    `bun install typescript`,
    `corepack pnpm run ${unscopedPackage}`,
    `spawn('pnpm', ['run', '${unscopedPackage}'])`,
    `npm exec --package=@${unscopedPackage}/cli -- ${unscopedPackage} status`,
    `npm -- run exec ${unscopedPackage}`,
    `spawn('npm', ['run', '${unscopedPackage}'])`,
    `some-npx ${unscopedPackage}`,
  ];
  for (const example of examples) {
    assert.deepEqual(findUnsafeCliInvocations(example), [], example);
  }
});

test('runs the command-safety gate for every SDK change', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/cli-command-safety.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /^  pull_request:$/mu);
  assert.match(workflow, /^  push:$/mu);
  assert.match(workflow, /^      - main$/mu);
  assert.doesNotMatch(workflow, /^    paths:$/mu);
  assert.match(workflow, /node-version-file: '\.nvmrc'/u);
  assert.match(
    workflow,
    /node --test scripts\/check-cli-command-safety\.test\.mjs/u,
  );
  assert.match(workflow, /node scripts\/check-cli-command-safety\.mjs/u);
  assert.doesNotMatch(workflow, /\b(?:npm|pnpm|yarn|bun) (?:ci|install)\b/u);
});

test('scans every tracked text format and ignores binary and untracked files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-cli-safety-'));
  try {
    await writeFile(
      path.join(root, 'tracked.txt'),
      `npx ${unscopedPackage} status\n`,
      'utf8',
    );
    await writeFile(
      path.join(root, 'SCRIPT'),
      `pnpm dlx ${unscopedPackage} --help\n`,
      'utf8',
    );
    await writeFile(
      path.join(root, 'tracked.py'),
      `# npx ${unscopedPackage} status\n`,
      'utf8',
    );
    await writeFile(path.join(root, 'tracked.bin'), Buffer.from([0, 1, 2, 3]));
    await writeFile(
      path.join(root, 'untracked.md'),
      `npx ${unscopedPackage} status\n`,
      'utf8',
    );
    const init = spawnSync('git', ['init', '--quiet'], { cwd: root });
    assert.equal(init.status, 0, init.stderr?.toString());
    const add = spawnSync(
      'git',
      ['add', 'tracked.txt', 'SCRIPT', 'tracked.py', 'tracked.bin'],
      { cwd: root },
    );
    assert.equal(add.status, 0, add.stderr?.toString());

    const result = checkRepository(root);
    assert.equal(result.filesChecked, 3);
    assert.deepEqual(
      result.violations.map((violation) => violation.file).sort(),
      ['SCRIPT', 'tracked.py', 'tracked.txt'],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('includes known companion projects without scanning unrelated siblings', async () => {
  const gitRoot = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-cli-workspace-'));
  const sdkRoot = path.join(gitRoot, 'immersive-web-sdk');
  const companionRoot = path.join(gitRoot, 'iwsdk-v0-template');
  const webxrRoot = path.join(gitRoot, 'webxr-first-steps');
  const unrelatedRoot = path.join(gitRoot, 'unrelated-project');
  try {
    await mkdir(sdkRoot, { recursive: true });
    await mkdir(companionRoot, { recursive: true });
    await mkdir(webxrRoot, { recursive: true });
    await mkdir(unrelatedRoot, { recursive: true });
    await writeFile(path.join(sdkRoot, 'README.md'), 'safe\n', 'utf8');
    await writeFile(
      path.join(companionRoot, 'guide.md'),
      'pnpm dlx ' + unscopedPackage + ' status\n',
      'utf8',
    );
    await writeFile(
      path.join(webxrRoot, 'AGENTS.md'),
      'npm exec ' + unscopedPackage + ' status\n',
      'utf8',
    );
    await writeFile(
      path.join(unrelatedRoot, 'guide.md'),
      `npx ${unscopedPackage} status\n`,
      'utf8',
    );
    const init = spawnSync('git', ['init', '--quiet'], { cwd: gitRoot });
    assert.equal(init.status, 0, init.stderr?.toString());
    const add = spawnSync('git', ['add', '.'], { cwd: gitRoot });
    assert.equal(add.status, 0, add.stderr?.toString());

    const result = checkWorkspace(sdkRoot);
    assert.equal(result.filesChecked, 3);
    assert.deepEqual(
      result.violations.map((violation) => violation.file),
      [
        path.join('iwsdk-v0-template', 'guide.md'),
        path.join('webxr-first-steps', 'AGENTS.md'),
      ],
    );
  } finally {
    await rm(gitRoot, { force: true, recursive: true });
  }
});
