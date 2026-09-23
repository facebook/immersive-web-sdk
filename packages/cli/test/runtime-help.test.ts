/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { expect, test } from 'vitest';
import { buildRuntimeCommandHelp } from '../src/help.js';

test('prints fields nested inside array items in runtime help', () => {
  const help = buildRuntimeCommandHelp('browser', 'interact').join('\n');

  expect(help).toContain('steps[].action (required) [enum]');
  expect(help).toContain('keyDown');
  expect(help).toContain('keyUp');
  expect(help).toContain('steps[].durationMs [integer]');
  expect(help).toContain('steps[].locator.role [string]');
  expect(help).toContain('scoped to this batch');
});
