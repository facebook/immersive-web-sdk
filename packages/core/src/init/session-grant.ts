/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const SESSION_GRANT_TTL_MS = 30_000;

type SessionGrantCallback = () => void;

type SessionGrantSubscriptionOptions = {
  persistent?: boolean;
};

let armedXRSystem: XRSystem | undefined;
let pendingGrantAt: number | undefined;
const subscribers = new Set<SessionGrantCallback>();
const persistentSubscribers = new Set<SessionGrantCallback>();

function now(): number {
  return Date.now();
}

function hasFreshPendingGrant(): boolean {
  if (pendingGrantAt == null) {
    return false;
  }
  if (now() - pendingGrantAt <= SESSION_GRANT_TTL_MS) {
    return true;
  }
  pendingGrantAt = undefined;
  return false;
}

function handleSessionGranted(): void {
  pendingGrantAt = now();
  if (subscribers.size === 0 && persistentSubscribers.size === 0) {
    return;
  }

  const pendingSubscribers = [...subscribers];
  const recurringSubscribers = [...persistentSubscribers];
  subscribers.clear();
  pendingGrantAt = undefined;
  for (const subscriber of [...pendingSubscribers, ...recurringSubscribers]) {
    try {
      subscriber();
    } catch (error) {
      console.error('[XR] sessiongranted subscriber failed:', error);
    }
  }
}

/**
 * Start recording native sessiongranted events before asynchronous world
 * initialization begins. Calling this more than once for the same XRSystem is
 * a no-op.
 *
 * @internal
 */
export function armSessionGrantCapture(): void {
  const xr = globalThis.navigator?.xr;
  if (xr == null || xr === armedXRSystem) {
    return;
  }
  armedXRSystem?.removeEventListener('sessiongranted', handleSessionGranted);
  armedXRSystem = xr;
  xr.addEventListener('sessiongranted', handleSessionGranted);
}

/** Arm capture synchronously when world options request grant-driven launch. */
export function armSessionGrantCaptureForOptions(
  xr: false | { launchOnSessionGranted?: boolean } | undefined,
): void {
  if (xr !== false && xr?.launchOnSessionGranted === true) {
    armSessionGrantCapture();
  }
}

/**
 * Consume a recently captured grant, or subscribe to a future grant. One-shot
 * subscriptions run at most once. Persistent subscriptions remain armed so a
 * world can re-enter XR after a failed request or an ended session.
 *
 * @internal
 */
export function onSessionGrant(
  callback: SessionGrantCallback,
  options: SessionGrantSubscriptionOptions = {},
): () => void {
  const target = options.persistent ? persistentSubscribers : subscribers;
  target.add(callback);

  if (hasFreshPendingGrant()) {
    pendingGrantAt = undefined;
    if (!options.persistent) {
      target.delete(callback);
    }
    callback();
  }

  return () => {
    target.delete(callback);
  };
}

/** Reset module state for isolated tests. @internal */
export function resetSessionGrantCaptureForTests(): void {
  armedXRSystem?.removeEventListener('sessiongranted', handleSessionGranted);
  armedXRSystem = undefined;
  pendingGrantAt = undefined;
  subscribers.clear();
  persistentSubscribers.clear();
}
