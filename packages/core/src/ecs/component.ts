/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ComponentRegistry, Types, createComponent } from 'elics';

/** Elics query operators re-export. @category ECS */
export { eq, ne, lt, le, gt, ge, isin, nin } from 'elics';

/** ECS component helpers and Types re-export. @category ECS */
export { Types, createComponent, ComponentRegistry };
