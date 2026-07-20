/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import prompts from 'prompts';
import { PromptResult, TriState, VariantId, AiTool } from './types.js';

export async function promptFlow(
  nameArg?: string,
  defaults: { xrEnabled?: boolean } = {},
): Promise<PromptResult> {
  let cancelled = false;
  const onCancel = () => {
    cancelled = true;
    return false;
  };
  const actionItems: PromptResult['actionItems'] = [];
  const prerequisites: PromptResult['prerequisites'] = [];

  const name =
    nameArg ||
    (
      await prompts(
        {
          type: 'text',
          name: 'name',
          message: 'Project name',
          initial: 'iwsdk-app',
          validate: (v: string) =>
            /^[a-zA-Z0-9._@-]+$/.test(v.trim())
              ? true
              : 'Project name must contain only letters, numbers, hyphens, underscores, dots, and @',
        },
        { onCancel },
      )
    ).name;

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const { aiTools } = await prompts(
    {
      type: 'multiselect',
      name: 'aiTools',
      message: 'Which AI coding tools do you use?',
      choices: [
        { title: 'Claude Code (Anthropic)', value: 'claude', selected: true },
        { title: 'Cursor', value: 'cursor' },
        { title: 'GitHub Copilot', value: 'copilot' },
        { title: 'OpenAI Codex', value: 'codex' },
        { title: 'None', value: 'none' },
      ],
      hint: '- Space to select, Enter to confirm',
    },
    { onCancel },
  );
  if (cancelled) {
    throw new Error('Input cancelled');
  }

  // If "none" is selected, clear all other selections
  const resolvedAiTools: AiTool[] = (aiTools as string[])?.includes('none')
    ? []
    : (aiTools as AiTool[]) || [];

  const { language } = await prompts(
    {
      type: 'select',
      name: 'language',
      message: 'Which language do you want to use?',
      choices: [
        { title: 'TypeScript', value: 'ts' },
        { title: 'JavaScript', value: 'js' },
      ],
      initial: 0,
    },
    { onCancel },
  );

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const xrEnabled =
    defaults.xrEnabled ??
    !!(
      await prompts(
        {
          type: 'toggle',
          name: 'xrEnabled',
          message: 'Enable XR support?',
          initial: true,
          active: 'Yes',
          inactive: 'No',
        },
        { onCancel },
      )
    ).xrEnabled;

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const { mode = 'vr' } = xrEnabled
    ? await prompts(
        {
          type: 'select',
          name: 'mode',
          message: 'What type of XR experience are you building?',
          choices: [
            { title: 'Virtual Reality', value: 'vr' },
            { title: 'Augmented Reality', value: 'ar' },
          ],
          initial: 0,
        },
        { onCancel },
      )
    : { mode: 'vr' as const };

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const xrFeatureKeys = !xrEnabled
    ? ([] as const)
    : mode === 'vr'
      ? (['handTracking', 'layers'] as const)
      : ([
          'handTracking',
          'anchors',
          'hitTest',
          'planeDetection',
          'meshDetection',
          'layers',
        ] as const);
  const xrFeatureStates: Record<string, TriState> = {};
  for (const key of xrFeatureKeys) {
    const initial =
      mode === 'ar' ? 1 : key === 'handTracking' || key === 'layers' ? 1 : 0;
    const label =
      key === 'handTracking'
        ? 'Hand Tracking'
        : key === 'planeDetection'
          ? 'Plane Detection'
          : key === 'meshDetection'
            ? 'Mesh Detection'
            : key === 'hitTest'
              ? 'Hit Test'
              : key === 'anchors'
                ? 'Anchors'
                : key === 'layers'
                  ? 'WebXR Layers'
                  : key;
    const { state } = await prompts(
      {
        type: 'select',
        name: 'state',
        message: `Enable ${label}?`,
        choices: [
          { title: 'No', value: 'no' },
          { title: 'Optional', value: 'optional' },
          { title: 'Required', value: 'required' },
        ],
        initial,
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    xrFeatureStates[key] = (state as TriState) || 'no';
  }

  // New per-feature prompts (replaces multiselect)
  // Order differs by mode:
  //  - VR: Locomotion → Grabbing → Physics
  //  - AR: Scene Understanding → Grabbing → Physics

  let locomotionEnabled = false;
  let locomotionUseWorker: boolean | undefined = undefined;
  let sceneUnderstandingEnabled = false;
  let environmentRaycastEnabled = false;

  if (xrEnabled && mode === 'vr') {
    // Locomotion (VR only)
    const ans = await prompts(
      {
        type: 'toggle',
        name: 'locomotionEnabled',
        message: 'Enable locomotion?',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    locomotionEnabled = !!ans.locomotionEnabled;

    if (locomotionEnabled) {
      const followUp = await prompts(
        {
          type: 'select',
          name: 'useWorker',
          message:
            'Deploy locomotion engine on a Worker? (recommended for performance)',
          choices: [
            { title: 'Yes (recommended)', value: true },
            { title: 'No', value: false },
          ],
          initial: 0,
        },
        { onCancel },
      );
      if (cancelled) {
        throw new Error('Input cancelled');
      }
      locomotionUseWorker = !!followUp.useWorker;
    }
  } else if (xrEnabled) {
    // AR: Scene Understanding first (requires room scanning)
    const sceneAns = await prompts(
      {
        type: 'toggle',
        name: 'sceneUnderstandingEnabled',
        message:
          'Enable Scene Understanding (planes/meshes/anchors)? Requires room scanning.',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    sceneUnderstandingEnabled = !!sceneAns.sceneUnderstandingEnabled;

    // Environment Raycast (no room scanning required)
    const raycastAns = await prompts(
      {
        type: 'toggle',
        name: 'environmentRaycastEnabled',
        message:
          'Enable Environment Raycast (hit-test surfaces)? No room scanning required.',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    environmentRaycastEnabled = !!raycastAns.environmentRaycastEnabled;
  }

  let grabbingEnabled = false;
  if (xrEnabled) {
    const grabbingAnswer = await prompts(
      {
        type: 'toggle',
        name: 'grabbingEnabled',
        message: 'Enable grabbing (one/two-hand, distance)?',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    grabbingEnabled = !!grabbingAnswer.grabbingEnabled;
  }

  // Physics (default: disabled)
  const { physicsEnabled } = await prompts(
    {
      type: 'toggle',
      name: 'physicsEnabled',
      message: 'Enable physics simulation (Havok)?',
      initial: false,
      active: 'Yes',
      inactive: 'No',
    },
    { onCancel },
  );
  if (cancelled) {
    throw new Error('Input cancelled');
  }

  // UI library selection removed (no-op currently)

  const { gitInit, installNow } = await prompts(
    [
      {
        type: 'toggle',
        name: 'gitInit',
        message: 'Set up a Git repository?',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      {
        type: 'toggle',
        name: 'installNow',
        message:
          'Install dependencies now? (We will print the command to start the dev server.)',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
    ],
    { onCancel },
  );

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const id = `${mode}-manual-${language}` as VariantId;
  return {
    name,
    id,
    installNow,
    xrEnabled,
    mode,
    language,
    features: [],
    featureFlags: {
      locomotionEnabled: !!locomotionEnabled,
      locomotionUseWorker,
      grabbingEnabled: !!grabbingEnabled,
      physicsEnabled: !!physicsEnabled,
      sceneUnderstandingEnabled: !!sceneUnderstandingEnabled,
      environmentRaycastEnabled: !!environmentRaycastEnabled,
    },
    gitInit,
    aiTools: resolvedAiTools,
    xrFeatureStates,
    actionItems,
    prerequisites,
  };
}
