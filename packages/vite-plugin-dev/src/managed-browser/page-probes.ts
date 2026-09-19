/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  RuntimeCameraSnapshot,
  RuntimeFramingSnapshot,
} from '../runtime-proof-parity.js';

// These functions are serialized into the browser page by Playwright. Keep
// imports type-only and preserve an ES2020+ target so emitted callbacks remain
// self-contained (without TypeScript helper references).

export interface BrowserEnvironmentDescriptor {
  devicePixelRatio: number;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  userAgent: string;
}

export interface BrowserApplicationIdentity {
  documentTimeOrigin: number;
  generation: number | null;
  id: string | null;
}

export function readApplicationIdentity(): BrowserApplicationIdentity {
  const rawGeneration = window.__IWSDK_MCP_TAB_GENERATION ?? null;
  const generation = rawGeneration == null ? null : Number(rawGeneration);
  return {
    documentTimeOrigin: performance.timeOrigin,
    generation: Number.isFinite(generation) ? generation : null,
    id: window.__IWSDK_MCP_PAGE_ID ?? null,
  };
}

export function describeElements(
  root: Element,
  {
    maxCandidates,
    maxNodes,
    maxTextLength,
    rootOnly = false,
  }: {
    maxCandidates: number;
    maxNodes: number;
    maxTextLength: number;
    rootOnly?: boolean;
  },
) {
  const escapeCss = (value: string) => CSS.escape(value);
  const directText = (element: Element): string => {
    const chunks: string[] = [];
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent?.replace(/\s+/g, ' ').trim();
        if (value) {
          chunks.push(value);
        }
      }
    }
    return chunks.join(' ');
  };
  const elementText = (element: Element): string =>
    ((element as HTMLElement).innerText || directText(element) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxTextLength);
  const roleFor = (element: Element): string => {
    const explicit = element.getAttribute('role');
    if (explicit) {
      return explicit;
    }
    const tag = element.tagName.toLowerCase();
    if (tag === 'a' && element.hasAttribute('href')) {
      return 'link';
    }
    if (tag === 'button') {
      return 'button';
    }
    if (tag === 'textarea') {
      return 'textbox';
    }
    if (tag === 'select') {
      return 'combobox';
    }
    if (tag === 'summary') {
      return 'button';
    }
    if (/^h[1-6]$/.test(tag)) {
      return 'heading';
    }
    if (tag === 'canvas') {
      return 'canvas';
    }
    if (tag === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') {
        return 'checkbox';
      }
      if (type === 'radio') {
        return 'radio';
      }
      if (type === 'range') {
        return 'slider';
      }
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return 'button';
      }
      return 'textbox';
    }
    return '';
  };
  const nameFor = (element: Element, text: string): string => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel.trim().slice(0, maxTextLength);
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (label) {
        return label.slice(0, maxTextLength);
      }
    }
    if (
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      element.labels?.length
    ) {
      const label = Array.from(element.labels)
        .map((entry) => entry.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (label) {
        return label.slice(0, maxTextLength);
      }
    }
    return (
      element.getAttribute('alt') ||
      element.getAttribute('title') ||
      element.getAttribute('placeholder') ||
      text
    ).slice(0, maxTextLength);
  };
  const stableSelectorFor = (element: Element): string | null => {
    const testId = element.getAttribute('data-testid');
    if (testId) {
      return `[data-testid="${escapeCss(testId)}"]`;
    }
    if (element.id) {
      return `#${escapeCss(element.id)}`;
    }
    const tag = element.tagName.toLowerCase();
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `${tag}[aria-label="${escapeCss(ariaLabel)}"]`;
    }
    if (element instanceof HTMLInputElement) {
      const typeAttribute = element.getAttribute('type');
      return typeAttribute
        ? `input[type="${escapeCss(typeAttribute)}"]`
        : 'input';
    }
    if (
      tag === 'button' ||
      tag === 'canvas' ||
      tag === 'select' ||
      tag === 'summary' ||
      tag === 'textarea'
    ) {
      return tag;
    }
    const explicitRole = element.getAttribute('role');
    return explicitRole ? `[role="${escapeCss(explicitRole)}"]` : null;
  };
  const candidateSelector = [
    'a[href]',
    'button',
    'canvas',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'input',
    'label',
    'output',
    'select',
    'summary',
    'textarea',
    '[contenteditable]',
    '[onclick]',
    '[role]',
    '[tabindex]',
  ].join(',');
  const candidates: Element[] = [];
  if (rootOnly || root.matches(candidateSelector)) {
    candidates.push(root);
  }
  const descendants = rootOnly ? [] : root.querySelectorAll(candidateSelector);
  for (const element of Array.from(descendants)) {
    if (candidates.length >= maxCandidates) {
      break;
    }
    candidates.push(element);
  }
  const elements: Array<{
    bounds: { height: number; width: number; x: number; y: number } | null;
    checked?: boolean;
    disabled: boolean;
    expanded?: boolean;
    focused: boolean;
    name: string;
    role: string;
    selected?: boolean;
    selector: string | null;
    tag: string;
    text: string;
    visible: boolean;
  }> = [];
  let truncated =
    !rootOnly &&
    descendants.length + (root.matches(candidateSelector) ? 1 : 0) >
      maxCandidates;
  for (const element of candidates) {
    if (elements.length >= maxNodes) {
      truncated = true;
      break;
    }
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      continue;
    }
    const role = roleFor(element);
    const tag = element.tagName.toLowerCase();
    const text = elementText(element);
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
    const disabled =
      element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true';
    const checkedValue =
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
        ? element.checked
        : element.getAttribute('aria-checked') === 'true'
          ? true
          : element.getAttribute('aria-checked') === 'false'
            ? false
            : undefined;
    const selectedValue =
      element instanceof HTMLOptionElement
        ? element.selected
        : element.getAttribute('aria-selected') === 'true'
          ? true
          : element.getAttribute('aria-selected') === 'false'
            ? false
            : undefined;
    const expandedValue =
      element.getAttribute('aria-expanded') === 'true'
        ? true
        : element.getAttribute('aria-expanded') === 'false'
          ? false
          : undefined;
    elements.push({
      bounds: visible
        ? {
            height: rect.height,
            width: rect.width,
            x: rect.x,
            y: rect.y,
          }
        : null,
      ...(checkedValue === undefined ? {} : { checked: checkedValue }),
      disabled,
      ...(expandedValue === undefined ? {} : { expanded: expandedValue }),
      focused: document.activeElement === element,
      name: nameFor(element, text),
      role,
      ...(selectedValue === undefined ? {} : { selected: selectedValue }),
      selector: stableSelectorFor(element),
      tag,
      text,
      visible,
    });
  }
  return {
    elements,
    truncated,
  };
}

