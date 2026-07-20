/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // The editor E2Es launch real WebGL browser contexts; running many files at
    // once can exhaust contexts on developer machines and CI runners.
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
