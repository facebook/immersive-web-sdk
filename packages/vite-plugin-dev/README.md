# @iwsdk/vite-plugin-dev

Vite plugin for IWSDK development — XR emulation, AI agent tooling, and Playwright browser.

## Features

- 🥽 **Device Emulation** — Emulate Meta Quest 2, Quest 3, Quest Pro, or Quest 1 via [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime)
- 🏠 **Synthetic Environments** — Optional room-scale environments for AR testing
- 🤖 **AI Agent Tooling** — MCP-based tools for Claude Code, Cursor, Copilot, and Codex
- 🖥️ **Managed Browser** — Playwright browser for screenshots and console capture
- 🔧 **Zero Config** — Works out of the box with sensible defaults

## Installation

```bash
npm install -D @iwsdk/vite-plugin-dev
```

## Quick Start

```javascript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      verbose: true,
    }),
  ],
});
```

## Configuration Options

```javascript
iwsdkDev({
  emulator: {
    // XR device to emulate
    // Options: 'metaQuest2' | 'metaQuest3' | 'metaQuestPro' | 'oculusQuest1'
    device: 'metaQuest3', // default

    // Synthetic environment for AR room simulation
    // Options: 'living_room' | 'meeting_room' | 'music_room' | 'office_large' | 'office_small'
    environment: 'living_room',

    // When to activate emulation
    // 'localhost' - only on localhost/127.0.0.1 (default)
    // 'always' - always activate
    // RegExp - custom hostname pattern
    activation: 'localhost',

    // Inject during production build (not just dev)
    injectOnBuild: false, // default

    // User-Agent pattern to skip (avoids injection on real XR browsers)
    userAgentException: /OculusBrowser/, // default
  },

  // AI agent configuration — omit to disable entirely
  ai: {
    // Usage mode:
    // 'collaborate' - visible Playwright, freely resizable, DevUI on (default)
    // 'agent' - headless Playwright, fixed viewport, no DevUI
    mode: 'collaborate',

    // Screenshot size constraint (viewport in agent mode, downscale bound otherwise)
    screenshotSize: { width: 800, height: 800 }, // default
  },

  // Enable verbose logging
  verbose: false, // default
});
```

## Usage Examples

### Basic VR Development

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
});
```

### AR Development with Synthetic Environment

```javascript
iwsdkDev({
  emulator: {
    device: 'metaQuest3',
    environment: 'living_room',
  },
});
```

### AI Agent Mode

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
  ai: { mode: 'agent', screenshotSize: { width: 500, height: 500 } },
});
```

### Collaborate Mode (default; human + agent share session)

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
  ai: { mode: 'collaborate' },
});
```

### AI Disabled

```javascript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  iwsdkDev,
  type DevPluginOptions,
  type EmulatorOptions,
  type AiOptions,
  type AiMode,
} from '@iwsdk/vite-plugin-dev';
```

## License

MIT © Meta Platforms, Inc.
