/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import type { Frame, Locator, Page } from 'playwright';
import sharp from 'sharp';
import {
  applicationIdentityChanged,
  DEFAULT_BROWSER_OPERATION_TIMEOUT_MS,
  getApplicationMetadata,
  getApplicationState,
  resolveApplicationFrame,
  withRuntimeView,
  type BrowserApplicationMetadata,
} from './application-surface.js';
import { errorMessage, parseUrl } from './internals.js';
import { describeElements, readApplicationIdentity } from './page-probes.js';

const MAX_SNAPSHOT_RECIPES = 2_000;

const MAX_SNAPSHOT_BYTES = 256 * 1024;

const MAX_SNAPSHOT_CANDIDATES = 4_000;

export const MAX_BROWSER_INTERACTION_TIMEOUT_MS = 12_000;

export interface BrowserScreenshotOptions {
  format?: 'jpeg' | 'png';
  fullPage?: boolean;
  quality?: number;
  ref?: string;
}

export interface BrowserSnapshotRequest {
  maxNodes?: number;
  maxTextLength?: number;
  rootRef?: string;
}

export interface BrowserSnapshotElement {
  bounds: { height: number; width: number; x: number; y: number } | null;
  checked?: boolean;
  disabled: boolean;
  expanded?: boolean;
  focused: boolean;
  name: string;
  ref: string;
  role: string;
  selected?: boolean;
  tag: string;
  text: string;
  visible: boolean;
}

export interface BrowserSnapshotResult {
  application: BrowserApplicationMetadata;
  elements: BrowserSnapshotElement[];
  snapshotId: string;
  truncated: boolean;
}

export interface BrowserSemanticLocator {
  name?: string;
  role?: string;
  testId?: string;
  text?: string;
}

export interface BrowserInteractionPoint {
  canvasRef?: string;
  x: number;
  y: number;
}

export interface BrowserInteractionStep {
  action: string;
  button?: 'left' | 'middle' | 'right';
  deltaX?: number;
  deltaY?: number;
  key?: string;
  loadState?: 'domcontentloaded' | 'load' | 'networkidle';
  locator?: BrowserSemanticLocator;
  path?: string;
  point?: BrowserInteractionPoint;
  ref?: string;
  state?:
    | 'attached'
    | 'checked'
    | 'detached'
    | 'disabled'
    | 'editable'
    | 'enabled'
    | 'focused'
    | 'hidden'
    | 'unchecked'
    | 'visible';
  targetLocator?: BrowserSemanticLocator;
  targetPoint?: BrowserInteractionPoint;
  targetRef?: string;
  text?: string;
  timeoutMs?: number;
  value?: string;
  values?: string[];
}

export interface BrowserInteractionRequest {
  steps: BrowserInteractionStep[];
  timeoutMs?: number;
}

export interface BrowserInteractionStepResult {
  action: string;
  durationMs: number;
  index: number;
}

export interface BrowserInteractionResult {
  application: BrowserApplicationMetadata;
  completed: BrowserInteractionStepResult[];
  failure?: {
    action: string;
    index: number;
    message: string;
    recovery: string;
    retryable: boolean;
    screenshot: { imageData: string; mimeType: 'image/png' } | null;
    snapshot: BrowserSnapshotResult | null;
  };
  success: boolean;
}

export interface BrowserScreenshotCapture {
  bytes: Buffer;
  metadata: BrowserApplicationMetadata & {
    downscaled: boolean;
    height: number;
    mimeType: 'image/jpeg' | 'image/png';
    width: number;
  };
}

interface BrowserSnapshotRecipe {
  applicationId: string | null;
  documentTimeOrigin: number;
  fingerprint: { name: string; role: string; tag: string };
  generation: number | null;
  frameOrigin: string;
  maxTextLength: number;
  selector: string | null;
  snapshotId: string;
}

interface InteractionProfiler {
  readonly activeDeadline: number | null;
  markInteractionStep(
    frame: Frame,
    index: number,
    action: string,
  ): Promise<void>;
}

interface ManagedInteractionSurfaceOptions {
  getRemainingOperationTimeMs(
    operation: string,
    maximumMs?: number,
    exhausted?: 'throw' | 'zero',
  ): number;
  onRestoreError(operation: string, error: unknown): void;
  page: Page;
  profiler: InteractionProfiler;
  screenshotSize: { width: number; height: number };
}

