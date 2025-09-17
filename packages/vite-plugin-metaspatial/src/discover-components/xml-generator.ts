/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import fs from 'fs-extra';
import { create } from 'xmlbuilder2';
import type {
  ComponentMetadata,
  EnumDefinition,
  PluginOptions,
} from './types.js';

export async function generateXMLFiles(
  discoveredComponents: ComponentMetadata[],
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
): Promise<void> {
  // Validate output directory path for security
  const outputDir = path.resolve(process.cwd(), options.outputDir);

  // Security check: ensure output directory is within project bounds
  const projectRoot = process.cwd();
  if (!outputDir.startsWith(projectRoot)) {
    throw new Error(`Output directory outside project bounds: ${outputDir}`);
  }

  // Clean output directory if requested
  if (options.clean && (await fs.pathExists(outputDir))) {
    if (options.verbose) {
      console.log(`🧹 Cleaning output directory: ${outputDir}`);
    }
    try {
      await fs.remove(outputDir);
    } catch (error) {
      console.warn(
        `Failed to clean output directory: ${(error as Error).message}`,
      );
    }
  }

  // Create output directory
  try {
    await fs.ensureDir(outputDir);
  } catch (error) {
    throw new Error(
      `Failed to create output directory: ${(error as Error).message}`,
    );
  }

  // Limit concurrent file operations to prevent memory issues
  const concurrencyLimit = 10;
  const chunks = [];
  for (let i = 0; i < discoveredComponents.length; i += concurrencyLimit) {
    chunks.push(discoveredComponents.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (component) => {
        try {
          const xmlContent = generateXMLForComponent(
            component,
            discoveredEnums,
            options,
          );

          // Validate XML content
          if (!xmlContent || xmlContent.trim().length === 0) {
            console.warn(
              `Empty XML generated for component ${component.exportName}`,
            );
            return;
          }

          // Derive filename with source prefix (IWSDK|CUSTOM)
          const fileName = getFileNameForComponent(component);
          const filePath = path.join(outputDir, fileName);

          // Use atomic write to prevent corruption
          const tempPath = `${filePath}.tmp`;
          await fs.writeFile(tempPath, xmlContent);
          await fs.move(tempPath, filePath);
        } catch (error) {
          console.error(
            `Failed to generate XML for ${component.exportName}:`,
            (error as Error).message,
          );
        }
      }),
    );
  }

  if (options.verbose) {
    console.log(
      `📄 Generated ${discoveredComponents.length} XML files in ${path.relative(process.cwd(), outputDir)}`,
    );
  }
}

/**
 * Generate only CUSTOM components incrementally: delete existing CUSTOM*.xml then write provided components.
 */
export async function generateIncrementalCustomXML(
  discoveredComponents: ComponentMetadata[],
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
): Promise<void> {
  const outputDir = path.resolve(process.cwd(), options.outputDir);

  await fs.ensureDir(outputDir);

  // Delete existing CUSTOM*.xml files
  const files = (await fs.pathExists(outputDir))
    ? await fs.readdir(outputDir)
    : [];
  await Promise.all(
    files
      .filter((f) => f.startsWith('CUSTOM') && f.endsWith('.xml'))
      .map((f) => fs.remove(path.join(outputDir, f)).catch(() => {})),
  );

  // Write provided CUSTOM components
  for (const component of discoveredComponents) {
    try {
      const xmlContent = generateXMLForComponent(
        component,
        discoveredEnums,
        options,
      );
      const fileName = getFileNameForComponent(component);
      const filePath = path.join(outputDir, fileName);
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, xmlContent);
      await fs.move(tempPath, filePath, { overwrite: true });
    } catch (error) {
      console.error(
        `Failed to generate XML for ${component.exportName}:`,
        (error as Error).message,
      );
    }
  }
}

function generateXMLForComponent(
  component: ComponentMetadata,
  discoveredEnums: Map<string, EnumDefinition>,
  options: PluginOptions,
): string {
  // Use the declared component name from createComponent's first argument
  // rather than the exported variable name.
  const componentName = component.name;
  const description = component.description;

  // Create XML document using xmlbuilder2
  const doc = create()
    .ele('ComponentSchema')
    .att('packageName', 'com.iwsdk.components');

  // Add enum definitions first
  const componentEnums = getEnumsForComponent(component, discoveredEnums);
  componentEnums.forEach((enumDef) => {
    const enumElement = doc.ele('Enum').att('name', enumDef.name);
    enumDef.values.forEach((value) => {
      enumElement.ele('EnumValue').att('value', value);
    });
  });

  // Add component definition
  const componentElement = doc
    .ele('Component')
    .att('name', componentName)
    .att('description', description);

  // Add attributes based on schema
  Object.entries(component.schema).forEach(([fieldName, fieldDef]) => {
    // Skip private fields (starting with _)
    if (fieldName.startsWith('_')) {
      return;
    }

    // Skip Object types entirely - don't generate XML attributes for them
    if (fieldDef.type === 'Object') {
      if (options.verbose) {
        console.log(`Skipping field "${fieldName}" with Object type`);
      }
      return;
    }

    const attributeType = mapTypeToXMLAttribute(fieldDef.type);
    const defaultValue = formatDefaultValue(
      fieldDef.default,
      fieldDef.type,
      discoveredEnums,
    );

    if (options.verbose && fieldDef.default !== undefined) {
      console.log(
        `Field "${fieldName}" default:`,
        fieldDef.default,
        'formatted:',
        defaultValue,
      );
    }

    const attributeElement = componentElement
      .ele(attributeType)
      .att('name', fieldName);
    if (defaultValue !== null) {
      attributeElement.att('defaultValue', defaultValue);
    }
  });

  return doc.end({
    prettyPrint: true,
    headless: !options.includeXmlDeclaration,
  });
}

