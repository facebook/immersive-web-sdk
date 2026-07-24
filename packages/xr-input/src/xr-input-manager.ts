/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Signal, signal } from '@preact/signals-core';
import { Group, PerspectiveCamera, Scene, Vector3, WebXRManager } from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadInputProfile } from './gamepad/input-profiles.js';
import { StatefulGamepad } from './gamepad/stateful-gamepad.js';
import { MultiPointer } from './pointer/multi-pointer.js';
import { XROrigin } from './rig/xr-origin.js';
import { XRInputVisualAdapter } from './visual/adapter/base-visual-adapter.js';
import { XRControllerVisualAdapter } from './visual/adapter/controller-visual-adapter.js';
import { XRHandVisualAdapter } from './visual/adapter/hand-visual-adapter.js';
import { AnimatedController } from './visual/impl/animated-controller.js';
import { AnimatedHand } from './visual/impl/animated-hand.js';
import {
  VisualConstructor,
  VisualImplementation,
} from './visual/impl/base-impl.js';

interface InputSourceData {
  inputSource: XRInputSource;
  isPrimary: boolean;
}
export enum XRInputDeviceType {
  Controller = 'controller',
  Hand = 'hand',
}

export interface XRAssetLoader {
  loadGLTF(assetPath: string): Promise<GLTF>;
}

export const DefaultXRAssetLoader = {
  gltfLoader: new GLTFLoader(),
  async loadGLTF(assetPath: string): Promise<GLTF> {
    return await DefaultXRAssetLoader.gltfLoader.loadAsync(assetPath);
  },
};

export interface XRInputDeviceConfig {
  handedness: XRHandedness;
  type: XRInputDeviceType;
  enabled?: boolean;
  visualClass?: VisualConstructor<VisualImplementation>;
}

export interface XRPointerSettings {
  enabled?: boolean;
}

export interface XRInputOptions {
  camera: PerspectiveCamera;
  scene: Scene;
  assetLoader?: XRAssetLoader;
  inputDevices?: XRInputDeviceConfig[];
  pointerSettings?: XRPointerSettings;
}

export class XRInputManager {
  public readonly xrOrigin: XROrigin;

  public readonly multiPointers: Record<'left' | 'right', MultiPointer>;

  public readonly gamepads = {
    left: undefined,
    right: undefined,
  } as Record<'left' | 'right', StatefulGamepad | undefined>;

  public readonly visualAdapters: {
    controller: {
      left: XRControllerVisualAdapter;
      right: XRControllerVisualAdapter;
    };
    hand: {
      left: XRHandVisualAdapter;
      right: XRHandVisualAdapter;
    };
    left: Signal<XRInputVisualAdapter | undefined>;
    right: Signal<XRInputVisualAdapter | undefined>;
  };

  private activeInputSources = {
    hand: { left: undefined, right: undefined },
    controller: { left: undefined, right: undefined },
  } as Record<
    'hand' | 'controller',
    Record<'left' | 'right', InputSourceData | undefined>
  >;

  private primaryInputSources = {
    left: undefined,
    right: undefined,
  } as Record<'left' | 'right', XRInputSource | undefined>;

  private scene: Scene;
  private hadSession = false;
  private readonly touchSurfaceVisualOffsets = {
    left: new Vector3(),
    right: new Vector3(),
  };

  private processedInputSourceKeys = new Set<string>();

  constructor(options: XRInputOptions) {
    const { scene, camera, assetLoader } = options;
    this.xrOrigin = new XROrigin();
    this.scene = scene; // used implicitly by MultiPointer via constructor
    this.visualAdapters = {
      controller: {
        left: new XRControllerVisualAdapter(
          this.xrOrigin,
          'left',
          true, // visuals enabled
          AnimatedController,
          scene,
          camera,
          assetLoader || DefaultXRAssetLoader,
        ),
        right: new XRControllerVisualAdapter(
          this.xrOrigin,
          'right',
          true, // visuals enabled
          AnimatedController,
          scene,
          camera,
          assetLoader || DefaultXRAssetLoader,
        ),
      },
      hand: {
        left: new XRHandVisualAdapter(
          this.xrOrigin,
          'left',
          true, // visuals enabled
          AnimatedHand,
          scene,
          camera,
          assetLoader || DefaultXRAssetLoader,
        ),
        right: new XRHandVisualAdapter(
          this.xrOrigin,
          'right',
          true, // visuals enabled
          AnimatedHand,
          scene,
          camera,
          assetLoader || DefaultXRAssetLoader,
        ),
      },
      left: signal(undefined),
      right: signal(undefined),
    };

    this.multiPointers = {
      left: new MultiPointer('left', this.scene, camera, this.xrOrigin),
      right: new MultiPointer('right', this.scene, camera, this.xrOrigin),
    };
  }