/** Owns snapshot references and every operation that can consume them. */
export class ManagedInteractionSurface {
  private readonly snapshotRecipes = new Map<string, BrowserSnapshotRecipe>();

  constructor(private readonly options: ManagedInteractionSurfaceOptions) {}

  captureRuntimeScreenshot(
    options: BrowserScreenshotOptions = {},
  ): Promise<BrowserScreenshotCapture> {
    return withRuntimeView(
      this.options.page,
      () =>
        this.captureApplicationImage(
          options,
          this.options.getRemainingOperationTimeMs('browser_screenshot'),
        ),
      (error) => this.options.onRestoreError('browser_screenshot', error),
    );
  }

  snapshotApplication(
    request: BrowserSnapshotRequest = {},
  ): Promise<BrowserSnapshotResult> {
    return collectApplicationSnapshot(
      this.options.page,
      this.snapshotRecipes,
      request,
      this.options.getRemainingOperationTimeMs('browser_snapshot'),
    );
  }

  async interactApplication(
    request: BrowserInteractionRequest,
  ): Promise<BrowserInteractionResult> {
    if (!Array.isArray(request.steps) || request.steps.length === 0) {
      throw new Error('browser_interact requires at least one step');
    }
    if (request.steps.length > 10) {
      throw new Error('browser_interact accepts at most 10 steps');
    }
    return withRuntimeView(
      this.options.page,
      () => this.runInteractionBatch(request),
      (error) => this.options.onRestoreError('browser_interact', error),
    );
  }

  private async captureApplicationImage(
    options: BrowserScreenshotOptions,
    timeoutMs: number,
  ): Promise<BrowserScreenshotCapture> {
    const { page, screenshotSize } = this.options;
    const frame = await resolveApplicationFrame(page);
    const format = options.format ?? 'png';
    const quality = Math.min(100, Math.max(20, options.quality ?? 90));
    const screenshotOptions =
      format === 'jpeg'
        ? ({ quality, timeout: timeoutMs, type: 'jpeg' } as const)
        : ({ timeout: timeoutMs, type: 'png' } as const);
    let raw: Buffer;
    if (options.ref) {
      const locator = await resolveRefLocator(
        frame,
        this.snapshotRecipes,
        options.ref,
      );
      raw = Buffer.from(await locator.screenshot(screenshotOptions));
    } else if (frame !== page.mainFrame()) {
      if (options.fullPage) {
        raw = Buffer.from(
          await frame.locator('html').screenshot(screenshotOptions),
        );
      } else {
        const frameElement = await frame.frameElement();
        raw = Buffer.from(await frameElement.screenshot(screenshotOptions));
      }
    } else {
      raw = Buffer.from(
        await page.screenshot({
          ...screenshotOptions,
          fullPage: options.fullPage ?? false,
        }),
      );
    }

    const rawMetadata = await sharp(raw).metadata();
    const downscaled =
      (rawMetadata.width ?? 0) > screenshotSize.width ||
      (rawMetadata.height ?? 0) > screenshotSize.height;
    const bytes = downscaled
      ? await (() => {
          const resized = sharp(raw).resize(
            screenshotSize.width,
            screenshotSize.height,
            {
              fit: 'inside',
              withoutEnlargement: true,
            },
          );
          return format === 'jpeg'
            ? resized.jpeg({ quality }).toBuffer()
            : resized.png().toBuffer();
        })()
      : raw;
    const imageMetadata = downscaled
      ? await sharp(bytes).metadata()
      : rawMetadata;
    return {
      bytes,
      metadata: {
        ...(await getApplicationMetadata(page)),
        downscaled,
        height: imageMetadata.height ?? 0,
        mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        width: imageMetadata.width ?? 0,
      },
    };
  }

