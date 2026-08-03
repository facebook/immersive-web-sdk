/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import type { WorldOptions } from '../../src/init/world-initializer.js';
import {
  IWSDK_PROJECT_MANIFEST_VERSION,
  ProjectManifestValidationError,
  assertValidIwsdkProjectManifest,
  normalizeProjectDevOptions,
  normalizeProjectWorldOptions,
  validateIwsdkProjectManifest,
  type IwsdkProjectManifestV1,
} from '../../src/project/index.js';

const vrManifest = {
  $schema:
    './node_modules/@iwsdk/core/dist/schemas/iwsdk-project.v1.schema.json',
  version: IWSDK_PROJECT_MANIFEST_VERSION,
  scene: './public/scenes/main.iwsdk.scene.json',
  assets: { module: './src/assets' },
  components: { module: './src/components' },
  world: {
    xr: {
      mode: 'vr',
      offer: 'always',
      referenceSpace: {
        type: 'local-floor',
        required: false,
        fallbackOrder: ['local', 'viewer'],
      },
      restoreCameraOnExit: true,
      features: {
        handTracking: { required: true },
        anchors: false,
        hitTest: true,
        planeDetection: false,
        meshDetection: false,
        layers: true,
        unbounded: false,
      },
    },
    input: {
      canvasPointerEvents: { enabled: true, activeDuringXR: false },
    },
    render: {
      fov: 50,
      near: 0.001,
      far: 300,
      stencil: true,
      camera: {
        position: [0, 1.6, 3],
        rotation: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        lookAt: [0, 1, 0],
      },
    },
    features: {
      locomotion: {
        useWorker: true,
        initialPlayerPosition: [-4, 0, -6],
        comfortAssistLevel: 0.5,
        turningMethod: 'snap',
        enableJumping: true,
        browserControls: {
          keyboard: true,
          gamepad: true,
        },
      },
      grabbing: { useHandPinchForGrab: true },
      physics: true,
      sceneUnderstanding: { showWireFrame: false },
      environmentRaycast: false,
      camera: false,
      spatialUI: {
        forwardHtmlEvents: true,
        kit: 'horizon',
        preferredColorScheme: 'dark',
      },
    },
  },
  dev: {
    emulator: {
      device: 'metaQuest3',
      iwer: true,
      activation: 'always',
      injectOnBuild: true,
      userAgentException: { source: 'OculusBrowser', flags: 'i' },
    },
  },
} as const satisfies IwsdkProjectManifestV1;

