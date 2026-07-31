/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal, type Signal } from '@preact/signals-core';
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  Globe2,
  Lock,
  Magnet,
  Move3D,
  Plus,
  Redo2,
  Rotate3D,
  Scale3D,
  Undo2,
} from 'lucide';
import { h, render, type VNode } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

type WorkspaceView = 'runtime' | 'editor';
type IconNode = readonly [
  tag: string,
  attributes: Record<string, string | number>,
  children?: readonly IconNode[],
];

export interface EditorWorkspaceSnapshot {
  assetCount: number;
  dirty: boolean;
  dirtyStatus: string;
  ghostedNodeIds: string[];
  hiddenNodeIds: string[];
  lockedNodeIds: string[];
  nodeCount: number;
  nodes: any[];
  rootSelected: boolean;
  sceneAssets: any[];
  scenePath: string | null;
  selectedNodeIds: string[];
  soloNodeId: string | null;
  statusStrip: string;
  transformMode: 'translate' | 'rotate' | 'scale';
  transformSnapEnabled: boolean;
  transformSpace: 'local' | 'world';
  view: WorkspaceView;
}

export interface EditorWorkspaceController {
  addAsset?(assetId: string): void;
  moveNode?(nodeId: string, parentId: string | null): void;
  openNodeContextMenu?(nodeId: string, point: { x: number; y: number }): void;
  redo?(): void;
  selectNode?(
    nodeId: string,
    modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ): void;
  selectRoot?(): void;
  setTransformMode?(mode: 'translate' | 'rotate' | 'scale'): void;
  setTransformSpace?(space: 'local' | 'world'): void;
  setView?(view: WorkspaceView): void;
  toggleNodeExpanded?(nodeId: string): void;
  toggleNodeVisibility?(nodeId: string): void;
  toggleTransformSnap?(): void;
  undo?(): void;
}

export interface EditorWorkspaceMount {
  state: Signal<EditorWorkspaceSnapshot>;
  unmount(): void;
  update(patch: Partial<EditorWorkspaceSnapshot>): void;
}

const DEFAULT_SNAPSHOT: EditorWorkspaceSnapshot = {
  assetCount: 0,
  dirty: false,
  dirtyStatus: 'Saved',
  ghostedNodeIds: [],
  hiddenNodeIds: [],
  lockedNodeIds: [],
  nodeCount: 0,
  nodes: [],
  rootSelected: false,
  sceneAssets: [],
  scenePath: null,
  selectedNodeIds: [],
  soloNodeId: null,
  statusStrip: 'Scene loading...',
  transformMode: 'translate',
  transformSnapEnabled: false,
  transformSpace: 'local',
  view: 'runtime',
};

const ICONS = {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Focus,
  Globe2,
  Lock,
  Magnet,
  Move3D,
  Plus,
  Redo2,
  Rotate3D,
  Scale3D,
  Undo2,
} satisfies Record<string, IconNode>;

export function mountEditorWorkspace(
  root: HTMLElement,
  controller: EditorWorkspaceController,
  initial: Partial<EditorWorkspaceSnapshot> = {},
): EditorWorkspaceMount {
  const state = signal({ ...DEFAULT_SNAPSHOT, ...initial });
  render(<EditorWorkspace state={state} controller={controller} />, root);
  return {
    state,
    unmount() {
      render(null, root);
    },
    update(patch) {
      state.value = { ...state.value, ...patch };
    },
  };
}

