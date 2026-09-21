# Physics Example

This example demonstrates IWSDK physics with Havok-backed `PhysicsBody`,
`PhysicsShape`, and `PhysicsManipulation` components. Static and dynamic physics
objects are declared in `public/scenes/physics.iwsdk.scene.json`; `src/index.ts`
initializes the world and configures the welcome panel.

## What It Shows

- A static environment with `LocomotionEnvironment`, `PhysicsBody`, and
  `PhysicsShape`.
- Dynamic catalog objects with grabbable and physics components.
- The high-contrast `Dynamic Sphere` starts above the floor and in front of the
  default desktop camera. Its initial downward impulse and gravity make it fall
  onto the static environment, where damping lets it settle without leaving the
  default view.
- Sphere and cylinder physics objects declared in the native scene.
- A UIKitML panel for entering and exiting XR.

## Project Structure

```
physics/
├── src/
│   ├── index.ts
│   └── panel.ts
├── public/
│   ├── audio/
│   ├── scenes/physics.iwsdk.scene.json
│   ├── textures/
│   └── ui/welcome.uikitml
├── vite.config.ts
└── package.json
```

Shared catalog assets load from the immutable
`@iwsdk/example-assets@0.4.2` CDN catalog. Set
`VITE_IWSDK_EXAMPLE_ASSET_BASE_URL` to use a local mirror.

## Run

```bash
pnpm install
pnpm dev
```

Use the HTTPS URL reported by Vite or `npx @iwsdk/cli dev status`.

## Customization

Configure static physics objects in `public/scenes/physics.iwsdk.scene.json`.
Use runtime code for procedural objects, forces, simulation control, and
game-specific behavior.
