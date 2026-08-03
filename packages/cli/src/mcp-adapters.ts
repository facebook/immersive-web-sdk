/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import mcpSurfaceMarkers from './mcp-surface-markers.json';
import { getReferenceEntrypoint } from './reference-runtime.js';
import {
  MCP_CONFIG_TARGETS,
  SUPPORTED_AI_TOOLS,
  type AiTool,
} from './runtime-contract.js';
import { normalizeWorkspaceRoot } from './runtime-state.js';

type JsonObject = Record<string, unknown>;

interface StableMcpCommandEntry {
  command: string;
  args: string[];
}

type StableMcpEntryMap = Record<string, StableMcpCommandEntry>;

export interface ManagedMcpServerRegistry {
  entries: StableMcpEntryMap;
  managedNames: string[];
}

export interface SyncMcpAdaptersOptions {
  workspaceRoot: string;
  tools?: AiTool[];
  command?: string;
  args?: string[];
}

export interface PruneMcpAdaptersOptions {
  workspaceRoot: string;
  tools?: AiTool[];
  weCreatedFile?: boolean;
}

type McpSurfaceMarkers = {
  runtimeServerName: string;
  optionalServerNames: string[];
  legacyServerNames: string[];
  legacyArgTokens: string[];
};

const MCP_SURFACE_MARKERS = mcpSurfaceMarkers as McpSurfaceMarkers;

export const DEFAULT_MCP_SERVER_NAME = MCP_SURFACE_MARKERS.runtimeServerName;
export const DEFAULT_MCP_SERVER_ARGS = ['mcp', 'stdio'] as const;
export const OPTIONAL_MCP_SERVER_NAMES = [
  ...MCP_SURFACE_MARKERS.optionalServerNames,
] as readonly string[];
export const LEGACY_MCP_SERVER_NAMES = [
  ...MCP_SURFACE_MARKERS.legacyServerNames,
] as readonly string[];
export const LEGACY_MCP_ARG_TOKENS = [
  ...MCP_SURFACE_MARKERS.legacyArgTokens,
] as readonly string[];
export const ALL_MANAGED_MCP_SERVER_NAMES = [
  DEFAULT_MCP_SERVER_NAME,
  ...OPTIONAL_MCP_SERVER_NAMES,
  ...LEGACY_MCP_SERVER_NAMES,
] as readonly string[];
const TOML_BLOCK_START = '# --- IWER managed (do not edit) ---';
const TOML_BLOCK_END = '# --- end IWER managed ---';

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(
  error: unknown,
  code: string,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

function getCliEntrypoint(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    'node_modules',
    '@iwsdk',
    'cli',
    'dist',
    'cli.js',
  );
}

export function hasManagedMcpServerReference(
  content: string,
  serverName: string,
): boolean {
  return (
    content.includes(`"${serverName}"`) ||
    content.includes(`[mcp_servers.${serverName}]`)
  );
}

export function hasManagedMcpArgToken(
  content: string,
  argToken: string,
): boolean {
  return content.includes(`"${argToken}"`);
}

function getMetaVrEntrypoint(workspaceRoot: string): string | null {
  const entrypoint = path.join(
    workspaceRoot,
    'node_modules',
    '@meta-quest',
    'metavr',
    'bin.js',
  );
  return existsSync(entrypoint) ? entrypoint : null;
}

export function getManagedMcpServerRegistry({
  workspaceRoot = process.cwd(),
  command = 'node',
  args,
}: {
  workspaceRoot?: string;
  command?: string;
  args?: string[];
} = {}): ManagedMcpServerRegistry {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const resolvedArgs = args ?? [
    getCliEntrypoint(normalizedWorkspaceRoot),
    ...DEFAULT_MCP_SERVER_ARGS,
  ];
  const entries: StableMcpEntryMap = {
    [DEFAULT_MCP_SERVER_NAME]: {
      command,
      args: resolvedArgs,
    },
  };

  const referenceEntrypoint = getReferenceEntrypoint(normalizedWorkspaceRoot);
  if (existsSync(referenceEntrypoint)) {
    entries['iwsdk-reference'] = {
      command: 'node',
      args: [referenceEntrypoint],
    };
  }

  const metaVrEntrypoint = getMetaVrEntrypoint(normalizedWorkspaceRoot);
  if (metaVrEntrypoint != null) {
    entries.metavr = {
      command: 'node',
      args: [metaVrEntrypoint, 'mcp', 'server'],
    };
  }

  return {
    entries,
    managedNames: [...ALL_MANAGED_MCP_SERVER_NAMES],
  };
}

