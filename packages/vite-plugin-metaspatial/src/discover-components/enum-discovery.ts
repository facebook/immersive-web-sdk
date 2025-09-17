/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import { createRequire } from 'node:module';
import * as path from 'path';
import { parse } from '@babel/parser';
import type {
  VariableDeclarator,
  ObjectExpression,
  Identifier,
} from '@babel/types';
import * as fsExtra from 'fs-extra';
import type {
  EnumDefinition,
  PluginOptions,
  ParsedEnumCache,
} from './types.js';
const require = createRequire(import.meta.url);
// Load CJS modules using require
const { default: traverse } = require('@babel/traverse');
const enhancedResolve = require('enhanced-resolve');

// Cache and recursion protection
const parseEnumCache = new Map<string, ParsedEnumCache>();
const currentlyParsing = new Set<string>();
const MAX_RECURSION_DEPTH = 10;
const CACHE_TTL_MS = 60000; // 1 minute

// Type guard helper function
function isNodeOfType<T>(node: any, type: string): node is T {
  return node && node.type === type;
}

// Create enhanced-resolve resolver
let resolver: any = null;

function getResolver() {
  if (!resolver) {
    try {
      const { ResolverFactory, CachedInputFileSystem } = enhancedResolve;
      const fileSystem = new CachedInputFileSystem(fs, 4000);

      resolver = ResolverFactory.createResolver({
        fileSystem,
        extensions: [
          '.ts',
          '.js',
          '.tsx',
          '.jsx',
          '.mts',
          '.mjs',
          '.cts',
          '.cjs',
        ],
        mainFields: ['main', 'module'],
        conditionNames: ['import', 'node', 'default', 'types'],
        exportsFields: ['exports'],
        symlinks: true,
      });
    } catch (_error) {
      resolver = null;
    }
  }

  return resolver;
}

/**
 * Discovers enum definitions from a same-file declaration
 */
export function checkForSameFileEnum(
  declarator: VariableDeclarator,
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
): void {
  if (
    isNodeOfType<Identifier>(declarator.id, 'Identifier') &&
    isNodeOfType<ObjectExpression>(declarator.init, 'ObjectExpression')
  ) {
    const enumName = declarator.id.name;

    if (discoveredEnums.has(enumName)) {
      return;
    }

    const { values, keyValueMap } = extractObjectValues(declarator.init);
    if (values.length > 0) {
      discoveredEnums.set(enumName, {
        name: enumName,
        values,
        keyValueMap,
      });

      if (options.verbose) {
        console.log(
          `🔍 Discovered same-file enum ${enumName} with values: ${values.join(', ')}`,
        );
      }
    }
  }
}

/**
 * Resolves enum references by looking up their definitions in imported files
 */
