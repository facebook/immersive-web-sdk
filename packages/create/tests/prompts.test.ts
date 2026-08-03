/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promptFlow } from '../src/prompts.js';

const promptMock = vi.hoisted(() => vi.fn());

vi.mock('prompts', () => ({ default: promptMock }));

beforeEach(() => {
  promptMock.mockReset();
});

describe('promptFlow', () => {
  it('uses the coherent recommended preset without follow-up configuration', async () => {
    promptMock
      .mockResolvedValueOnce({ target: 'browser' })
      .mockResolvedValueOnce({ setup: 'recommended' });

    const result = await promptFlow('browser-app');

    expect(questionNames()).toEqual(['target', 'setup']);
    expect(result).toMatchObject({
      name: 'browser-app',
      target: 'browser',
      language: 'ts',
      xrEnabled: false,
      installNow: true,
      gitInit: true,
      xrFeatureStates: {},
      featureFlags: {
        locomotionEnabled: true,
        locomotionBrowserControls: true,
        grabbingEnabled: true,
        physicsEnabled: false,
        sceneUnderstandingEnabled: false,
        environmentRaycastEnabled: false,
      },
    });
  });

  it('asks only target-relevant advanced questions and derives XR features', async () => {
    promptMock
      .mockResolvedValueOnce({ target: 'ar' })
      .mockResolvedValueOnce({ setup: 'advanced' })
      .mockResolvedValueOnce({ language: 'js' })
      .mockResolvedValueOnce({ enabled: false })
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ gitInit: false, installNow: false });

    const result = await promptFlow('advanced-ar-app');

    expect(questionNames()).toEqual([
      'target',
      'setup',
      'language',
      'enabled',
      'enabled',
      'enabled',
      'enabled',
      'gitInit',
      'installNow',
    ]);
    expect(questionMessages()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Grabbing'),
        expect.stringContaining('Physics'),
        expect.stringContaining('Room surfaces and anchors'),
        expect.stringContaining('Real-world placement'),
      ]),
    );
    expect(questionMessages().join('\n')).not.toMatch(
      /Enable (?:Hand Tracking|Anchors|Hit Test|Plane Detection|Mesh Detection|WebXR Layers)/,
    );
    expect(questionNames()).not.toContain('aiTools');
    expect(result).toMatchObject({
      target: 'ar',
      mode: 'ar',
      language: 'js',
      installNow: false,
      gitInit: false,
      featureFlags: {
        locomotionEnabled: false,
        grabbingEnabled: false,
        physicsEnabled: true,
        sceneUnderstandingEnabled: true,
        environmentRaycastEnabled: true,
      },
      xrFeatureStates: {
        handTracking: 'optional',
        anchors: 'optional',
        planeDetection: 'optional',
        meshDetection: 'optional',
        hitTest: 'optional',
      },
    });
  });

  it('uses a target supplied by the CLI without asking for it again', async () => {
    promptMock.mockResolvedValueOnce({ setup: 'recommended' });

    const result = await promptFlow('vr-app', { target: 'vr' });

    expect(questionNames()).toEqual(['setup']);
    expect(result).toMatchObject({ target: 'vr', language: 'ts' });
  });
});

function questions() {
  return promptMock.mock.calls.flatMap(([question]) =>
    Array.isArray(question) ? question : [question],
  ) as Array<{
    choices?: Array<{ value?: string }>;
    message?: string;
    name?: string;
  }>;
}

function questionNames() {
  return questions().map((question) => question.name);
}

function questionMessages() {
  return questions()
    .map((question) => question.message)
    .filter((message): message is string => message != null);
}
