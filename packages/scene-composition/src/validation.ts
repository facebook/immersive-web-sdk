/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_VERSION,
  type SceneAsset,
  type SceneComponentFieldSchema,
  type SceneComponentSchema,
  type SceneDocument,
  type SceneNode,
  type SceneTransform,
  type ValidationIssue,
  type ValidationResult,
} from './types.js';
import { isFiniteNumber, isJsonValue, isPlainObject, isVec3 } from './utils.js';

export function validateSceneDocument(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return {
      issues: [{ path: '$', message: 'Scene document must be an object' }],
      valid: false,
    };
  }

  if (value.version !== CURRENT_SCENE_VERSION) {
    issues.push({
      message: `version must be "${CURRENT_SCENE_VERSION}"`,
      path: '$.version',
    });
  }

  if (value.units !== 'meters') {
    issues.push({ message: 'units must be "meters"', path: '$.units' });
  }

  const assetIds = validateAssets(value.assets, '$.assets', issues);
  validateComponentSchemas(
    value.componentSchemas,
    '$.componentSchemas',
    issues,
  );

  if (!Array.isArray(value.nodes)) {
    issues.push({ message: 'nodes must be an array', path: '$.nodes' });
  } else {
    const nodeIds = new Set<string>();
    validateNodes(value.nodes, '$.nodes', assetIds, nodeIds, issues);
    validateNodeReferences(value.nodes, '$.nodes', nodeIds, issues);
  }

  validateOptionalJsonObject(value.editor, '$.editor', issues);
  validateOptionalJsonObject(value.metadata, '$.metadata', issues);

  return {
    issues,
    valid: issues.length === 0,
  };
}

function validateNodeReferences(
  value: unknown[],
  path: string,
  nodeIds: Set<string>,
  issues: ValidationIssue[],
) {
  for (let index = 0; index < value.length; index += 1) {
    const nodePath = `${path}[${index}]`;
    const node = value[index] as Partial<SceneNode>;

    if (!isPlainObject(node)) {
      continue;
    }

    const placeOn = isPlainObject(node.transform)
      ? node.transform.placeOn
      : undefined;
    const target =
      typeof placeOn === 'string'
        ? placeOn
        : isPlainObject(placeOn)
          ? placeOn.target
          : undefined;
    if (
      typeof target === 'string' &&
      target.length > 0 &&
      !nodeIds.has(target)
    ) {
      issues.push({
        message: `unknown placeOn target "${target}"`,
        path:
          typeof placeOn === 'string'
            ? `${nodePath}.transform.placeOn`
            : `${nodePath}.transform.placeOn.target`,
      });
    }

    if (Array.isArray(node.children)) {
      validateNodeReferences(
        node.children,
        `${nodePath}.children`,
        nodeIds,
        issues,
      );
    }
  }
}

