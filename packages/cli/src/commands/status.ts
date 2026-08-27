/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSuccess } from '../cli-results.js';
import type {
  CliOptionValue,
  CliOptions,
  CliSuccess,
  ResolvedCliIo,
} from '../cli-types.js';
import {
  findNearestIwsdkAppRoot,
  getRuntimeUrls,
  getWorkspaceRuntimeState,
  resolveWorkspaceRoot,
} from '../runtime-state.js';
import { readAdapterStatus } from './adapter.js';

export async function detectWorkspaceForStatus(
  cwd: string,
  workspaceOverride: CliOptionValue | undefined,
): Promise<string | null> {
  if (typeof workspaceOverride === 'string') {
    try {
      return await resolveWorkspaceRoot({
        cwd,
        workspace: workspaceOverride,
        requireRunning: false,
      });
    } catch {
      return null;
    }
  }

  return findNearestIwsdkAppRoot(cwd);
}

export async function handleStatus(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await detectWorkspaceForStatus(
    io.cwd,
    options.workspace,
  );

  if (!workspaceRoot) {
    return createSuccess({
      workspaceRoot: null,
    });
  }

  const [state, adapters] = await Promise.all([
    getWorkspaceRuntimeState(workspaceRoot),
    readAdapterStatus(workspaceRoot),
  ]);

  return createSuccess({
    workspaceRoot,
    runtimeUrls: getRuntimeUrls(state.session),
    state,
    adapters,
  });
}
