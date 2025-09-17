/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir } from 'fs/promises';
import fsp from 'fs/promises';
import path from 'path';
import type { Recipe } from '@pmndrs/chef';
import { buildProject } from '@pmndrs/chef';
import chalk from 'chalk';
import ora from 'ora';
import { Ora } from 'ora';
import prettier from 'prettier';

async function applyRecipe(recipe: Recipe, outDir: string) {
  const result = await buildProject([recipe], undefined, { allowUrl: true });
  const decoder = new TextDecoder('utf-8');
  for (const [rel, bytes] of Object.entries(result)) {
    const outPath = path.join(outDir, rel);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const ext = path.extname(rel).toLowerCase();
    const isTs = ext === '.ts' || ext === '.tsx' || ext === '.d.ts';
    if (!isTs) {
      await fsp.writeFile(outPath, Buffer.from(bytes as any));
      continue;
    }
    // Attempt to format TS content with Prettier; fall back on error
    try {
      const text =
        typeof bytes === 'string'
          ? (bytes as string)
          : decoder.decode(bytes as Uint8Array);
      const formatted = await prettier.format(text, { filepath: rel });
      await fsp.writeFile(outPath, formatted, 'utf8');
    } catch {
      await fsp.writeFile(outPath, Buffer.from(bytes as any));
    }
  }
}

export async function scaffoldProject(recipe: Recipe, outDir: string) {
  const scaffoldSpinner: Ora = ora({
    text: `Scaffolding in ${chalk.gray(outDir)} ...`,
    stream: process.stderr,
    discardStdin: false,
    hideCursor: false,
    isEnabled: process.stderr.isTTY,
  }).start();
  try {
    await mkdir(outDir, { recursive: true });
    await applyRecipe(recipe, outDir);
    scaffoldSpinner.stopAndPersist({
      symbol: chalk.green('✔'),
      text: 'Project files created',
    });
  } catch (e) {
    scaffoldSpinner.stopAndPersist({
      symbol: chalk.red('✖'),
      text: 'Scaffolding failed',
    });
    throw e;
  }
}
