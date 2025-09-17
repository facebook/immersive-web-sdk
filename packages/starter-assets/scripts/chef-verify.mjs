#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProject } from '@pmndrs/chef';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RECIPES_DIR = path.join(ROOT, 'dist', 'recipes');

async function main() {
  const files = (await fsp.readdir(RECIPES_DIR)).filter((f) =>
    f.endsWith('.recipe.json'),
  );
  if (files.length === 0) {
    console.error('No *.recipe.json files found in dist/recipes. Build first.');
    process.exit(1);
  }
  let ok = 0;
  for (const f of files) {
    const p = path.join(RECIPES_DIR, f);
    const recipe = JSON.parse(await fsp.readFile(p, 'utf8'));
    try {
      const result = await buildProject([recipe], undefined, {
        allowUrl: true,
      });
      const count = Object.keys(result).length;
      console.log(`OK ${f} (${count} files)`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${f}:`, e?.message || e);
      process.exit(1);
    }
  }
  console.log(`Summary: ${ok} / ${files.length} recipes OK`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