  update(xrManager: WebXRManager, delta: number, time: number): void {
    const session = xrManager.getSession();
    if (!session) {
      if (this.hadSession) {
        this.onSessionEnded();
      } else {
        this.disablePointers(time);
      }
      this.hadSession = false;
      return;
    }
    this.hadSession = true;

    const refSpace = xrManager.getReferenceSpace();
    const frame = xrManager.getFrame();
    if (!refSpace || !frame) {
      this.disablePointers(time);
      return;
    }

    // Reset active input sources
    this.resetActiveInputSources();

    // Update active input sources
    this.updateActiveInputSources(session);

    // Update controllers and hands (poses + visuals + gamepads)
    this.updateControllersAndHands(frame, refSpace, delta);

    // Update head tracking
    this.xrOrigin.updateHead(frame, refSpace);

    // Force matrix update for xrOrigin, and then update pointers
    this.xrOrigin.updateMatrixWorld(true);
    this.updatePointers(delta, time);
  }

  private onSessionEnded(): void {
    // Clear active sources and visuals
    this.resetActiveInputSources();

    // Disconnect controller/hand visuals and clear primary adapters
    (['left', 'right'] as const).forEach((handedness) => {
      const ctrl = this.visualAdapters.controller[handedness];
      const hand = this.visualAdapters.hand[handedness];
      if (ctrl.connected) {
        ctrl.disconnect();
      }
      if (hand.connected) {
        hand.disconnect();
      }
    });
    this.visualAdapters.left.value = undefined;
    this.visualAdapters.right.value = undefined;

    // Hide pointer visuals and disable combined pointers
    this.disablePointers();
  }

  private disablePointers(time = 0): void {
    try {
      this.multiPointers.left.update(false, 0, time);
      this.multiPointers.right.update(false, 0, time);
    } catch {}
  }

  isPrimary(deviceType: 'controller' | 'hand', handedness: 'left' | 'right') {
    return !!this.activeInputSources[deviceType][handedness]?.isPrimary;
  }

  /**
   * Get the primary input source for a given handedness.
   * Returns the XRInputSource that is currently active for left or right hand.
   */
  getPrimaryInputSource(
    handedness: 'left' | 'right',
  ): XRInputSource | undefined {
    return this.primaryInputSources[handedness];
  }

  private resetActiveInputSources(): void {
    this.activeInputSources.controller.left = undefined;
    this.activeInputSources.controller.right = undefined;
    this.activeInputSources.hand.left = undefined;
    this.activeInputSources.hand.right = undefined;
    this.primaryInputSources.left = undefined;
    this.primaryInputSources.right = undefined;
  }

  /**
   * Updates the active input sources from the XR session.
   *
   * IMPORTANT: This method handles a platform quirk where some runtimes
   * include the same hands in BOTH session.inputSources AND session.trackedSources.
   * The duplicate entries represent the same physical hands but as different XRInputSource objects
   * with different properties (e.g., different gamepad.buttons lengths).
   *
   * To prevent the trackedSources from overwriting the isPrimary status set by inputSources,
   * we track which handedness+type combinations have already been processed and skip
   * re-processing duplicates from trackedSources.
   *
   * Without this deduplication:
   * - Hands from inputSources would be marked as isPrimary=true
   * - Then the same hands from trackedSources would overwrite with isPrimary=false
   * - This causes hand visuals to not be displayed (since visibility is tied to isPrimary)
   */
  private updateActiveInputSources(session: XRSession): void {
    this.processedInputSourceKeys.clear();

    // Process inputSources (these are primary)
    for (const inputSource of session.inputSources) {
      this.assignInputSource(inputSource, true);
      const key = `${inputSource.handedness}-${inputSource.hand ? 'hand' : 'controller'}`;
      this.processedInputSourceKeys.add(key);
    }

    // Process trackedSources (these are non-primary)
    // Skip any that were already in inputSources to avoid overwriting isPrimary
    if (session.trackedSources) {
      for (const inputSource of session.trackedSources) {
        const key = `${inputSource.handedness}-${inputSource.hand ? 'hand' : 'controller'}`;
        if (!this.processedInputSourceKeys.has(key)) {
          this.assignInputSource(inputSource, false);
        }
      }
    }
  }

  private assignInputSource(
    inputSource: XRInputSource,
    isPrimary: boolean,
  ): void {
    const handedness = inputSource.handedness;
    if (handedness === 'left' || handedness === 'right') {
      const target = inputSource.hand
        ? this.activeInputSources.hand
        : this.activeInputSources.controller;
      target[handedness] = { inputSource, isPrimary };
      if (isPrimary) {
        this.primaryInputSources[handedness] = inputSource;
      }
    }
  }

