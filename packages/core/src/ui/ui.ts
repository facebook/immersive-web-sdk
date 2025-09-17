/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { forwardHtmlEvents } from '@pmndrs/pointer-events';
import { reversePainterSortStable, Component } from '@pmndrs/uikit';
import { interpret } from '@pmndrs/uikitml';
import { Types, createComponent, Entity, createSystem } from '../ecs/index.js';
import { Vector3 } from '../runtime/three.js';
import { UIKitDocument } from './document.js';

/**
 * Props accepted by the {@link PanelUI} component.
 * @category UI
 */
export interface PanelUIProps {
  /** Path to compiled UIKitML JSON. @example "/ui/settings.json" */
  config: string;
  /** Max panel width in meters. @defaultValue 1 */
  maxWidth?: number;
  /** Max panel height in meters. @defaultValue 1 */
  maxHeight?: number;
}

/**
 * Component for 3D panel UI elements with file‑based configuration.
 *
 * @remarks
 * - Compile `.uikitml` → JSON using the UIKitML Vite plugin, then set {@link PanelUIProps.config}.
 * - When parented to world space (default), {@link PanelUISystem} drives target dimensions from
 *   {@link PanelUIProps.maxWidth} / {@link PanelUIProps.maxHeight} and accounts for world scale.
 * - Pointer events are forwarded to the UI when `forwardHtmlEvents` is enabled.
 * @category UI
 * @see /getting-started/06-spatial-ui
 */
export const PanelUI = createComponent(
  'PanelUI',
  {
    /** Path to .json file */
    config: { type: Types.String, default: '' },
    /** Max width constraint */
    maxWidth: { type: Types.Float32, default: 1 },
    /** Max height constraint */
    maxHeight: { type: Types.Float32, default: 1 },
  },
  'Component for 3D panel UI elements with file-based configuration',
);

/**
 * Internal component containing the loaded UI document (a UIKitDocument `Group`).
 * @category UI
 * @hideineditor
 */
export const PanelDocument = createComponent(
  'PanelDocument',
  {
    document: { type: Types.Object, default: undefined }, // UIKitDocument (extends Group)
  },
  'Internal component containing loaded UI document',
);

/**
 * Renders and updates spatial UI panels and forwards pointer events.
 *
 * @remarks
 * - Sets Three.js transparent sort to a stable painter order for UI readability.
 * - When configured to forward HTML events, bridges DOM events into the 3D scene.
 * - Continuously updates document target dimensions in world space.
 * @category UI
 */
export class PanelUISystem extends createSystem(
  {
    unconfiguredPanels: { required: [PanelUI], excluded: [PanelDocument] },
    configuredPanels: { required: [PanelUI, PanelDocument] },
  },
  {
    /** When true, forwards HTML/DOM pointer events to the 3D UI. */
    forwardHtmlEvents: { type: Types.Boolean, default: true },
    /** Additional pre-built UI component libraries */
    kits: { type: Types.Object, default: {} },
  },
) {
  private htmlHandler?: {
    destroy: () => void;
    update: () => void;
  };

  private vec3 = new Vector3();

  /** Configure transparent sort, set up DOM event forwarding, and reactive queries. */
  init(): void {
    this.renderer.setTransparentSort(reversePainterSortStable);
    this.config.forwardHtmlEvents.subscribe((forwarding) => {
      this.htmlHandler?.destroy();
      if (forwarding) {
        this.htmlHandler = forwardHtmlEvents(
          this.renderer.domElement,
          () => this.camera,
          this.scene,
        );
      } else {
        this.htmlHandler = undefined;
      }
    });

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
    });

    // Set up cleanup when panels are unconfigured
    this.queries.configuredPanels.subscribe('disqualify', (entity) => {
      this.cleanupPanel(entity);
    });
  }

  /** Forward HTML events and tick loaded UIKit documents each frame. */
  update(_delta: number): void {
    this.htmlHandler?.update();

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

  /** Tear down forwarded event handling. */
  destroy(): void {
    this.htmlHandler?.destroy();
  }
}
