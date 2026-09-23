/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { RuntimeBrowserClient } from '@iwsdk/cli/contract';
import { describe, expect, it } from 'vitest';
import {
  hasManagedCommandRoles,
  hasReadyBrowserCommandPath,
  isBrowserBridgeConnectionAllowed,
  isSameBrowserEndpoint,
  normalizeBrowserHello,
  normalizeDeviceClass,
  normalizePageRole,
} from '../src/browser-client-routing.js';

const owner = {
  sessionId: 'session-a',
  browserEpoch: 3,
  fallbackPageId: 'connection-1',
};
const managedHello = {
  type: 'iwsdk_browser_hello',
  sessionId: 'session-a',
  browserEpoch: 3,
  deviceClass: 'managed',
  pageId: 'tab-a',
  pageRole: 'app',
  role: 'app',
  tabId: 'tab-a',
  tabGeneration: 2,
  commandReady: true,
};

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
  it('does not let a physical app satisfy managed readiness', () => {
    expect(
      hasReadyBrowserCommandPath([
        client({ deviceClass: 'physical', role: 'app' }),
      ]),
    ).toBe(false);
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

  it('defaults only absent device classes and roles', () => {
    expect(normalizeDeviceClass(undefined)).toBe('managed');
    expect(normalizeDeviceClass('physical')).toBe('physical');
    expect(normalizePageRole(undefined)).toBe('app');
    expect(normalizePageRole('editor')).toBe('editor');
    for (const malformed of ['browser', null, '', 1]) {
      expect(normalizeDeviceClass(malformed)).toBeNull();
      expect(normalizePageRole(malformed)).toBeNull();
    }
  });

  it('reports either missing managed role as a broken command path', () => {
    const app = client({ pageId: 'app', role: 'app', commandReady: false });
    const editor = client({ pageId: 'editor', role: 'editor' });
    expect(hasManagedCommandRoles([app, editor])).toBe(true);
    expect(hasManagedCommandRoles([app])).toBe(false);
    expect(hasManagedCommandRoles([editor])).toBe(false);
    expect(
      hasManagedCommandRoles([
        editor,
        client({ deviceClass: 'physical', headsetId: 'quest', role: 'app' }),
      ]),
    ).toBe(false);
  });

  describe('normalizeBrowserHello', () => {
    it('keeps a current managed hello exactly', () => {
      expect(normalizeBrowserHello(managedHello, owner)).toEqual({
        browserEpoch: 3,
        commandReady: true,
        deviceClass: 'managed',
        headsetId: undefined,
        pageId: 'tab-a',
        role: 'app',
        sceneSessionId: undefined,
        sessionId: 'session-a',
        tabGeneration: 2,
      });
    });

    it('gives absent legacy fields their documented defaults', () => {
      expect(
        normalizeBrowserHello(
          { sessionId: 'session-a', browserEpoch: 3 },
          owner,
        ),
      ).toMatchObject({
        commandReady: false,
        deviceClass: 'managed',
        pageId: 'connection-1',
        role: 'app',
        tabGeneration: 1,
      });
      expect(
        normalizeBrowserHello(
          {
            sessionId: 'session-a',
            browserEpoch: 3,
            role: 'editor',
            tabId: 't',
          },
          owner,
        ),
      ).toMatchObject({ pageId: 't', role: 'editor' });
    });

    it.each([
      ['unknown deviceClass', { deviceClass: 'browser' }],
      ['null deviceClass', { deviceClass: null }],
      ['unknown role', { pageRole: 'viewer', role: 'viewer' }],
      ['null role', { pageRole: null, role: undefined }],
      ['conflicting roles', { pageRole: 'app', role: 'editor' }],
      ['null pageId', { pageId: null, tabId: undefined }],
      ['conflicting page ids', { pageId: 'tab-a', tabId: 'tab-b' }],
      ['empty pageId', { pageId: '', tabId: undefined }],
      ['overlong pageId', { pageId: 'x'.repeat(10_000), tabId: undefined }],
      ['string commandReady', { commandReady: 'true' }],
      ['null commandReady', { commandReady: null }],
      ['null tabGeneration', { tabGeneration: null }],
      ['string tabGeneration', { tabGeneration: '2' }],
      ['fractional tabGeneration', { tabGeneration: 1.5 }],
      ['zero tabGeneration', { tabGeneration: 0 }],
      ['negative tabGeneration', { tabGeneration: -1 }],
      ['unsafe tabGeneration', { tabGeneration: 2 ** 53 }],
      ['null sceneSessionId', { sceneSessionId: null }],
      ['numeric sceneSessionId', { sceneSessionId: 7 }],
      ['another session', { sessionId: 'session-b' }],
      ['a missing session', { sessionId: undefined }],
      ['another browser epoch', { browserEpoch: 2 }],
      ['a string browser epoch', { browserEpoch: '3' }],
    ])('rejects a managed hello with %s', (_name, patch) => {
      expect(normalizeBrowserHello({ ...managedHello, ...patch }, owner)).toBe(
        null,
      );
    });

    it('binds a physical hello to its paired headset, never to a claim', () => {
      const physicalHello = {
        ...managedHello,
        deviceClass: 'physical',
        sessionId: 'claimed',
        browserEpoch: 99,
        headsetId: 'spoofed',
      };
      expect(
        normalizeBrowserHello(physicalHello, {
          ...owner,
          headsetId: '192.168.1.5:5555',
        }),
      ).toMatchObject({
        browserEpoch: undefined,
        deviceClass: 'physical',
        headsetId: '192.168.1.5:5555',
        sessionId: 'session-a',
      });
      expect(normalizeBrowserHello(physicalHello, owner)).toBeNull();
    });

    it('lets a repeated hello change readiness but nothing else', () => {
      const first = normalizeBrowserHello(managedHello, owner)!;
      const ready = normalizeBrowserHello(
        { ...managedHello, commandReady: false },
        owner,
      )!;
      const reloaded = normalizeBrowserHello(
        { ...managedHello, tabGeneration: 3 },
        owner,
      )!;
      expect(isSameBrowserEndpoint(first, ready)).toBe(true);
      expect(isSameBrowserEndpoint(first, reloaded)).toBe(false);
      expect(
        isSameBrowserEndpoint(first, { ...first, deviceClass: undefined }),
      ).toBe(true);
    });
  });
});
