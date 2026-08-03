/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { reportSessionStart } from '../src/metavr-telemetry.js';

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

  test('uses the Node entrypoint without relying on the Windows npx.cmd shim', () => {
    reportSessionStart('session-1', {
      iwsdkVersion: '0.5.0',
      port: 8081,
      clientVersion: '1.2.3',
    });

    expect(mocks.resolve).toHaveBeenCalledWith('@meta-quest/metavr/bin.js');
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        '/workspace/node_modules/@meta-quest/metavr/bin.js',
        'xxiwsdk',
        '--client-version',
        '1.2.3',
        'session-start',
        '--session-id',
        'session-1',
        '--iwsdk-version',
        '0.5.0',
        '--port',
        '8081',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    expect(mocks.child.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.child.unref).toHaveBeenCalledOnce();
  });
});
