/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { RuntimeBrowserClient } from '@iwsdk/cli/contract';
import { describe, expect, it } from 'vitest';
import {
  hasReadyBrowserCommandPath,
  isBrowserBridgeConnectionAllowed,
  normalizeDeviceClass,
} from '../src/browser-client-routing.js';
function client(
  overrides: Partial<RuntimeBrowserClient>,
): RuntimeBrowserClient {
  return {
    commandReady: true,
    deviceClass: 'managed',
    pageId: 'page',
    role: 'app',
    tabGeneration: 1,
    ...overrides,
  };
}

describe('browser client routing', () => {
  it('treats one ready physical app as a complete command path', () => {
    expect(
      hasReadyBrowserCommandPath([
        client({ deviceClass: 'physical', role: 'app' }),
      ]),
    ).toBe(true);
  });

  it('still requires both managed app and editor roles', () => {
    expect(hasReadyBrowserCommandPath([client({ role: 'app' })])).toBe(false);
    expect(
      hasReadyBrowserCommandPath([
        client({ pageId: 'app', role: 'app' }),
        client({ pageId: 'editor', role: 'editor' }),
      ]),
    ).toBe(true);
  });

  it('ignores clients that have not announced command readiness', () => {
    expect(
      hasReadyBrowserCommandPath([
        client({
          commandReady: false,
          deviceClass: 'physical',
          role: 'app',
        }),
      ]),
    ).toBe(false);
  });

  it('accepts only loopback addresses for browser command clients', () => {
    expect(isBrowserBridgeConnectionAllowed('127.0.0.1')).toBe(true);
    expect(isBrowserBridgeConnectionAllowed('::1')).toBe(true);
    expect(isBrowserBridgeConnectionAllowed('::ffff:127.0.0.1')).toBe(true);
    expect(isBrowserBridgeConnectionAllowed('192.168.1.25')).toBe(false);
    expect(isBrowserBridgeConnectionAllowed(undefined)).toBe(false);
  });

  it('defaults unknown device classes to managed', () => {
    expect(normalizeDeviceClass(undefined)).toBe('managed');
    expect(normalizeDeviceClass('browser')).toBe('managed');
    expect(normalizeDeviceClass('physical')).toBe('physical');
  });
});
