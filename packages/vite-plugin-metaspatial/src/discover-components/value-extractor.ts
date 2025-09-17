/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as t from '@babel/types';
import type { Node } from '@babel/types';
import type { ExtractedValue, FieldDefinition } from './types.js';

// Constants for recursion and security limits
const MAX_RECURSION_DEPTH = 50;
const MAX_ARRAY_SIZE = 1000;
const MAX_OBJECT_KEYS = 100;

/**
 * Extracts values from AST nodes using Babel's enterprise-grade type system
 */
export function extractValue(
  valueNode: Node | null,
  enumReferences?: Set<string>,
  depth: number = 0,
): ExtractedValue {
  if (!valueNode) {
    return undefined;
  }

  // Prevent stack overflow from infinite recursion
  if (depth > MAX_RECURSION_DEPTH) {
    console.warn(`Maximum recursion depth exceeded during value extraction`);
    return undefined;
  }

  // Use Babel's type guards for robust AST checking
  if (t.isStringLiteral(valueNode)) {
    return valueNode.value;
  }

  if (t.isNumericLiteral(valueNode)) {
    return valueNode.value;
  }

  if (t.isBooleanLiteral(valueNode)) {
    return valueNode.value;
  }

  if (t.isArrayExpression(valueNode)) {
    // Security check: limit array size
    if (valueNode.elements.length > MAX_ARRAY_SIZE) {
      console.warn(
        `Array too large (${valueNode.elements.length}), truncating to ${MAX_ARRAY_SIZE} elements`,
      );
      return valueNode.elements
        .slice(0, MAX_ARRAY_SIZE)
        .map((el) => extractValue(el, enumReferences, depth + 1))
        .filter((v) => v !== undefined);
    }

    return valueNode.elements
      .map((el) => extractValue(el, enumReferences, depth + 1))
      .filter((v) => v !== undefined);
  }

  if (t.isMemberExpression(valueNode)) {
    // Handle Types.Float32, Types.Boolean, etc.
    if (isTypesReference(valueNode)) {
      const typeName = getTypeName(valueNode);
      if (typeName) {
        return { object: 'Types', property: typeName };
      }
    }

    // Handle nested member expressions like Enums.EnvironmentType.STATIC
    if (isNestedMemberExpression(valueNode)) {
      const enumName = getEnumNameFromNested(valueNode);
      if (enumName && enumReferences) {
        enumReferences.add(enumName);
      }
      return {
        object: enumName || 'UnknownEnum',
        property: t.isIdentifier(valueNode.property)
          ? valueNode.property.name
          : 'UNKNOWN',
      };
    }

    // Handle simple enum values like EnvironmentType.STATIC
    const enumName = getSimpleEnumName(valueNode);
    if (enumName) {
      if (enumReferences) {
        enumReferences.add(enumName);
      }
      return {
        object: enumName,
        property: t.isIdentifier(valueNode.property)
          ? valueNode.property.name
          : 'UNKNOWN',
      };
    }
    return undefined;
  }

  if (t.isIdentifier(valueNode)) {
    const identifierName = valueNode.name;
    if (enumReferences) {
      enumReferences.add(identifierName);
    }
    return {
      object: 'Enum',
      property: identifierName,
    };
  }

  if (t.isObjectExpression(valueNode)) {
    // Security check: limit object size
    if (valueNode.properties.length > MAX_OBJECT_KEYS) {
      console.warn(
        `Object too large (${valueNode.properties.length} keys), truncating to ${MAX_OBJECT_KEYS} keys`,
      );
    }

    const obj: Record<string, ExtractedValue> = {};
    const limitedProperties = valueNode.properties.slice(0, MAX_OBJECT_KEYS);

    limitedProperties.forEach((prop) => {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        obj[prop.key.name] = extractValue(
          prop.value,
          enumReferences,
          depth + 1,
        );
      }
    });
    return obj;
  }

  return undefined;
}

/**
 * Extracts field definition from an object expression using Babel types
 */
export function extractFieldDefinition(
  fieldNode: Node | null,
  enumReferences: Set<string>,
): FieldDefinition | null {
  if (!t.isObjectExpression(fieldNode)) {
    return null;
  }

  const field: FieldDefinition = {};

  // Extract field properties using Babel's type-safe traversal
  fieldNode.properties.forEach((prop) => {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      const key = prop.key.name;
      const shouldTrackEnums = key === 'enum';
      const value = extractValue(
        prop.value,
        shouldTrackEnums ? enumReferences : undefined,
      );

      if (value !== undefined) {
        field[key] = value;
      }
    }
  });

  return processFieldWithContext(field, enumReferences);
}

