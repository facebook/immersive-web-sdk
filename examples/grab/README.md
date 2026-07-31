# Grab Interactions Example

This example demonstrates one-hand, two-hand, and distance grabbing in IWSDK.
Its globe, landmarks, pins, and pyramids are declared in
`public/scenes/grab.iwsdk.scene.json` and loaded with
`level: './scenes/grab.iwsdk.scene.json'`.

## What It Shows

- A rotation-only `DistanceGrabbable` Earth with grabbable landmarks parented
  to its surface.
- `OneHandGrabbable` map pins.
- `DistanceGrabbable` and `TwoHandsGrabbable` pyramids.
- A UIKitML panel for entering and exiting XR.

## Project Structure

```
grab/
├── src/
│   ├── index.ts
│   └── panel.ts
├── public/
│   ├── audio/
│   ├── gltf/original-grab/
│   ├── scenes/grab.iwsdk.scene.json
│   ├── textures/
│   └── ui/welcome.uikitml
├── vite.config.ts
└── package.json
```

The room uses the shared asset catalog. The original Grab models are preserved
as standard GLB files from the example's earlier authoring source. The runtime
loads them directly from the asset manifest and native scene.

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