function percentile(values: number[], percent: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function maxOrNull(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce(
        (maximum, value) => (value > maximum ? value : maximum),
        Number.NEGATIVE_INFINITY,
      );
}

export function summarizeFrameTimes(frameTimes: number[]): {
  droppedFrameCount: number;
  droppedFrameThresholdMs: number;
  max: number | null;
  p50: number | null;
  p95: number | null;
  sampleCount: number;
} {
  const droppedFrameThresholdMs = (1000 / 60) * 1.5;
  return {
    droppedFrameCount: frameTimes.filter(
      (frameTime) => frameTime > droppedFrameThresholdMs,
    ).length,
    droppedFrameThresholdMs,
    max: maxOrNull(frameTimes),
    p50: percentile(frameTimes, 50),
    p95: percentile(frameTimes, 95),
    sampleCount: frameTimes.length,
  };
}

export function readEnvironmentDescriptor(
  source: 'first' | 'largest' | 'renderer',
): {
  canvas: {
    backingHeight: number;
    backingWidth: number;
    cssHeight: number;
    cssWidth: number;
  } | null;
  canvasIndex: number | null;
  environment: BrowserEnvironmentDescriptor;
} {
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const canvas = (() => {
    if (source === 'renderer') {
      const rendererCanvas = (window as any).FRAMEWORK_MCP_RUNTIME?.world
        ?.renderer?.domElement;
      return rendererCanvas instanceof HTMLCanvasElement
        ? rendererCanvas
        : null;
    }
    if (source === 'largest') {
      return (
        canvases.reduce<HTMLCanvasElement | null>((largest, candidate) => {
          const candidateRect = candidate.getBoundingClientRect();
          const largestRect = largest?.getBoundingClientRect();
          return largest == null ||
            candidateRect.width * candidateRect.height >
              largestRect!.width * largestRect!.height
            ? candidate
            : largest;
        }, null) ?? null
      );
    }
    return canvases[0] ?? null;
  })();
  const gl = (canvas?.getContext('webgl2') ||
    canvas?.getContext('webgl') ||
    canvas?.getContext('experimental-webgl')) as
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null;
  const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
  const rect = canvas?.getBoundingClientRect();
  return {
    canvas:
      canvas == null || rect == null
        ? null
        : {
            backingHeight: canvas.height,
            backingWidth: canvas.width,
            cssHeight: rect.height,
            cssWidth: rect.width,
          },
    canvasIndex: canvas == null ? null : canvases.indexOf(canvas),
    environment: {
      devicePixelRatio: window.devicePixelRatio,
      gpuRenderer: debugInfo
        ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null,
      gpuVendor: debugInfo
        ? gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null,
      userAgent: navigator.userAgent,
    },
  };
}

export function assertBrowserEnvironmentDescriptor(
  value: unknown,
): asserts value is BrowserEnvironmentDescriptor {
  if (typeof value !== 'object' || value == null) {
    throw new Error('Browser environment descriptor is unavailable');
  }
  const descriptor = value as Record<string, unknown>;
  if (
    typeof descriptor.devicePixelRatio !== 'number' ||
    typeof descriptor.userAgent !== 'string' ||
    !(
      descriptor.gpuRenderer == null ||
      typeof descriptor.gpuRenderer === 'string'
    ) ||
    !(descriptor.gpuVendor == null || typeof descriptor.gpuVendor === 'string')
  ) {
    throw new Error('Browser environment descriptor is invalid');
  }
}

export function flattenRuntimeHierarchy(hierarchy: any): {
  entries: any[];
  runtimeHashes: string[];
} {
  const entries: any[] = [];
  const runtimeHashes = new Set<string>();
  const pending = [hierarchy];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry && typeof entry === 'object') {
      entries.push(entry);
      if (typeof entry.runtimeHash === 'string') {
        runtimeHashes.add(entry.runtimeHash);
      }
      if (Array.isArray(entry.children)) {
        pending.push(...entry.children);
      }
    }
  }
  return { entries, runtimeHashes: [...runtimeHashes].sort() };
}

