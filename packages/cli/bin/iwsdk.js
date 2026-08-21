#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const entrypoint = new URL('../dist/cli.js', import.meta.url);
if (!existsSync(fileURLToPath(entrypoint))) {
  console.error(
    'The local @iwsdk/cli package has not been built. Run "corepack pnpm@11.22.0 --filter @iwsdk/cli build" from the immersive-web-sdk repository, then retry.',
  );
  process.exitCode = 1;
} else {
  await import(entrypoint.href);
}
