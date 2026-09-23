/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Compatibility entry point. Managed-browser implementation lives with its
// domain owners under managed-browser/.
export * from './managed-browser/session.js';
export { ensureChromiumInstalled } from './managed-browser/launch.js';
