/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

declare module 'virtual:iwsdk-project' {
  const projectOptions: import('@iwsdk/core').WorldOptions;
  export const manifest: import('@iwsdk/core/project').IwsdkProjectManifestV1;
  export default projectOptions;
}
