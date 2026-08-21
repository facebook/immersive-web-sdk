#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Copyright (c) 2026 Sythos (https://www.sythos.net).
 *
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Keep the historical entry point working while the migration check lives with
// the rest of the r181-to-r185 test scripts.
await import('../test/threejs-r181-r185/check-three-version.mjs');
