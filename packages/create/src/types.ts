/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type VariantId =
  `${'vr' | 'ar'}-${'manual' | 'metaspatial'}-${'ts' | 'js'}`;
export type TriState = 'no' | 'optional' | 'required';

export type ActionItem = {
  message: string;
  level?: 'info' | 'warning' | 'important';
};

export type PromptResult = {
  name: string;
  id: VariantId;
  installNow: boolean;
  metaspatial: boolean;
  mode: 'vr' | 'ar';
  language: 'ts' | 'js';
  // Legacy multiselect (kept for forward-compat with older recipes; unused now)
  features: string[];
  // New granular feature prompts (mapped to world-initializer features)
  featureFlags?: {
    locomotionEnabled: boolean;
    locomotionUseWorker?: boolean; // only if enabled
    grabbingEnabled: boolean;
    physicsEnabled: boolean;
    sceneUnderstandingEnabled: boolean; // AR-relevant
  };
  gitInit: boolean;
  xrFeatureStates: Record<string, TriState>;
  actionItems?: ActionItem[];
  prerequisites?: ActionItem[];
};
