/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { getUnsupportedNodeMessage } from './node-engine.js';
import { NODE_ENGINE } from './version.js';
import { runCli } from './index.js';

const nodeError = getUnsupportedNodeMessage(process.versions.node, NODE_ENGINE);
if (nodeError) {
  console.error(nodeError);
  process.exitCode = 1;
} else {
  const exitCode = await runCli(process.argv.slice(2));
  if (typeof exitCode === 'number') {
    process.exitCode = exitCode;
  }
}
