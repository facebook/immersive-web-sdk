<h1 align="center">create-iwsdk</h1>

<p align="center">
    <a href="https://www.npmjs.com/package/@iwsdk/create"><img src="https://badgen.net/npm/v/@iwsdk/create/?icon=npm&color=orange" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/@iwsdk/create"><img src="https://badgen.net/npm/dt/@iwsdk/create" alt="npm download" /></a>
    <a href="https://raw.githubusercontent.com/facebook/immersive-web-sdk/main/LICENSE"><img src="https://badgen.net/github/license/facebook/immersive-web-sdk/" alt="license" /></a>
</p>

<p align="center"><strong>Scaffold a new Immersive Web SDK project in seconds.</strong></p>

## Quick Start

```bash
npm create @iwsdk@latest
```

Or with other package managers:

```bash
# pnpm
pnpm create @iwsdk@latest

# yarn
yarn create @iwsdk

# bun
bun create @iwsdk
```

## Interactive Prompts

The CLI will guide you through:

1. **Project name** - Directory name for your new project
2. **Language** - TypeScript or JavaScript
3. **Platform** - VR (Virtual Reality) or AR (Augmented Reality)
4. **XR Features** - Hand tracking, layers, anchors, hit-test, plane/mesh detection (tri-state: No/Optional/Required)
5. **SDK Features** - Locomotion (VR), Scene Understanding (AR), Grabbing, Physics
6. **Git & Install** - Initialize git repo and install dependencies

## What You Get

A fully configured project with:

- ⚡ **Vite** - Fast dev server with HMR
- 🎮 **WebXR Emulator** - Develop without VR hardware
- 📦 **GLTF Optimization** - Automatic asset compression
- 🔒 **HTTPS** - Required for WebXR, auto-configured
- 🧩 **Native scene workflow** - IWSDK scene JSON and editor tooling

## Example

```bash
$ npm create @iwsdk@latest

===============================================
IWSDK Create CLI v0.2.2
Node v20.19.0

? Project name › iwsdk-app
? Which language do you want to use? › TypeScript
? What type of experience are you building? › Virtual Reality
? Enable Hand Tracking? › Optional
? Enable WebXR Layers? › Optional
? Enable locomotion? › Yes
? Deploy locomotion engine on a Worker? › Yes (recommended)
? Enable grabbing (one/two-hand, distance)? › Yes
? Enable physics simulation (Havok)? › No
? Set up a Git repository? › Yes
? Install dependencies now? › Yes
```

## Command Line Options

```bash
# Provide project name directly
npm create @iwsdk@latest my-app

# Skip all prompts and use defaults
npm create @iwsdk@latest my-app -- -y

# Use canary SDK bundle
npm create @iwsdk@latest -- --canary
```

| Flag           | Description                              |
| -------------- | ---------------------------------------- |
| `[name]`       | Project name (first positional argument) |
| `-y, --yes`    | Skip prompts and use defaults (VR + TS)  |
| `--canary`     | Use the default canary SDK bundle        |
| `--canary URL` | Use a custom HTTP(S) SDK bundle          |

## Generated Templates

Based on your choices, one of these variants is generated:

| Template ID    | Description                       |
| -------------- | --------------------------------- |
| `vr-manual-ts` | VR + TypeScript + native workflow |
| `vr-manual-js` | VR + JavaScript + native workflow |
| `ar-manual-ts` | AR + TypeScript + native workflow |
| `ar-manual-js` | AR + JavaScript + native workflow |

The scaffolded project includes native scene JSON under `public/scenes/` and is
ready for declarative scene authoring through the IWSDK managed workspace.

## Requirements

- Node.js 20.19.0 or higher

## Documentation

For guides and tutorials, visit: **[https://iwsdk.dev](https://iwsdk.dev)**

## License

MIT © Meta Platforms, Inc.

---

<details>
<summary><strong>Development (for contributors)</strong></summary>

### Local Development

```bash
# Build the CLI
pnpm --filter @iwsdk/create build

# Run locally
pnpm --filter @iwsdk/create dev
```

### Module Layout

- `src/cli.ts` — Entrypoint: parses flags, runs prompts, scaffolds project
- `src/prompts.ts` — Interactive questions and defaults
- `src/recipes.ts` — Fetch helpers for CDN-hosted recipes
- `src/scaffold.ts` — Wraps Chef's `buildProject` and writes files
- `src/installer.ts` — Dependency installation and next steps
- `src/types.ts` — Shared types (`VariantId`, `TriState`, `PromptResult`)

### How It Works

The CLI uses [@pmndrs/chef](https://github.com/pmndrs/chef) to apply recipes fetched from jsDelivr CDN. Recipes and assets live in the `@iwsdk/starter-assets` package.

</details>
