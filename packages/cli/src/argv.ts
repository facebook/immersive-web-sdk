/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { CliOptionValue, CliOptions, ParsedArgv } from './cli-types.js';

function toCamelCase(flagName: string): string {
  return flagName.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

export function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const rawKey = token.slice(2);
    const key = toCamelCase(rawKey);
    const next = argv[index + 1];

    if (next && !next.startsWith('--')) {
      options[key] = next;
      index++;
      continue;
    }

    options[key] = true;
  }

  return { positionals, options };
}

export function safeJsonParse<T = unknown>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${String(error)}`);
  }
}

export function parseIntegerOption(
  value: CliOptionValue | undefined,
  label: string,
  fallback: number,
): number {
  if (value == null) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

export function parseOptionalPositiveIntegerOption(
  value: CliOptionValue | undefined,
  label: string,
): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} requires a positive integer value`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}
