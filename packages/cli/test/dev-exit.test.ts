/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  describeChildExit,
  describeStartupExit,
  isAbnormalChildExit,
  shouldOpenExternalBrowser,
} from '../src/commands/dev.js';

describe('shouldOpenExternalBrowser', () => {
  it('never opens an OS browser when Playwright manages the workspace', () => {
    expect(
      shouldOpenExternalBrowser(true, {
        browser: {
          commandReady: true,
          connected: true,
          connectedClientCount: 1,
          lastTransitionAt: new Date(0).toISOString(),
          status: 'connected',
        },
      }),
    ).toBe(false);
  });

  it('opens externally only when requested and no managed browser exists', () => {
    expect(shouldOpenExternalBrowser(true, {})).toBe(true);
    expect(shouldOpenExternalBrowser(false, {})).toBe(false);
  });
});

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

describe('describeStartupExit', () => {
  const writeLog = (content: string) => {
    const logPath = path.join(
      mkdtempSync(path.join(tmpdir(), 'iwsdk-dev-exit-')),
      'dev.log',
    );
    writeFileSync(logPath, content);
    return logPath;
  };

  it('names an occupied configured port instead of a generic exit', async () => {
    const logPath = writeLog(
      'error when starting dev server:\nError: Port 8081 is already in use\n',
    );
    await expect(describeStartupExit(logPath)).resolves.toBe(
      'Port 8081 is already in use. The runtime keeps its configured port instead of moving; stop the process using it or change server.port.',
    );
  });

  it('keeps the generic message for other or unreadable logs', async () => {
    const generic = 'Dev server exited before registering a runtime session';
    await expect(
      describeStartupExit(writeLog('SyntaxError: bad config\n')),
    ).resolves.toBe(generic);
    await expect(describeStartupExit('/nonexistent/dev.log')).resolves.toBe(
      generic,
    );
    await expect(describeStartupExit(null)).resolves.toBe(generic);
  });
});