  private async runInteractionBatch(
    request: BrowserInteractionRequest,
  ): Promise<BrowserInteractionResult> {
    const { getRemainingOperationTimeMs, page, profiler } = this.options;
    const completed: BrowserInteractionStepResult[] = [];
    const frame = await resolveApplicationFrame(page);
    const initialState = await getApplicationState(page, frame);
    const buildFailure = async (
      error: unknown,
      index: number,
      action: BrowserInteractionStep['action'],
    ): Promise<BrowserInteractionResult> => {
      const message = errorMessage(error);
      const retryable = isRetryableInteractionError(error);
      const nextEvidenceTimeout = () =>
        getRemainingOperationTimeMs(
          'browser_interact failure evidence',
          2_000,
          'zero',
        );
      const snapshotTimeoutMs = nextEvidenceTimeout();
      const snapshot =
        snapshotTimeoutMs < 100
          ? null
          : await collectApplicationSnapshot(
              page,
              this.snapshotRecipes,
              { maxNodes: 100 },
              snapshotTimeoutMs,
            ).catch(() => null);
      const screenshotTimeoutMs = nextEvidenceTimeout();
      const screenshot =
        screenshotTimeoutMs < 100
          ? null
          : await this.captureApplicationImage(
              { format: 'png' },
              screenshotTimeoutMs,
            )
              .then((capture) => ({
                imageData: capture.bytes.toString('base64'),
                mimeType: 'image/png' as const,
              }))
              .catch(() => null);
      return {
        application: initialState.application,
        completed,
        failure: {
          action,
          index,
          message,
          recovery: retryable
            ? 'Capture a fresh browser_snapshot and retry the failed step.'
            : 'Correct the failed action parameters or application state before retrying.',
          retryable,
          screenshot,
          snapshot,
        },
        success: false,
      };
    };
    const remainingInteractionTimeMs = getRemainingOperationTimeMs(
      'browser_interact',
      MAX_BROWSER_INTERACTION_TIMEOUT_MS,
      'zero',
    );
    if (remainingInteractionTimeMs < 100) {
      return buildFailure(
        Object.assign(
          new Error(
            'browser_interact ran out of active command time before it could continue',
          ),
          { retryable: true },
        ),
        0,
        request.steps[0]!.action,
      );
    }
    const batchTimeoutMs = Math.min(
      MAX_BROWSER_INTERACTION_TIMEOUT_MS,
      Math.max(100, request.timeoutMs ?? 10_000),
      remainingInteractionTimeMs,
    );
    const batchDeadline = Date.now() + batchTimeoutMs;
    for (const [index, step] of request.steps.entries()) {
      const startedAt = Date.now();
      try {
        const profileDeadline = profiler.activeDeadline;
        const remainingBatchTimeoutMs = Math.min(
          batchDeadline - startedAt,
          getRemainingOperationTimeMs(
            'browser_interact',
            Number.POSITIVE_INFINITY,
            'zero',
          ),
          profileDeadline == null
            ? Number.POSITIVE_INFINITY
            : profileDeadline - startedAt,
        );
        if (remainingBatchTimeoutMs < 100) {
          throw new Error(
            `browser_interact batch timed out after ${batchTimeoutMs}ms`,
          );
        }
        await profiler.markInteractionStep(frame, index, step.action);
        await executeInteractionStep(
          page,
          frame,
          this.snapshotRecipes,
          step,
          remainingBatchTimeoutMs,
        );
        const currentFrame = await resolveApplicationFrame(page);
        const currentState = await getApplicationState(page, currentFrame);
        if (
          applicationIdentityChanged(
            {
              documentTimeOrigin: initialState.documentTimeOrigin,
              generation: initialState.application.generation,
              id: initialState.application.id,
            },
            {
              documentTimeOrigin: currentState.documentTimeOrigin,
              generation: currentState.application.generation,
              id: currentState.application.id,
            },
          )
        ) {
          throw Object.assign(
            new Error(
              'The current application reloaded or changed while browser_interact was running',
            ),
            { retryable: true },
          );
        }
        completed.push({
          action: step.action,
          durationMs: Date.now() - startedAt,
          index,
        });
      } catch (error) {
        return buildFailure(error, index, step.action);
      }
    }
    return {
      application: await getApplicationMetadata(page).catch(
        () => initialState.application,
      ),
      completed,
      success: true,
    };
  }
}

