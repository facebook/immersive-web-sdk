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
import type { ProcessedIWEROptions } from './types.js';

// Configuration will be replaced by the plugin
const CONFIG: ProcessedIWEROptions = '__IWER_CONFIG_REPLACEMENT_TOKEN__' as any;

// Device configuration mapping
const DEVICE_CONFIGS = {
  metaQuest2,
  metaQuest3,
  metaQuestPro,
  oculusQuest1,
} as const;

// Activation check function
function shouldActivate(
  activationMode: ProcessedIWEROptions['activation'],
  userAgentException?: ProcessedIWEROptions['userAgentException'],
): boolean {
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
function injectIWER(config: ProcessedIWEROptions): void {
  console.log('[IWER Plugin] Configuration:', config);

  const shouldActivateResult = shouldActivate(
    config.activation,
    config.userAgentException,
  );

  if (!shouldActivateResult) {
    if (config.verbose) {
      console.log('[IWER Plugin] Skipping activation - not on localhost');
    }
    return;
  }

  if (config.verbose) {
    console.log('[IWER Plugin] 🎯 Activating IWER runtime...');
  }

  try {
    // Create and configure XR device with the specified device config
    const deviceConfig =
      DEVICE_CONFIGS[config.device as keyof typeof DEVICE_CONFIGS];

    if (!deviceConfig) {
      const availableDevices = Object.keys(DEVICE_CONFIGS).join(', ');
      console.error(
        `[IWER Plugin] ❌ Invalid device configuration: "${config.device}"\n` +
          `Available devices: ${availableDevices}\n` +
          `Falling back to default device: metaQuest3`,
      );
    }

    const finalDeviceConfig = deviceConfig || metaQuest3;
    const xrDevice = new XRDevice(finalDeviceConfig);

    if (config.verbose) {
      console.log(
        '[IWER Plugin] 📱 Using device configuration:',
        deviceConfig ? config.device : 'metaQuest3 (fallback)',
      );
    }
    xrDevice.installRuntime();
    xrDevice.installDevUI(DevUI);

    // Configure SEM if provided
    if (config.sem) {
      if (config.verbose) {
        console.log(
          '[IWER Plugin] 🌐 Installing SEM with scene:',
          config.sem.defaultScene,
        );
      }

      // Install SEM and load environment from CDN
      xrDevice.installSEM(SyntheticEnvironmentModule);

      if (config.verbose) {
        console.log(
          '[IWER Plugin] 📍 Loading default environment from CDN:',
          config.sem.defaultScene,
        );
      }

      // Use SEM's built-in CDN loading (since __IS_UMD__ is true)
      xrDevice.sem?.loadDefaultEnvironment(config.sem.defaultScene);
    }

    if (config.verbose) {
      console.log('[IWER Plugin] ✅ Runtime activated successfully!');
    }

    // Expose for debugging
    (window as any).IWER_DEVICE = xrDevice;
  } catch (error) {
    console.error('[IWER Plugin] ❌ Failed to activate runtime:', error);
  }
}

// Execute with configuration
injectIWER(CONFIG);