export function assertValidSceneDocument(
  value: unknown,
): asserts value is SceneDocument {
  const result = validateSceneDocument(value);
  if (!result.valid) {
    const details = result.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid IWSDK scene document:\n${details}`);
  }
}

const COMPONENT_FIELD_TYPES = new Set([
  'Int8',
  'Int16',
  'Int32',
  'Entity',
  'Float32',
  'Float64',
  'Boolean',
  'String',
  'FilePath',
  'Object',
  'Vec2',
  'Vec3',
  'Vec4',
  'Color',
  'Enum',
]);

function validateComponentSchemas(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  if (value == null) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push({ message: 'componentSchemas must be an array', path });
    return;
  }

  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const schemaPath = `${path}[${index}]`;
    const schema = value[index] as Partial<SceneComponentSchema>;

    if (!isPlainObject(schema)) {
      issues.push({
        message: 'component schema must be an object',
        path: schemaPath,
      });
      continue;
    }

    if (!isNonEmptyString(schema.id)) {
      issues.push({
        message: 'component schema id must be a non-empty string',
        path: `${schemaPath}.id`,
      });
    } else if (ids.has(schema.id)) {
      issues.push({
        message: `duplicate component schema id "${schema.id}"`,
        path: `${schemaPath}.id`,
      });
    } else {
      ids.add(schema.id);
    }

    if (schema.name != null && !isNonEmptyString(schema.name)) {
      issues.push({
        message: 'component schema name must be a non-empty string',
        path: `${schemaPath}.name`,
      });
    }
    if (schema.description != null && typeof schema.description !== 'string') {
      issues.push({
        message: 'component schema description must be a string',
        path: `${schemaPath}.description`,
      });
    }
    if (
      schema.source != null &&
      schema.source !== 'iwsdk' &&
      schema.source !== 'app' &&
      schema.source !== 'scene'
    ) {
      issues.push({
        message: 'component schema source must be "iwsdk", "app", or "scene"',
        path: `${schemaPath}.source`,
      });
    }

    if (!isPlainObject(schema.fields)) {
      issues.push({
        message: 'component schema fields must be an object',
        path: `${schemaPath}.fields`,
      });
      continue;
    }

    for (const [fieldName, field] of Object.entries(schema.fields)) {
      validateComponentFieldSchema(
        fieldName,
        field,
        `${schemaPath}.fields.${fieldName}`,
        issues,
      );
    }
  }
}

function validateComponentFieldSchema(
  fieldName: string,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  const field = value as Partial<SceneComponentFieldSchema>;

  if (!isNonEmptyString(fieldName)) {
    issues.push({ message: 'component field name must be non-empty', path });
  }

  if (!isPlainObject(field)) {
    issues.push({ message: 'component field schema must be an object', path });
    return;
  }

  if (!COMPONENT_FIELD_TYPES.has(String(field.type))) {
    issues.push({
      message: 'component field type is not supported',
      path: `${path}.type`,
    });
  }
  if (field.default !== undefined && !isJsonValue(field.default)) {
    issues.push({
      message: 'component field default must be JSON serializable',
      path: `${path}.default`,
    });
  }
  if (field.description != null && typeof field.description !== 'string') {
    issues.push({
      message: 'component field description must be a string',
      path: `${path}.description`,
    });
  }
  if (field.enum != null) {
    if (
      !isPlainObject(field.enum) ||
      Object.values(field.enum).some((entry) => typeof entry !== 'string')
    ) {
      issues.push({
        message: 'component field enum must be an object of string values',
        path: `${path}.enum`,
      });
    }
  }
  if (field.fileTypes != null && typeof field.fileTypes !== 'string') {
    issues.push({
      message: 'component field fileTypes must be a string',
      path: `${path}.fileTypes`,
    });
  }
  if (field.subfolder != null && typeof field.subfolder !== 'string') {
    issues.push({
      message: 'component field subfolder must be a string',
      path: `${path}.subfolder`,
    });
  }
  if (field.min != null && !isFiniteNumber(field.min)) {
    issues.push({
      message: 'component field min must be a finite number',
      path: `${path}.min`,
    });
  }
  if (field.max != null && !isFiniteNumber(field.max)) {
    issues.push({
      message: 'component field max must be a finite number',
      path: `${path}.max`,
    });
  }
  if (field.internal != null && typeof field.internal !== 'boolean') {
    issues.push({
      message: 'component field internal must be a boolean',
      path: `${path}.internal`,
    });
  }
}

function validateAssets(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  const assetIds = new Set<string>();

  if (value == null) {
    return assetIds;
  }

  if (!Array.isArray(value)) {
    issues.push({ message: 'assets must be an array', path });
    return assetIds;
  }

  for (let index = 0; index < value.length; index += 1) {
    const assetPath = `${path}[${index}]`;
    const asset = value[index] as Partial<SceneAsset>;

    if (!isPlainObject(asset)) {
      issues.push({ message: 'asset must be an object', path: assetPath });
      continue;
    }

    if (!isNonEmptyString(asset.id)) {
      issues.push({
        message: 'asset id must be a non-empty string',
        path: assetPath,
      });
    } else if (assetIds.has(asset.id)) {
      issues.push({
        message: `duplicate asset id "${asset.id}"`,
        path: assetPath,
      });
    } else {
      assetIds.add(asset.id);
    }

    if (!isNonEmptyString(asset.uri)) {
      issues.push({
        message: 'asset uri must be a non-empty string',
        path: assetPath,
      });
    }

    if (asset.name != null && !isNonEmptyString(asset.name)) {
      issues.push({
        message: 'asset name must be a non-empty string',
        path: assetPath,
      });
    }

    if (asset.bounds != null) {
      if (!isPlainObject(asset.bounds)) {
        issues.push({
          message: 'asset bounds must be an object',
          path: `${assetPath}.bounds`,
        });
      } else {
        validateVec3(asset.bounds.min, `${assetPath}.bounds.min`, issues);
        validateVec3(asset.bounds.max, `${assetPath}.bounds.max`, issues);
      }
    }

    validateOptionalJsonObject(asset.metadata, `${assetPath}.metadata`, issues);
  }

  return assetIds;
}

function validateNodes(
  value: unknown[],
  path: string,
  assetIds: Set<string>,
  nodeIds: Set<string>,
  issues: ValidationIssue[],
) {
  for (let index = 0; index < value.length; index += 1) {
    const nodePath = `${path}[${index}]`;
    const node = value[index] as Partial<SceneNode>;

    if (!isPlainObject(node)) {
      issues.push({ message: 'node must be an object', path: nodePath });
      continue;
    }

    if (!isNonEmptyString(node.id)) {
      issues.push({
        message: 'node id must be a non-empty string',
        path: `${nodePath}.id`,
      });
    } else if (nodeIds.has(node.id)) {
      issues.push({
        message: `duplicate node id "${node.id}"`,
        path: `${nodePath}.id`,
      });
    } else {
      nodeIds.add(node.id);
    }

    if (node.name != null && !isNonEmptyString(node.name)) {
      issues.push({
        message: 'node name must be a non-empty string',
        path: `${nodePath}.name`,
      });
    }

    if (node.asset != null) {
      if (!isNonEmptyString(node.asset)) {
        issues.push({
          message: 'node asset must be a non-empty string',
          path: `${nodePath}.asset`,
        });
      } else if (!assetIds.has(node.asset)) {
        issues.push({
          message: `unknown asset "${node.asset}"`,
          path: `${nodePath}.asset`,
        });
      }
    }

    validateTransform(node.transform, `${nodePath}.transform`, issues);
    validateComponents(node.components, `${nodePath}.components`, issues);
    validateOptionalJsonObject(node.editor, `${nodePath}.editor`, issues);
    validateOptionalJsonObject(node.metadata, `${nodePath}.metadata`, issues);

    if (node.children != null) {
      if (!Array.isArray(node.children)) {
        issues.push({
          message: 'children must be an array',
          path: `${nodePath}.children`,
        });
      } else {
        validateNodes(
          node.children,
          `${nodePath}.children`,
          assetIds,
          nodeIds,
          issues,
        );
      }
    }
  }
}

function validateTransform(
  transform: SceneTransform | undefined,
  path: string,
  issues: ValidationIssue[],
) {
  if (transform == null) {
    return;
  }

  if (!isPlainObject(transform)) {
    issues.push({ message: 'transform must be an object', path });
    return;
  }

  validateVec3(transform.position, `${path}.position`, issues, true);
  validateVec3(transform.rotationDeg, `${path}.rotationDeg`, issues, true);
  validateScale(transform.scale, `${path}.scale`, issues);
  validateVec3(transform.lookAt, `${path}.lookAt`, issues, true);

  if (transform.placeOn != null) {
    if (typeof transform.placeOn === 'string') {
      if (transform.placeOn.length === 0) {
        issues.push({
          message: 'placeOn target must be non-empty',
          path: `${path}.placeOn`,
        });
      }
    } else if (isPlainObject(transform.placeOn)) {
      if (!isNonEmptyString(transform.placeOn.target)) {
        issues.push({
          message: 'placeOn target must be non-empty',
          path: `${path}.placeOn.target`,
        });
      }
      if (
        transform.placeOn.clearance != null &&
        !isFiniteNumber(transform.placeOn.clearance)
      ) {
        issues.push({
          message: 'placeOn clearance must be a finite number',
          path: `${path}.placeOn.clearance`,
        });
      }
      if (
        transform.placeOn.align != null &&
        transform.placeOn.align !== 'center' &&
        transform.placeOn.align !== 'preserve-xz'
      ) {
        issues.push({
          message: 'placeOn align must be "center" or "preserve-xz"',
          path: `${path}.placeOn.align`,
        });
      }
    } else {
      issues.push({
        message: 'placeOn must be a string or object',
        path: `${path}.placeOn`,
      });
    }
  }
}

function validateComponents(
  components: Record<string, unknown> | undefined,
  path: string,
  issues: ValidationIssue[],
) {
  if (components == null) {
    return;
  }

  if (!isPlainObject(components)) {
    issues.push({ message: 'components must be an object', path });
    return;
  }

  for (const [name, value] of Object.entries(components)) {
    if (!isNonEmptyString(name)) {
      issues.push({ message: 'component name must be non-empty', path });
    }

    if (isTypedComponentValue(value)) {
      if (value.type !== stripComponentPrefix(name)) {
        issues.push({
          message: `typed component "${name}" type must match its component key`,
          path: `${path}.${name}.type`,
        });
      }
      if (value.props != null && !isJsonObject(value.props)) {
        issues.push({
          message: `typed component "${name}" props must be a JSON object`,
          path: `${path}.${name}.props`,
        });
      }
    } else if (!isJsonValue(value)) {
      issues.push({
        message: `component "${name}" payload must be JSON serializable`,
        path: `${path}.${name}`,
      });
    }
  }
}

function isTypedComponentValue(
  value: unknown,
): value is { type: string; props?: unknown } {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'type' || key === 'props') &&
    isNonEmptyString((value as { type?: unknown }).type)
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && isJsonValue(value);
}

function stripComponentPrefix(componentName: string): string {
  const prefix = 'com.iwsdk.components.';
  return componentName.startsWith(prefix)
    ? componentName.slice(prefix.length)
    : componentName;
}

function validateOptionalJsonObject(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  if (value == null) {
    return;
  }

  if (!isPlainObject(value) || !isJsonValue(value)) {
    issues.push({ message: 'value must be a JSON object', path });
  }
}

function validateVec3(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  optional = false,
) {
  if (value == null && optional) {
    return;
  }

  if (!isVec3(value)) {
    issues.push({ message: 'value must be a finite [x, y, z] tuple', path });
  }
}

function validateScale(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  if (value == null) {
    return;
  }

  const values =
    typeof value === 'number' && isFiniteNumber(value)
      ? [value]
      : isVec3(value)
        ? value
        : undefined;

  if (values == null) {
    issues.push({
      message: 'scale must be a finite number or [x, y, z] tuple',
      path,
    });
    return;
  }

  if (values.some((entry) => entry <= 0)) {
    issues.push({ message: 'scale values must be greater than 0', path });
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
