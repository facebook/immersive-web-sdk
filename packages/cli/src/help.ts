/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  getRuntimeOperationByCliPath,
  type JsonSchema,
} from './runtime-contract.js';

function describeSchemaType(schema: JsonSchema): string {
  if (schema.enum?.length) {
    return 'enum';
  }
  if (schema.type) {
    return schema.type;
  }
  if (schema.oneOf?.length) {
    return schema.oneOf.map((entry) => describeSchemaType(entry)).join(' | ');
  }
  return 'value';
}

function formatSchemaPropertyLines(
  propertyPath: string,
  schema: JsonSchema,
  required: boolean,
  indent = 2,
): string[] {
  const prefix = ' '.repeat(indent);
  const lines = [
    `${prefix}${propertyPath}${required ? ' (required)' : ''} [${describeSchemaType(schema)}]${
      schema.description ? ` - ${schema.description}` : ''
    }`,
  ];

  if (schema.enum?.length) {
    lines.push(`${prefix}  values: ${schema.enum.join(', ')}`);
  }

  if (schema.properties) {
    const nestedRequired = new Set(schema.required ?? []);
    for (const [name, nestedSchema] of Object.entries(schema.properties)) {
      lines.push(
        ...formatSchemaPropertyLines(
          `${propertyPath}.${name}`,
          nestedSchema,
          nestedRequired.has(name),
          indent + 2,
        ),
      );
    }
  }

  if (schema.items?.enum?.length) {
    lines.push(`${prefix}  item values: ${schema.items.enum.join(', ')}`);
  }

  return lines;
}

export function buildRuntimeCommandHelp(
  domain: string,
  action: string,
): string[] {
  const operation = getRuntimeOperationByCliPath(domain, action);
  if (!operation) {
    return [`Unknown ${domain} command "${action}".`];
  }

  const writesScreenshot =
    operation.mcpName === 'browser_screenshot' ||
    operation.mcpName === 'scene_screenshot' ||
    operation.mcpName === 'scene_render_file' ||
    operation.mcpName === 'ui_render_preview';

  const lines = [
    `Usage: iwsdk ${domain} ${action} [--input-json <json>] [--timeout <ms>] [--raw]${
      writesScreenshot ? ' [--output-file <path>]' : ''
    }`,
    '',
    `Description: ${operation.description}`,
    `MCP tool: ${operation.mcpName}`,
    `WebSocket method: ${operation.wsMethod}`,
    '',
    'Parameters:',
  ];

  const properties = operation.inputSchema.properties ?? {};
  const required = new Set(operation.inputSchema.required ?? []);
  const propertyEntries = Object.entries(properties);
  if (propertyEntries.length === 0) {
    lines.push('  (none)');
  } else {
    for (const [name, schema] of propertyEntries) {
      lines.push(
        ...formatSchemaPropertyLines(name, schema, required.has(name)),
      );
    }
  }

  lines.push(
    '',
    'Options:',
    '  --input-json <json>',
    '  --timeout <ms>',
    '  --raw',
  );
  if (writesScreenshot) {
    lines.push(
      '  --output-file <path>   Write the PNG to this path and return screenshotPath; takes precedence over --raw',
    );
  }

  return lines;
}

export function buildMcpInspectHelp(): string[] {
  return [
    'Usage: iwsdk mcp inspect [--tool <mcpName>]',
    '',
    'Options:',
    '  --tool <mcpName>   Show description and input schema for one runtime tool',
  ];
}

export function buildReferenceCommandHelp(action?: string): string[] {
  if (action === 'status') {
    return [
      'Usage: iwsdk reference status',
      '',
      'Show reference project state plus shared corpus and model cache status.',
    ];
  }

  if (action === 'warmup') {
    return [
      'Usage: iwsdk reference warmup',
      '',
      'Download and initialize the external reference corpus and model caches.',
      'The pinned model file URLs are baked into the SDK and must remain reachable unless the shared cache is already pre-warmed.',
      'Set IWSDK_REFERENCE_ASSETS_BASE_URL when you are hosting the corpus payload yourself, including local/internal SDK bundle deployments that do not ship @iwsdk/reference-assets.',
    ];
  }

  if (action === 'inspect') {
    return [
      'Usage: iwsdk reference inspect [--tool <name>] [--raw]',
      '',
      'Inspect the reference tool catalog exported by @iwsdk/reference.',
      '',
      'Options:',
      '  --tool <name>   Show one reference tool by CLI or MCP name',
      '  --raw           Emit the raw inspect payload',
    ];
  }

  if (action) {
    return [
      `Usage: iwsdk reference ${action} [--input-json <json>] [--raw]`,
      '',
      'Run a reference query using the workspace-installed @iwsdk/reference package.',
      '',
      'Options:',
      '  --input-json <json>   JSON payload matching the reference tool schema',
      '  --raw                 Emit the raw query payload',
    ];
  }

  return [
    'Usage: iwsdk reference <subcommand>',
    '',
    'Subcommands:',
    '  status',
    '  warmup',
    '  inspect [--tool <name>] [--raw]',
    '  search [--input-json <json>] [--raw]',
    '  relationship [--input-json <json>] [--raw]',
    '  api [--input-json <json>] [--raw]',
    '  file [--input-json <json>] [--raw]',
    '  components [--input-json <json>] [--raw]',
    '  systems [--input-json <json>] [--raw]',
    '  dependents [--input-json <json>] [--raw]',
    '  examples [--input-json <json>] [--raw]',
  ];
}

export function usageLines(): string[] {
  return [
    'Usage: iwsdk <command> [subcommand] [--help]',
    '',
    'Commands:',
    '  status',
    '  dev up|down|restart|logs|open|status [--open] [--foreground]',
    '  adapter sync|status|prune',
    '  reference status|warmup|inspect|search|relationship|api|file|components|systems|dependents|examples',
    '  mcp stdio|inspect [--tool <mcpName>]',
    '  xr <action>',
    '  browser <action>',
    '  scene <action>',
    '  ui <action>',
    '  ecs <action>',
  ];
}
