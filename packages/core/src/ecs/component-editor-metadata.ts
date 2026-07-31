/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { AnyComponent } from './component.js';

/** Presentation and lifecycle hints consumed by IWSDK authoring tools. */
export interface ComponentEditorMetadata {
  /** Exclude this component from generic component authoring UI. */
  hidden?: boolean;
  /** The runtime owns this component as an intrinsic part of an entity. */
  intrinsic?: boolean;
}

const metadataByComponent = new WeakMap<
  AnyComponent,
  ComponentEditorMetadata
>();

/** Attach editor metadata without changing the Elics component shape. */
export function setComponentEditorMetadata<C extends AnyComponent>(
  component: C,
  metadata: ComponentEditorMetadata,
): C {
  metadataByComponent.set(component, Object.freeze({ ...metadata }));
  return component;
}

/** Read editor metadata previously attached to an Elics component. */
export function getComponentEditorMetadata(
  component: AnyComponent,
): Readonly<ComponentEditorMetadata> | undefined {
  return metadataByComponent.get(component);
}
