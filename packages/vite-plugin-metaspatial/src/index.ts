/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Export component discovery plugin
export {
  discoverComponents,
  type ComponentDiscoveryOptions,
} from './discover-components/index.js';

// Export GLXF generation plugin
export {
  generateGLXF,
  type GLXFGenerationOptions,
} from './generate-glxf/index.js';
