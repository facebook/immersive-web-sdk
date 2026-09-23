/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheManager } from '../../src/asset/cache-manager.js';
import { uiInspect } from '../../src/mcp/ui-debug-tools.js';
import { Group } from '../../src/runtime/index.js';
import { UIKitDocument } from '../../src/ui/document.js';
import { PanelDocument } from '../../src/ui/panel-components.js';
import { loadUIKitMLAsset } from '../../src/ui/uikitml.js';

const PANEL_SOURCE = `
<style>
  .panel {}
  .action {}
  .live {}
</style>
<Panel id="settings-root" class="panel">
  <Button id="save-button" class="action" disabled>Save</Button>
  <Button id="cancel-button" class="action" style="display: none">Cancel</Button>
</Panel>
`;

function nestedPanelSource(count: number): string {
  return [
    '<style>.nested {}</style>',
    ...Array.from(
      { length: count },
      (_, index) => `<Panel id="nested-${index}" class="nested">`,
    ),
    ...Array.from({ length: count }, () => '</Panel>'),
  ].join('');
}

function stubPanelSource(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(PANEL_SOURCE, { status: 200 })),
  );
}

function createWorld(
  object3D: Group,
  options: {
    active?: boolean;
    entityIndex?: number;
    panelDocument?: UIKitDocument;
  } = {},
) {
  const entityIndex = options.entityIndex ?? 7;
  const entity = {
    active: options.active ?? true,
    index: entityIndex,
    object3D,
    getComponents: () => (options.panelDocument ? [PanelDocument] : []),
    getValue: (component: unknown, key: string) =>
      component === PanelDocument && key === 'document'
        ? options.panelDocument
        : null,
  };
  return {
    entity,
    world: {
      entityManager: {
        getEntityByIndex: (index: number) =>
          index === entityIndex ? entity : null,
      },
    } as any,
  };
}

