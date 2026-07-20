# Audio Example

This example demonstrates 3D positional audio in IWSDK. The scene is declared in
`public/scenes/audio.iwsdk.scene.json` and loaded with
`level: './scenes/audio.iwsdk.scene.json'`.

## What It Shows

- Three interactive robot objects with positional audio.
- Different playback modes: `restart`, `overlap`, and `fade-restart`.
- Directional audio cones and distance-based falloff.
- A UIKitML panel for entering and exiting XR.

## Project Structure

```
audio/
├── src/
│   ├── index.ts
│   ├── panel.ts
│   └── spin.ts
├── public/
│   ├── audio/
│   ├── scenes/audio.iwsdk.scene.json
│   ├── textures/
│   └── ui/
├── ui/
│   └── welcome.uikitml
├── vite.config.ts
└── package.json
```

The robot and environment meshes are served from the shared example asset
catalog at `/iwsdk-assets/...`.

## Run

```bash
pnpm install
pnpm dev
```

Use the HTTPS URL reported by Vite or `npx iwsdk dev status`.

## Customization

Add static audio emitters by editing `public/scenes/audio.iwsdk.scene.json` and
adding `AudioSource`, `RayInteractable`, and any custom components needed by
your systems. Add runtime-only behavior in `src/`.
