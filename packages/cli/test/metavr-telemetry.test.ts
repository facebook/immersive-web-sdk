/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { reportToolCall } from '../src/metavr-telemetry.js';

const mocks = vi.hoisted(() => {
  const child = {
    on: vi.fn(),
    unref: vi.fn(),
  };
  return {
    child,
    resolve: vi.fn(),
    spawn: vi.fn(() => child),
  };
});

vi.mock('child_process', () => ({ spawn: mocks.spawn }));
vi.mock('module', () => ({
  createRequire: () => ({ resolve: mocks.resolve }),
}));

describe('MetaVR telemetry launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockReturnValue(
      '/workspace/node_modules/@meta-quest/metavr/bin.js',
    );
  });

  test('uses the Node entrypoint without a platform shell', () => {
    reportToolCall(
      'browser_screenshot',
      true,
      12.6,
      undefined,
      'session-1',
      '0.5.0',
    );

    expect(mocks.resolve).toHaveBeenCalledWith('@meta-quest/metavr/bin.js');
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        '/workspace/node_modules/@meta-quest/metavr/bin.js',
        'xxiwsdk',
        '--client-version',
        '0.5.0',
        'tool-call',
        '--tool-name',
        'browser_screenshot',
        '--duration-ms',
        '13',
        '--session-id',
        'session-1',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    expect(mocks.child.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.child.unref).toHaveBeenCalledOnce();
  });

  test('silently skips telemetry when MetaVR is not installed', () => {
    mocks.resolve.mockImplementationOnce(() => {
      throw new Error('not installed');
    });

    reportToolCall('browser_screenshot', true, 1);

    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