export function resolveEnumReferences(
  code: string,
  filePath: string,
  enumReferences: Set<string>,
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
  depth: number = 0,
): void {
  // Parse imports to find where enums come from
  const imports = parseImports(code);

  for (const enumName of enumReferences) {
    // Skip if already discovered
    if (discoveredEnums.has(enumName)) {
      if (options.verbose) {
        console.log(`✅ Enum ${enumName} already discovered`);
      }
      continue;
    }

    if (options.verbose) {
      console.log(`🔍 Looking for enum ${enumName} in imports...`);
    }

    // Find the import for this enum, checking direct imports, aliases, and namespaces
    let originalEnumName = enumName;
    let resolvedEnumName = enumName; // Use separate variable for modifications
    let importInfo = imports.find((imp) => {
      // Check direct specifiers
      if (imp.specifiers.includes(enumName)) {
        return true;
      }

      // Check if this is an aliased import (local name -> imported name)
      if (imp.aliases && imp.aliases.has(enumName)) {
        return true;
      }

      return false;
    });

    // Check for namespace imports (e.g., Enums.FollowBehavior)
    if (!importInfo && enumName.includes('.')) {
      const [namespaceName, actualEnumName] = enumName.split('.', 2);
      importInfo = imports.find(
        (imp) => imp.namespaces && imp.namespaces.includes(namespaceName),
      );
      if (importInfo) {
        // Update resolvedEnumName to the actual enum name for resolution
        resolvedEnumName = actualEnumName;
      }
    }

    // If not found in direct imports, check star exports
    if (!importInfo) {
      const starExports = imports.filter((imp) => imp.specifiers.includes('*'));
      for (const starExport of starExports) {
        const resolvedPath = resolveImportPath(starExport.source, filePath);
        if (resolvedPath) {
          try {
            const starFileContent = fsExtra.readFileSync(resolvedPath, 'utf8');
            const enumDef = parseEnumObjectFromCode(
              starFileContent,
              resolvedEnumName,
              options,
              resolvedPath,
              depth + 1,
            );
            if (enumDef) {
              discoveredEnums.set(enumName, enumDef);
              if (options.verbose) {
                console.log(
                  `🌟 Resolved enum ${enumName} from star export ${path.relative(process.cwd(), resolvedPath)} with values: ${enumDef.values.join(', ')}`,
                );
              }
              // Found in star export, continue to next enum
              continue;
            }
          } catch (error) {
            if (options.verbose) {
              console.warn(
                `Failed to resolve enum ${originalEnumName} from star export ${starExport.source}:`,
                (error as Error).message,
              );
            }
          }
        }
      }

      if (options.verbose) {
        console.log(`❌ No import found for enum ${originalEnumName}`);
      }
      continue;
    }

    if (options.verbose) {
      console.log(
        `📦 Found import for ${originalEnumName} from ${importInfo.source}`,
      );
    }

    // Resolve the actual file path
    const resolvedPath = resolveImportPath(importInfo.source, filePath);
    if (!resolvedPath) {
      if (options.verbose) {
        console.warn(`❌ Could not resolve path for ${importInfo.source}`);
      }
      continue;
    }

    // Try to read and parse the enum from the resolved file
    try {
      const fileContent = fsExtra.readFileSync(resolvedPath, 'utf8');

      // If this is an aliased import, resolve to the actual imported name
      let enumNameToFind = resolvedEnumName;
      if (importInfo.aliases && importInfo.aliases.has(originalEnumName)) {
        enumNameToFind = importInfo.aliases.get(originalEnumName)!;
      }

      const enumDef = parseEnumObjectFromCode(
        fileContent,
        enumNameToFind,
        options,
        resolvedPath,
        depth + 1,
      );

      if (enumDef) {
        // Store using the original enum name (local name) for later lookup
        discoveredEnums.set(originalEnumName, enumDef);
        if (options.verbose) {
          console.log(
            `🎯 Resolved enum ${originalEnumName} from ${path.relative(process.cwd(), resolvedPath)} with values: ${enumDef.values.join(', ')}`,
          );
        }
      } else {
        if (options.verbose) {
          console.log(
            `⚠️ Could not parse enum ${originalEnumName} from ${path.relative(process.cwd(), resolvedPath)}`,
          );
        }
      }
    } catch (error) {
      if (options.verbose) {
        console.warn(
          `Failed to resolve enum ${originalEnumName} from ${resolvedPath}:`,
          (error as Error).message,
        );
      }
    }
  }
}

/**
 * Parses enum object from code
 */
