/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { Chalk } from 'chalk';
import ora, { Ora } from 'ora';
import type { ActionItem } from './types.js';
const stdoutColor = new Chalk({ level: process.stdout.isTTY ? 3 : 0 });
const stderrColor = new Chalk({ level: process.stderr.isTTY ? 3 : 0 });

export async function installDependencies(outDir: string) {
  const installSpinner: Ora = ora({
    text: 'Installing dependencies ...',
    stream: process.stderr,
    discardStdin: false,
    hideCursor: false,
    isEnabled: process.stderr.isTTY,
  }).start();

  const args = ['install'];
  const cmd = 'npm';
  try {
    const child = spawn(cmd, args, { cwd: outDir, stdio: 'inherit' });
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Install failed (${code})`)),
      );
    });
    installSpinner.stopAndPersist({
      symbol: stderrColor.green('✔'),
      text: 'Dependencies installed',
    });
  } catch (e) {
    installSpinner.stopAndPersist({
      symbol: stderrColor.red('✖'),
      text: 'Install failed',
    });
    throw e;
  }
}

export function printNextSteps(
  appName: string,
  installed: boolean,
  actionItems: ActionItem[] = [],
) {
  const startCmd = 'npm run dev';
  console.log('\nNext steps:');
  // Choose the best stream for colored action items
  const itemStream = process.stdout.isTTY
    ? process.stdout
    : process.stderr.isTTY
      ? process.stderr
      : process.stdout;
  const itemColor = process.stdout.isTTY
    ? stdoutColor
    : process.stderr.isTTY
      ? stderrColor
      : stdoutColor;
  for (const item of actionItems) {
    const prefix = item.level === 'important' ? '!!!' : '!';
    itemStream.write(`${itemColor.bold.yellow(prefix)} ${item.message}\n`);
  }
  // Commands go to stdout
  console.log(stdoutColor.gray(`  cd ${appName}`));
  if (!installed) {
    console.log(stdoutColor.gray('  npm install'));
  }
  console.log(stdoutColor.gray(`  ${startCmd}`));
}

export function printPrerequisites(prereqs: ActionItem[] = []) {
  if (!prereqs.length) {
    return;
  }
  console.log('\nPrerequisites:');
  const itemStream = process.stdout.isTTY
    ? process.stdout
    : process.stderr.isTTY
      ? process.stderr
      : process.stdout;
  const itemColor = process.stdout.isTTY
    ? stdoutColor
    : process.stderr.isTTY
      ? stderrColor
      : stdoutColor;
  for (const item of prereqs) {
    const prefix = item.level === 'important' ? '!!!' : '!';
    const lines = String(item.message).split('\n');
    if (!lines.length) {
      continue;
    }
    // First line with prefix
    itemStream.write(`${itemColor.bold.yellow(prefix)} ${lines[0]}\n`);
    // Subsequent lines indented with subdued color
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) {
        itemStream.write('\n');
      } else {
        itemStream.write(`    ${itemColor.gray('- ' + line)}\n`);
      }
    }
  }
}
