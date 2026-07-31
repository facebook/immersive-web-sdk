/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Synthetic Environment Module configuration
 * @deprecated Use `emulator.environment` instead
 */
export interface SEMOptions {
  /**
   * Default scene to load
   * @default 'living_room'
   */
  defaultScene?:
    | 'living_room'
    | 'meeting_room'
    | 'music_room'
    | 'office_large'
    | 'office_small';
}

export type AiMode = 'agent' | 'collaborate';

/**
 * AI agent tooling configuration.
 * Enables AI agent control of the emulated XR runtime via MCP + WebSocket.
 */
export interface AiOptions {
  /**
   * Usage mode:
   * - `'agent'`: Headless Playwright, fixed viewport, no DevUI.
   * - `'collaborate'`: Visible Playwright, freely resizable, DevUI on. Human and agent share the session.
   * @default 'collaborate'
   */
  mode?: AiMode;

  /**
   * Screenshot size constraint.
   * - In agent mode: sets the Playwright viewport dimensions directly.
   * - In collaborate mode: screenshots are downscaled to fit within
   *   this bounding box, preserving aspect ratio.
   * @default { width: 800, height: 800 }
   */
  screenshotSize?: { width?: number; height?: number };
}

/**
 * Managed IWSDK workspace configuration.
 * Enables the Playwright-managed runtime/editor workspace without
 * requiring an AI mode.
 */
export interface WorkspaceOptions {
  /**
   * Enable the managed workspace.
   * @default false unless ai is configured
   */
  enabled?: boolean;

  /**
   * Launch the managed browser when the dev server starts.
   * @default true
   */
  open?: boolean;

  /**
   * Launch the managed workspace headlessly.
   * @default false for workspace-only, derived from ai.mode when ai is set
   */
  headless?: boolean;

  /**
   * Screenshot size constraint for managed browser captures.
   * @default { width: 800, height: 800 }
   */
  screenshotSize?: { width?: number; height?: number };
}

/**
 * XR emulator configuration
 */
export interface EmulatorOptions {
  /**
   * XR device to emulate
   * @default 'metaQuest3'
   */
  device?: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';

  /**
   * When to activate the WebXR emulation
   * 'localhost' - only activate when running on localhost (127.0.0.1, localhost)
   * 'always' - always activate the emulation
   * RegExp - activate when hostname matches the provided regex pattern
   * @default 'localhost'
   */
  activation?: 'localhost' | 'always' | RegExp;

  /**
   * Synthetic environment to load in the emulator
   * @default undefined (no environment)
   */
  environment?:
    | 'living_room'
    | 'meeting_room'
    | 'music_room'
    | 'office_large'
    | 'office_small';

  /**
   * Inject script during build phase (in addition to dev)
   * @default false
   */
  injectOnBuild?: boolean;

  /**
   * User-Agent exception pattern. If the UA matches this RegExp, the
   * runtime will NOT be injected even if activation passes.
   * Useful to avoid injecting on real XR browsers like OculusBrowser.
   * @default /OculusBrowser/
   */
  userAgentException?: RegExp;

  /**
   * Whether to inject the IWER (Immersive Web Emulation Runtime).
   * - `true` (default): inject the emulator during development, subject to
   *   `activation` and `userAgentException` (which already skips real XR
   *   browsers such as OculusBrowser so headsets keep their native WebXR).
   * - `false`: never inject the emulator. Use this for browser-only apps, or to
   *   develop exclusively against native WebXR.
   *
   * @remarks
   * Note that `navigator.xr` exists in ordinary desktop Chrome (the API surface
   * is present even with no XR device), so its mere presence is not a reliable
   * signal for whether to emulate — hence a simple opt-out rather than
   * auto-detection.
   * @default true
   */
  iwer?: boolean;
}

/**
 * Options for IWSDK's cached, untrusted development certificate.
 */
export interface DevelopmentHttpsOptions {
  /**
   * Directory used to cache the generated certificate. Relative paths are
   * resolved from the Vite project root.
   * @default '<vite cacheDir>/iwsdk-https'
   */
  certDir?: string;

  /** Additional DNS names to include in the certificate. */
  domains?: string[];

  /** Certificate common name. */
  name?: string;

  /** Certificate lifetime in days. */
  ttlDays?: number;
}

/**
 * Main plugin options interface
 */
export interface DevPluginOptions {
  /**
   * Project module whose default export is the AssetManifest passed to
   * World.create. The managed editor imports the same module in its own realm.
   * @example './src/assets.ts'
   */
  assetManifest?: string;

  /**
   * System-free module whose default export is the ComponentManifest passed to
   * World.create. The managed editor imports the same module in its own realm.
   * @example './src/components.ts'
   */
  componentManifest?: string;

  /**
   * XR emulator configuration
   */
  emulator?: EmulatorOptions;

  /**
   * AI agent tooling configuration.
   * Enables AI agent control of the emulated XR runtime via MCP + WebSocket.
   * Omit to disable AI features entirely (no Playwright, no MCP bridge, no
   * runtime session publication).
   */
  ai?: AiOptions;

  /**
   * Managed workspace configuration. AI modes imply a managed workspace, but
   * this option can be used for manual editor workflows without an active AI
   * mode.
   */
  workspace?: WorkspaceOptions;

  /**
   * Configure the cached, self-signed HTTPS certificate used by the Vite dev
   * server. IWSDK enables it by default so WebXR is available on physical
   * headsets without installing a local certificate authority. The managed
   * Playwright browser accepts the certificate automatically; headset browsers
   * show their normal one-time warning.
   *
   * Set this to `false` to opt into HTTP. A `server.https` value supplied to
   * Vite takes precedence, so projects can also provide their own certificate.
   * @default true
   */
  https?: boolean | DevelopmentHttpsOptions;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

/** @deprecated Use `DevPluginOptions` instead */
export type IWERPluginOptions = DevPluginOptions;

/**
 * Internal processed options with all defaults applied
 */
export interface ProcessedDevOptions {
  assetManifest?: string;
  componentManifest?: string;
  device: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1';
  sem?: {
    defaultScene: string;
  };
  ai?: {
    mode: AiMode;
    headless: boolean;
    devUI: boolean;
    viewport: { width: number; height: number } | null;
    screenshotSize: { width: number; height: number };
  };
  workspace?: {
    enabled: boolean;
    open: boolean;
    headless: boolean;
    devUI: boolean;
    viewport: { width: number; height: number } | null;
    screenshotSize: { width: number; height: number };
  };
  injectOnBuild: boolean;
  activation: 'localhost' | 'always' | RegExp;
  verbose: boolean;
  userAgentException?: RegExp | string;
  iwer: boolean;
}

/** @deprecated Use `ProcessedDevOptions` instead */
export type ProcessedIWEROptions = ProcessedDevOptions;

/**
 * Injection bundle result
 */
export interface InjectionBundleResult {
  code: string;
  size: number;
}
