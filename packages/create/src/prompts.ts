/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import prompts from 'prompts';
import { PromptResult, TriState, VariantId } from './types.js';

export async function promptFlow(nameArg?: string): Promise<PromptResult> {
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
            v.trim().length ? true : 'Project name is required',
        },
        { onCancel },
      )
    ).name;

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const { language, mode } = await prompts(
    [
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
      {
        type: 'select',
        name: 'mode',
        message: 'What type of experience are you building?',
        choices: [
          { title: 'Virtual Reality', value: 'vr' },
          { title: 'Augmented Reality', value: 'ar' },
        ],
        initial: 0,
      },
    ],
    { onCancel },
  );

  if (cancelled) {
    throw new Error('Input cancelled');
  }

  const xrFeatureKeys =
    mode === 'vr'
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

  if (mode === 'vr') {
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
  } else {
    // AR: Scene Understanding first
    const ans = await prompts(
      {
        type: 'toggle',
        name: 'sceneUnderstandingEnabled',
        message: 'Enable Scene Understanding (planes/meshes/anchors)?',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      },
      { onCancel },
    );
    if (cancelled) {
      throw new Error('Input cancelled');
    }
    sceneUnderstandingEnabled = !!ans.sceneUnderstandingEnabled;
  }

  // Grabbing (default: enabled)
  const { grabbingEnabled } = await prompts(
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

  const metaAnswer = await prompts(
    {
      type: 'select',
      name: 'metaspatialChoice',
      message: 'Enable Meta Spatial Editor integration?',
      choices: [
        { title: 'No (Can change later)', value: false },
        {
          title: 'Yes (Additional software required)',
          value: true,
        },
      ],
      initial: 0,
    },
    { onCancel },
  );
  const metaspatial = !!metaAnswer.metaspatialChoice;

  if (metaspatial) {
    prerequisites.push({
      level: 'important',
      message:
        'Required: Install Meta Spatial Editor (v9 or later). The build pipeline depends on its CLI tool; without it, build or dev WILL FAIL. Download: https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-editor-overview',
    });
  }

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

  const kind = metaspatial ? 'metaspatial' : 'manual';
  const id = `${mode}-${kind}-${language}` as VariantId;
  return {
    name,
    id,
    installNow,
    metaspatial,
    mode,
    language,
    features: [],
    featureFlags: {
      locomotionEnabled: !!locomotionEnabled,
      locomotionUseWorker,
      grabbingEnabled: !!grabbingEnabled,
      physicsEnabled: !!physicsEnabled,
      sceneUnderstandingEnabled: !!sceneUnderstandingEnabled,
    },
    gitInit,
    xrFeatureStates,
    actionItems,
    prerequisites,
  };
}
