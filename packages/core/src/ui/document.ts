/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component } from '@pmndrs/uikit';
import { signal, Signal } from '@preact/signals-core';
import { Group, Object3D } from 'three';

/**
 * Lightweight DOM-like wrapper around a UIKit root `Component` that lives in the 3D scene.
 *
 * @remarks
 * - Provides query helpers (`getElementById`, `getElementsByClassName`, `querySelector(All)`).
 * - Maintains reactive target dimensions via {@link targetWidth}/{@link targetHeight} and
 *   scales the group to fit while preserving aspect ratio.
 * - Intended to be attached to an entity's `object3D` in world space or to the `camera` for
 *   screen‑space UI. Use together with {@link PanelUISystem} and {@link ScreenSpaceUISystem}.
 *
 * @category UI
 */
export class UIKitDocument extends Group {
  private elementMap = new Map<string, Component<any>>();
  private classMap = new Map<string, Component<any>[]>();
  private _rootElement: Component<any>;
  private _abortController = new AbortController();

  /** Reactive target width in meters. Set via {@link setTargetDimensions}. */
  readonly targetWidth: Signal<number> = signal(0);
  /** Reactive target height in meters. Set via {@link setTargetDimensions}. */
  readonly targetHeight: Signal<number> = signal(0);

  /**
   * Create a document backed by a UIKit root component.
   * @param rootComponent The root `Component` produced by `@pmndrs/uikitml` `interpret()`.
   */
  constructor(rootComponent: Component<any>) {
    super();

    this._rootElement = rootComponent;
    this.add(this._rootElement);
    this.indexElements(rootComponent);

    this.setupReactiveResizing();
  }

  /**
   * Return the first element with a matching `id` (UIKit property).
   * @param id The element identifier without the `#` prefix.
   */
  getElementById(id: string): Component<any> | null {
    return this.elementMap.get(id) || null;
  }

  /**
   * Return all elements that include `className` in their class list.
   * @param className The class without the preceding dot.
   */
  getElementsByClassName(className: string): Component<any>[] {
    return this.classMap.get(className) || [];
  }

  /**
   * Return the first element matching a simple CSS‑like selector.
   *
   * @remarks
   * Supported selectors:
   * - `#id`
   * - `.class`
   * - Descendant combinations, e.g. `#parent .child`
   */
  querySelector(selector: string): Component<any> | null {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Return all elements matching a simple CSS‑like selector. See {@link querySelector}.
   */
  querySelectorAll(selector: string): Component<any>[] {
    // Handle descendant selectors (e.g., "#parent .child")
    if (selector.includes(' ')) {
      return this.parseDescendantSelector(selector);
    }

    // Handle simple selectors
    if (selector.startsWith('#')) {
      const element = this.getElementById(selector.substring(1));
      return element ? [element] : [];
    }
    if (selector.startsWith('.')) {
      return this.getElementsByClassName(selector.substring(1));
    }

    return [];
  }

  /** Parse descendant selectors like `#parent .child`. */
  private parseDescendantSelector(selector: string): Component<any>[] {
    const parts = selector.trim().split(/\s+/);
    if (parts.length < 2) {
      return [];
    }

    // Start with elements matching the first selector
    let currentElements = this.querySelectorAll(parts[0]);

    // For each subsequent selector part, find descendants
    for (let i = 1; i < parts.length; i++) {
      const nextSelector = parts[i];
      const descendants: Component<any>[] = [];

      for (const parent of currentElements) {
        const childMatches = this.findDescendants(parent, nextSelector);
        descendants.push(...childMatches);
      }

      currentElements = descendants;
      if (currentElements.length === 0) {
        break;
      }
    }

    return currentElements;
  }

  /** Find all descendants of a parent that match a selector. */
  private findDescendants(
    parent: Component<any>,
    selector: string,
  ): Component<any>[] {
    const results: Component<any>[] = [];
    this.searchDescendants(parent, selector, results);
    return results;
  }

  /** Recursively search for descendants matching a selector. */
  private searchDescendants(
    parent: Object3D,
    selector: string,
    results: Component<any>[],
  ): void {
    for (const child of parent.children) {
      if (child instanceof Component) {
        if (this.matchesSelector(child as Component<any>, selector)) {
          results.push(child as any);
        }
      }
      // Continue searching in children regardless of whether current child matched
      this.searchDescendants(child, selector, results);
    }
  }

  /** Check if a component matches a simple selector (`#id` or `.class`). */
  private matchesSelector(
    component: Component<any>,
    selector: string,
  ): boolean {
    if (selector.startsWith('#')) {
      const id = component.properties?.signal?.id?.value;
      return id === selector.substring(1);
    }

    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      const classList = component.classList
        ? ((component.classList as any).list?.filter(
            (c: any) => typeof c === 'string',
          ) as string[]) || []
        : [];
      return classList.includes(className);
    }

    return false;
  }

