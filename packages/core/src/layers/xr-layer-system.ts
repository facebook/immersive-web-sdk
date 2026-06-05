/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from '../ecs/component.js';
import { createSystem } from '../ecs/system.js';
import { Entity } from '../ecs/entity.js';
import {
  AddEquation,
  BackSide,
  Color,
  CustomBlending,
  CylinderGeometry,
  DepthFormat,
  DepthStencilFormat,
  DepthTexture,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  UnsignedInt248Type,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
  ZeroFactor,
} from '../runtime/index.js';
import { XRCylinderLayer } from './xr-cylinder-layer.js';
import { XRQuadLayer } from './xr-quad-layer.js';

const _position = new Vector3();
const _quaternion = new Quaternion();
const _clearColor = new Color();

interface CachedTransform {
  position: Vector3;
  quaternion: Quaternion;
}

function toRigidTransform(pos: Vector3, quat: Quaternion): XRRigidTransform {
  return new XRRigidTransform(
    { x: pos.x, y: pos.y, z: pos.z },
    { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
  );
}

/**
 * Internal component storing per-entity runtime state for active XR layers.
 * Attached by {@link XRLayerSystem} when an entity qualifies; removed on
 * teardown. Keeping state in a component rather than system-side maps makes
 * the system stateless with respect to entities, which improves HMR behavior
 * and allows runtime MCP tools to inspect layer state.
 *
 * @category Layers
 */
export const XRLayerState = createComponent(
  'XRLayerState',
  {
    isQuad: { type: Types.Boolean, default: true },
    mesh: { type: Types.Object, default: null },
    renderTarget: { type: Types.Object, default: null },
    fallbackMaterial: { type: Types.Object, default: null },
    xrLayer: { type: Types.Object, default: null },
    pixelWidth: { type: Types.Int16, default: 0 },
    pixelHeight: { type: Types.Int16, default: 0 },
    stencil: { type: Types.Boolean, default: false },
    cachedTransform: { type: Types.Object, default: null },
  },
  'Internal state for active XR layer entities',
);

/**
 * XRLayerSystem manages WebXR quad and cylinder composition layers.
 *
 * For each entity with an {@link XRQuadLayer} or {@link XRCylinderLayer}
 * component, the system:
 * - Creates a mesh (plane or cylinder) as a child of the entity's object3D
 * - Renders layer content each frame via the component's `renderCallback`
 * - In XR sessions with layer support, creates native XR composition layers
 *   and switches the mesh to a punch-through material that makes the
 *   projection layer transparent where the content layer appears
 * - Falls back to rendering the content onto a textured mesh outside XR
 *
 * @category Layers
 */
export class XRLayerSystem extends createSystem({
  quadLayers: { required: [XRQuadLayer] },
  cylinderLayers: { required: [XRCylinderLayer] },
  activeLayers: { required: [XRLayerState] },
}) {
  private sessionUsesLayers = false;

  init() {
    const onSessionStart = () => this.handleSessionStart();
    const onSessionEnd = () => this.handleSessionEnd();
    this.xrManager.addEventListener('sessionstart', onSessionStart);
    this.xrManager.addEventListener('sessionend', onSessionEnd);

    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onSessionStart),
      () => this.xrManager.removeEventListener('sessionend', onSessionEnd),
    );

    // Register the query subscriptions on cleanupFuncs so they're released on
    // system teardown (matching the xr listeners above).
    this.cleanupFuncs.push(
      this.queries.quadLayers.subscribe('qualify', (entity: Entity) =>
        this.setupLayer(entity, 'quad'),
      ),
      this.queries.quadLayers.subscribe('disqualify', (entity: Entity) =>
        this.teardownLayer(entity),
      ),
      this.queries.cylinderLayers.subscribe('qualify', (entity: Entity) =>
        this.setupLayer(entity, 'cylinder'),
      ),
      this.queries.cylinderLayers.subscribe('disqualify', (entity: Entity) =>
        this.teardownLayer(entity),
      ),
    );
  }

  update() {
    if (this.queries.activeLayers.entities.size === 0) {
      return;
    }
    this.renderLayers();
  }

  // ---------------------------------------------------------------------------
  // Layer setup / teardown
  // ---------------------------------------------------------------------------

  private setupLayer(entity: Entity, type: 'quad' | 'cylinder') {
    const isQuad = type === 'quad';
    const component = isQuad ? XRQuadLayer : XRCylinderLayer;

    const pixelWidth = entity.getValue(component, 'pixelWidth') as number;
    const pixelHeight = entity.getValue(component, 'pixelHeight') as number;
    const stencil = entity.getValue(component, 'stencil') as boolean;

    let geometry;
    let side;
    if (isQuad) {
      const width = entity.getValue(XRQuadLayer, 'width') as number;
      const height = entity.getValue(XRQuadLayer, 'height') as number;
      geometry = new PlaneGeometry(width, height);
      side = FrontSide;
    } else {
      const radius = entity.getValue(XRCylinderLayer, 'radius') as number;
      const centralAngle = entity.getValue(
        XRCylinderLayer,
        'centralAngle',
      ) as number;
      const aspectRatio = entity.getValue(
        XRCylinderLayer,
        'aspectRatio',
      ) as number;
      geometry = new CylinderGeometry(
        radius,
        radius,
        (radius * centralAngle) / aspectRatio,
        64,
        64,
        true,
        Math.PI - centralAngle / 2,
        centralAngle,
      );
      side = BackSide;
    }

    const renderTarget = this.createRenderTarget(
      pixelWidth,
      pixelHeight,
      stencil,
    );

    const fallbackMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      side,
      transparent: true,
    });
    fallbackMaterial.map = renderTarget.texture;
    fallbackMaterial.map.offset.y = 1;
    fallbackMaterial.map.repeat.y = -1;

    const mesh = new Mesh(geometry, fallbackMaterial);
    entity.object3D?.add(mesh);

    entity.addComponent(XRLayerState, {
      isQuad,
      mesh,
      renderTarget,
      fallbackMaterial,
      pixelWidth,
      pixelHeight,
      stencil,
    });

    if (this.sessionUsesLayers) {
      this.activateNativeLayer(entity);
      this.updateSessionLayers();
    }
  }

  private teardownLayer(entity: Entity) {
    const mesh = XRLayerState.data.mesh[entity.index] as Mesh | null;
    if (!mesh) {
      return;
    }

    const fallbackMaterial = XRLayerState.data.fallbackMaterial[
      entity.index
    ] as MeshBasicMaterial;
    const renderTarget = XRLayerState.data.renderTarget[
      entity.index
    ] as WebGLRenderTarget;
    const xrLayer = XRLayerState.data.xrLayer[entity.index];

    if (xrLayer && this.sessionUsesLayers) {
      entity.setValue(XRLayerState, 'xrLayer', null);
      this.updateSessionLayers();
    }

    mesh.geometry.dispose();
    fallbackMaterial.dispose();
    if (mesh.material !== fallbackMaterial) {
      (mesh.material as MeshBasicMaterial).dispose();
    }
    renderTarget.dispose();
    mesh.removeFromParent();

    entity.removeComponent(XRLayerState);
  }

  // ---------------------------------------------------------------------------
  // XR session lifecycle
  // ---------------------------------------------------------------------------

  private handleSessionStart() {
    const session = this.xrManager.getSession();
    const layers = (session?.renderState as any)?.layers;
    // Need both a layers array AND a projection layer at index 0.
    // The IWER emulator exposes an empty layers array which is truthy
    // but has no projection layer -- treat that as "no layers support".
    if (!layers?.length) {
      this.sessionUsesLayers = false;
      return;
    }

    this.sessionUsesLayers = true;

    for (const entity of this.queries.activeLayers.entities) {
      this.activateNativeLayer(entity);
    }

    this.updateSessionLayers();
  }

  private handleSessionEnd() {
    for (const entity of this.queries.activeLayers.entities) {
      this.deactivateNativeLayer(entity);
    }
    this.sessionUsesLayers = false;
  }

  // ---------------------------------------------------------------------------
  // Native layer management
  // ---------------------------------------------------------------------------

  private activateNativeLayer(entity: Entity) {
    const binding = this.xrManager.getBinding() as any;
    const session = this.xrManager.getSession();
    if (!binding || !session) {
      return;
    }

    const isQuad = !!XRLayerState.data.isQuad[entity.index];
    const mesh = XRLayerState.data.mesh[entity.index] as Mesh;
    const pixelWidth = XRLayerState.data.pixelWidth[entity.index] as number;
    const pixelHeight = XRLayerState.data.pixelHeight[entity.index] as number;
    const renderTarget = XRLayerState.data.renderTarget[
      entity.index
    ] as WebGLRenderTarget;

    const refSpace = this.xrManager.getReferenceSpace();
    mesh.updateMatrixWorld(true);
    mesh.getWorldPosition(_position);
    mesh.getWorldQuaternion(_quaternion);

    const transform = toRigidTransform(_position, _quaternion);

    let xrLayer;
    if (isQuad) {
      const width = entity.getValue(XRQuadLayer, 'width') as number;
      const height = entity.getValue(XRQuadLayer, 'height') as number;

      xrLayer = binding.createQuadLayer({
        transform,
        width: width / 2,
        height: height / 2,
        space: refSpace,
        viewPixelWidth: pixelWidth,
        viewPixelHeight: pixelHeight,
        clearOnAccess: false,
      });
    } else {
      const radius = entity.getValue(XRCylinderLayer, 'radius') as number;
      const centralAngle = entity.getValue(
        XRCylinderLayer,
        'centralAngle',
      ) as number;
      const aspectRatio = entity.getValue(
        XRCylinderLayer,
        'aspectRatio',
      ) as number;

      xrLayer = binding.createCylinderLayer({
        transform,
        radius,
        centralAngle,
        aspectRatio,
        space: refSpace,
        viewPixelWidth: pixelWidth,
        viewPixelHeight: pixelHeight,
        clearOnAccess: false,
      });
    }

    entity.setValue(XRLayerState, 'xrLayer', xrLayer);

    // Switch to punch-through material so the projection layer is
    // transparent where this content layer appears.
    const side = isQuad ? FrontSide : BackSide;
    const punchMaterial = new MeshBasicMaterial({ color: 0xffffff, side });
    punchMaterial.blending = CustomBlending;
    punchMaterial.blendEquation = AddEquation;
    punchMaterial.blendSrc = ZeroFactor;
    punchMaterial.blendDst = ZeroFactor;
    mesh.material = punchMaterial;

    // Mark render target for external-texture usage and set colorSpace so
    // that WebGLPrograms can derive the correct output encoding (super-three
    // reads renderTarget.texture.colorSpace when isXRRenderTarget is true).
    (renderTarget as any).isXRRenderTarget = true;
    renderTarget.texture.colorSpace = SRGBColorSpace;

    entity.setValue(XRLayerState, 'cachedTransform', {
      position: _position.clone(),
      quaternion: _quaternion.clone(),
    } satisfies CachedTransform);
  }

  private deactivateNativeLayer(entity: Entity) {
    const mesh = XRLayerState.data.mesh[entity.index] as Mesh;
    const fallbackMaterial = XRLayerState.data.fallbackMaterial[
      entity.index
    ] as MeshBasicMaterial;
    const pixelWidth = XRLayerState.data.pixelWidth[entity.index] as number;
    const pixelHeight = XRLayerState.data.pixelHeight[entity.index] as number;
    const stencil = !!XRLayerState.data.stencil[entity.index];

    // Dispose punch-through material
    if (mesh.material !== fallbackMaterial) {
      (mesh.material as MeshBasicMaterial).dispose();
    }

    // Recreate render target so stale __hasExternalTextures state is cleared
    const oldRenderTarget = XRLayerState.data.renderTarget[
      entity.index
    ] as WebGLRenderTarget;
    oldRenderTarget.dispose();

    const newRenderTarget = this.createRenderTarget(
      pixelWidth,
      pixelHeight,
      stencil,
    );
    entity.setValue(XRLayerState, 'renderTarget', newRenderTarget);

    // Restore fallback material with the fresh render target texture
    fallbackMaterial.map = newRenderTarget.texture;
    fallbackMaterial.map.offset.y = 1;
    fallbackMaterial.map.repeat.y = -1;
    mesh.material = fallbackMaterial;

    entity.setValue(XRLayerState, 'xrLayer', null);
    entity.setValue(XRLayerState, 'cachedTransform', null);
  }

  /**
   * Rebuild the session's render state layers array.
   * Keeps the projection layer at index 0, then appends content layers.
   */
  private updateSessionLayers() {
    const session = this.xrManager.getSession();
    if (!session?.renderState.layers) {
      return;
    }

    // Projection layer is always the first entry
    const projLayer = session.renderState.layers[0];
    const layers: any[] = projLayer ? [projLayer] : [];

    for (const entity of this.queries.activeLayers.entities) {
      const xrLayer = XRLayerState.data.xrLayer[entity.index];
      if (xrLayer) {
        layers.push(xrLayer);
      }
    }

    session.updateRenderState({ layers });
  }

  // ---------------------------------------------------------------------------
  // Per-frame rendering
  // ---------------------------------------------------------------------------

  private renderLayers() {
    const renderer = this.renderer as any;
    const savedRenderTarget = renderer.getRenderTarget();

    // Disable XR so renderer.render() uses the layer's own camera
    // instead of the headset-tracked XR cameras.
    const savedXrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;

    // Save clear color so we can clear layers to transparent
    renderer.getClearColor(_clearColor);
    const savedClearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);

    for (const entity of this.queries.activeLayers.entities) {
      const isQuad = !!XRLayerState.data.isQuad[entity.index];
      const component = isQuad ? XRQuadLayer : XRCylinderLayer;
      const callback = entity.getValue(component, 'renderCallback') as
        | (() => void)
        | null;
      if (!callback) {
        continue;
      }

      const xrLayer = XRLayerState.data.xrLayer[entity.index];
      const mesh = XRLayerState.data.mesh[entity.index] as Mesh;
      const renderTarget = XRLayerState.data.renderTarget[
        entity.index
      ] as WebGLRenderTarget;

      if (this.sessionUsesLayers && xrLayer) {
        // XR path: sync native layer transform and render to its texture
        const binding = this.xrManager.getBinding() as any;
        const frame = this.xrFrame;
        if (!binding || !frame) {
          continue;
        }

        this.syncLayerTransform(xrLayer, mesh, entity);

        const subImage = binding.getSubImage(xrLayer, frame);
        renderer.setRenderTargetTextures(
          renderTarget,
          subImage.colorTexture,
          undefined,
        );
        renderer.setRenderTarget(renderTarget);
      } else {
        // Fallback path: render to the internal render target
        renderer.setRenderTarget(renderTarget);
      }

      callback();
    }

    // Restore renderer state
    renderer.setClearColor(_clearColor, savedClearAlpha);
    renderer.xr.enabled = savedXrEnabled;
    renderer.setRenderTarget(savedRenderTarget);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Update the native XR layer's transform only when the mesh has moved,
   * avoiding per-frame XRRigidTransform allocations for static layers.
   */
  private syncLayerTransform(xrLayer: any, mesh: Mesh, entity: Entity) {
    mesh.updateMatrixWorld(true);
    mesh.getWorldPosition(_position);
    mesh.getWorldQuaternion(_quaternion);

    const cached = XRLayerState.data.cachedTransform[
      entity.index
    ] as CachedTransform | null;

    if (
      cached?.position.equals(_position) &&
      cached.quaternion.equals(_quaternion)
    ) {
      return;
    }

    xrLayer.transform = toRigidTransform(_position, _quaternion);

    if (cached) {
      cached.position.copy(_position);
      cached.quaternion.copy(_quaternion);
    } else {
      entity.setValue(XRLayerState, 'cachedTransform', {
        position: _position.clone(),
        quaternion: _quaternion.clone(),
      } satisfies CachedTransform);
    }
  }

  private createRenderTarget(
    width: number,
    height: number,
    stencil: boolean,
  ): WebGLRenderTarget {
    return new WebGLRenderTarget(width, height, {
      format: RGBAFormat,
      type: UnsignedByteType,
      depthTexture: new DepthTexture(
        width,
        height,
        stencil ? UnsignedInt248Type : UnsignedIntType,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        stencil ? DepthStencilFormat : DepthFormat,
      ),
      samples: 4,
      stencilBuffer: stencil,
    });
  }
}
