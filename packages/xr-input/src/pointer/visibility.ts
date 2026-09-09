/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Object3D } from 'three';

type UIKitComponentLike = Object3D & {
  isVisible?: { value: unknown };
  needsRenderTraversal?: { value: unknown };
};

function isVisibleForPointerEvents(object: Object3D): boolean {
  const component = object as UIKitComponentLike;
  if (
    typeof component.isVisible?.value === 'boolean' &&
    typeof component.needsRenderTraversal?.value === 'boolean'
  ) {
    // UIKit uses Object3D.visible to skip render traversal for renderless
    // components. Its isVisible signal carries the semantic visibility that
    // pointer hit testing should honor.
    return component.isVisible.value;
  }
  return object.visible;
}

/** Return whether an object and every ancestor are semantically visible. */
export function isObjectTreeVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current != null) {
    if (!isVisibleForPointerEvents(current)) {
      return false;
    }
    current = current.parent;
  }
  return true;
}