describe('iwsdk.project.v1 validation and normalization', () => {
  it('normalizes a complete VR manifest to the existing WorldOptions shape', () => {
    expect(validateIwsdkProjectManifest(vrManifest)).toEqual({
      valid: true,
      issues: [],
    });

    const normalized = normalizeProjectWorldOptions(vrManifest);
    const worldOptions: WorldOptions = normalized;

    expect(worldOptions).toEqual({
      level: './scenes/main.iwsdk.scene.json',
      xr: {
        sessionMode: 'immersive-vr',
        offer: 'always',
        referenceSpace: {
          type: 'local-floor',
          required: false,
          fallbackOrder: ['local', 'viewer'],
        },
        restoreCameraOnExit: true,
        features: {
          handTracking: { required: true },
          anchors: false,
          hitTest: true,
          planeDetection: false,
          meshDetection: false,
          layers: true,
          unbounded: false,
        },
      },
      input: {
        canvasPointerEvents: { enabled: true, activeDuringXR: false },
      },
      render: {
        fov: 50,
        near: 0.001,
        far: 300,
        stencil: true,
        camera: {
          position: [0, 1.6, 3],
          rotation: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          lookAt: [0, 1, 0],
        },
      },
      features: {
        locomotion: {
          useWorker: true,
          initialPlayerPosition: [-4, 0, -6],
          comfortAssistLevel: 0.5,
          turningMethod: 1,
          enableJumping: true,
          browserControls: {
            keyboard: true,
            gamepad: true,
          },
        },
        grabbing: { useHandPinchForGrab: true },
        physics: true,
        sceneUnderstanding: { showWireFrame: false },
        environmentRaycast: false,
        camera: false,
        spatialUI: {
          forwardHtmlEvents: true,
          kit: 'horizon',
          preferredColorScheme: 'dark',
        },
      },
    });
  });

  it('preserves structured AR depth-sensing and required feature flags', () => {
    const manifest = {
      version: IWSDK_PROJECT_MANIFEST_VERSION,
      scene: './public/scenes/main.iwsdk.scene.json',
      world: {
        xr: {
          mode: 'ar',
          offer: 'once',
          referenceSpace: 'unbounded',
          features: {
            depthSensing: {
              required: true,
              usage: 'gpu-optimized',
              format: 'float32',
            },
            hitTest: { required: true },
            anchors: { required: true },
            planeDetection: { required: true },
            meshDetection: { required: true },
            unbounded: { required: true },
          },
        },
        features: {
          locomotion: false,
          grabbing: true,
          sceneUnderstanding: true,
          environmentRaycast: true,
          camera: true,
        },
      },
      dev: {
        emulator: {
          environment: 'living_room',
          activation: { source: '^(localhost|127\\.0\\.0\\.1)$', flags: 'i' },
          injectOnBuild: false,
        },
      },
    } as const satisfies IwsdkProjectManifestV1;

    expect(validateIwsdkProjectManifest(manifest).valid).toBe(true);
    expect(normalizeProjectWorldOptions(manifest)).toMatchObject({
      xr: {
        sessionMode: 'immersive-ar',
        referenceSpace: 'unbounded',
        features: {
          depthSensing: {
            required: true,
            usage: 'gpu-optimized',
            format: 'float32',
          },
        },
      },
    });
    const dev = normalizeProjectDevOptions(manifest);
    expect(dev.emulator?.activation).toBeInstanceOf(RegExp);
    expect((dev.emulator?.activation as RegExp).flags).toContain('i');
    expect((dev.emulator?.activation as RegExp).test('LOCALHOST')).toBe(true);
  });

  it('normalizes Desktop XR false and readable smooth turning', () => {
    const manifest = {
      version: IWSDK_PROJECT_MANIFEST_VERSION,
      scene: 'public/scenes/main.iwsdk.scene.json',
      world: {
        xr: false,
        input: { canvasPointerEvents: true },
        render: {
          camera: { position: [0, 1.6, 0], lookAt: [0, 1.55, -1] },
        },
        features: {
          locomotion: {
            turningMethod: 'smooth',
            browserControls: true,
          },
        },
      },
      dev: {
        emulator: { iwer: false, activation: 'localhost' },
      },
    } as const satisfies IwsdkProjectManifestV1;

    expect(normalizeProjectWorldOptions(manifest)).toEqual({
      level: './scenes/main.iwsdk.scene.json',
      xr: false,
      input: { canvasPointerEvents: true },
      render: {
        camera: { position: [0, 1.6, 0], lookAt: [0, 1.55, -1] },
      },
      features: {
        locomotion: { turningMethod: 2, browserControls: true },
      },
    });
    expect(normalizeProjectDevOptions(manifest)).toEqual({
      emulator: { iwer: false, activation: 'localhost' },
    });
  });

  it('reports unknown keys and unsupported executable spatial UI values at JSON paths', () => {
    const invalid = structuredClone(vrManifest) as unknown as Record<
      string,
      any
    >;
    invalid.extra = true;
    invalid.world.xr.features.unrecognized = true;
    invalid.world.features.spatialUI.componentSets = [];
    invalid.world.features.locomotion.browserControls.pointerLock = false;
    invalid.dev.emulator.verbose = true;

    const issues = validateIwsdkProjectManifest(invalid).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.extra', code: 'unknown-key' }),
        expect.objectContaining({
          path: '$.world.xr.features.unrecognized',
          code: 'unknown-key',
        }),
        expect.objectContaining({
          path: '$.world.features.spatialUI.componentSets',
          code: 'unknown-key',
        }),
        expect.objectContaining({
          path: '$.world.features.locomotion.browserControls.pointerLock',
          code: 'unknown-key',
        }),
        expect.objectContaining({
          path: '$.dev.emulator.verbose',
          code: 'unknown-key',
        }),
      ]),
    );
  });

  it('reports missing fields, invalid versions, types, enums, tuples, and regexes together', () => {
    const invalid = {
      version: 'iwsdk.project.v2',
      scene: './public/scenes/main.json',
      assets: {},
      world: {
        xr: {
          offer: 'sometimes',
          features: {
            depthSensing: {
              usage: 'fastest',
              format: 'rgba8',
            },
          },
        },
        render: { camera: { position: [0, Number.NaN] } },
        features: {
          locomotion: { turningMethod: 'continuous' },
          physics: 'yes',
        },
      },
      dev: {
        emulator: {
          activation: { source: '[', flags: 'ii' },
          userAgentException: { source: '' },
        },
        workspace: { enabled: true },
      },
    };

    const issues = validateIwsdkProjectManifest(invalid).issues;
    for (const path of [
      '$.version',
      '$.scene',
      '$.assets.module',
      '$.world.xr.mode',
      '$.world.xr.offer',
      '$.world.xr.features.depthSensing.usage',
      '$.world.xr.features.depthSensing.format',
      '$.world.render.camera.position',
      '$.world.features.locomotion.turningMethod',
      '$.world.features.physics',
      '$.dev.emulator.activation',
      '$.dev.emulator.userAgentException.source',
      '$.dev.workspace',
    ]) {
      expect(issues, path).toEqual(
        expect.arrayContaining([expect.objectContaining({ path })]),
      );
    }
  });

  it('throws a path-rich aggregate error before normalization', () => {
    expect(() => assertValidIwsdkProjectManifest({ version: 'wrong' })).toThrow(
      ProjectManifestValidationError,
    );
    expect(() => normalizeProjectWorldOptions({ version: 'wrong' })).toThrow(
      /\$\.scene: required property is missing/u,
    );
  });
});