  private updateControllersAndHands(
    frame: XRFrame,
    refSpace: XRReferenceSpace,
    delta: number,
  ): void {
    (['left', 'right'] as const).forEach((handedness) => {
      (['controller', 'hand'] as const).forEach((key) => {
        const inputSourceData = this.activeInputSources[key][handedness];
        const visualAdapter = this.visualAdapters[key][handedness];
        if (inputSourceData) {
          const { inputSource, isPrimary } = inputSourceData;
          const raySpace = isPrimary
            ? this.xrOrigin.raySpaces[handedness]
            : this.xrOrigin.secondaryRaySpaces[handedness];
          const gripSpace = isPrimary
            ? this.xrOrigin.gripSpaces[handedness]
            : this.xrOrigin.secondaryGripSpaces[handedness];
          visualAdapter.raySpace = raySpace;
          visualAdapter.gripSpace = gripSpace;
          updatePose(frame, inputSource.targetRaySpace, refSpace, raySpace);
          if (inputSource.gripSpace) {
            updatePose(frame, inputSource.gripSpace, refSpace, gripSpace);
          } else {
            gripSpace.position.copy(raySpace.position);
            gripSpace.quaternion.copy(raySpace.quaternion);
            gripSpace.scale.copy(raySpace.scale);
          }

          if (visualAdapter.inputSource !== inputSourceData.inputSource) {
            visualAdapter.connect(inputSourceData.inputSource);
          }
          visualAdapter.update(frame, delta);
          visualAdapter.isPrimary = inputSourceData.isPrimary;
          if (visualAdapter.isPrimary) {
            this.visualAdapters[handedness].value = visualAdapter;
          }
          if (visualAdapter.visual) {
            visualAdapter.visual.model.visible = inputSourceData.isPrimary;
          }

          // Update index tip space for hands (used by TouchPointer)
          if (key === 'hand' && isPrimary) {
            const handAdapter = this.visualAdapters.hand[handedness];
            const indexTipXRSpace = handAdapter.getIndexTipSpace();
            if (indexTipXRSpace) {
              updatePose(
                frame,
                indexTipXRSpace,
                refSpace,
                this.xrOrigin.indexTipSpaces[handedness],
              );
            }
          }
        } else if (visualAdapter.connected) {
          visualAdapter.disconnect();
        }
      });

      // For controllers, fallback indexTipSpace to raySpace (no finger tracking)
      const hasHandActive = !!this.activeInputSources.hand[handedness];
      if (!hasHandActive && this.activeInputSources.controller[handedness]) {
        const raySpace = this.xrOrigin.raySpaces[handedness];
        const indexTipSpace = this.xrOrigin.indexTipSpaces[handedness];
        indexTipSpace.position.copy(raySpace.position);
        indexTipSpace.quaternion.copy(raySpace.quaternion);
        indexTipSpace.scale.copy(raySpace.scale);
      }
    });
    (['left', 'right'] as const).forEach((handedness) => {
      const inputSource = this.primaryInputSources[handedness];

      // If the input source changed, clear the cached StatefulGamepad.
      if (this.gamepads[handedness]?.inputSource !== inputSource) {
        this.gamepads[handedness] = undefined;
      }

      const hasGamepad = !!(inputSource && inputSource.gamepad);

      // Lazily create a StatefulGamepad only when a gamepad is available.
      if (!this.gamepads[handedness] && hasGamepad) {
        const inputConfig = loadInputProfile(inputSource!);
        this.gamepads[handedness] = new StatefulGamepad(inputConfig);
      }

      // Update if present and source still has a gamepad.
      if (hasGamepad) {
        this.gamepads[handedness]?.update();
      }
    });
  }

  private updatePointers(delta: number, time: number) {
    (['left', 'right'] as const).forEach((handedness) => {
      const inputSource = this.primaryInputSources[handedness];
      const hasGamepad = !!(inputSource && inputSource.gamepad);
      const connected = !!(
        inputSource &&
        hasGamepad &&
        this.gamepads[handedness]
      );
      const selectStart = connected
        ? !!this.gamepads[handedness]?.getSelectStart()
        : false;
      const selectEnd = connected
        ? !!this.gamepads[handedness]?.getSelectEnd()
        : false;

      // First: move all registered pointers (ray + grab) via the combined pointer
      const gp = this.gamepads[handedness];
      const squeezeStart = connected
        ? !!gp?.getButtonDown('xr-standard-squeeze')
        : false;
      const squeezeEnd = connected
        ? !!gp?.getButtonUp('xr-standard-squeeze')
        : false;
      this.multiPointers[handedness].update(connected, delta, time, {
        selectStart,
        selectEnd,
        squeezeStart,
        squeezeEnd,
      });

      const touchSurfaceVisualOffset = this.multiPointers[
        handedness
      ].getTouchSurfaceVisualOffset(this.touchSurfaceVisualOffsets[handedness]);
      const handAdapter = this.visualAdapters.hand[handedness];
      if (touchSurfaceVisualOffset && handAdapter.isPrimary) {
        handAdapter.applyVisualOffsetWorld(touchSurfaceVisualOffset);
      }
    });
  }
}

function updatePose(
  frame: XRFrame,
  xrSpace: XRSpace,
  refSpace: XRReferenceSpace,
  group: Group,
) {
  const xrPose = frame.getPose(xrSpace, refSpace);
  if (xrPose) {
    group.matrix.fromArray(xrPose.transform.matrix);
    group.matrix.decompose(group.position, group.quaternion, group.scale);
  }
}
