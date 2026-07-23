/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  hasCliOption,
  validateFeatureOptionsForTarget,
} from '../src/cli-options.js';

describe('CLI option validation', () => {
  it('recognizes both spaced and equals option syntax', () => {
    expect(hasCliOption(['--language', 'js'], '--language')).toBe(true);
    expect(hasCliOption(['--language=js'], '--language')).toBe(true);
    expect(hasCliOption(['--language-extra=js'], '--language')).toBe(false);
  });

  it.each([
    ['ar', '--locomotion'],
    ['ar', '--no-locomotion'],
    ['vr', '--scene-understanding'],
    ['browser', '--no-environment-raycast'],
  ] as const)('rejects %s target configuration with %s', (target, option) => {
    expect(() => validateFeatureOptionsForTarget(target, [option])).toThrow(
      `${option} is not available for --target ${target}`,
    );
  });

  it('accepts feature options supported by the selected target', () => {
    expect(() =>
      validateFeatureOptionsForTarget('browser', [
        '--locomotion',
        '--no-grabbing',
        '--physics',
      ]),
    ).not.toThrow();
    expect(() =>
      validateFeatureOptionsForTarget('ar', [
        '--scene-understanding',
        '--environment-raycast',
      ]),
    ).not.toThrow();
  });
});
