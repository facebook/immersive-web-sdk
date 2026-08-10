/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { setPreferredColorScheme } from '@pmndrs/uikit';
import { Types } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import type { Object3D } from '../runtime/index.js';
import { UIKitDocument } from './document.js';
import {
  PanelDocument,
  PanelUI,
  type ColorScheme,
} from './panel-components.js';
import {
  DEFAULT_UIKITML_KIT,
  configureUIKitRenderer,
  loadUIKitMLComponent,
  type UIKitMLComponentSet,
  type UIKitMLKit,
} from './uikitml.js';

export { ColorSchemeType, PanelDocument, PanelUI } from './panel-components.js';
export type { ColorScheme, PanelUIProps } from './panel-components.js';

/**
 * Renders and updates spatial UI panels.
 *
 * @remarks
 * - Sets Three.js transparent sort to a stable painter order for UI readability.
 * - DOM pointer forwarding is owned by `CanvasPointerSystem` in the input layer.
 * - World-space size is controlled exclusively by the entity transform.
 * @category UI
 */
export class PanelUISystem extends createSystem(
  {
    unconfiguredPanels: { required: [PanelUI], excluded: [PanelDocument] },
    configuredPanels: { required: [PanelUI, PanelDocument] },
  },
  {
    /** Built-in UIKitML component collection. */
    kit: { type: Types.String, default: DEFAULT_UIKITML_KIT },
    /** Additional application-defined UIKitML components. */
    componentSets: { type: Types.Object, default: [] },
    /** Color scheme preference for UI theming */
    preferredColorScheme: { type: Types.String, default: 'system' },
  },
) {
  /** Configure transparent sort, color scheme, and reactive queries. */
  init(): void {
    configureUIKitRenderer(this.renderer);

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

  /** Tick every UIKit document in the scene, including manifest-backed assets. */
  update(_delta: number): void {
    const documents = new Set<UIKitDocument>();
    const collect = (object: Object3D): void => {
      if (object instanceof UIKitDocument && !object.disposed) {
        documents.add(object);
      }
    };
    this.scene.traverse(collect);
    this.camera.traverse(collect);
    for (const document of documents) {
      document.rootElement.update?.(_delta * 1000);
    }
  }

  /**
   * Load and parse the `PanelUI.config` UIKitML file, create a {@link UIKitDocument},
   * attach it to the entity, and tag the entity with {@link PanelDocument}.
   */
  private async loadPanel(entity: Entity): Promise<void> {
    if (!entity.object3D) {
      throw new Error(
        `Entity ${entity.index} cannot host PanelUI because it has no object3D. ` +
          'Create it with world.createTransformEntity() before adding PanelUI.',
      );
    }

    const config = PanelUI.data.config[entity.index];
    const rootElement = await loadUIKitMLComponent(config, {
      kit: this.config.kit.value as UIKitMLKit,
      componentSets: this.config.componentSets.value as UIKitMLComponentSet[],
      preferredColorScheme: this.config.preferredColorScheme
        .value as ColorScheme,
    });
    const document = new UIKitDocument(rootElement);

    entity.object3D.add(document);
    entity.addComponent(PanelDocument, { document });
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
