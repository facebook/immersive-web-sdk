---
title: Config & Signals
---

# Config & Signals

System config values are reactive signals powered by `@preact/signals`. Define them in `createSystem(..., schema)`.

```ts
export class CameraShake extends createSystem(
  {},
  {
    intensity: { type: Types.Float32, default: 0 },
    decayPerSecond: { type: Types.Float32, default: 1 },
  },
) {
  update(dt: number) {
    const i = this.config.intensity.peek();
    if (i <= 0) return;
    // apply random offset scaled by i
    this.camera.position.x += (Math.random() - 0.5) * 0.01 * i;
    this.config.intensity.value = Math.max(
      0,
      i - this.config.decayPerSecond.peek() * dt,
    );
  }
}
```

### Reading vs Tracking

- `.value` — set and track.
- `.peek()` — read without tracking to avoid incidental subscriptions.
- `.subscribe(fn)` — run when the value changes.

```ts
const unsubscribe = this.config.intensity.subscribe((v) => console.log(v));
// later
unsubscribe();
```

### UI ↔ ECS wiring

Config signals are ideal for developer tools and UI controls:

```ts
// debugging slider
document.getElementById('intensity')!.addEventListener('input', (e) => {
  this.config.intensity.value = Number((e.target as HTMLInputElement).value);
});
```