export function parseEnumObjectFromCode(
  code: string,
  enumName: string,
  options: PluginOptions,
  currentFilePath?: string,
  depth: number = 0,
): EnumDefinition | null {
  // Input validation
  if (!code || typeof code !== 'string') {
    console.warn(`Invalid code provided for enum ${enumName}`);
    return null;
  }

  if (!enumName || typeof enumName !== 'string') {
    console.warn('Invalid enum name provided');
    return null;
  }

  // Create unique key for caching and recursion detection
  const cacheKey = `${currentFilePath || 'unknown'}:${enumName}`;

  // Check cache first
  const cached = parseEnumCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Prevent infinite recursion
  if (currentlyParsing.has(cacheKey)) {
    console.warn(
      `Circular reference detected for enum ${enumName} in ${currentFilePath}`,
    );
    return null;
  }

  if (depth > MAX_RECURSION_DEPTH) {
    console.warn(`Maximum recursion depth exceeded for enum ${enumName}`);
    return null;
  }

  currentlyParsing.add(cacheKey);

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    let enumDef: EnumDefinition | null = null;

    traverse(ast, {
      // Handle: export { EnumName } from './other-file'
      ExportNamedDeclaration: (path: any) => {
        if (enumDef) {
          return;
        } // Already found

        // Check for re-exports
        if (path.node.source && path.node.specifiers) {
          for (const spec of path.node.specifiers) {
            if (
              spec.type === 'ExportSpecifier' &&
              spec.exported &&
              spec.exported.name === enumName
            ) {
              // This is a re-export, follow it
              if (currentFilePath) {
                const reExportPath = path.node.source.value;
                try {
                  const resolvedPath = resolveImportPath(
                    reExportPath,
                    currentFilePath,
                  );
                  if (resolvedPath) {
                    const reExportContent = fsExtra.readFileSync(
                      resolvedPath,
                      'utf8',
                    );
                    enumDef = parseEnumObjectFromCode(
                      reExportContent,
                      enumName,
                      options,
                      resolvedPath,
                      depth + 1,
                    );
                  }
                } catch (err) {
                  if (options.verbose) {
                    console.warn(
                      `Failed to follow re-export of ${enumName} from ${reExportPath}:`,
                      (err as Error).message,
                    );
                  }
                }
              }
              return;
            }
          }
        }

        // Handle: export const EnumName = { ... }
        const declaration = path.node.declaration;
        if (declaration && declaration.type === 'VariableDeclaration') {
          declaration.declarations.forEach((declarator: any) => {
            if (
              declarator.id &&
              declarator.id.type === 'Identifier' &&
              declarator.id.name === enumName &&
              declarator.init &&
              declarator.init.type === 'ObjectExpression'
            ) {
              const { values, keyValueMap } = extractObjectValues(
                declarator.init,
              );
              if (values.length > 0) {
                enumDef = { name: enumName, values, keyValueMap };
              }
            }
          });
        }
      },

      // Handle: const EnumName = { ... }; export { EnumName }
      VariableDeclaration: (path: any) => {
        if (enumDef) {
          return;
        } // Already found

        if (path.parent.type === 'Program') {
          path.node.declarations.forEach((declarator: any) => {
            if (
              declarator.id &&
              declarator.id.type === 'Identifier' &&
              declarator.id.name === enumName &&
              declarator.init &&
              declarator.init.type === 'ObjectExpression'
            ) {
              const { values, keyValueMap } = extractObjectValues(
                declarator.init,
              );
              if (values.length > 0) {
                enumDef = { name: enumName, values, keyValueMap };
              }
            }
          });
        }
      },
    });

    // Cache the result
    parseEnumCache.set(cacheKey, {
      result: enumDef,
      timestamp: Date.now(),
    });

    return enumDef;
  } catch (error) {
    // Cache null result to prevent repeated failures
    parseEnumCache.set(cacheKey, {
      result: null,
      timestamp: Date.now(),
    });

    if (options.verbose) {
      console.warn(
        `Failed to parse enum ${enumName}:`,
        (error as Error).message,
      );
    }
    return null;
  } finally {
    currentlyParsing.delete(cacheKey);
  }
}

/**
 * Extracts values from an object expression (const enum pattern)
 */
