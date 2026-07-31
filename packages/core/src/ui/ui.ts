/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  reversePainterSortStable,
  Component,
  setPreferredColorScheme,
} from '@pmndrs/uikit';
import { interpret } from '@pmndrs/uikitml';
import { Types } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { Vector3 } from '../runtime/three.js';
import { UIKitDocument } from './document.js';
import {
  PanelDocument,
  PanelUI,
  type ColorScheme,
} from './panel-components.js';

export { ColorSchemeType, PanelDocument, PanelUI } from './panel-components.js';
export type { ColorScheme, PanelUIProps } from './panel-components.js';

/**
 * Renders and updates spatial UI panels.
 *
 * @remarks
 * - Sets Three.js transparent sort to a stable painter order for UI readability.
 * - DOM pointer forwarding is owned by `CanvasPointerSystem` in the input layer.
 * - Continuously updates document target dimensions in world space.
 * @category UI
 */
export class PanelUISystem extends createSystem(
  {
    unconfiguredPanels: { required: [PanelUI], excluded: [PanelDocument] },
    configuredPanels: { required: [PanelUI, PanelDocument] },
  },
  {
    /** Additional pre-built UI component libraries */
    kits: { type: Types.Object, default: {} },
    /** Color scheme preference for UI theming */
    preferredColorScheme: { type: Types.String, default: 'system' },
  },
) {
  private vec3 = new Vector3();

  /** Configure transparent sort, color scheme, and reactive queries. */
  init(): void {
    this.renderer.setTransparentSort(reversePainterSortStable);
    this.renderer.localClippingEnabled = true;

    // Apply color scheme preference. Register the unsubscribe / query handles
    // on cleanupFuncs so they are released on system teardown.
    this.cleanupFuncs.push(
      this.config.preferredColorScheme.subscribe((scheme) => {
        setPreferredColorScheme(scheme as ColorScheme);
      }),

      // Set up reactive UI loading when panels need configuration
      this.queries.unconfiguredPanels.subscribe('qualify', (entity) => {
        this.loadPanel(entity)
          .then(() => {
            // Loading completed successfully - PanelDocument component added
          })
          .catch((error) => {
            console.error(
              `[PanelUISystem] Failed to load panel for entity ${entity.index}:`,
              error,
            );
          });
      }),

      // Set up cleanup when panels are unconfigured
      this.queries.configuredPanels.subscribe('disqualify', (entity) => {
        this.cleanupPanel(entity);
      }),
    );
  }

  /** Tick loaded UIKit documents each frame. */
  update(_delta: number): void {
    // Update loaded panels - need to call update on root component for animations/frame updates
    this.queries.configuredPanels.entities.forEach((entity) => {
      const document = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (
        document?.rootElement &&
        typeof document.rootElement.update === 'function'
      ) {
        document.rootElement.update(_delta * 1000); // UIKit expects milliseconds
      }

      // Continuously set target dimensions when UIKitDocument is in world space (parented to entity)
      // This ensures PanelUISystem controls dimensions when not in screen space
      // Note: Signals automatically handle duplicate value detection, so no need to check for changes
      if (document && document.parent === entity.object3D) {
        const maxWidth = PanelUI.data.maxWidth[entity.index];
        const maxHeight = PanelUI.data.maxHeight[entity.index];

        // Account for entity's world scale to get accurate target dimensions
        const worldScale = entity.object3D.getWorldScale(this.vec3);
        const adjustedMaxWidth = maxWidth / worldScale.x;
        const adjustedMaxHeight = maxHeight / worldScale.y;

        document.setTargetDimensions(adjustedMaxWidth, adjustedMaxHeight);
      }
    });
  }

  /**
   * Load and interpret the `PanelUI.config` JSON file, create a {@link UIKitDocument},
   * attach it to the entity, and tag the entity with {@link PanelDocument}.
   */
  private async loadPanel(entity: Entity): Promise<void> {
    try {
      const config = PanelUI.data.config[entity.index];

      // Load and parse JSON file
      const response = await fetch(config);
      if (!response.ok) {
        throw new Error(
          `Failed to load UI config: ${config} (${response.status} ${response.statusText})`,
        );
      }

      const parseResult = await response.json();

      const rootElement = interpret(
        parseResult,
        this.config.kits.value as {},
      ) as Component;
      if (!rootElement) {
        throw new Error(`Failed to interpret UI config: ${config}`);
      }

      // Create UIKitDocument
      const document = new UIKitDocument(rootElement);

      // Add the UIKitDocument (Group) to the entity's object3D
      if (entity.object3D) {
        entity.object3D.add(document);
      } else {
        console.warn(
          `[PanelUISystem] Entity ${entity.index} has no object3D! Cannot add UI to scene.`,
        );
      }

      // Add PanelDocument component to entity - this triggers reactive system
      entity.addComponent(PanelDocument, {
        document: document,
      });
    } catch (error) {
      console.error(
        `[PanelUISystem] Error loading panel for entity ${entity.index}:`,
        error,
      );
    }
  }

  /** Remove, dispose, and detach the loaded {@link UIKitDocument} from the entity. */
  private cleanupPanel(entity: Entity): void {
    // Get the document before cleanup
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;

    if (document) {
      // Remove UIKitDocument (Group) from scene first
      if (entity.object3D) {
        entity.object3D.remove(document);
      }

      // Delegate cleanup to UIKitDocument's dispose method
      if (typeof document.dispose === 'function') {
        document.dispose();
      }
    }
  }
}