afterEach(() => {
  CacheManager.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('uiInspect', () => {
  it('lists stable-ID elements in document order for an asset-backed panel', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    asset.name = 'Settings Panel';
    const { world } = createWorld(asset);

    const result = uiInspect(world, { entityIndex: 7 });

    expect(result.panel).toMatchObject({
      assetId: '/ui/settings.uikitml',
      entityIndex: 7,
      name: 'Settings Panel',
    });
    expect(result.elements.map((element) => element.id)).toEqual([
      'settings-root',
      'save-button',
      'cancel-button',
    ]);
    expect(
      result.elements.every(
        (element) => element.missingProperties === undefined,
      ),
    ).toBe(true);
    expect(result).toMatchObject({
      limited: false,
      total: 3,
    });

    asset.dispose();
  });

  it('returns live text, state, classes, layout, and requested properties', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const button = asset.requireElementById('save-button');
    button.setProperties({ disabled: true, text: 'Saved' });
    const { world } = createWorld(asset);

    const result = uiInspect(world, {
      entityIndex: 7,
      selector: '#save-button',
      properties: ['disabled', 'display', 'missing'],
    });

    expect(result.selector).toBe('#save-button');
    expect(result.total).toBe(1);
    expect(result.elements[0]).toMatchObject({
      id: 'save-button',
      classes: ['action'],
      text: 'Saved',
      properties: {
        disabled: true,
      },
      missingProperties: ['display', 'missing'],
      state: {
        active: false,
        disabled: true,
        hovered: false,
      },
    });
    expect(result.elements[0].componentType).toBe('Button');
    expect(result.elements[0].uuid).toEqual(expect.any(String));
    expect(result.elements[0].layout).toEqual({
      relativeCenter: null,
      size: null,
    });

    asset.dispose();
  });

  it('supports class selectors, deterministic limits, and deduplicated properties', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const { world } = createWorld(asset);

    const result = uiInspect(world, {
      entityIndex: 7,
      selector: '.action',
      properties: ['disabled', 'disabled'],
      limit: 1,
    });

    expect(result.total).toBe(2);
    expect(result.limited).toBe(true);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].id).toBe('save-button');
    expect(Object.keys(result.elements[0].properties)).toEqual(['disabled']);

    asset.dispose();
  });

  it('matches current IDs and classes instead of stale document indexes', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const button = asset.requireElementById('save-button');
    button.setProperties({ id: 'renamed-button' });
    button.classList.remove('action');
    button.classList.add('live');
    button.classList.add('__id__renamed-button');
    const { world } = createWorld(asset);

    expect(
      uiInspect(world, {
        entityIndex: 7,
        selector: '#renamed-button',
      }).elements[0],
    ).toMatchObject({
      id: 'renamed-button',
      classes: ['live'],
    });
    expect(
      uiInspect(world, { entityIndex: 7, selector: '#save-button' }).total,
    ).toBe(0);
    expect(
      uiInspect(world, { entityIndex: 7, selector: '.live' }).elements.map(
        (element) => element.id,
      ),
    ).toEqual(['renamed-button']);
    expect(
      uiInspect(world, { entityIndex: 7, selector: '.action' }).elements.map(
        (element) => element.id,
      ),
    ).toEqual(['cancel-button']);

    asset.dispose();
  });

  it('does not allocate property signals for missing or inherited names', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const button = asset.requireElementById('save-button');
    const propertyStateMap = (
      button.properties as unknown as {
        propertyStateMap: Record<string, unknown>;
      }
    ).propertyStateMap;
    for (const property of ['neverSeenProperty', 'toString', 'constructor']) {
      expect(Object.hasOwn(propertyStateMap, property)).toBe(false);
    }
    const { world } = createWorld(asset);

    expect(
      uiInspect(world, {
        entityIndex: 7,
        selector: '#save-button',
        properties: ['neverSeenProperty', 'toString', 'constructor'],
      }).elements[0],
    ).toMatchObject({
      id: 'save-button',
      missingProperties: ['neverSeenProperty', 'toString', 'constructor'],
      text: 'Save',
    });
    for (const property of ['neverSeenProperty', 'toString', 'constructor']) {
      expect(Object.hasOwn(propertyStateMap, property)).toBe(false);
    }

    asset.dispose();
  });

  it('matches descendant selectors in one bounded live traversal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(nestedPanelSource(25), { status: 200 }),
        ),
    );
    const asset = await loadUIKitMLAsset('/ui/nested.uikitml');
    const querySelectorAll = vi.spyOn(asset.document, 'querySelectorAll');
    const { world } = createWorld(asset);

    const result = uiInspect(world, {
      entityIndex: 7,
      selector: Array.from({ length: 12 }, () => '.nested').join(' '),
      limit: 1,
    });

    expect(querySelectorAll).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      limited: true,
      total: 14,
    });
    expect(result.elements).toHaveLength(1);

    asset.dispose();
  });

  it('reports an element hidden by an Object3D ancestor as not visible', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const root = asset.requireElementById('settings-root');
    root.displayed.value = true;
    const { world } = createWorld(asset);

    expect(
      uiInspect(world, { entityIndex: 7, selector: '#settings-root' })
        .elements[0].state.visible,
    ).toBe(true);

    const textOnlyButton = asset.requireElementById('save-button');
    await vi.waitFor(() => {
      asset.document.rootElement.update(0.016);
      expect(textOnlyButton.isVisible.value).toBe(true);
    });
    textOnlyButton.visible = false;
    expect(
      uiInspect(world, { entityIndex: 7, selector: '#save-button' }).elements[0]
        .state.visible,
    ).toBe(true);

    asset.visible = false;
    expect(
      uiInspect(world, { entityIndex: 7, selector: '#settings-root' })
        .elements[0].state.visible,
    ).toBe(false);

    asset.dispose();
  });

  it('resolves a screen-space document after it is reparented away from the asset', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    asset.document.removeFromParent();
    const { world } = createWorld(asset);

    expect(
      uiInspect(world, {
        entityIndex: 7,
        selector: '#cancel-button',
      }).elements[0],
    ).toMatchObject({
      id: 'cancel-button',
      text: 'Cancel',
      state: {
        displayed: false,
        visible: false,
      },
    });

    asset.dispose();
  });

  it('resolves a reparented legacy PanelUI document through its ECS component', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const host = new Group();
    const camera = new Group();
    host.name = 'Legacy Panel';
    asset.document.removeFromParent();
    camera.add(asset.document);
    const { world } = createWorld(host, {
      panelDocument: asset.document,
    });

    expect(
      uiInspect(world, {
        entityIndex: 7,
        selector: '#save-button',
      }).panel,
    ).toMatchObject({
      entityIndex: 7,
      name: 'Legacy Panel',
    });

    asset.document.dispose();
  });

  it('does not attribute a descendant entity panel to its ancestor', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const parent = new Group();
    const childEntityRoot = new Group();
    parent.entityIdx = 7;
    childEntityRoot.entityIdx = 8;
    childEntityRoot.add(asset);
    parent.add(childEntityRoot);
    const { world } = createWorld(parent);

    expect(() => uiInspect(world, { entityIndex: 7 })).toThrow(
      'does not own a live UIKitML document',
    );

    asset.dispose();
  });

  it('returns no matches for a supported selector that is absent', async () => {
    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const { world } = createWorld(asset);

    expect(
      uiInspect(world, {
        entityIndex: 7,
        selector: '#missing-button',
      }),
    ).toMatchObject({
      elements: [],
      limited: false,
      total: 0,
    });

    asset.dispose();
  });

  it('rejects invalid entities, non-UI entities, selectors, properties, and limits', async () => {
    const plain = new Group();
    const { world } = createWorld(plain);

    expect(() => uiInspect(world, { entityIndex: -1 })).toThrow(
      'entityIndex must be a non-negative integer',
    );
    expect(() => uiInspect(world, { entityIndex: 99 })).toThrow(
      'Entity 99 not found',
    );
    expect(() => uiInspect(world, { entityIndex: 7 })).toThrow(
      'does not own a live UIKitML document',
    );

    stubPanelSource();
    const asset = await loadUIKitMLAsset('/ui/settings.uikitml');
    const panelWorld = createWorld(asset).world;

    expect(() =>
      uiInspect(panelWorld, { entityIndex: 7, selector: 'Button' }),
    ).toThrow('supports only #id, .class');
    expect(() =>
      uiInspect(panelWorld, { entityIndex: 7, selector: '.action.live' }),
    ).toThrow('supports only #id, .class');
    expect(() =>
      uiInspect(panelWorld, { entityIndex: 7, selector: '#save:hover' }),
    ).toThrow('supports only #id, .class');
    expect(() =>
      uiInspect(panelWorld, { entityIndex: 99, selector: 'Button' }),
    ).toThrow('supports only #id, .class');
    expect(() =>
      uiInspect(panelWorld, {
        entityIndex: 7,
        selector: Array.from({ length: 17 }, () => '.action').join(' '),
      }),
    ).toThrow('selector allows at most 16 descendant parts');
    expect(() =>
      uiInspect(panelWorld, { entityIndex: 7, properties: [] }),
    ).toThrow('properties must be a non-empty string array');
    expect(() =>
      uiInspect(panelWorld, { entityIndex: 7, properties: ['__proto__'] }),
    ).toThrow('each property must be a camelCase name');
    expect(() => uiInspect(panelWorld, { entityIndex: 7, limit: 51 })).toThrow(
      'limit must be an integer from 1 to 50',
    );

    const inactiveWorld = createWorld(asset, { active: false }).world;
    expect(() => uiInspect(inactiveWorld, { entityIndex: 7 })).toThrow(
      'Entity 7 not found or has been destroyed',
    );

    asset.dispose();
  });
});
