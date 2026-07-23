/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type ExperienceTarget = 'vr' | 'ar' | 'browser';
export type XRMode = Exclude<ExperienceTarget, 'browser'>;
export type Language = 'ts' | 'js';
export type VariantId = `${ExperienceTarget}-manual-${Language}`;
export type TriState = 'no' | 'optional' | 'required';
export type AiTool = 'claude' | 'cursor' | 'copilot' | 'codex';

export type FeatureFlags = {
  locomotionEnabled: boolean;
  locomotionUseWorker?: boolean;
  locomotionBrowserControls?: boolean;
  grabbingEnabled: boolean;
  physicsEnabled: boolean;
  sceneUnderstandingEnabled: boolean;
  environmentRaycastEnabled: boolean;
};

export type ActionItem = {
  message: string;
  level?: 'info' | 'warning' | 'important';
};

export type PromptResult = {
  name: string;
  id: VariantId;
  installNow: boolean;
  target: ExperienceTarget;
  xrEnabled: boolean;
  mode?: XRMode;
  language: Language;
  // Legacy multiselect (kept for forward-compat with older recipes; unused now)
  features: string[];
  // New granular feature prompts (mapped to world-initializer features)
  featureFlags: FeatureFlags;
  gitInit: boolean;
  aiTools: AiTool[];
  xrFeatureStates: Record<string, TriState>;
  actionItems?: ActionItem[];
  prerequisites?: ActionItem[];
};