export async function readRuntimeHierarchy(): Promise<any> {
  const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
  if (!runtime) {
    throw new Error('IWSDK app runtime bridge is unavailable');
  }
  return runtime.dispatch('get_scene_hierarchy', {
    maxChildren: 1000,
    maxDepth: 32,
  });
}

export async function readRuntimeRenderStats(): Promise<
  Record<string, unknown>
> {
  const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
  if (!runtime) {
    throw new Error('IWSDK app runtime bridge is unavailable');
  }
  return runtime.handles?.('get_render_stats')
    ? runtime.dispatch('get_render_stats', {})
    : {
        available: false,
        reason: 'runtime render-statistics bridge is unavailable',
      };
}

export async function sampleRuntimeFrameTimes({
  sampleFrames,
  warmupFrames,
}: {
  sampleFrames: number;
  warmupFrames: number;
}): Promise<number[]> {
  const waitFrame = () =>
    new Promise<number>((resolve) => requestAnimationFrame(resolve));
  for (let index = 0; index < warmupFrames; index += 1) {
    await waitFrame();
  }
  const frameTimes: number[] = [];
  let previous = await waitFrame();
  for (let index = 0; index < sampleFrames; index += 1) {
    const current = await waitFrame();
    frameTimes.push(current - previous);
    previous = current;
  }
  return frameTimes;
}

export async function readRuntimeNodes(
  requests: Array<{ entry: any | null; nodeId: string }>,
): Promise<
  Array<{
    components: unknown;
    hierarchy: any | null;
    nodeId: string;
    transform: unknown;
  }>
> {
  const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
  if (!runtime) {
    throw new Error('IWSDK app runtime bridge is unavailable');
  }
  const nodes = [];
  for (const { entry, nodeId } of requests) {
    if (entry == null) {
      nodes.push({
        components: null,
        hierarchy: null,
        nodeId,
        transform: null,
      });
      continue;
    }
    const transform = await runtime.dispatch('get_object_transform', {
      nodeId,
    });
    const components =
      typeof entry.entityIndex === 'number' &&
      runtime.handles?.('ecs_query_entity')
        ? await runtime.dispatch('ecs_query_entity', {
            entityIndex: entry.entityIndex,
          })
        : null;
    nodes.push({ components, hierarchy: entry, nodeId, transform });
  }
  return nodes;
}

