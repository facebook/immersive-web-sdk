/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import path from 'path';
import { Chalk } from 'chalk';
import { spawn } from 'cross-spawn';
import ora, { Ora } from 'ora';
import type { ResolvedSource } from './source.js';
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
    const child = spawn(cmd, args, {
      cwd: outDir,
      stdio: 'inherit',
    });
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

/**
 * Install dependencies in bundle mode.
 * Rewrites @iwsdk/* entries in both dependencies and devDependencies
 * to file: paths pointing at .sdk-packages/ before running npm install.
 * The rewritten paths are kept permanently so `npm install` remains
 * reproducible as long as the .sdk-packages/ directory is present.
 */
export async function installDependenciesFromBundle(
  outDir: string,
  source: ResolvedSource,
) {
  const pkgPath = path.join(outDir, 'package.json');

  const installSpinner: Ora = ora({
    text: 'Installing dependencies from bundle ...',
    stream: process.stderr,
    discardStdin: false,
    hideCursor: false,
    isEnabled: process.stderr.isTTY,
  }).start();

  try {
    // Rewrite @iwsdk/* deps to file: paths in both dependencies and devDependencies
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const directDependencyNames = new Set<string>();
    for (const depsKey of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[depsKey];
      if (!deps) {
        continue;
      }
      for (const name of Object.keys(deps)) {
        if (name.startsWith('@iwsdk/')) {
          directDependencyNames.add(name);
          const spec = source.getPackageInstallSpec(name);
          if (spec) {
            deps[name] = spec;
          }
        }
      }
    }
    const allPackageSpecs = source.getPackageInstallSpecs();
    const bundleOverrides: Record<string, string> = {};
    for (const [name, spec] of Object.entries(allPackageSpecs)) {
      if (!directDependencyNames.has(name)) {
        bundleOverrides[name] = spec;
      }
    }
    if (Object.keys(bundleOverrides).length > 0) {
      const existingOverrides =
        pkg.overrides != null &&
        typeof pkg.overrides === 'object' &&
        !Array.isArray(pkg.overrides)
          ? pkg.overrides
          : {};
      pkg.overrides = {
        ...existingOverrides,
        ...bundleOverrides,
      };
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // Run npm install
    const child = spawn('npm', ['install'], {
      cwd: outDir,
      stdio: 'inherit',
    });
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Install failed (${code})`)),
      );
    });
    installSpinner.stopAndPersist({
      symbol: stderrColor.green('✔'),
      text: 'Dependencies installed from bundle',
    });
  } catch (e) {
    installSpinner.stopAndPersist({
      symbol: stderrColor.red('✖'),
      text: 'Install failed',
    });
    throw e;
  }
}

function printReferenceWarmupGuidance() {
  console.log(
    stdoutColor.gray(
      '  # @iwsdk/reference downloads its pinned model automatically during warmup',
    ),
  );
  console.log(
    stdoutColor.gray(
      '  # optional for bundle/internal or unpublished corpus payloads: set IWSDK_REFERENCE_ASSETS_BASE_URL to the hosted reference-assets dist URL',
    ),
  );
  console.log(
    stdoutColor.gray(
      '  # warmup still needs access to the baked public model file URLs unless the shared cache is already pre-warmed',
    ),
  );
  console.log(stdoutColor.gray('  # then run: npx iwsdk reference warmup'));
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
  printReferenceWarmupGuidance();
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
