/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
const require = createRequire(import.meta.url);
// Load CJS modules using require
import {
  checkForSameFileEnum,
  resolveEnumReferences,
} from './enum-discovery.js';
import type {
  ComponentMetadata,
  EnumDefinition,
  FieldDefinition,
  PluginOptions,
} from './types.js';
import {
  extractFieldDefinition,
  extractStringLiteral,
} from './value-extractor.js';
const { default: traverse } = require('@babel/traverse');

/**
 * Parses components from source code
 */
export function parseComponentsFromCode(
  code: string,
  filePath: string,
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
): ComponentMetadata[] {
  const components: ComponentMetadata[] = [];
  const enumReferences = new Set<string>();

  // Input validation
  if (!code || typeof code !== 'string') {
    console.warn(`Invalid code provided for ${filePath}`);
    return components;
  }

  if (!filePath || typeof filePath !== 'string') {
    console.warn('Invalid file path provided');
    return components;
  }

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
    });

    traverse(ast, {
      // Handle: export const ComponentName = createComponent(...)
      ExportNamedDeclaration: (path: any) => {
        const declaration = path.node.declaration;

        if (declaration && declaration.type === 'VariableDeclaration') {
          declaration.declarations.forEach((declarator: any) => {
            if (isCreateComponentCall(declarator.init)) {
              // Check for skip tag on leading JSDoc attached to the declarator/init or its immediate wrappers
              if (
                shouldSkipByDocTag([
                  declarator,
                  declarator.init,
                  declaration,
                  path.node,
                ])
              ) {
                if (options.verbose) {
                  console.log(
                    `⏭️  Skipping component due to @hideineditor tag in ${filePath}`,
                  );
                }
                return;
              }
              const component = extractComponentMetadata(
                declarator,
                filePath,
                enumReferences,
              );
              if (component) {
                components.push(component);
              }
            } else {
              // Check if this is a same-file enum definition
              checkForSameFileEnum(declarator, discoveredEnums, options);
            }
          });
        }
      },

      // Handle: const ComponentName = createComponent(...); export { ComponentName };
      VariableDeclaration: (path: any) => {
        // Only process if this is at module level and exported later
        if (path.parent.type === 'Program') {
          path.node.declarations.forEach((declarator: any) => {
            if (isCreateComponentCall(declarator.init)) {
              // Check for skip tag on leading JSDoc attached to the declarator/init or the declaration
              if (
                shouldSkipByDocTag([declarator, declarator.init, path.node])
              ) {
                if (options.verbose) {
                  console.log(
                    `⏭️  Skipping component due to @hideineditor tag in ${filePath}`,
                  );
                }
                return;
              }
              const component = extractComponentMetadata(
                declarator,
                filePath,
                enumReferences,
              );
              if (component) {
                components.push(component);
              }
            } else {
              // Check if this is a same-file enum definition
              checkForSameFileEnum(declarator, discoveredEnums, options);
            }
          });
        }
      },
    });

    // Now resolve any enum references we found
    if (enumReferences.size > 0) {
      resolveEnumReferences(
        code,
        filePath,
        enumReferences,
        discoveredEnums,
        options,
      );
    }
  } catch (error) {
    if (options.verbose) {
      console.warn(
        `AST parsing failed for ${filePath}:`,
        (error as Error).message,
      );
    }
  }

  return components;
}

/**
 * Checks if a node is a createComponent call
 */
function isCreateComponentCall(node: any | null): boolean {
  if (!node || node.type !== 'CallExpression') {
    return false;
  }

  // Check for: createComponent(...)
  if (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'createComponent'
  ) {
    return true;
  }

  // Check for: SomeNamespace.createComponent(...)
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'createComponent'
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts component metadata from a declarator
 */
function extractComponentMetadata(
  declarator: any,
  filePath: string,
  enumReferences: Set<string>,
): ComponentMetadata | null {
  if (!declarator?.id || declarator.id.type !== 'Identifier') {
    return null;
  }

  const componentName = declarator.id.name;

  // Validate component name format
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(componentName)) {
    console.warn(`Invalid component name format: ${componentName}`);
    return null;
  }

  const callExpression = declarator.init;

  if (!callExpression?.arguments || callExpression.arguments.length < 2) {
    console.warn(`Invalid createComponent call for ${componentName}`);
    return null;
  }

  // Extract name from first parameter (string literal)
  const nameArg = callExpression.arguments[0];
  const name = extractStringLiteral(nameArg);

  // Extract schema from second parameter (object expression)
  const schemaArg = callExpression.arguments[1];
  const schema = extractSchema(schemaArg, enumReferences);

  // Extract description from third parameter (string literal) if available
  const descriptionArg = callExpression.arguments[2];
  const description = descriptionArg
    ? extractStringLiteral(descriptionArg)
    : null;

  return {
    name: name || `com.elics.${componentName}`, // fallback to inferred name
    description: description || `EliCS component: ${componentName}`, // fallback to inferred description
    file: filePath.replace(process.cwd(), '.'),
    exportName: componentName,
    schema: schema,
  };
}

/**
 * Returns true if any provided AST node has a leading JSDoc block containing the configured tag
 */
function shouldSkipByDocTag(nodes: any[]): boolean {
  const re = /@hideineditor(?:\b|\s|$)/i;
  for (const node of nodes) {
    if (!node) {
      continue;
    }
    const comments = node.leadingComments || [];
    for (const c of comments) {
      if (c && c.type === 'CommentBlock' && re.test(String(c.value))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extracts schema from object expression
 */
function extractSchema(
  schemaNode: any | null,
  enumReferences: Set<string>,
): Record<string, FieldDefinition> {
  if (!schemaNode || schemaNode.type !== 'ObjectExpression') {
    return {};
  }

  const schema: Record<string, FieldDefinition> = {};

  (schemaNode as any).properties.forEach((prop: any) => {
    if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
      const fieldName = prop.key.name;
      const fieldDefinition = extractFieldDefinition(
        prop.value,
        enumReferences,
      );

      if (fieldDefinition) {
        schema[fieldName] = fieldDefinition;
      }
    }
  });

  return schema;
}