async function collectApplicationSnapshot(
  page: Page,
  recipes: Map<string, BrowserSnapshotRecipe>,
  request: BrowserSnapshotRequest = {},
  timeoutMs = DEFAULT_BROWSER_OPERATION_TIMEOUT_MS,
): Promise<BrowserSnapshotResult> {
  const frame = await resolveApplicationFrame(page);
  const state = await getApplicationState(page, frame);
  const application = state.application;
  const frameOrigin = new URL(frame.url()).origin;
  const documentTimeOrigin = state.documentTimeOrigin;
  const maxNodes = Math.min(1000, Math.max(1, request.maxNodes ?? 200));
  const maxTextLength = Math.min(
    1000,
    Math.max(16, request.maxTextLength ?? 200),
  );
  const rootLocator =
    request.rootRef == null
      ? frame.locator('body')
      : await resolveRefLocator(frame, recipes, request.rootRef);
  // Locator/ElementHandle evaluation has no independent execution timeout.
  // Bound the asynchronous locator-resolution phase explicitly; the
  // evaluation below is synchronous and its DOM traversal is candidate-capped.
  await rootLocator.waitFor({ state: 'attached', timeout: timeoutMs });
  const snapshotId = randomUUID();
  const raw = await rootLocator.evaluate(describeElements, {
    maxCandidates: Math.min(
      MAX_SNAPSHOT_CANDIDATES,
      Math.max(maxNodes, maxNodes * 4),
    ),
    maxNodes,
    maxTextLength,
  });
  const elements: BrowserSnapshotElement[] = [];
  let serializedElementBytes = 0;
  for (const entry of raw.elements) {
    const ref = `s${snapshotId.slice(0, 8)}e${elements.length + 1}`;
    const { selector: _selector, ...elementWithoutSelector } = entry;
    const element = { ...elementWithoutSelector, ref };
    const elementBytes = Buffer.byteLength(JSON.stringify(element), 'utf8');
    if (serializedElementBytes + elementBytes > MAX_SNAPSHOT_BYTES - 8 * 1024) {
      break;
    }
    recipes.set(ref, {
      applicationId: application.id,
      documentTimeOrigin,
      fingerprint: { name: entry.name, role: entry.role, tag: entry.tag },
      generation: application.generation,
      frameOrigin,
      maxTextLength,
      selector: entry.selector,
      snapshotId,
    });
    elements.push(element);
    serializedElementBytes += elementBytes;
  }
  while (recipes.size > MAX_SNAPSHOT_RECIPES) {
    const oldestRef = recipes.keys().next().value;
    if (oldestRef == null) {
      break;
    }
    recipes.delete(oldestRef);
  }
  return {
    application,
    elements,
    snapshotId,
    truncated: raw.truncated || elements.length < raw.elements.length,
  };
}

function semanticLocator(frame: Frame, value: BrowserSemanticLocator): Locator {
  if (value.testId) {
    return frame.getByTestId(value.testId);
  }
  if (value.role) {
    return frame.getByRole(value.role as never, {
      ...(value.name == null ? {} : { name: value.name }),
    });
  }
  if (value.text) {
    return frame.getByText(value.text, { exact: true });
  }
  throw new Error('Interaction locator requires testId, role, or text');
}

async function resolveRefLocator(
  frame: Frame,
  recipes: Map<string, BrowserSnapshotRecipe>,
  ref: string,
): Promise<Locator> {
  const recipe = recipes.get(ref);
  const currentIdentity = await frame
    .evaluate(readApplicationIdentity)
    .catch(() => ({
      documentTimeOrigin: Number.NaN,
      generation: null,
      id: null,
    }));
  const frameOrigin = parseUrl(frame.url())?.origin ?? '';
  if (
    recipe == null ||
    recipe.frameOrigin !== frameOrigin ||
    applicationIdentityChanged(
      {
        documentTimeOrigin: recipe.documentTimeOrigin,
        generation: recipe.generation,
        id: recipe.applicationId,
      },
      currentIdentity,
    )
  ) {
    throw Object.assign(new Error(`Unknown or stale browser ref: ${ref}`), {
      retryable: true,
    });
  }
  const candidates: Locator[] = [];
  if (recipe.selector != null) {
    candidates.push(frame.locator(recipe.selector));
  }
  if (recipe.fingerprint.role) {
    candidates.push(
      frame.getByRole(recipe.fingerprint.role as never, {
        ...(recipe.fingerprint.name ? { name: recipe.fingerprint.name } : {}),
      }),
    );
  }
  if (recipe.fingerprint.name) {
    candidates.push(frame.getByText(recipe.fingerprint.name, { exact: true }));
  }
  if (candidates.length === 0) {
    throw Object.assign(
      new Error(`Browser ref ${ref} has no stable locator recipe`),
      { retryable: true },
    );
  }
  let locator = candidates[0]!;
  let count = await locator.count();
  for (const candidate of candidates.slice(1)) {
    if (count === 1) {
      break;
    }
    const candidateCount = await candidate.count();
    if (candidateCount === 1) {
      locator = candidate;
      count = candidateCount;
      break;
    }
    count = candidateCount;
  }
  if (count !== 1) {
    throw Object.assign(
      new Error(`Browser ref ${ref} resolved to ${count} elements`),
      { retryable: true },
    );
  }
  const [fingerprint] = (
    await locator.evaluate(describeElements, {
      maxCandidates: 1,
      maxNodes: 1,
      maxTextLength: recipe.maxTextLength,
      rootOnly: true,
    })
  ).elements;
  if (
    fingerprint == null ||
    fingerprint.tag !== recipe.fingerprint.tag ||
    fingerprint.role !== recipe.fingerprint.role ||
    (recipe.fingerprint.name && fingerprint.name !== recipe.fingerprint.name)
  ) {
    throw Object.assign(
      new Error(`Browser ref ${ref} no longer matches its snapshot element`),
      { retryable: true },
    );
  }
  recipes.delete(ref);
  recipes.set(ref, recipe);
  return locator;
}

