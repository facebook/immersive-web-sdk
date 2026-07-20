/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DevUI } from '@iwer/devui';
import { SyntheticEnvironmentModule } from '@iwer/sem';
import {
  XRDevice,
  metaQuest2,
  metaQuest3,
  metaQuestPro,
  oculusQuest1,
} from 'iwer';
import { initMCPClient } from './mcp/ws-client.js';
import type { ProcessedDevOptions } from './types.js';

// Configuration will be replaced by the plugin
const CONFIG: ProcessedDevOptions = '__IWSDK_DEV_CONFIG__' as any;

// Device configuration mapping
const DEVICE_CONFIGS = {
  metaQuest2,
  metaQuest3,
  metaQuestPro,
  oculusQuest1,
} as const;

type SEMConstructor = Parameters<XRDevice['installSEM']>[0];
// @iwer/sem is runtime-compatible with installSEM, but its published type lags
// IWER's SEMConstructor interface.
const SEM_CONSTRUCTOR = SyntheticEnvironmentModule as unknown as SEMConstructor;

// Activation check function
function shouldActivate(
  activationMode: ProcessedDevOptions['activation'],
  userAgentException?: ProcessedDevOptions['userAgentException'],
  iwer?: ProcessedDevOptions['iwer'],
): boolean {
  // IWER is opt-out. `false` should never reach here (the plugin skips bundle
  // generation entirely when iwer is false), but guard defensively.
  if (iwer === false) {
    return false;
  }

  // UA exception: if provided and matches current UA, block activation
  if (userAgentException) {
    const ua = navigator.userAgent || '';

    if (userAgentException instanceof RegExp) {
      if (userAgentException.test(ua)) {
        return false;
      }
    } else if (
      typeof userAgentException === 'string' &&
      userAgentException.startsWith('/') &&
      userAgentException.endsWith('/')
    ) {
      const pattern = userAgentException.slice(1, -1);
      try {
        const regex = new RegExp(pattern);
        if (regex.test(ua)) {
          return false;
        }
      } catch {
        // ignore invalid pattern; fail open to activation checks
      }
    }
  }

  if (activationMode === 'always') {
    return true;
  }

  if (activationMode === 'localhost') {
    return (
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    );
  }

  // If activationMode is a RegExp object, test it directly
  if (activationMode instanceof RegExp) {
    return activationMode.test(location.hostname);
  }

  // If activationMode is a regex pattern (as a string), test it
  if (typeof activationMode === 'string') {
    if (
      (activationMode as string).startsWith('/') &&
      (activationMode as string).endsWith('/')
    ) {
      const pattern = (activationMode as string).slice(1, -1); // Remove leading and trailing slashes
      const regex = new RegExp(pattern);
      return regex.test(location.hostname);
    }
  }

  return false;
}

// Main injection function
function initDevRuntime(config: ProcessedDevOptions): void {
  console.log('[IWSDK Dev] Configuration:', config);

  const shouldActivateResult = shouldActivate(
    config.activation,
    config.userAgentException,
    config.iwer,
  );

  if (!shouldActivateResult) {
    if (config.verbose) {
      const reason =
        config.iwer === false
          ? 'IWER disabled (iwer: false)'
          : 'activation conditions not met (localhost / user-agent)';
      console.log(`[IWSDK Dev] Skipping activation - ${reason}`);
    }
    return;
  }

  if (config.verbose) {
    console.log('[IWSDK Dev] 🎯 Activating IWER runtime...');
  }

  try {
    // Create and configure XR device with the specified device config
    const deviceConfig =
      DEVICE_CONFIGS[config.device as keyof typeof DEVICE_CONFIGS];

    if (!deviceConfig) {
      const availableDevices = Object.keys(DEVICE_CONFIGS).join(', ');
      console.error(
        `[IWSDK Dev] ❌ Invalid device configuration: "${config.device}"\n` +
          `Available devices: ${availableDevices}\n` +
          `Falling back to default device: metaQuest3`,
      );
    }

    const finalDeviceConfig = deviceConfig || metaQuest3;
    const xrDevice = new XRDevice(finalDeviceConfig);

    if (config.verbose) {
      console.log(
        '[IWSDK Dev] 📱 Using device configuration:',
        deviceConfig ? config.device : 'metaQuest3 (fallback)',
      );
    }
    xrDevice.installRuntime();

    // DevUI visibility per session:
    // - Normal browser tabs (not Playwright-managed): always show DevUI
    // - Playwright-managed tabs: follow the mode's devUI setting
    const isManagedTab = (window as any).__IWER_MCP_MANAGED;
    if (!config.ai || !isManagedTab || config.ai.devUI) {
      xrDevice.installDevUI(DevUI);
    }

    // Configure SEM if provided
    if (config.sem) {
      if (config.verbose) {
        console.log(
          '[IWSDK Dev] 🌐 Installing SEM with scene:',
          config.sem.defaultScene,
        );
      }

      // Install SEM and load environment from CDN
      xrDevice.installSEM(SEM_CONSTRUCTOR);

      if (config.verbose) {
        console.log(
          '[IWSDK Dev] 📍 Loading default environment from CDN:',
          config.sem.defaultScene,
        );
      }

      // Use SEM's built-in CDN loading (since __IS_UMD__ is true)
      xrDevice.sem?.loadDefaultEnvironment(config.sem.defaultScene);
    }

    // Initialize MCP client only in the Playwright-managed tab.
    // Manual browser tabs get IWER + DevUI but are not remote-controlled.
    if (config.ai && (window as any).__IWER_MCP_MANAGED) {
      if (config.verbose) {
        console.log('[IWSDK Dev] 🔌 Initializing MCP client...');
      }

      const mcpClient = initMCPClient(xrDevice, {
        verbose: config.verbose,
      });

      // Expose MCP client for debugging
      (window as any).IWER_MCP = mcpClient;

      if (config.verbose) {
        console.log('[IWSDK Dev] ✅ MCP client initialized');
      }
    }

    if (config.verbose) {
      console.log('[IWSDK Dev] ✅ Runtime activated successfully!');
    }

    // Expose for debugging
    (window as any).IWER_DEVICE = xrDevice;
  } catch (error) {
    console.error('[IWSDK Dev] ❌ Failed to activate runtime:', error);
  }
}

// Execute with configuration
initDevRuntime(CONFIG);
