/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  RuntimeBrowserClient,
  RuntimeDeviceClass,
  RuntimePageRole,
  RuntimePageTarget,
} from '@iwsdk/cli/contract';

/** Longest page, tab, scene or owner identity accepted from a browser. */
export const MAX_BROWSER_IDENTITY_LENGTH = 256;

/** Absent is a legacy managed page; any other unknown class is malformed. */
export function normalizeDeviceClass(
  deviceClass: unknown,
): RuntimeDeviceClass | null {
  if (deviceClass === undefined) {
    return 'managed';
  }
  return deviceClass === 'managed' || deviceClass === 'physical'
    ? deviceClass
    : null;
}

/** Absent is a legacy app page; any other unknown role is malformed. */
export function normalizePageRole(role: unknown): RuntimePageRole | null {
  if (role === undefined) {
    return 'app';
  }
  return role === 'app' || role === 'editor' || role === 'preview'
    ? role
    : null;
}

/** A conflicting pair of announced names is malformed, never resolved. */
const CONFLICT = Symbol('conflict');

/** Reads a field pages announce under current and legacy names. */
function announced(current: unknown, legacy: unknown): unknown {
  if (current === undefined) {
    return legacy;
  }
  return legacy === undefined || legacy === current ? current : CONFLICT;
}

function isIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_BROWSER_IDENTITY_LENGTH
  );
}

function isOptionalIdentity(value: unknown): boolean {
  return value === undefined || isIdentity(value);
}

/**
 * True only for endpoint metadata that is safe to route, sort and publish:
 * bounded string identities and a positive safe-integer generation.
 */
export function isValidBrowserEndpoint(endpoint: RuntimePageTarget): boolean {
  return (
    isIdentity(endpoint.pageId) &&
    Number.isSafeInteger(endpoint.tabGeneration) &&
    endpoint.tabGeneration! >= 1 &&
    ['app', 'editor', 'preview'].includes(endpoint.role as string) &&
    [undefined, 'managed', 'physical'].includes(endpoint.deviceClass) &&
    (endpoint.deviceClass === 'physical'
      ? isIdentity(endpoint.headsetId)
      : isOptionalIdentity(endpoint.headsetId)) &&
    isOptionalIdentity(endpoint.sessionId) &&
    isOptionalIdentity(endpoint.sceneSessionId) &&
    (endpoint.browserEpoch === undefined ||
      (Number.isSafeInteger(endpoint.browserEpoch) &&
        endpoint.browserEpoch >= 0))
  );
}

const ENDPOINT_IDENTITY_KEYS = [
  'deviceClass',
  'headsetId',
  'sessionId',
  'browserEpoch',
  'role',
  'pageId',
  'tabGeneration',
  'sceneSessionId',
] as const;

/** Compares everything except readiness, the one field a socket may update. */
export function isSameBrowserEndpoint(
  left: RuntimePageTarget,
  right: RuntimePageTarget,
): boolean {
  return ENDPOINT_IDENTITY_KEYS.every((key) =>
    key === 'deviceClass'
      ? (left.deviceClass ?? 'managed') === (right.deviceClass ?? 'managed')
      : left[key] === right[key],
  );
}

export interface BrowserHelloOwner {
  sessionId: string;
  browserEpoch: number;
  /** Resolved from the hello's pairing token; required for physical pages. */
  headsetId?: string;
  /** Used only when a legacy page announces neither pageId nor tabId. */
  fallbackPageId: string;
}

/**
 * Converts a raw iwsdk_browser_hello into endpoint metadata before any
 * registry sees it. Absent legacy fields take defaults, but present malformed
 * values are rejected (null) instead of coerced, and a managed page must carry
 * exactly the owned session and browser epoch.
 */
export function normalizeBrowserHello(
  hello: Record<string, unknown>,
  owner: BrowserHelloOwner,
): RuntimeBrowserClient | null {
  const deviceClass = normalizeDeviceClass(hello.deviceClass);
  const role = normalizePageRole(announced(hello.pageRole, hello.role));
  const announcedPageId = announced(hello.pageId, hello.tabId);
  const pageId =
    announcedPageId === undefined ? owner.fallbackPageId : announcedPageId;
  if (
    deviceClass == null ||
    role == null ||
    (hello.commandReady !== undefined &&
      typeof hello.commandReady !== 'boolean') ||
    (deviceClass === 'managed' &&
      (hello.sessionId !== owner.sessionId ||
        hello.browserEpoch !== owner.browserEpoch))
  ) {
    return null;
  }
  const client: RuntimeBrowserClient = {
    commandReady: hello.commandReady === true,
    sessionId: owner.sessionId,
    browserEpoch: deviceClass === 'managed' ? owner.browserEpoch : undefined,
    headsetId: deviceClass === 'physical' ? owner.headsetId : undefined,
    deviceClass,
    pageId: pageId as string,
    role,
    sceneSessionId: hello.sceneSessionId as string | undefined,
    tabGeneration: (hello.tabGeneration === undefined
      ? 1
      : hello.tabGeneration) as number,
  };
  return isValidBrowserEndpoint(client) ? client : null;
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

function hasManagedRoles(
  clients: readonly RuntimeBrowserClient[],
  requireReady: boolean,
): boolean {
  const roles = new Set(
    clients
      .filter(
        (client) =>
          client.deviceClass === 'managed' &&
          (client.commandReady || !requireReady),
      )
      .map((client) => client.role),
  );
  return roles.has('app') && roles.has('editor');
}

/** True while both managed roles the command path needs have a bridge. */
export function hasManagedCommandRoles(
  clients: readonly RuntimeBrowserClient[],
): boolean {
  return hasManagedRoles(clients, false);
}

export function hasReadyBrowserCommandPath(
  clients: readonly RuntimeBrowserClient[],
): boolean {
  return hasManagedRoles(clients, true);
}