export async function mergeJsonConfig(
  filePath: string,
  serverEntries: Record<string, unknown>,
  jsonKey: string,
  managedKeys?: string[],
): Promise<boolean> {
  let existing: JsonObject = {};
  let created = false;

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error(
        `Existing JSON config at ${filePath} must contain a top-level object`,
      );
    }
    existing = parsed;
  } catch (error) {
    if (!isNodeErrorWithCode(error, 'ENOENT')) {
      if (error instanceof SyntaxError) {
        throw new Error(`Existing JSON config at ${filePath} is invalid JSON`);
      }
      throw error;
    }
    created = true;
  }

  const sectionValue = existing[jsonKey];
  if (sectionValue != null && !isRecord(sectionValue)) {
    throw new Error(
      `Existing JSON config section "${jsonKey}" at ${filePath} must be an object`,
    );
  }
  const section: JsonObject = isRecord(sectionValue) ? { ...sectionValue } : {};
  if (managedKeys) {
    for (const key of managedKeys) {
      if (!(key in serverEntries)) {
        delete section[key];
      }
    }
  }

  Object.assign(section, serverEntries);
  existing[jsonKey] = section;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`);
  return created;
}

export async function unmergeJsonConfig(
  filePath: string,
  serverKeys: string[],
  jsonKey: string,
  weCreatedFile: boolean,
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return;
  }

  let existing: JsonObject;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return;
    }
    existing = parsed;
  } catch {
    return;
  }

  const sectionValue = existing[jsonKey];
  if (isRecord(sectionValue)) {
    for (const key of serverKeys) {
      delete sectionValue[key];
    }
    if (Object.keys(sectionValue).length === 0) {
      delete existing[jsonKey];
    }
  }

  if (weCreatedFile && Object.keys(existing).length === 0) {
    await unlink(filePath).catch(() => {});
    return;
  }

  await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`);
}

function stripTomlServerSections(
  content: string,
  serverNames: string[],
): string {
  const managedNames = new Set(serverNames);
  const lines = content.split('\n');
  const result: string[] = [];
  let skippingManagedSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (sectionMatch) {
      skippingManagedSection = managedNames.has(sectionMatch[1]);
      if (skippingManagedSection) {
        continue;
      }
    } else if (trimmed.startsWith('[') && skippingManagedSection) {
      skippingManagedSection = false;
    }

    if (!skippingManagedSection) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

export async function mergeTomlConfig(
  filePath: string,
  serverEntries: StableMcpEntryMap,
  managedKeys?: string[],
): Promise<boolean> {
  let existing = '';
  let created = false;

  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    created = true;
  }

  const startIdx = existing.indexOf(TOML_BLOCK_START);
  const endIdx = existing.indexOf(TOML_BLOCK_END);
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    existing = `${existing.slice(0, startIdx).trimEnd()}\n${existing
      .slice(endIdx + TOML_BLOCK_END.length)
      .trimStart()}`;
    existing = existing.trim();
  }
  if (managedKeys?.length) {
    existing = stripTomlServerSections(existing, managedKeys);
  }

  const tomlLines = [TOML_BLOCK_START];
  for (const [name, entry] of Object.entries(serverEntries)) {
    tomlLines.push(`[mcp_servers.${name}]`);
    tomlLines.push(`command = ${JSON.stringify(entry.command)}`);
    tomlLines.push(
      `args = [${entry.args.map((arg) => JSON.stringify(arg)).join(', ')}]`,
    );
    tomlLines.push('default_tools_approval_mode = "approve"');
    tomlLines.push('');
  }
  tomlLines.push(TOML_BLOCK_END);

  const newContent = existing
    ? `${existing.trimEnd()}\n\n${tomlLines.join('\n')}\n`
    : `${tomlLines.join('\n')}\n`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, newContent);
  return created;
}

function openCodeServerEntries(
  serverEntries: StableMcpEntryMap,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(serverEntries).map(([name, entry]) => [
      name,
      {
        type: 'local',
        command: [entry.command, ...entry.args],
        enabled: true,
      },
    ]),
  );
}

function openCodePermissionKey(serverName: string): string {
  return `${serverName}_*`;
}

export async function mergeOpenCodeConfig(
  filePath: string,
  serverEntries: StableMcpEntryMap,
  managedKeys: string[],
): Promise<boolean> {
  let existing: JsonObject = {};
  let created = false;
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (!isRecord(parsed)) {
      throw new Error(
        `Existing OpenCode config at ${filePath} must contain a top-level object`,
      );
    }
    existing = parsed;
  } catch (error) {
    if (!isNodeErrorWithCode(error, 'ENOENT')) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Existing OpenCode config at ${filePath} is invalid JSON`,
        );
      }
      throw error;
    }
    created = true;
  }

  const mcpValue = existing.mcp;
  if (mcpValue != null && !isRecord(mcpValue)) {
    throw new Error(
      `Existing OpenCode config section "mcp" at ${filePath} must be an object`,
    );
  }
  const mcp = isRecord(mcpValue) ? { ...mcpValue } : {};
  for (const key of managedKeys) {
    delete mcp[key];
  }
  Object.assign(mcp, openCodeServerEntries(serverEntries));
  existing.mcp = mcp;

  const permissionValue = existing.permission;
  if (
    permissionValue != null &&
    typeof permissionValue !== 'string' &&
    !isRecord(permissionValue)
  ) {
    throw new Error(
      `Existing OpenCode config section "permission" at ${filePath} must be a string or object`,
    );
  }
  const permission: JsonObject =
    typeof permissionValue === 'string'
      ? { '*': permissionValue }
      : isRecord(permissionValue)
        ? { ...permissionValue }
        : {};
  for (const key of managedKeys) {
    delete permission[openCodePermissionKey(key)];
  }
  for (const name of Object.keys(serverEntries)) {
    permission[openCodePermissionKey(name)] = 'allow';
  }
  existing.permission = permission;
  existing.$schema ??= 'https://opencode.ai/config.json';

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`);
  return created;
}

