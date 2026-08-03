/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import { parseArgv, parseOptionalPositiveIntegerOption } from '../src/argv.js';

describe('CLI argument parsing', () => {
  test('parses dev session values and positive/negative boolean flags', () => {
    expect(
      parseArgv([
        'dev',
        'up',
        '--ai-mode',
        'agent',
        '--headless',
        '--no-open',
        '--screenshot-width',
        '1280',
        '--screenshot-height',
        '720',
      ]),
    ).toEqual({
      positionals: ['dev', 'up'],
      options: {
        aiMode: 'agent',
        headless: true,
        noOpen: true,
        screenshotHeight: '720',
        screenshotWidth: '1280',
      },
    });
  });

  test('requires strict positive integer option values', () => {
    expect(parseOptionalPositiveIntegerOption('800', '--width')).toBe(800);
    expect(parseOptionalPositiveIntegerOption(undefined, '--width')).toBe(
      undefined,
    );
    expect(() => parseOptionalPositiveIntegerOption(true, '--width')).toThrow(
      '--width requires a positive integer value',
    );
    expect(() => parseOptionalPositiveIntegerOption('20px', '--width')).toThrow(
      '--width must be a positive integer',
    );
    expect(() => parseOptionalPositiveIntegerOption('0', '--width')).toThrow(
      '--width must be a positive integer',
    );
  });
});
