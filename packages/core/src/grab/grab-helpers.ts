/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { HandleStore } from '@pmndrs/handle';

/**
 * Pure helpers backing {@link GrabSystem.forceRelease} and
 * {@link GrabSystem.getHolderHand}. Kept side-effect-free and dependency-light
 * so they can be unit-tested without spinning up the full ECS / xr-input
 * import chain.
 *
 * Not part of the public package API surface — `grab-system.ts` is the only
 * intended caller.
 */

/**
 * Cancel every active pointer on a grab `handle`. Safe to call when `handle`
 * is `undefined`, when the entity is not currently held, or when the
 * underlying `cancel()` throws (errors are swallowed to match the cleanup
 * semantics already used inside `GrabSystem` on Handle-component disqualify).
 */
export function cancelGrabHandle(
  handle: HandleStore<unknown> | undefined,
): void {
  if (!handle) {
    return;
  }
  try {
    handle.cancel();
  } catch {}
}

/**
 * Determine which controller is currently holding the entity backing
 * `handle`, given the candidate pointer IDs per hand.
 *
 * Each hand contributes the IDs of every pointer kind that can capture a
 * grab handle today — near grabs use the `grab` sub-pointer, distance grabs
 * use the `ray` sub-pointer (per `pointerEventsType` on the handle's
 * object). Passing both keeps `getHolderHand` correct across both grab
 * styles without leaking pointer-kind selection into callers.
 *
 * Returns `'left'` / `'right'` for single-hand grabs, `'left'` for two-hand
 * grabs (deterministic), and `null` when the entity has no active grabs or
 * none of the candidate IDs match.
 */
export function findHolderHand(
  handle: HandleStore<unknown> | undefined,
  leftPointerIds: readonly number[],
  rightPointerIds: readonly number[],
): 'left' | 'right' | null {
  if (!handle || handle.inputState.size === 0) {
    return null;
  }
  if (leftPointerIds.some((id) => handle.inputState.has(id))) {
    return 'left';
  }
  if (rightPointerIds.some((id) => handle.inputState.has(id))) {
    return 'right';
  }
  return null;
}
