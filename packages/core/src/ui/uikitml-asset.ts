/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Component } from '@pmndrs/uikit';
import { Group, type Object3D } from '../runtime/index.js';
import { UIKitDocument } from './document.js';

/** Object hierarchy produced when a UIKitML manifest asset is instantiated. */
export class UIKitMLAsset extends Group {
  readonly isUIKitMLAsset = true;

  constructor(
    readonly assetId: string,
    readonly document: UIKitDocument,
  ) {
    super();
    this.name = assetId;
    this.add(document);
  }

  /** Find a UIKit element without first dereferencing {@link document}. */
  getElementById<T extends Component<any> = Component<any>>(
    id: string,
  ): T | null {
    return this.document.getElementById<T>(id);
  }

  /** Return a typed UIKit element or throw when the id is absent. */
  requireElementById<T extends Component<any> = Component<any>>(id: string): T {
    return this.document.requireElementById<T>(id);
  }

  /** Release the document even when ScreenSpace has temporarily reparented it. */
  dispose(): void {
    this.document.removeFromParent();
    this.document.dispose();
  }
}

/** Find a UIKit document in either a manifest asset or a legacy panel hierarchy. */
export function findUIKitDocument(
  object: Object3D | null | undefined,
): UIKitDocument | null {
  if (!object) {
    return null;
  }
  if (object instanceof UIKitDocument) {
    return object.disposed ? null : object;
  }
  if (object instanceof UIKitMLAsset) {
    return object.document.disposed ? null : object.document;
  }
  let result: UIKitDocument | null = null;
  object.traverse((child) => {
    if (!result && child instanceof UIKitDocument && !child.disposed) {
      result = child;
    }
  });
  return result;
}
