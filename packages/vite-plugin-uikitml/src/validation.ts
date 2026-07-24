/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

type ParsedNode =
  | string
  | {
      children?: readonly ParsedNode[];
      dataUid?: string;
      sourceTag?: string;
    };

type SourceRange = {
  start?: {
    line?: number;
    column?: number;
  };
};

type ParseResult = {
  element?: ParsedNode;
  ranges?: Record<string, SourceRange>;
};

function formatLocation(
  ranges: ParseResult['ranges'],
  dataUid: string | undefined,
): string {
  if (!dataUid) {
    return '';
  }

  const start = ranges?.[dataUid]?.start;
  if (typeof start?.line !== 'number' || typeof start?.column !== 'number') {
    return '';
  }

  return `:${start.line + 1}:${start.column + 1}`;
}

/**
 * Warn when UIKitML contains nested inline spans.
 *
 * UIKit currently accepts this shape but can render it with stray glyphs or
 * overflowing text. The warning keeps the failure mode visible while preserving
 * compatibility with existing markup.
 */
export function warnForNestedInlineSpans(
  parseResult: ParseResult,
  sourcePath: string,
): void {
  function visit(node: ParsedNode | undefined, insideSpan: boolean): void {
    if (!node || typeof node === 'string') {
      return;
    }

    const isSpan = node.sourceTag === 'span';
    if (isSpan && insideSpan) {
      const location = formatLocation(parseResult.ranges, node.dataUid);
      console.warn(
        `[compile-uikitml] Nested <span> in ${sourcePath}${location}. UIKit may render inline spans inside spans with stray glyphs or overflow; use a flex <div> row with sibling <span> elements instead.`,
      );
    }

    for (const child of node.children ?? []) {
      visit(child, insideSpan || isSpan);
    }
  }

  visit(parseResult.element, false);
}
