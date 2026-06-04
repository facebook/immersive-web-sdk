/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three';
import {
  DEFAULT_PROFILES_PATH,
  InputLayout,
} from '../../gamepad/input-profiles.js';
import { XRAssetLoader } from '../../xr-input-manager.js';

export interface VisualImplementation {
  model: Object3D;
  xrInput?: XRInputVisualAdapter;
  init: () => void;
  connect: (inputSource: XRInputSource, enabled: boolean) => void;
  disconnect: () => void;
  toggle: (enabled: boolean) => void;
  update: (delta: number) => void;
}

export interface VisualConstructor<T extends VisualImplementation> {
  new (
    scene: Scene,
    camera: PerspectiveCamera,
    gltfScene: Group,
    layout: InputLayout,
  ): T;
  assetProfileId?: string;
  assetKeyPrefix: string;
  assetPath?: string;
}

export interface InputConfig {
  inputSource: XRInputSource;
  layout: InputLayout;
  profileId: string;
  resolvedProfileId: string;
  assetPath?: string;
}

export interface HandPose {
  [jointName: string]: number[];
}

export abstract class XRInputVisualAdapter {
  static cursorPool: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  public visual?: VisualImplementation;
  protected inputConfig?: InputConfig;
  public raySpace: Group | undefined;
  public gripSpace: Group | undefined;
  public isPrimary = false;
  protected _inputSource?: XRInputSource;

  constructor(
    protected playerSpace: Group,
    public handedness: XRHandedness,
    protected visualsEnabled: boolean,
    protected visualClass: VisualConstructor<VisualImplementation>,
    protected scene: Scene,
    protected camera: PerspectiveCamera,
    protected assetLoader: XRAssetLoader,
  ) {}

  protected connectVisual() {
    if (this.inputConfig) {
      const { inputSource, layout } = this.inputConfig;
      XRInputVisualAdapter.createVisual(
        this.visualClass,
        inputSource,
        layout,
        this.visualsEnabled,
        this.scene,
        this.camera,
        this.assetLoader,
        this.inputConfig.assetPath,
      ).then((visual) => {
        if (
          visual &&
          inputSource === this._inputSource &&
          visual.constructor === this.visualClass
        ) {
          this.visual = visual;
          this.visual.xrInput = this;
          this.playerSpace.add(visual.model);
        }
      });
    }
  }

  protected disconnectVisual() {
    if (this.visual) {
      this.visual.disconnect();
      this.visual.xrInput = undefined;
      this.visual.model.removeFromParent();
      this.visual = undefined;
    }
  }

  /**
   * Swap the controller/hand visual to a different `VisualImplementation`
   * subclass at runtime. Tears down the current visual (model removed from
   * the scene graph, `xrInput` cleared) and triggers asset load + `init()`
   * for the new class on the next tick.
   *
   * @param visualClass A `VisualConstructor` — typically a subclass of
   *   `BaseControllerVisual` (for controllers) or `BaseHandVisual` (for
   *   hands), or one of the built-in implementations such as `AnimatedController`,
   *   `AnimatedControllerHand`, or `AnimatedHand`.
   *
   * @example
   * ```ts
   * import { BaseControllerVisual, type VisualConstructor } from '@iwsdk/xr-input';
   *
   * class MyCustomController extends BaseControllerVisual {
   *   init() { ... }
   * }
   *
   * controllerAdapter.updateVisualImplementation(
   *   MyCustomController as VisualConstructor<MyCustomController>,
   * );
   * ```
   */
  updateVisualImplementation<T extends VisualImplementation>(
    visualClass: VisualConstructor<T>,
  ) {
    this.disconnectVisual();
    this.visualClass = visualClass;
    this.connectVisual();
  }

  get connected() {
    return !!this._inputSource;
  }

  // add hooks for connect and disconnect
  get inputSource() {
    return this._inputSource;
  }

  connect(inputSource: XRInputSource) {
    if (this._inputSource) {
      this.disconnect();
    }
    this._inputSource = inputSource;
    // Provide fallback for runtimes that only surface gripSpace or targetRaySpace
  }

  disconnect() {
    this._inputSource = undefined;
  }

  abstract update(frame: XRFrame, delta: number): void;

  get pointerBusy() {
    return !!false;
  }

  static visualCache = new Map<string, VisualImplementation>();

  static async createVisual<T extends VisualImplementation>(
    visualClass: VisualConstructor<T>,
    inputSource: XRInputSource,
    layout: InputLayout,
    enabled: boolean,
    scene: Scene,
    camera: PerspectiveCamera,
    assetLoader: XRAssetLoader,
    profileAssetPath?: string,
  ): Promise<T | undefined> {
    const profileId = visualClass.assetProfileId ?? inputSource.profiles[0];
    const assetPath =
      profileAssetPath ??
      visualClass.assetPath ??
      `${DEFAULT_PROFILES_PATH}/${profileId}/${inputSource.handedness}.glb`;
    const assetKeyPrefix = visualClass.assetKeyPrefix;
    const assetKey = `${assetKeyPrefix}-${profileId}-${inputSource.handedness}`;
    let visual: T;
    if (this.visualCache.has(assetKey)) {
      visual = this.visualCache.get(assetKey) as T;
    } else {
      const gltf = await assetLoader.loadGLTF(assetPath).catch(() => null);
      // Visual subclasses dereference asset nodes (SkinnedMesh, wrist, joints)
      // in their constructor and init(), so an empty model crashes them. Bail
      // before construction; caller's `if (visual && ...)` skips the assignment.
      if (!gltf || gltf.scene.children.length === 0) {
        console.warn(
          `[xr-input] Failed to load visual asset ${assetPath}; input will be tracked without a visual.`,
        );
        return undefined;
      }
      visual = new visualClass(scene, camera, gltf.scene, layout);
      visual.init();
      this.visualCache.set(assetKey, visual);
    }
    visual.connect(inputSource, enabled);
    return visual;
  }
}