  /**
   * Check if `element` is a descendant of `ancestor`.
   * @returns `true` if `ancestor` appears in the parent chain of `element`.
   */
  isDescendantOf(element: Component<any>, ancestor: Component<any>): boolean {
    let current = element.parent;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** Convenience for `querySelectorAll("${parent} ${child}")`. */
  querySelectorAllWithin(
    parentSelector: string,
    childSelector: string,
  ): Component<any>[] {
    return this.querySelectorAll(`${parentSelector} ${childSelector}`);
  }
  /** Convenience for the first match of `querySelectorAllWithin`. */
  querySelectorWithin(
    parentSelector: string,
    childSelector: string,
  ): Component<any> | null {
    return this.querySelector(`${parentSelector} ${childSelector}`);
  }
  /** Set up reactivity that rescales the group when size or target changes. */
  private setupReactiveResizing(): void {
    const abortSignal = this._abortController.signal;

    // React to changes in target dimensions or root component size to apply scaling
    const targetWidthUnsubscribe = this.targetWidth.subscribe(() =>
      this.updateScaling(),
    );
    const targetHeightUnsubscribe = this.targetHeight.subscribe(() =>
      this.updateScaling(),
    );
    const sizeUnsubscribe = this._rootElement.size?.subscribe(() =>
      this.updateScaling(),
    );

    abortSignal.addEventListener('abort', () => {
      targetWidthUnsubscribe();
      targetHeightUnsubscribe();
      sizeUnsubscribe?.();
    });
  }

  /** Compute uniform scale to fit the target width/height while preserving aspect ratio. */
  private updateScaling(): void {
    const targetWorldWidth = this.targetWidth.value;
    const targetWorldHeight = this.targetHeight.value;
    const uiNaturalSize = this._rootElement.size?.value;

    if (
      targetWorldWidth > 0 &&
      targetWorldHeight > 0 &&
      uiNaturalSize &&
      Array.isArray(uiNaturalSize) &&
      uiNaturalSize.length >= 2
    ) {
      const [uiWidth, uiHeight] = uiNaturalSize;
      if (
        typeof uiWidth === 'number' &&
        typeof uiHeight === 'number' &&
        uiWidth > 0 &&
        uiHeight > 0
      ) {
        // Convert UIKit dimensions to world space units (UIKit uses cm units)
        const uiWidthInWorldUnits = uiWidth / 100;
        const uiHeightInWorldUnits = uiHeight / 100;

        const scaleX = targetWorldWidth / uiWidthInWorldUnits;
        const scaleY = targetWorldHeight / uiHeightInWorldUnits;
        const optimalScale = Math.min(scaleX, scaleY);

        // Apply scale to the Group (this), not the root element
        this.scale.setScalar(optimalScale);
      }
    }
  }

  /**
   * Set desired dimensions for the UI in meters. The document computes a uniform scale
   * that fits these constraints while preserving aspect ratio.
   * @param width Target width in meters.
   * @param height Target height in meters.
   */
  setTargetDimensions(width: number, height: number): void {
    this.targetWidth.value = width;
    this.targetHeight.value = height;
  }

  /**
   * Current intrinsic size of the UIKit root component (in UIKit units, centimeters),
   * if available from the underlying component's `size` signal.
   */
  get computedSize(): { width: number; height: number } | null {
    const sizeValue = this._rootElement.size?.value;
    if (sizeValue && Array.isArray(sizeValue) && sizeValue.length >= 2) {
      const [width, height] = sizeValue;
      if (typeof width === 'number' && typeof height === 'number') {
        return { width, height };
      }
    }
    return null;
  }

  /** Return the most recently requested target size in meters. */
  get targetSize(): { width: number; height: number } {
    return {
      width: this.targetWidth.value,
      height: this.targetHeight.value,
    };
  }

  /** The root UIKit component for this document. */
  get rootElement(): Component<any> {
    return this._rootElement;
  }

  /**
   * Dispose of internal resources and detach children. Safe to call multiple times.
   */
  dispose(): void {
    // Abort all effects to clean up signal subscriptions
    this._abortController.abort();

    // Dispose of the root UIKit Component which will clean up all resources
    if (this._rootElement && typeof this._rootElement.dispose === 'function') {
      this._rootElement.dispose();
    }

    // Remove root element from this Group
    this.remove(this._rootElement);

    // Clear internal maps
    this.elementMap.clear();
    this.classMap.clear();
  }

  /** String summary useful for debugging. */
  toString(): string {
    const elementCount = this.elementMap.size;
    const classCount = this.classMap.size;
    const computed = this.computedSize;
    const target = this.targetSize;
    return `UIKitDocument { elements: ${elementCount}, classes: ${classCount}, computed: ${computed ? `${computed.width}x${computed.height}` : 'none'}, target: ${target.width}x${target.height} }`;
  }

  /** Index IDs and classes for DOM‑like queries. */
  private indexElements(object: Object3D): void {
    // Only index UIKit Components, not all Object3Ds
    if (object instanceof Component) {
      // Access id from UIKit's properties system
      const id = object.properties?.signal?.id?.value;
      // Access classes from UIKit's ClassList - work around iterator bug by accessing private list
      const classList = object.classList
        ? ((object.classList as any).list?.filter(
            (c: any) => typeof c === 'string',
          ) as string[]) || []
        : [];

      // Index by ID
      if (id) {
        this.elementMap.set(id, object as any);
      }

      // Index by class names
      for (const className of classList) {
        if (!this.classMap.has(className)) {
          this.classMap.set(className, []);
        }
        this.classMap.get(className)!.push(object as any);
      }
    }

    // Recursively index children
    for (const child of object.children) {
      this.indexElements(child);
    }
  }
}
