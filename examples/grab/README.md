# Grab Interactions Example

This example demonstrates one-hand, two-hand, and distance grabbing in IWSDK. The
static objects are declared in `public/scenes/grab.iwsdk.scene.json` and loaded
with `level: './scenes/grab.iwsdk.scene.json'`.

## What It Shows

- `OneHandGrabbable` on a catalog plant asset.
- `TwoHandsGrabbable` on a second plant asset.
- `DistanceGrabbable` on robot assets.
- A UIKitML panel for entering and exiting XR.

## Project Structure

```
grab/
├── src/
│   ├── index.ts
│   └── panel.ts
├── public/
│   ├── audio/
│   ├── scenes/grab.iwsdk.scene.json
│   ├── textures/
│   └── ui/
├── ui/
│   └── welcome.uikitml
├── vite.config.ts
└── package.json
```

Shared catalog assets are served at `/iwsdk-assets/...` by the example asset
Vite plugin.

## Run

```bash
pnpm install
pnpm dev
```

Use the HTTPS URL reported by Vite or `npx iwsdk dev status`.

## Customization

Add new grabbable scene objects in `public/scenes/grab.iwsdk.scene.json`.
Enable `grabbing: true` in `World.create` whenever objects use grabbable
components.