export async function unmergeOpenCodeConfig(
  filePath: string,
  managedKeys: string[],
  weCreatedFile: boolean,
): Promise<void> {
  let existing: JsonObject;
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (!isRecord(parsed)) {
      return;
    }
    existing = parsed;
  } catch {
    return;
  }

  if (isRecord(existing.mcp)) {
    for (const key of managedKeys) {
      delete existing.mcp[key];
    }
    if (Object.keys(existing.mcp).length === 0) {
      delete existing.mcp;
    }
  }
  if (isRecord(existing.permission)) {
    for (const key of managedKeys) {
      delete existing.permission[openCodePermissionKey(key)];
    }
    if (Object.keys(existing.permission).length === 0) {
      delete existing.permission;
    }
  }
  if (
    weCreatedFile &&
    Object.keys(existing).every((key) => key === '$schema')
  ) {
    await unlink(filePath).catch(() => {});
    return;
  }
  await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`);
}

export async function unmergeTomlConfig(
  filePath: string,
  weCreatedFile: boolean,
  serverKeys?: string[],
): Promise<void> {
  let existing: string;
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    return;
  }

  const startIdx = existing.indexOf(TOML_BLOCK_START);
  const endIdx = existing.indexOf(TOML_BLOCK_END);
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    const cleaned = serverKeys?.length
      ? stripTomlServerSections(existing, serverKeys)
      : existing.trim();
    if (weCreatedFile && cleaned === '') {
      await unlink(filePath).catch(() => {});
      return;
    }
    if (cleaned !== existing.trim()) {
      await writeFile(filePath, `${cleaned}\n`);
    }
    if (weCreatedFile && existing.trim() === '') {
      await unlink(filePath).catch(() => {});
    }
    return;
  }

  const cleaned = `${existing.slice(0, startIdx).trimEnd()}\n${existing
    .slice(endIdx + TOML_BLOCK_END.length)
    .trimStart()}`;
  const result = serverKeys?.length
    ? stripTomlServerSections(cleaned, serverKeys)
    : cleaned.trim();

  if (weCreatedFile && result === '') {
    await unlink(filePath).catch(() => {});
    return;
  }

  await writeFile(filePath, `${result}\n`);
}

export async function syncMcpAdapters({
  workspaceRoot,
  tools,
  command,
  args,
}: SyncMcpAdaptersOptions): Promise<{
  workspaceRoot: string;
  tools: AiTool[];
  serverNames: string[];
}> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const registry = getManagedMcpServerRegistry({
    workspaceRoot: normalizedWorkspaceRoot,
    command,
    args,
  });
  const { entries: serverEntries, managedNames } = registry;
  const appliedTools = tools ?? [...SUPPORTED_AI_TOOLS];

  const writes: Array<Promise<boolean>> = [];
  for (const tool of appliedTools) {
    const target = MCP_CONFIG_TARGETS[tool];
    const filePath = path.join(normalizedWorkspaceRoot, target.file);
    if (target.format === 'json') {
      writes.push(
        mergeJsonConfig(
          filePath,
          serverEntries,
          target.jsonKey ?? 'mcpServers',
          managedNames,
        ),
      );
    } else if (target.format === 'toml') {
      writes.push(mergeTomlConfig(filePath, serverEntries, managedNames));
    } else {
      writes.push(mergeOpenCodeConfig(filePath, serverEntries, managedNames));
    }
  }

  await Promise.all(writes);
  return {
    workspaceRoot: normalizedWorkspaceRoot,
    tools: appliedTools,
    serverNames: Object.keys(serverEntries),
  };
}

export async function pruneMcpAdapters({
  workspaceRoot,
  tools,
  weCreatedFile = false,
}: PruneMcpAdaptersOptions): Promise<void> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const appliedTools = tools ?? [...SUPPORTED_AI_TOOLS];
  const serverKeys = [...ALL_MANAGED_MCP_SERVER_NAMES];

  const writes: Array<Promise<void>> = [];
  for (const tool of appliedTools) {
    const target = MCP_CONFIG_TARGETS[tool];
    const filePath = path.join(normalizedWorkspaceRoot, target.file);
    if (target.format === 'json') {
      writes.push(
        unmergeJsonConfig(
          filePath,
          serverKeys,
          target.jsonKey ?? 'mcpServers',
          weCreatedFile,
        ),
      );
    } else if (target.format === 'toml') {
      writes.push(unmergeTomlConfig(filePath, weCreatedFile, serverKeys));
    } else {
      writes.push(unmergeOpenCodeConfig(filePath, serverKeys, weCreatedFile));
    }
  }

  await Promise.all(writes);
}
