/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import type { Object3D } from '../runtime/index.js';
import type { ScenePointerDescendants } from '../runtime/scene-pointer-descendants.js';
import { UIKitDocument } from './document.js';
import { ScreenSpace } from './screenspace-component.js';
import { PanelDocument } from './ui.js';

export { ScreenSpace } from './screenspace-component.js';

interface LayoutEnvironment {
  canvasWidth: number;
  canvasHeight: number;
  projectionScaleY: number;
}

/**
 * Positions {@link PanelUI} documents relative to the camera with CSS‑like semantics.
 *
 * @remarks
 * - Converts CSS units to pixels using temporary DOM nodes, then maps pixels to meters at
 *   a camera‑relative plane given by `zOffset`.
 * - Automatically toggles between screen‑space (under the camera) and world‑space depending on
 *   `renderer.xr.isPresenting`.
 * - Uses {@link UIKitDocument.setTargetDimensions} while camera-local, then restores intrinsic
 *   size in XR so the entity transform remains the world-space scale authority.
 *
 * @category UI
 */
export class ScreenSpaceUISystem extends createSystem({
  panels: { required: [ScreenSpace] },
}) {
  private screenSpaceDescendants: Object3D[] = [];
  private documentSizes = new WeakMap<
    UIKitDocument,
    { width: number; height: number }
  >();
  private entityDocuments = new WeakMap<Object3D, UIKitDocument>();
  private layoutEnvironment?: LayoutEnvironment;
  private layoutHelpers = {
    dimensionContainer: document.createElement('div'),
    positionContainer: document.createElement('div'),
    dimensionElement: document.createElement('div'),
    positionElement: document.createElement('div'),
  };
  private resized = true;
  private autoDimensionWarned = { width: false, height: false };

  /** Prepare hidden DOM helpers and resize listener. */
  init() {
    this.layoutHelpers.dimensionContainer.style.width = '100vw';
    this.layoutHelpers.dimensionContainer.style.height = '100vh';
    this.layoutHelpers.dimensionContainer.style.position = 'absolute';
    this.layoutHelpers.dimensionContainer.style.visibility = 'hidden';

    this.layoutHelpers.positionContainer.style.width = '100vw';
    this.layoutHelpers.positionContainer.style.height = '100vh';
    this.layoutHelpers.positionContainer.style.position = 'relative';
    this.layoutHelpers.positionContainer.style.visibility = 'hidden';

    const onResize = () => {
      this.resized = true;
    };
    window.addEventListener('resize', onResize, false);
    this.cleanupFuncs.push(() =>
      window.removeEventListener('resize', onResize, false),
    );
  }

  /** Move panels between world and screen space and recompute layout on changes. */
  update(): void {
    this.screenSpaceDescendants.length = 0;
    const resized = this.resized;
    const layoutEnvironmentChanged = this.hasLayoutEnvironmentChanged();

    this.queries.panels.entities.forEach((entity) => {
      const parent = entity.object3D;
      const document = this.resolveDocument(entity);

      if (!document) {
        return;
      } // Skip if UI not loaded yet

      const panelInScreenSpace = document.parent === this.camera;
      const documentSizeChanged = this.hasDocumentSizeChanged(document);

      if (this.renderer.xr.isPresenting && panelInScreenSpace) {
        // Move back to world space when entering XR
        parent?.add(document);
        document.clearTargetDimensions();
        // Reset position that were set during screen space layout
        document.position.set(0, 0, 0);
      } else if (!this.renderer.xr.isPresenting && !panelInScreenSpace) {
        // Move to screen space when not in XR
        this.camera.add(document);
        this.calculateLayout(entity, document);
      } else if (
        panelInScreenSpace &&
        (resized || documentSizeChanged || layoutEnvironmentChanged)
      ) {
        // Recalculate when the viewport, camera projection, or UIKit's intrinsic
        // layout changes. In particular, three.js restores the browser camera one
        // frame after XR ends, so the first non-XR layout may still see the XR
        // projection and must self-correct on the following frame.
        this.calculateLayout(entity, document);
      }

      if (document.parent === this.camera) {
        this.screenSpaceDescendants.push(document);
      }
    });
    this.resized = false;

    const scene = this.scene as typeof this.scene & ScenePointerDescendants;
    scene.screenSpaceDescendants =
      this.screenSpaceDescendants.length > 0
        ? this.screenSpaceDescendants
        : undefined;
  }

  /** Detect every renderer/camera input used to map screen pixels into world units. */
  private hasLayoutEnvironmentChanged(): boolean {
    const next = {
      canvasWidth: this.renderer.domElement.clientWidth,
      canvasHeight: this.renderer.domElement.clientHeight,
      // Matrix element 5 is the vertical projection scale. Unlike camera.fov,
      // it also reflects zoom and direct projection-matrix changes.
      projectionScaleY: this.camera.projectionMatrix.elements[5],
    };
    const previous = this.layoutEnvironment;
    this.layoutEnvironment = next;
    return (
      previous == null ||
      previous.canvasWidth !== next.canvasWidth ||
      previous.canvasHeight !== next.canvasHeight ||
      previous.projectionScaleY !== next.projectionScaleY
    );
  }

  /** Resolve legacy component-backed and manifest-backed UIKit documents. */
  private resolveDocument(entity: Entity): UIKitDocument | undefined {
    const host = entity.object3D;
    if (!host) {
      return undefined;
    }
    const cached = this.entityDocuments.get(host);
    if (cached && !cached.disposed) {
      return cached;
    }
    const componentDocument = PanelDocument.data.document[entity.index] as
      | UIKitDocument
      | undefined;
    if (componentDocument && !componentDocument.disposed) {
      this.entityDocuments.set(host, componentDocument);
      return componentDocument;
    }
    let discovered: UIKitDocument | undefined;
    host.traverse((object) => {
      if (!discovered && object instanceof UIKitDocument && !object.disposed) {
        discovered = object;
      }
    });
    if (discovered) {
      this.entityDocuments.set(host, discovered);
    }
    return discovered;
  }

  /** Track intrinsic UIKit dimensions so late font/content layout invalidates positioning. */
  private hasDocumentSizeChanged(document: UIKitDocument): boolean {
    const size = document.computedSize;
    if (!size) {
      return false;
    }

    const previous = this.documentSizes.get(document);
    this.documentSizes.set(document, size);
    return (
      previous == null ||
      previous.width !== size.width ||
      previous.height !== size.height
    );
  }

  /** Compute pixel size/position and apply camera‑relative transform. */
  private calculateLayout(entity: Entity, document: UIKitDocument) {
    const computedSize = document.computedSize;

    if (computedSize) {
      const widthExp = entity.getValue(ScreenSpace, 'width')!;
      const heightExp = entity.getValue(ScreenSpace, 'height')!;
      const top = entity.getValue(ScreenSpace, 'top')!;
      const bottom = entity.getValue(ScreenSpace, 'bottom')!;
      const left = entity.getValue(ScreenSpace, 'left')!;
      const right = entity.getValue(ScreenSpace, 'right')!;
      const zOffset = entity.getValue(ScreenSpace, 'zOffset')!;

      // Get desired dimensions in screen pixels
      const { height: hPx, width: wPx } = this.getComputedDimensionValues(
        widthExp,
        heightExp,
      );

      // Convert UIKit dimensions to world space units (UIKit uses cm units)
      const uiWidthInWorldUnits = computedSize.width / 100;
      const uiHeightInWorldUnits = computedSize.height / 100;

      // Screen dimensions
      const W = this.renderer.domElement.clientWidth;
      const H = this.renderer.domElement.clientHeight;
      const projectionScaleY = this.camera.projectionMatrix.elements[5];

      // A hidden or transitioning canvas can temporarily report unusable
      // dimensions. Leave the document attached and retry when the tracked
      // layout environment becomes valid instead of writing NaN/Infinity.
      if (
        W <= 0 ||
        H <= 0 ||
        !Number.isFinite(projectionScaleY) ||
        projectionScaleY <= 0
      ) {
        return;
      }

      // Calculate world-to-pixel conversion for screen space at zOffset
      const worldHeightAtZ = (2 * zOffset) / projectionScaleY;
      const worldPerPixel = worldHeightAtZ / H;

      // Calculate desired world space dimensions
      const targetWorldWidth = wPx * worldPerPixel;
      const targetWorldHeight = hPx * worldPerPixel;

      // Set target dimensions on UIKitDocument - this will trigger reactive scaling
      document.setTargetDimensions(targetWorldWidth, targetWorldHeight);

      // Get final scaled dimensions for positioning
      const finalScale = document.scale.x; // UIKitDocument sets uniform scale
      const usedWpx = (uiWidthInWorldUnits * finalScale) / worldPerPixel;
      const usedHpx = (uiHeightInWorldUnits * finalScale) / worldPerPixel;

      // Calculate position based on CSS-like positioning
      const { top: computedTop, left: computedLeft } =
        this.getComputedPositionValues(usedWpx, usedHpx, {
          top,
          bottom,
          left,
          right,
        });

      // Convert screen position to camera-relative world position
      const centerXpx = computedLeft + usedWpx / 2;
      const centerYpx = H - computedTop - usedHpx / 2;
      const camX = (centerXpx - W / 2) * worldPerPixel;
      const camY = (centerYpx - H / 2) * worldPerPixel;
      const camZ = -zOffset;

      // Position the UIKitDocument in camera space
      document.position.set(camX, camY, camZ);
    }
  }

  /**
   * Evaluate CSS expressions for width/height using a temporary DOM node.
   * Returns pixel values from `window.getComputedStyle`.
   *
   * @remarks
   * `ScreenSpace` declares `'auto'` as the default for both axes, but on a
   * floating helper `<div>` the browser resolves an unconstrained `auto`
   * dimension to `0px`. A `0px` target collapses {@link
   * UIKitDocument.setTargetDimensions} and the panel retains its intrinsic
   * world-space size inside camera space, blowing the UI up to most of the
   * viewport. Until aspect-ratio derivation from the
   * other axis lands, treat `'auto'` as an unsupported size for screen-space
   * layout: warn once per axis, and clamp the contributing CSS expression to
   * a viewport-relative fallback that produces a sensibly-sized HUD.
   */
  private getComputedDimensionValues(widthExp: string, heightExp: string) {
    const widthForLayout = this.resolveAutoDimension(widthExp, 'width');
    const heightForLayout = this.resolveAutoDimension(heightExp, 'height');

    const { dimensionElement: element, dimensionContainer: container } =
      this.layoutHelpers;
    document.body.appendChild(container);
    element.style.width = widthForLayout;
    element.style.height = heightForLayout;
    container.appendChild(element);
    const pixelValues = window.getComputedStyle(element);
    const result = {
      width: parseFloat(pixelValues.width),
      height: parseFloat(pixelValues.height),
    };
    document.body.removeChild(container);
    return result;
  }

  /**
   * Substitute a `'25vw'` / `'25vh'` fallback for `'auto'` on the given axis,
   * logging a single warning per axis the first time it triggers.
   */
  private resolveAutoDimension(
    expression: string,
    axis: 'width' | 'height',
  ): string {
    if (expression !== 'auto') {
      return expression;
    }
    if (!this.autoDimensionWarned[axis]) {
      this.autoDimensionWarned[axis] = true;
      console.warn(
        `[ScreenSpace] ${axis}: 'auto' is not supported in screen-space layout; ` +
          `clamping to '25v${axis === 'width' ? 'w' : 'h'}'. Set an explicit CSS ` +
          `size (e.g. '320px', '40vw') to silence this warning.`,
      );
    }
    return axis === 'width' ? '25vw' : '25vh';
  }

  /** Evaluate CSS absolute positioning and return `top`/`left` in pixels. */
  private getComputedPositionValues(
    widthPx: number,
    heightPx: number,
    { top = 'auto', bottom = 'auto', left = 'auto', right = 'auto' },
  ) {
    const { positionElement: element, positionContainer: container } =
      this.layoutHelpers;
    document.body.appendChild(container);
    element.style.position = 'absolute';
    element.style.width = `${widthPx}px`;
    element.style.height = `${heightPx}px`;
    element.style.top = top;
    element.style.bottom = bottom;
    element.style.left = left;
    element.style.right = right;
    container.appendChild(element);
    const pixelValues = window.getComputedStyle(element);
    const result = {
      top: parseFloat(pixelValues.top),
      left: parseFloat(pixelValues.left),
    };
    document.body.removeChild(container);
    return result;
  }

  destroy(): void {
    super.destroy();
    (
      this.scene as typeof this.scene & ScenePointerDescendants
    ).screenSpaceDescendants = undefined;
    this.screenSpaceDescendants.length = 0;
  }
}
