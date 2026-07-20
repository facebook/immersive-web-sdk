/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';
import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
export const Visibility = createComponent(
  'Visibility',
  {
    isVisible: { type: Types.Boolean, default: true },
  },
  'Component to control if an entity object is visible',
  // @ts-ignore - 4th argument is editor metadata consumed by tooling.
  { hideInEditor: true },
);

function attachToEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D) {
    return;
  }

  Object.defineProperty(object3D, 'visible', {
    get: () => {
      return entity.getValue(Visibility, 'isVisible');
    },
    set: (value: boolean) => {
      entity.setValue(Visibility, 'isVisible', value);
    },
    enumerable: true,
    configurable: true,
  });
}

function detachFromEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D) {
    return;
  }

  Object.defineProperty(object3D, 'visible', {
    value: object3D.visible,
    enumerable: true,
    configurable: true,
  });
}

export class VisibilitySystem extends createSystem({
  visibility: { required: [Visibility] },
}) {
  init(): void {
    this.queries.visibility.subscribe('qualify', attachToEntity);
    this.queries.visibility.subscribe('disqualify', detachFromEntity);
  }
}
