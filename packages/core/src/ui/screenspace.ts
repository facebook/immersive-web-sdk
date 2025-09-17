/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent, Entity, createSystem } from '../ecs/index.js';
import { MathUtils } from '../runtime/three.js';
import { UIKitDocument } from './document.js';
import { PanelUI, PanelDocument } from './ui.js';

/**
 * CSS‑like screen‑space layout for a {@link PanelUI}.
 *
 * @remarks
 * When XR is not presenting, the panel is re‑parented under the active camera and positioned
 * in pixels using CSS‑like expressions for `top`/`left`/`bottom`/`right`, with `width`/`height`
 * specified in any CSS units supported by the browser (e.g. `px`, `vw`, `vh`, `%`, `em`).
 *
 * On XR session start, the panel is automatically returned to world space.
 *
 * All size inputs are ultimately converted to meters using the camera frustum at `zOffset`.
 *
 * @example Place a panel at bottom‑right, 40% width, auto height
 * ```ts
 * entity.addComponent(PanelUI, { config: '/ui/menu.json' })
 * entity.addComponent(ScreenSpace, {
 *   width: '40vw',
 *   height: 'auto',
 *   bottom: '24px',
 *   right: '24px',
 *   zOffset: 0.25,
 * })
 * ```
 *
 * @category UI
 */
export const ScreenSpace = createComponent(
  'ScreenSpace',
  {
    /** CSS size expression for height (e.g., `240px`, `40vh`, `auto`). */
    height: { type: Types.String, default: 'auto' },
    /** CSS size expression for width (e.g., `480px`, `40vw`, `auto`). */
    width: { type: Types.String, default: 'auto' },
    /** CSS absolute `top` position (pixels/percent/vh) or `auto`. */
    top: { type: Types.String, default: 'auto' },
    /** CSS absolute `bottom` position (pixels/percent/vh) or `auto`. */
    bottom: { type: Types.String, default: 'auto' },
    /** CSS absolute `left` position (pixels/percent/vw) or `auto`. */
    left: { type: Types.String, default: 'auto' },
    /** CSS absolute `right` position (pixels/percent/vw) or `auto`. */
    right: { type: Types.String, default: 'auto' },
    /** Distance in meters in front of the camera’s near plane. */
    zOffset: { type: Types.Float32, default: 0.2 },
  },
  'Component for screen-space UI positioning',
);
/**
 * Positions {@link PanelUI} documents relative to the camera with CSS‑like semantics.
 *
 * @remarks
 * - Converts CSS units to pixels using temporary DOM nodes, then maps pixels to meters at
 *   a camera‑relative plane given by `zOffset`.
 * - Automatically toggles between screen‑space (under the camera) and world‑space depending on
 *   `renderer.xr.isPresenting`.
 * - Sets {@link UIKitDocument.setTargetDimensions} so that the UI scales to the requested size
 *   without distorting aspect ratio.
 *
 * @category UI
 */
export class ScreenSpaceUISystem extends createSystem({
  panels: { required: [PanelUI, PanelDocument, ScreenSpace] },
}) {
  private layoutHelpers = {
    dimensionContainer: document.createElement('div'),
    positionContainer: document.createElement('div'),
    dimensionElement: document.createElement('div'),
    positionElement: document.createElement('div'),
  };
  private resized = true;

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

    window.addEventListener(
      'resize',
      () => {
        this.resized = true;
      },
      false,
    );
  }

  /** Move panels between world and screen space and recompute layout on changes. */
  update(): void {
    this.queries.panels.entities.forEach((entity) => {
      const parent = entity.object3D;
      const document = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;

      if (!document) {
        return;
      } // Skip if UI not loaded yet

      const panelInScreenSpace = document.parent === this.camera;

      if (this.renderer.xr.isPresenting && panelInScreenSpace) {
        // Move back to world space when entering XR
        parent?.add(document);
        // Reset position that were set during screen space layout
        document.position.set(0, 0, 0);
      } else if (!this.renderer.xr.isPresenting && !panelInScreenSpace) {
        // Move to screen space when not in XR
        this.camera.add(document);
        this.calculateLayout(entity);
      } else if (panelInScreenSpace && this.resized) {
        // Recalculate layout on resize
        this.calculateLayout(entity);
        this.resized = false;
      }
    });
  }

  /** Compute pixel size/position and apply camera‑relative transform. */
  private calculateLayout(entity: Entity) {
    const document = PanelDocument.data.document[entity.index] as
      | UIKitDocument
      | undefined;
    const computedSize = document?.computedSize;

    if (document && computedSize) {
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

      // Calculate world-to-pixel conversion for screen space at zOffset
      const vFOV = MathUtils.degToRad(this.camera.fov);
      const worldHeightAtZ = 2 * Math.tan(vFOV / 2) * zOffset;
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
   */
  private getComputedDimensionValues(widthExp: string, heightExp: string) {
    const { dimensionElement: element, dimensionContainer: container } =
      this.layoutHelpers;
    document.body.appendChild(container);
    element.style.width = widthExp;
    element.style.height = heightExp;
    container.appendChild(element);
    const pixelValues = window.getComputedStyle(element);
    const result = {
      width: parseFloat(pixelValues.width),
      height: parseFloat(pixelValues.height),
    };
    document.body.removeChild(container);
    return result;
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
}
