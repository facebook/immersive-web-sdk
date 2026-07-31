/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * UI toolkit integration: spatial and screen‑space panels, DOM‑like queries, and behaviors.
 *
 * @packageDocumentation
 * @category UI
 */
// DOM-like access for UI elements
export { UIKitDocument } from './document.js';
export { UIKitMLAsset, findUIKitDocument } from './uikitml-asset.js';

// Updated components with file-based support
export {
  PanelUI,
  PanelDocument,
  PanelUISystem,
  ColorSchemeType,
} from './ui.js';
export type { PanelUIProps, ColorScheme } from './ui.js';
export type {
  UIKitMLComponentSet,
  UIKitMLKit,
  UIKitMLLoadOptions,
} from './uikitml.js';
export {
  DEFAULT_UIKITML_KIT,
  configureUIKitRenderer,
  loadUIKitMLAsset,
  loadUIKitMLComponent,
  parseUIKitMLSource,
} from './uikitml.js';

// Behavior components
export * from './follow.js';
export * from './screenspace.js';
