/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  RuntimeBrowserClient,
  RuntimeDeviceClass,
} from '@iwsdk/cli/contract';

export function normalizeDeviceClass(
  deviceClass: string | undefined,
): RuntimeDeviceClass {
  return deviceClass === 'physical' ? 'physical' : 'managed';
}

export function isBrowserBridgeConnectionAllowed(
  address: string | undefined,
): boolean {
  if (address == null) {
    return false;
  }
  const normalized = address.toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

export function hasReadyBrowserCommandPath(
  clients: readonly RuntimeBrowserClient[],
): boolean {
  if (
    clients.some(
      (client) =>
        client.commandReady &&
        client.deviceClass === 'physical' &&
        client.role === 'app',
    )
  ) {
    return true;
  }

  const readyManagedRoles = new Set(
    clients
      .filter(
        (client) => client.commandReady && client.deviceClass === 'managed',
      )
      .map((client) => client.role),
  );
  return readyManagedRoles.has('app') && readyManagedRoles.has('editor');
}