async function resolveStepLocator(
  frame: Frame,
  recipes: Map<string, BrowserSnapshotRecipe>,
  step: BrowserInteractionStep,
  target = false,
): Promise<Locator> {
  const ref = target ? step.targetRef : step.ref;
  const locator = target ? step.targetLocator : step.locator;
  if (ref) {
    return resolveRefLocator(frame, recipes, ref);
  }
  if (locator) {
    return semanticLocator(frame, locator);
  }
  throw new Error(`${step.action} requires a ref or semantic locator`);
}

async function resolvePagePoint(
  page: Page,
  frame: Frame,
  recipes: Map<string, BrowserSnapshotRecipe>,
  point: BrowserInteractionPoint,
): Promise<{ x: number; y: number }> {
  let x = point.x;
  let y = point.y;
  if (point.canvasRef) {
    const canvas = await resolveRefLocator(frame, recipes, point.canvasRef);
    const box = await canvas.boundingBox();
    if (box == null) {
      throw Object.assign(
        new Error(`Canvas ref ${point.canvasRef} is not visible`),
        { retryable: true },
      );
    }
    return { x: box.x + x, y: box.y + y };
  }
  if (frame !== page.mainFrame()) {
    const frameBox = await (await frame.frameElement()).boundingBox();
    if (frameBox == null) {
      throw new Error('Application frame is not visible');
    }
    x += frameBox.x;
    y += frameBox.y;
  }
  return { x, y };
}