/**
 * Process field with context to ensure proper typing and defaults
 */
export function processFieldWithContext(
  field: FieldDefinition,
  _enumReferences: Set<string>,
): FieldDefinition | null {
  // Step 1: Extract and validate type
  let fieldType = extractFieldType(field.type);
  if (!fieldType) {
    console.warn(`⚠️ Unable to determine field type, skipping field`);
    return null;
  }

  // Step 2: For enum types, validate enum field exists
  if (fieldType === 'Enum') {
    if (!field.enum) {
      console.warn(
        `⚠️ Field has type Enum but no enum property, skipping field`,
      );
      return null;
    }
    // Enum reference was already added to enumReferences in first pass
  }

  // Step 3: Process default value with context
  if (field.default !== undefined) {
    field.default = processDefaultWithContext(
      field.default,
      fieldType,
      field.enum,
    );
  } else {
    // Provide fallback default if none specified
    field.default = getFallbackDefault(fieldType, field.enum);
  }

  // Step 4: Ensure field.type is a string for XML generator
  field.type = fieldType;

  return field;
}

/**
 * Extracts field type from value
 */
function extractFieldType(typeValue: any): string | null {
  // Convert Types.Float32 etc to string representation
  if (typeValue && typeof typeValue === 'object' && typeValue.property) {
    return typeValue.property;
  }
  if (typeof typeValue === 'string') {
    return typeValue;
  }
  return null;
}

/**
 * Process default value with context
 */
function processDefaultWithContext(
  defaultValue: ExtractedValue,
  fieldType: string,
  enumObj?: ExtractedValue,
): ExtractedValue {
  if (fieldType === 'Enum') {
    if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      'object' in defaultValue &&
      'property' in defaultValue
    ) {
      return defaultValue;
    }
    console.warn(`⚠️ Enum field has invalid default value, using fallback`);
    return getFallbackDefault(fieldType, enumObj);
  }

  return defaultValue;
}

/**
 * Gets fallback default value for a field type
 */
function getFallbackDefault(
  fieldType: string,
  enumObj?: ExtractedValue,
): ExtractedValue {
  switch (fieldType) {
    case 'Float32':
    case 'Float64':
    case 'Int8':
    case 'Int16':
    case 'Int32':
    case 'Int64':
      return 0;

    case 'Boolean':
      return true;

    case 'String':
      return '';

    case 'Vec2':
      return [0, 0];

    case 'Vec3':
      return [0, 0, 0];

    case 'Vec4':
      return [0, 0, 0, 0];

    case 'Enum':
      if (
        enumObj &&
        typeof enumObj === 'object' &&
        enumObj !== null &&
        'property' in enumObj &&
        typeof enumObj.property === 'string'
      ) {
        return { object: enumObj.property, property: 'FIRST_VALUE' };
      }
      return { object: 'UnknownEnum', property: 'DEFAULT' };

    default:
      console.warn(
        `⚠️ Unknown field type ${fieldType}, using empty string fallback`,
      );
      return '';
  }
}

/**
 * Checks if a member expression references the Types object (e.g., Types.Float32)
 */
function isTypesReference(memberExpr: t.MemberExpression): boolean {
  return (
    t.isIdentifier(memberExpr.object) && memberExpr.object.name === 'Types'
  );
}

/**
 * Gets the type name from a Types reference (e.g., "Float32" from Types.Float32)
 */
function getTypeName(memberExpr: t.MemberExpression): string | null {
  return t.isIdentifier(memberExpr.property) ? memberExpr.property.name : null;
}

/**
 * Gets enum name from a simple member expression (e.g., "EnvironmentType" from EnvironmentType.STATIC)
 */
function getSimpleEnumName(memberExpr: t.MemberExpression): string | null {
  if (t.isIdentifier(memberExpr.object)) {
    return memberExpr.object.name;
  }
  return null;
}

/**
 * Checks if a member expression is nested (e.g., Enums.EnvironmentType.STATIC)
 */
function isNestedMemberExpression(memberExpr: t.MemberExpression): boolean {
  return t.isMemberExpression(memberExpr.object);
}

/**
 * Extracts the enum name from a nested member expression
 */
function getEnumNameFromNested(memberExpr: t.MemberExpression): string | null {
  if (!isNestedMemberExpression(memberExpr)) {
    return null;
  }

  const nestedObject = memberExpr.object as t.MemberExpression;
  return t.isIdentifier(nestedObject.property)
    ? nestedObject.property.name
    : null;
}

/**
 * Extracts string literal value from AST node using Babel types
 */
export function extractStringLiteral(node: Node | null): string | null {
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  return null;
}