export function readCameraFramingSnapshot(renderStats: any): {
  camera: RuntimeCameraSnapshot | null;
  framing: RuntimeFramingSnapshot | null;
} {
  const world = (window as any).FRAMEWORK_MCP_RUNTIME?.world;
  const camera = world?.camera;
  let cameraSnapshot: RuntimeCameraSnapshot | null = null;
  let framingSnapshot: RuntimeFramingSnapshot | null = null;
  if (camera) {
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix?.();
    const position = camera.position.clone();
    camera.getWorldPosition(position);
    const direction = camera.position.clone();
    camera.getWorldDirection(direction);
    cameraSnapshot = {
      aspect:
        typeof camera.aspect === 'number' && Number.isFinite(camera.aspect)
          ? camera.aspect
          : null,
      direction: direction.toArray(),
      far:
        typeof camera.far === 'number' && Number.isFinite(camera.far)
          ? camera.far
          : null,
      fov:
        camera.isPerspectiveCamera === true && typeof camera.fov === 'number'
          ? camera.fov
          : null,
      height:
        camera.isOrthographicCamera === true &&
        typeof camera.top === 'number' &&
        typeof camera.bottom === 'number'
          ? (camera.top - camera.bottom) / (camera.zoom || 1)
          : null,
      near:
        typeof camera.near === 'number' && Number.isFinite(camera.near)
          ? camera.near
          : null,
      position: position.toArray(),
      projection:
        camera.isPerspectiveCamera === true
          ? 'perspective'
          : camera.isOrthographicCamera === true
            ? 'orthographic'
            : 'unknown',
    };

    const bounds = renderStats?.framingBounds;
    if (
      bounds &&
      Array.isArray(bounds.min) &&
      Array.isArray(bounds.max) &&
      bounds.min.length === 3 &&
      bounds.max.length === 3
    ) {
      const corners = [];
      let inFrontCornerCount = 0;
      for (const x of [bounds.min[0], bounds.max[0]]) {
        for (const y of [bounds.min[1], bounds.max[1]]) {
          for (const z of [bounds.min[2], bounds.max[2]]) {
            const worldPoint = camera.position.clone().set(x, y, z);
            const viewPoint = worldPoint
              .clone()
              .applyMatrix4(camera.matrixWorldInverse);
            if (viewPoint.z < 0) {
              inFrontCornerCount += 1;
              corners.push(worldPoint.project(camera));
            }
          }
        }
      }
      const centerWorld = camera.position
        .clone()
        .set(
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2,
        );
      const centerView = centerWorld
        .clone()
        .applyMatrix4(camera.matrixWorldInverse);
      const centerNdc = centerWorld.clone().project(camera).toArray();
      if (corners.length > 0) {
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const clippedWidth = Math.max(
          0,
          Math.min(1, maxX) - Math.max(-1, minX),
        );
        const clippedHeight = Math.max(
          0,
          Math.min(1, maxY) - Math.max(-1, minY),
        );
        framingSnapshot = {
          boundsAvailable: true,
          centerNdc:
            centerView.z < 0
              ? [centerNdc[0], centerNdc[1], centerNdc[2]]
              : null,
          fullyInsideViewport:
            minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
          inFrontCornerCount,
          projectedBounds: {
            max: [maxX, maxY],
            min: [minX, minY],
          },
          viewportCoverage:
            (Math.max(0, maxX - minX) * Math.max(0, maxY - minY)) / 4,
          viewportOverlap: (clippedWidth * clippedHeight) / 4,
        };
      } else {
        framingSnapshot = {
          boundsAvailable: true,
          centerNdc: null,
          fullyInsideViewport: false,
          inFrontCornerCount,
          projectedBounds: null,
          viewportCoverage: 0,
          viewportOverlap: 0,
        };
      }
    } else {
      framingSnapshot = {
        boundsAvailable: false,
        centerNdc: null,
        fullyInsideViewport: false,
        inFrontCornerCount: 0,
        projectedBounds: null,
        viewportCoverage: 0,
        viewportOverlap: 0,
      };
    }
  }
  return { camera: cameraSnapshot, framing: framingSnapshot };
}
