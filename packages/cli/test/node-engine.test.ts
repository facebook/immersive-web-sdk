/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import { getUnsupportedNodeMessage } from '../src/node-engine.js';

const RANGE = '>=20.19.0 <21.0.0-0 || >=22.12.0 <23.0.0-0 || >=24.0.0';

describe('IWSDK Node engine guard', () => {
  test.each(['20.19.0', '22.12.0', '24.0.0', '25.1.0'])(
    'accepts supported Node %s',
    (version) => {
      expect(getUnsupportedNodeMessage(version, RANGE)).toBeUndefined();
    },
  );

  test.each(['20.18.3', '21.7.3', '22.11.0', '23.11.1'])(
    'rejects unsupported Node %s with the required range',
    (version) => {
      expect(getUnsupportedNodeMessage(version, RANGE)).toContain(RANGE);
    },
  );
});
