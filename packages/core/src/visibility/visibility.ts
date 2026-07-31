/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { Visibility } from './visibility-component.js';

export { Visibility } from './visibility-component.js';

function attachToEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D || (object3D as any).__visibilityAttached) {
    return;
  }
  (object3D as any).__visibilityAttached = true;

  Object.defineProperty(object3D, 'visible', {
    get: () => Boolean(Visibility.data.isVisible[entity.index]),
    set: (value: boolean) => {
      entity.setValue(Visibility, 'isVisible', value);
    },
    enumerable: true,
    configurable: true,
  });
}

function detachFromEntity(entity: Entity): void {
  const object3D = entity.object3D;
  if (!object3D || !(object3D as any).__visibilityAttached) {
    return;
  }
  const visible = Boolean(Visibility.data.isVisible[entity.index]);

  Object.defineProperty(object3D, 'visible', {
    value: visible,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  delete (object3D as any).__visibilityAttached;
}

export class VisibilitySystem extends createSystem({
  visibility: { required: [Visibility] },
}) {
  init(): void {
    this.queries.visibility.subscribe('qualify', attachToEntity);
    this.queries.visibility.subscribe('disqualify', detachFromEntity);
  }
}
