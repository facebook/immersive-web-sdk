/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { describeChildExit, isAbnormalChildExit } from '../src/commands/dev.js';

describe('isAbnormalChildExit', () => {
  it('treats a clean exit (code 0, no signal) as normal', () => {
    expect(isAbnormalChildExit({ exitCode: 0, signal: null })).toBe(false);
  });

  it('treats a non-zero exit code as abnormal', () => {
    expect(isAbnormalChildExit({ exitCode: 1, signal: null })).toBe(true);
  });

  it('treats signal termination (exitCode null) as abnormal', () => {
    // Regression: the old `exit.exitCode && exit.exitCode !== 0` check was
    // false here, so a signal-killed dev server looked like success.
    expect(isAbnormalChildExit({ exitCode: null, signal: 'SIGTERM' })).toBe(
      true,
    );
    expect(isAbnormalChildExit({ exitCode: null, signal: 'SIGKILL' })).toBe(
      true,
    );
  });

  it('treats an unknown termination (both null) as abnormal', () => {
    expect(isAbnormalChildExit({ exitCode: null, signal: null })).toBe(true);
  });
});

describe('describeChildExit', () => {
  it('names the signal when present', () => {
    expect(describeChildExit({ exitCode: null, signal: 'SIGTERM' })).toBe(
      'Dev server terminated by signal SIGTERM',
    );
  });

  it('names the exit code when there is no signal', () => {
    expect(describeChildExit({ exitCode: 3, signal: null })).toBe(
      'Dev server exited with code 3',
    );
  });

  it('falls back to a generic message when neither is available', () => {
    expect(describeChildExit({ exitCode: null, signal: null })).toBe(
      'Dev server exited abnormally',
    );
  });
});