function EditorWorkspace({
  controller,
  state,
}: {
  controller: EditorWorkspaceController;
  state: Signal<EditorWorkspaceSnapshot>;
}) {
  const snapshot = useSignalValue(state);
  return (
    <main class="workspace-shell" data-workspace-shell>
      <WorkspaceViewSwitcher snapshot={snapshot} controller={controller} />
      <iframe
        id="workspace-runtime-frame"
        class="workspace-runtime-frame"
        data-workspace-runtime-src="/"
        title="IWSDK runtime app"
      />
      <section class="workspace-editor-pane" data-workspace-editor-pane>
        <main class="editor-shell">
          <div class="editor-state-readouts" aria-hidden="true">
            <span id="scene-status">
              {snapshot.nodeCount} nodes, {snapshot.assetCount} assets
            </span>
            <span
              id="dirty-status"
              data-state={snapshot.dirty ? 'dirty' : 'saved'}
            >
              {snapshot.dirtyStatus}
            </span>
          </div>
          <EditorViewport snapshot={snapshot} controller={controller} />
          <EditorLeftPanel snapshot={snapshot} controller={controller} />
          <EditorInspector snapshot={snapshot} controller={controller} />
        </main>
      </section>
    </main>
  );
}

function useSignalValue<T>(state: Signal<T>): T {
  const [value, setValue] = useState(() => state.peek());
  useEffect(() => state.subscribe(setValue), [state]);
  return value;
}