function getFileNameForComponent(component: ComponentMetadata): string {
  // Determine base name (drop any package-like prefixes)
  const raw = component.name || component.exportName || 'Component';
  const base = raw.includes('.') ? raw.split('.').pop()! : raw;
  const prefix = component.source === 'framework' ? 'IWSDK' : 'CUSTOM';
  return `${prefix}${base}.xml`;
}

function getEnumsForComponent(
  component: ComponentMetadata,
  discoveredEnums: Map<string, EnumDefinition>,
): EnumDefinition[] {
  // Return enums that are used by this component and have actual values
  const componentEnums: EnumDefinition[] = [];
  Object.entries(component.schema).forEach(([_fieldName, fieldDef]) => {
    if (fieldDef.type === 'Enum' && fieldDef.enum) {
      const enumName = getEnumName(fieldDef.enum);
      if (enumName && discoveredEnums.has(enumName)) {
        const enumDef = discoveredEnums.get(enumName)!;
        // Only include enums that have actual values discovered
        if (
          enumDef.values.length > 0 &&
          !componentEnums.find((e) => e.name === enumName)
        ) {
          componentEnums.push(enumDef);
        }
      }
    }
  });
  return componentEnums;
}

function getEnumName(enumObj: any): string | null {
  if (enumObj && typeof enumObj === 'object' && enumObj.property) {
    return enumObj.property;
  }
  return null;
}

function mapTypeToXMLAttribute(elicsType?: string): string {
  const typeMap: Record<string, string> = {
    Float32: 'FloatAttribute',
    Float64: 'FloatAttribute',
    Int8: 'IntAttribute',
    Int16: 'IntAttribute',
    Int32: 'IntAttribute',
    Int64: 'LongAttribute',
    Boolean: 'BooleanAttribute',
    String: 'StringAttribute',
    Vec2: 'Vector2Attribute',
    Vec3: 'Vector3Attribute',
    Vec4: 'Vector4Attribute',
    Color: 'Color4Attribute',
    Entity: 'EntityAttribute',
    Enum: 'EnumAttribute', // Enums use EnumAttribute
  };

  return typeMap[elicsType || ''] || 'StringAttribute';
}

function formatDefaultValue(
  value: any,
  type?: string,
  discoveredEnums?: Map<string, EnumDefinition>,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  // First, try to resolve any object reference values (const objects used as enums)
  // This applies to ALL types, not just Enum or String
  if (
    typeof value === 'object' &&
    value.object &&
    value.property &&
    discoveredEnums
  ) {
    const enumName = value.object;

    // Check if this is a reference to a discovered enum/const object
    if (discoveredEnums.has(enumName)) {
      const enumDef = discoveredEnums.get(enumName)!;
      const enumKey = value.property;

      // Use the key-value mapping to get the actual value
      if (enumDef.keyValueMap && enumDef.keyValueMap[enumKey]) {
        const resolvedValue = enumDef.keyValueMap[enumKey];

        // For enum types, return the enum name with the resolved value
        if (type === 'Enum') {
          return `${enumName}.${resolvedValue}`;
        }

        // For other types, format according to type
        return formatValueByType(resolvedValue, type);
      }

      // Fallback: try lowercase transformation
      const fallbackValue = enumKey.toLowerCase();
      return formatValueByType(fallbackValue, type);
    }

    // If not found in discoveredEnums, still try to handle special cases
    // For example, Types.Float32 -> "Float32"
    if (value.object === 'Types' && value.property) {
      return value.property;
    }
  }

  // If we couldn't resolve the object reference, continue with normal formatting
  return formatValueByType(value, type);
}

function formatValueByType(value: any, type?: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  // Handle vector/array values
  if (Array.isArray(value)) {
    if (type === 'Vec2' || type === 'Vec3' || type === 'Vec4') {
      // Handle arrays with object elements that represent invalid values
      const validValues = value
        .map((v) => {
          if (typeof v === 'number') {
            return `${v}f`;
          } else if (typeof v === 'object' && v.property) {
            // Skip invalid values like NaN, Infinity, undefined
            if (
              v.property === 'NaN' ||
              v.property === 'Infinity' ||
              v.property === 'undefined'
            ) {
              return null;
            }
            return v.property;
          }
          return v;
        })
        .filter((v) => v !== null);

      // If all values are invalid, return null
      if (validValues.length === 0) {
        return null;
      }

      return validValues.join(', ');
    }
    return value.join(', ');
  }

  // Handle string values
  if (type === 'String') {
    return value.toString();
  }

  // Handle boolean values (lowercase)
  if (type === 'Boolean') {
    return value.toString().toLowerCase();
  }

  // Handle float values with 'f' suffix
  if (type === 'Float32' || type === 'Float64') {
    if (typeof value === 'number') {
      return `${value}f`;
    }
  }

  // Handle long values with 'L' suffix
  if (type === 'Int64') {
    if (typeof value === 'number') {
      return `${value}L`;
    }
  }

  // Handle integer values
  if (type === 'Int8' || type === 'Int16' || type === 'Int32') {
    if (typeof value === 'number') {
      return value.toString();
    }
  }

  // Handle primitive values
  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value.toString().toLowerCase();
  }

  // Handle objects that represent undefined/null values
  if (typeof value === 'object' && value.property === 'undefined') {
    return null;
  }

  // If it's a complex object, don't include a default value
  if (typeof value === 'object') {
    return null;
  }

  return value.toString();
}