async function waitForLocatorState(
  page: Page,
  locator: Locator,
  state: NonNullable<BrowserInteractionStep['state']>,
  timeout: number,
): Promise<void> {
  if (
    state === 'attached' ||
    state === 'detached' ||
    state === 'hidden' ||
    state === 'visible'
  ) {
    await locator.waitFor({ state, timeout });
    return;
  }
  const predicate: () => Promise<boolean> = {
    checked: () => locator.isChecked().catch(() => false),
    disabled: () => locator.isDisabled().catch(() => false),
    editable: () => locator.isEditable().catch(() => false),
    enabled: () => locator.isEnabled().catch(() => false),
    focused: () =>
      locator
        .evaluate((element) => document.activeElement === element)
        .catch(() => false),
    unchecked: () =>
      locator
        .isChecked()
        .then((value) => !value)
        .catch(() => false),
  }[state];
  const deadline = Date.now() + timeout;
  while (Date.now() <= deadline) {
    if (await predicate()) {
      return;
    }
    await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${state} state`);
}

async function executeInteractionStep(
  page: Page,
  frame: Frame,
  recipes: Map<string, BrowserSnapshotRecipe>,
  step: BrowserInteractionStep,
  remainingBatchTimeoutMs: number,
): Promise<void> {
  const timeout = Math.min(
    MAX_BROWSER_INTERACTION_TIMEOUT_MS,
    Math.max(
      100,
      Math.min(
        step.timeoutMs ?? remainingBatchTimeoutMs,
        remainingBatchTimeoutMs,
      ),
    ),
  );
  const button = step.button ?? 'left';
  let stepLocator: Locator | null = null;
  const locator = async () =>
    (stepLocator ??= await resolveStepLocator(frame, recipes, step));
  switch (step.action) {
    case 'click':
    case 'doubleClick':
    case 'hover': {
      if (step.point) {
        const point = await resolvePagePoint(page, frame, recipes, step.point);
        if (step.action === 'hover') {
          await page.mouse.move(point.x, point.y);
        } else {
          await page.mouse.click(point.x, point.y, {
            button,
            clickCount: step.action === 'doubleClick' ? 2 : 1,
          });
        }
        return;
      }
      const resolved = await locator();
      if (step.action === 'hover') {
        await resolved.hover({ timeout });
      } else if (step.action === 'doubleClick') {
        await resolved.dblclick({ button, timeout });
      } else {
        await resolved.click({ button, timeout });
      }
      return;
    }
    case 'pointerMove': {
      if (!step.point) {
        throw new Error('pointerMove requires point');
      }
      const point = await resolvePagePoint(page, frame, recipes, step.point);
      await page.mouse.move(point.x, point.y);
      return;
    }
    case 'pointerDown':
      await page.mouse.down({ button });
      return;
    case 'pointerUp':
      await page.mouse.up({ button });
      return;
    case 'wheel':
      await page.mouse.wheel(step.deltaX ?? 0, step.deltaY ?? 0);
      return;
    case 'fill': {
      if (step.value == null) {
        throw new Error('fill requires value');
      }
      await (
        await locator()
      ).fill(step.value, {
        timeout,
      });
      return;
    }
    case 'type': {
      if (step.value == null) {
        throw new Error('type requires value');
      }
      await (await locator()).pressSequentially(step.value, { timeout });
      return;
    }
    case 'clear':
      await (await locator()).clear({ timeout });
      return;
    case 'press': {
      if (!step.key) {
        throw new Error('press requires key');
      }
      if (step.ref || step.locator) {
        await (
          await locator()
        ).press(step.key, {
          timeout,
        });
      } else {
        await page.keyboard.press(step.key);
      }
      return;
    }
    case 'check':
      await (await locator()).check({ timeout });
      return;
    case 'uncheck':
      await (await locator()).uncheck({ timeout });
      return;
    case 'select': {
      const values = step.values ?? (step.value == null ? [] : [step.value]);
      if (values.length === 0) {
        throw new Error('select requires value or values');
      }
      await (
        await locator()
      ).selectOption(values, {
        timeout,
      });
      return;
    }
    case 'scroll': {
      if (step.ref || step.locator) {
        await (await locator()).hover({ timeout });
      } else if (step.point) {
        const point = await resolvePagePoint(page, frame, recipes, step.point);
        await page.mouse.move(point.x, point.y);
      }
      await page.mouse.wheel(step.deltaX ?? 0, step.deltaY ?? 0);
      return;
    }
    case 'drag': {
      if (step.point && step.targetPoint) {
        const from = await resolvePagePoint(page, frame, recipes, step.point);
        const to = await resolvePagePoint(
          page,
          frame,
          recipes,
          step.targetPoint,
        );
        await page.mouse.move(from.x, from.y);
        await page.mouse.down({ button });
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await page.mouse.up({ button });
        return;
      }
      const source = await locator();
      const target = await resolveStepLocator(frame, recipes, step, true);
      await source.dragTo(target, { timeout });
      return;
    }
    case 'wait': {
      if (step.state) {
        await waitForLocatorState(page, await locator(), step.state, timeout);
        return;
      }
      if (step.text != null) {
        await frame.getByText(step.text, { exact: false }).first().waitFor({
          state: 'visible',
          timeout,
        });
        return;
      }
      if (step.path != null) {
        await frame.waitForFunction(
          (expectedPath) =>
            `${window.location.pathname}${window.location.search}${window.location.hash}` ===
            expectedPath,
          step.path,
          { timeout },
        );
        return;
      }
      await frame.waitForLoadState(step.loadState ?? 'domcontentloaded', {
        timeout,
      });
      return;
    }
    default:
      throw new Error(`Unsupported browser interaction action: ${step.action}`);
  }
}

export function isRetryableInteractionError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error != null &&
    'retryable' in error &&
    error.retryable === true
  ) {
    return true;
  }
  const message = errorMessage(error);
  return /timeout|timed out|not visible|not stable|detached|intercepts pointer|outside of the viewport/i.test(
    message,
  );
}