export function extractObjectValues(objectNode: any): {
  values: string[];
  keyValueMap: Record<string, string>;
} {
  const values: string[] = [];
  const keyValueMap: Record<string, string> = {};

  if (objectNode.properties) {
    objectNode.properties.forEach((prop: any) => {
      if (prop.type === 'ObjectProperty' && prop.value && prop.key) {
        const key = prop.key.name || prop.key.value; // Handle both Identifier and StringLiteral keys

        // Extract the value (could be string, number, etc.)
        if (prop.value.type === 'StringLiteral') {
          const value = prop.value.value;
          values.push(value);
          keyValueMap[key] = value;
        } else if (prop.value.type === 'NumericLiteral') {
          const value = prop.value.value.toString();
          values.push(value);
          keyValueMap[key] = value;
        } else if (prop.value.type === 'Identifier') {
          // Handle references to other constants
          const value = prop.value.name;
          values.push(value);
          keyValueMap[key] = value;
        }
      }
    });
  }

  return { values, keyValueMap };
}

// Helper functions

function parseImports(code: string): Array<{
  source: string;
  specifiers: string[];
  aliases?: Map<string, string>; // local name -> imported name mapping
  namespaces?: string[]; // namespace imports
}> {
  const imports: Array<{
    source: string;
    specifiers: string[];
    aliases?: Map<string, string>;
    namespaces?: string[];
  }> = [];

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    traverse(ast, {
      ImportDeclaration: (path: any) => {
        const source = path.node.source.value;
        const specifiers: string[] = [];

        const aliases = new Map<string, string>();
        const namespaces: string[] = [];

        path.node.specifiers.forEach((spec: any) => {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier'
          ) {
            const importedName = spec.imported.name;
            const localName = spec.local?.name || importedName;

            specifiers.push(importedName);

            // Track alias if local name differs from imported name
            if (localName !== importedName) {
              aliases.set(localName, importedName);
            }
          } else if (
            spec.type === 'ImportDefaultSpecifier' &&
            spec.local.type === 'Identifier'
          ) {
            specifiers.push(spec.local.name);
          } else if (
            spec.type === 'ImportNamespaceSpecifier' &&
            spec.local.type === 'Identifier'
          ) {
            // Handle: import * as Something from './file'
            namespaces.push(spec.local.name);
          }
        });

        if (specifiers.length > 0 || namespaces.length > 0) {
          const importEntry: any = { source, specifiers };
          if (aliases.size > 0) {
            importEntry.aliases = aliases;
          }
          if (namespaces.length > 0) {
            importEntry.namespaces = namespaces;
          }
          imports.push(importEntry);
        }
      },

      // Handle star exports: export * from './file'
      ExportAllDeclaration: (path: any) => {
        if (path.node.source) {
          const source = path.node.source.value;
          // Mark as star export with special notation
          imports.push({ source, specifiers: ['*'] });
        }
      },
    });
  } catch {
    // Ignore parse errors for imports
  }

  return imports;
}

/**
 * Resolve import path using enhanced-resolve for robust Node.js module resolution
 */
function resolveImportPath(
  importSource: string,
  currentFile: string,
): string | null {
  // Input validation
  if (!importSource || typeof importSource !== 'string') {
    console.warn('Invalid import source provided');
    return null;
  }

  if (!currentFile || typeof currentFile !== 'string') {
    console.warn('Invalid current file provided');
    return null;
  }

  // Security check: prevent path traversal attacks
  const normalizedSource = path.normalize(importSource);
  if (normalizedSource.includes('..') && !normalizedSource.startsWith('../')) {
    console.warn(`Suspicious import path detected: ${importSource}`);
    return null;
  }

  const resolver = getResolver();

  if (!resolver) {
    return null;
  }

  try {
    const context = path.dirname(currentFile);
    const resolved = resolver.resolveSync({}, context, importSource);

    // Additional security check on resolved path
    if (resolved) {
      const resolvedNormalized = path.normalize(resolved);
      if (resolvedNormalized.includes('..')) {
        console.warn(`Resolved path contains traversal: ${resolved}`);
        return null;
      }
    }

    return resolved || null;
  } catch (_error) {
    return null;
  }
}
