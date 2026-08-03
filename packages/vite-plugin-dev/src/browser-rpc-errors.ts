/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  RuntimeBrowserState,
  RuntimeIssueCause,
} from '@iwsdk/cli/contract';

export interface RuntimeRpcErrorPayload {
  code: number;
  message: string;
  cause?: RuntimeIssueCause;
}

const RUNTIME_RPC_ERROR_CODE = -32000;

export function createUnavailableBrowserRpcError(
  browser: RuntimeBrowserState | null | undefined,
): RuntimeRpcErrorPayload {
  if (browser?.status === 'launch_failed') {
    return {
      code: RUNTIME_RPC_ERROR_CODE,
      message: browser.lastError?.message ?? 'Managed browser launch failed.',
      cause: browser.lastError?.cause ?? 'browser_launch_failed',
    };
  }

  if (browser?.status === 'not_launched') {
    return {
      code: RUNTIME_RPC_ERROR_CODE,
      message:
        browser.lastError?.message ??
        'No managed browser was launched because the dev server was started with --no-open. Run "iwsdk dev restart --open" to enable browser, scene, and runtime tools.',
      cause: 'browser_not_launched',
    };
  }

  if (browser?.status === 'disconnected') {
    return {
      code: RUNTIME_RPC_ERROR_CODE,
      message:
        browser.lastError?.message ??
        'Managed browser runtime disconnected from the MCP bridge.',
      cause: browser.lastError?.cause ?? 'connection_lost',
    };
  }

  if (browser?.connected && browser.commandReady === false) {
    return {
      code: RUNTIME_RPC_ERROR_CODE,
      message:
        browser.lastError?.message ??
        'Managed browser command path is still warming up.',
      cause: browser.lastError?.cause ?? 'browser_not_ready',
    };
  }

  return {
    code: RUNTIME_RPC_ERROR_CODE,
    message: 'Browser not ready',
    cause: browser?.lastError?.cause ?? 'browser_not_ready',
  };
}
