/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { FEATURE_CATALOG } from './catalog.js';
import type { ExperienceTarget, FeatureFlags } from './types.js';

type FeatureOption = {
  key: keyof FeatureFlags;
  options: readonly string[];
};

const FEATURE_OPTIONS = [
  {
    key: 'locomotionEnabled',
    options: ['--locomotion', '--no-locomotion'],
  },
  { key: 'grabbingEnabled', options: ['--grabbing', '--no-grabbing'] },
  { key: 'physicsEnabled', options: ['--physics', '--no-physics'] },
  {
    key: 'sceneUnderstandingEnabled',
    options: ['--scene-understanding', '--no-scene-understanding'],
  },
  {
    key: 'environmentRaycastEnabled',
    options: ['--environment-raycast', '--no-environment-raycast'],
  },
] as const satisfies readonly FeatureOption[];

export function hasCliOption(args: readonly string[], option: string): boolean {
  return args.some(
    (argument) => argument === option || argument.startsWith(`${option}=`),
  );
}

export function validateFeatureOptionsForTarget(
  target: ExperienceTarget,
  args: readonly string[],
): void {
  for (const definition of FEATURE_OPTIONS) {
    const option = definition.options.find((candidate) =>
      hasCliOption(args, candidate),
    );
    if (option === undefined) {
      continue;
    }

    const supportedTargets = FEATURE_CATALOG[definition.key].targets;
    if (!(supportedTargets as readonly ExperienceTarget[]).includes(target)) {
      throw new Error(
        `${option} is not available for --target ${target}. ` +
          `Supported targets: ${supportedTargets.join(', ')}.`,
      );
    }
  }
}
