/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents } from '@iwsdk/core';
import { Elevator } from './elevator.js';
import { LocomotionSettingsPanel } from './panel.js';

export default defineComponents([Elevator, LocomotionSettingsPanel]);
