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
  type UIKitMLError,
} from '@drawcall/uikitml';

function formatParseError(error: UIKitMLError): string {
  const position = error.range?.start;
  return `${error.message}${
    position ? ` at ${position.line}:${position.column}` : ''
  }`;
}

export function validateUIKitMLSource(source: string, filePath: string): void {
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
): Promise<string[]> {
  const files = await collectUIKitMLFiles(publicDirectory);
  const failures: string[] = [];
  for (const file of files) {
    try {
      validateUIKitMLSource(await readFile(file, 'utf8'), file);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'));
  }
  return files;
}
