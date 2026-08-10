/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parse,
  resolveKitComponentSets,
  type UIKitMLAst,
  type UIKitMLError,
  type UIKitMLElementNode,
  type UIKitMLNode,
} from '@drawcall/uikitml';

const BUNDLED_FONT_CHARACTERS = new Set(
  `${Array.from({ length: 95 }, (_, index) =>
    String.fromCodePoint(0x20 + index),
  ).join('')}°ÄÖÜäöüß§`,
);

export interface UIKitMLValidationResult {
  files: string[];
  warnings: string[];
}

function formatParseError(error: UIKitMLError): string {
  const position = error.range?.start;
  return `${error.message}${
    position ? ` at ${position.line}:${position.column}` : ''
  }`;
}

export function validateUIKitMLSource(source: string, filePath: string): void {
  parseUIKitMLSource(source, filePath);
}

function describeElement(element: UIKitMLElementNode | undefined): string {
  if (!element) {
    return '<text>';
  }
  const id = typeof element.props.id === 'string' ? `#${element.props.id}` : '';
  return `<${element.tagName}${id}>`;
}

function collectUnsupportedGlyphs(
  node: UIKitMLNode,
  glyphs: Map<string, string>,
  parent?: UIKitMLElementNode,
): void {
  if (node.kind === 'text') {
    for (const character of node.value) {
      if (/\s/u.test(character) || BUNDLED_FONT_CHARACTERS.has(character)) {
        continue;
      }
      if (!glyphs.has(character)) {
        const position = node.meta.text?.start ?? node.meta.element.start;
        glyphs.set(
          character,
          `${describeElement(parent)} ${position.line + 1}:${position.column + 1}`,
        );
      }
    }
    return;
  }
  if (node.kind === 'element') {
    for (const child of node.children) {
      collectUnsupportedGlyphs(child, glyphs, node);
    }
  }
}

function fontCoverageWarning(
  ast: UIKitMLAst,
  filePath: string,
): string | undefined {
  const glyphs = new Map<string, string>();
  collectUnsupportedGlyphs(ast.root, glyphs);
  if (glyphs.size === 0) {
    return undefined;
  }
  const details = [...glyphs].map(([character, location]) => {
    const codePoint = character.codePointAt(0)!;
    return `${JSON.stringify(character)} (U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, '0')}) at ${location}`;
  });
  const customFontNote = ast.fontFaces?.length
    ? ' A custom @font-face is declared; confirm that it is applied to these elements and contains these glyphs.'
    : ' Define and apply a custom @font-face containing these glyphs; UIKitML does not automatically fall back to a system font.';
  return `[IWSDK] UIKitML font coverage warning in ${filePath}: the bundled font atlas does not contain ${details.join(', ')}.${customFontNote}`;
}

function parseUIKitMLSource(source: string, filePath: string): UIKitMLAst {
  if (/^\s*(?:<!doctype\s+html\b|<html(?:\s|>))/i.test(source)) {
    throw new Error(
      `[IWSDK] Invalid UIKitML ${filePath}: file contains an HTML document instead of UIKitML.`,
    );
  }
  const result = parse(source, {
    componentSets: resolveKitComponentSets('horizon'),
  });
  if (!result.success) {
    throw new Error(
      `[IWSDK] Invalid UIKitML ${filePath}:\n${result.errors
        .map(formatParseError)
        .join('\n')}`,
    );
  }
  return result.ast;
}

async function collectUIKitMLFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectUIKitMLFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.uikitml')
        ? [entryPath]
        : [];
    }),
  );
  return files.flat().sort();
}

export async function validateUIKitMLDirectory(
  publicDirectory: string,
): Promise<UIKitMLValidationResult> {
  const files = await collectUIKitMLFiles(publicDirectory);
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    try {
      const ast = parseUIKitMLSource(await readFile(file, 'utf8'), file);
      const warning = fontCoverageWarning(ast, file);
      if (warning) {
        warnings.push(warning);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'));
  }
  return { files, warnings };
}