function WorkspaceViewSwitcher({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  return (
    <div class="workspace-view-switcher" aria-label="Workspace view">
      {(['runtime', 'editor'] as const).map((view) => (
        <button
          key={view}
          data-active={snapshot.view === view || undefined}
          data-workspace-view-button={view}
          onClick={() => controller.setView?.(view)}
        >
          {view === 'runtime' ? 'Runtime' : 'Editor'}
        </button>
      ))}
    </div>
  );
}

function EditorViewport({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  return (
    <section class="editor-viewport">
      <EditorToolbar snapshot={snapshot} controller={controller} />
      <div id="scene-viewport">
        <div
          id="orientation-gizmo"
          aria-label="Interactive orientation gizmo"
        />
        <div
          class="editor-slot viewport-overlay-slot"
          data-editor-slot="viewport.overlay"
        />
      </div>
      <section
        id="editor-bottom-panel"
        class="editor-bottom-panel"
        aria-label="Scene diagnostics"
      >
        <div class="bottom-panel-tabs" role="tablist">
          <button data-bottom-tab="assets" data-active>
            Assets
          </button>
          <button data-bottom-tab="console">Console</button>
          <button data-bottom-tab="validation">Validation</button>
        </div>
        <AssetBrowser snapshot={snapshot} controller={controller} />
        <div id="bottom-panel-content" class="bottom-panel-content" />
      </section>
      <div
        id="editor-status-strip"
        aria-live="polite"
        data-state={snapshot.dirty ? 'dirty' : 'saved'}
      >
        {snapshot.statusStrip}
      </div>
    </section>
  );
}

function EditorToolbar({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  return (
    <div class="editor-toolbar" aria-label="Scene editor tools">
      <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.left" />
      <div
        id="transform-toolbar"
        class="toolbar-group"
        aria-label="Transform controls"
      >
        <IconButton
          active={snapshot.transformMode === 'translate'}
          icon="Move3D"
          label="Move"
          data={{ 'data-transform-mode': 'translate' }}
          onClick={() => controller.setTransformMode?.('translate')}
        />
        <IconButton
          active={snapshot.transformMode === 'rotate'}
          icon="Rotate3D"
          label="Rotate"
          data={{ 'data-transform-mode': 'rotate' }}
          onClick={() => controller.setTransformMode?.('rotate')}
        />
        <IconButton
          active={snapshot.transformMode === 'scale'}
          icon="Scale3D"
          label="Scale"
          data={{ 'data-transform-mode': 'scale' }}
          onClick={() => controller.setTransformMode?.('scale')}
        />
      </div>
      <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.center" />
      <div class="toolbar-group" aria-label="Transform settings">
        <IconButton
          active={snapshot.transformSpace === 'local'}
          icon="Box"
          label="Local space"
          data={{ 'data-transform-space': 'local' }}
          onClick={() => controller.setTransformSpace?.('local')}
        />
        <IconButton
          active={snapshot.transformSpace === 'world'}
          icon="Globe2"
          label="World space"
          data={{ 'data-transform-space': 'world' }}
          onClick={() => controller.setTransformSpace?.('world')}
        />
        <IconButton
          active={snapshot.transformSnapEnabled}
          icon="Magnet"
          label="Snap"
          data={{ 'data-transform-snap': '' }}
          onClick={() => controller.toggleTransformSnap?.()}
        />
      </div>
      <div class="toolbar-group" aria-label="Document history">
        <IconButton
          icon="Undo2"
          label="Undo"
          id="undo"
          onClick={() => controller.undo?.()}
        />
        <IconButton
          icon="Redo2"
          label="Redo"
          id="redo"
          onClick={() => controller.redo?.()}
        />
      </div>
      <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.right" />
    </div>
  );
}

function IconButton({
  active = false,
  data = {},
  disabled = false,
  icon,
  id,
  label,
  onClick,
}: {
  active?: boolean;
  data?: Record<string, string>;
  disabled?: boolean;
  icon: keyof typeof ICONS;
  id?: string;
  label: string;
  onClick?(): void;
}) {
  return (
    <button
      {...data}
      id={id}
      class="icon-button"
      data-active={active || undefined}
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

function EditorLeftPanel({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  return (
    <section
      class="editor-panel editor-panel-left"
      data-editor-panel="composition"
    >
      <div class="editor-slot sidebar-slot" data-editor-slot="sidebar.top" />
      <SceneGraph snapshot={snapshot} controller={controller} />
      <div class="editor-slot sidebar-slot" data-editor-slot="sidebar.bottom" />
      <div
        id="scene-graph-context-menu"
        class="scene-graph-context-menu"
        hidden
      />
    </section>
  );
}

function SceneGraph({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  const [query, setQuery] = useState('');
  const filteredNodes = useMemo(
    () => filterSceneNodes(snapshot.nodes, query.trim().toLowerCase()),
    [snapshot.nodes, query],
  );
  return (
    <div class="panel-section scene-graph-section">
      <div class="panel-section-header">
        <h2>Scene Graph</h2>
      </div>
      <div class="panel-control-row">
        <input
          id="scene-graph-filter"
          type="search"
          placeholder="Filter nodes"
          aria-label="Filter scene graph nodes"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <button
        id="scene-root-drop-target"
        class="scene-root-drop-target node-row"
        data-active={snapshot.rootSelected || undefined}
        data-scene-root-drop
        type="button"
        style={{ '--depth': 0 } as any}
        onClick={() => controller.selectRoot?.()}
        onDragOver={(event) => {
          const transfer = event.dataTransfer;
          if (transfer?.types.includes('text/plain')) {
            event.preventDefault();
            transfer.dropEffect = 'move';
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const nodeId = event.dataTransfer?.getData('text/plain');
          if (nodeId) {
            controller.moveNode?.(nodeId, null);
          }
        }}
      >
        <span class="node-row-icon">
          <Icon name="Move3D" />
        </span>
        <span class="node-row-main">
          <span class="node-row-id">Root</span>
          <span class="node-row-subtitle">Scene Root</span>
        </span>
      </button>
      <div id="outliner" role="tree">
        {filteredNodes.length ? (
          filteredNodes.map((node) => (
            <SceneNodeRow
              key={node.id}
              node={node}
              depth={0}
              query={query}
              snapshot={snapshot}
              controller={controller}
            />
          ))
        ) : (
          <div class="empty-state" data-empty-outliner>
            No matching nodes
          </div>
        )}
      </div>
    </div>
  );
}

function SceneNodeRow({
  controller,
  depth,
  node,
  query,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  depth: number;
  node: any;
  query: string;
  snapshot: EditorWorkspaceSnapshot;
}) {
  const children = Array.isArray(node.children) ? node.children : [];
  const expanded =
    children.length > 0 && (Boolean(query) || node.expanded !== false);
  const selected = snapshot.selectedNodeIds.includes(node.id);
  const hidden = snapshot.hiddenNodeIds.includes(node.id);
  const locked = snapshot.lockedNodeIds.includes(node.id);
  const ghosted = snapshot.ghostedNodeIds.includes(node.id);
  const solo = snapshot.soloNodeId === node.id;
  const kind = sceneNodeKind(node);
  return (
    <>
      <button
        class="node-row"
        data-node-id={node.id}
        data-outliner-parent={children.length > 0 || undefined}
        data-active={selected || undefined}
        data-preview-hidden={hidden || undefined}
        data-preview-locked={locked || undefined}
        draggable
        aria-expanded={children.length > 0 ? expanded : undefined}
        style={{ '--depth': depth } as any}
        onClick={(event) =>
          controller.selectNode?.(node.id, {
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          })
        }
        onContextMenu={(event) => {
          event.preventDefault();
          controller.openNodeContextMenu?.(node.id, {
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onKeyDown={(event) => {
          if (
            !children.length ||
            !['ArrowLeft', 'ArrowRight'].includes(event.key)
          ) {
            return;
          }
          const shouldExpand = event.key === 'ArrowRight';
          if (shouldExpand === expanded) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          controller.toggleNodeExpanded?.(node.id);
        }}
        onDragStart={(event) => {
          const transfer = event.dataTransfer;
          transfer?.setData('text/plain', node.id);
          if (transfer) {
            transfer.effectAllowed = 'move';
          }
        }}
        onDragOver={(event) => {
          const transfer = event.dataTransfer;
          const dragged = transfer?.getData('text/plain');
          if (dragged !== node.id) {
            event.preventDefault();
            if (transfer) {
              transfer.dropEffect = 'move';
            }
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragged = event.dataTransfer?.getData('text/plain');
          if (dragged && dragged !== node.id) {
            controller.moveNode?.(dragged, node.id);
          }
        }}
      >
        <span
          class="node-row-caret"
          data-outliner-disclosure={children.length > 0 || undefined}
          title={
            children.length > 0
              ? `${expanded ? 'Collapse' : 'Expand'} ${node.name || node.id}`
              : undefined
          }
          onClick={(event) => {
            if (!children.length) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            controller.toggleNodeExpanded?.(node.id);
          }}
        >
          {children.length > 0 ? (
            <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} />
          ) : null}
        </span>
        <span class="node-row-icon">
          <Icon name={kind === 'group' ? 'Boxes' : 'Box'} />
        </span>
        <span class="node-row-main">
          <span class="node-row-id">{node.name || node.id}</span>
          <span class="node-row-subtitle">{sceneNodeSubtitle(node)}</span>
        </span>
        <span
          class="node-row-visibility"
          data-preview-visibility-toggle
          role="button"
          title={hidden ? 'Show' : 'Hide'}
          aria-label={hidden ? 'Show' : 'Hide'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            controller.toggleNodeVisibility?.(node.id);
          }}
        >
          <Icon name={hidden ? 'EyeOff' : 'Eye'} />
        </span>
        {solo || ghosted || locked ? (
          <span class="node-row-preview-state" aria-hidden="true">
            {solo ? <Icon name="Focus" /> : null}
            {ghosted ? <Icon name="Eye" /> : null}
            {locked ? <Icon name="Lock" /> : null}
          </span>
        ) : null}
        {children.length > 0 ? (
          <span class="node-row-meta">{children.length}</span>
        ) : null}
      </button>
      {expanded
        ? children.map((child: any) => (
            <SceneNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              query={query}
              snapshot={snapshot}
              controller={controller}
            />
          ))
        : null}
    </>
  );
}

function filterSceneNodes(nodes: any[], query: string): any[] {
  if (!query) {
    return nodes;
  }
  return nodes.flatMap((node) => {
    const children = filterSceneNodes(node.children || [], query);
    const values = [
      node.id,
      node.name,
      node.content?.asset,
      node.content?.geometry?.type,
      sceneNodeKind(node),
    ];
    const matches = values.some(
      (value) =>
        typeof value === 'string' && value.toLowerCase().includes(query),
    );
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

function sceneNodeKind(node: any): string {
  return node.content?.type || (node.children?.length ? 'group' : 'group');
}

function sceneNodeSubtitle(node: any): string {
  return (
    node.content?.asset ||
    node.content?.geometry?.type ||
    node.content?.type ||
    'group'
  );
}

function AssetBrowser({
  controller,
  snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const assets = snapshot.sceneAssets.filter((asset) =>
    normalizedQuery.length === 0
      ? true
      : `${asset.id} ${asset.name || ''}`
          .toLowerCase()
          .includes(normalizedQuery),
  );
  return (
    <div id="assets-panel" class="asset-library-section" data-assets-panel>
      <div class="asset-library-project">
        <div class="panel-control-row asset-browser-controls">
          <input
            id="asset-filter"
            type="search"
            placeholder="Search assets"
            aria-label="Search assets"
            value={query}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
            }}
          />
        </div>
        <div id="asset-catalog" aria-live="polite">
          {assets.length ? (
            assets.map((asset) => (
              <AssetRow
                key={asset.id}
                name={asset.id}
                meta={assetCatalogMeta(asset)}
                thumbnailUrl={asset.thumbnailUrl}
                actionLabel={`Add ${asset.id}`}
                actionIcon="Plus"
                actionData={{ 'data-add-asset': asset.id }}
                rowData={{ 'data-asset-id': asset.id }}
                onAction={() => controller.addAsset?.(asset.id)}
              />
            ))
          ) : (
            <div class="empty-state">No assets found</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetRow({
  actionData,
  actionIcon,
  actionLabel,
  meta,
  name,
  onAction,
  rowData,
  thumbnailUrl,
}: {
  actionData?: Record<string, string>;
  actionIcon: 'Plus';
  actionLabel: string;
  meta: string;
  name: string;
  onAction(): void;
  rowData?: Record<string, string>;
  thumbnailUrl?: string;
}) {
  return (
    <div class="asset-catalog-row" {...rowData}>
      <span class="asset-catalog-thumb" aria-hidden="true">
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <Icon name="Box" />}
      </span>
      <span class="asset-catalog-main">
        <span class="asset-catalog-name">{name}</span>
        <span class="asset-catalog-meta">{meta}</span>
      </span>
      <button
        {...actionData}
        class="asset-add-button icon-button"
        title={actionLabel}
        aria-label={actionLabel}
        onClick={onAction}
      >
        <Icon name={actionIcon} />
      </button>
    </div>
  );
}

function assetCatalogMeta(asset: any): string {
  const kind = asset.kind || 'asset';
  const name = typeof asset.name === 'string' ? asset.name.trim() : '';
  if (
    !name ||
    name === asset.id ||
    /^(root|scene|group|object3d|mesh)$/i.test(name)
  ) {
    return kind;
  }
  return `${kind} - ${name}`;
}

function EditorInspector({
  controller: _controller,
  snapshot: _snapshot,
}: {
  controller: EditorWorkspaceController;
  snapshot: EditorWorkspaceSnapshot;
}) {
  return (
    <section
      class="editor-panel editor-panel-right"
      data-editor-panel="inspector"
    >
      <div class="panel-section">
        <div class="panel-section-header">
          <h2>Inspector</h2>
        </div>
        <div id="inspector" />
      </div>
    </section>
  );
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  return renderIconNode(ICONS[name], true);
}

function renderIconNode(node: IconNode, root = false, key = 0): VNode<any> {
  const [tag, attributes, children = []] = node;
  return h(
    tag,
    { ...attributes, ...(root ? { class: 'lucide-icon' } : {}), key },
    children.map((child, index) => renderIconNode(child, false, index)),
  );
}
