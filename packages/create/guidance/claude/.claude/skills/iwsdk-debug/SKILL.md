---
name: iwsdk-debug
description: Debug continuous behavior in WebXR scenes — physics, animations, collisions, game loops, or any real-time interaction that happens too fast for an agent to observe. Uses ECS pause/step/snapshot/diff to freeze time and inspect state frame by frame.
argument-hint: '[description of behavior to debug]'
---

# Debug Continuous Behavior

Real-time behavior (physics, animations, collisions, game loops) happens too fast for an agent to observe directly. By the time you take a screenshot, the action is over. This skill uses ECS time-control tools to freeze, step, and diff state frame by frame.

User request is in `$ARGUMENTS`.

## Core Workflow

Every debugging session follows this pattern:

1. **Set up** the scenario (position objects, aim controllers, etc.)
2. **`ecs_pause`** — freeze ECS updates right before the interesting moment
3. **`ecs_snapshot({ "label": "before" })`** — capture state before the action
4. **Trigger** the action (release grip, apply force, start animation, etc.)
5. **`ecs_step(count, delta)`** — advance a few frames at fixed timestep
6. **`browser_screenshot`** — visually verify what happened
7. **`ecs_snapshot({ "label": "after" })`** — capture state after stepping
8. **`ecs_diff({ "from": "before", "to": "after" })`** — see exactly what changed
9. **Repeat** steps 5-8, stepping further until the behavior completes
10. **`ecs_resume`** — return to normal execution when done

The key insight: **pause BEFORE triggering the action**, not after. If you pause after, you've already missed the first frames.

## Tool Reference

| Tool                                              | Purpose                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ecs_pause`                                       | Freeze all ECS system updates. Render loop continues — screenshots still work.       |
| `ecs_step({"count":N,"delta":SECONDS})`           | Advance N frames with fixed timestep (seconds). Must pause first.                    |
| `ecs_resume`                                      | Resume normal execution. First frame uses capped delta to avoid physics explosions.  |
| `ecs_snapshot({"label":"..."})`                   | Capture full ECS state. Stores up to 2 snapshots.                                    |
| `ecs_diff({"from":"...","to":"..."})`             | Compare two snapshots. Shows added/removed entities and field-level value changes.   |
| `ecs_toggle_system({"name":"...","paused":true})` | Pause/resume a single system. Use `ecs_list_systems` to discover names.              |
| `browser_screenshot`                              | Runtime visual verification — works while paused and auto-switches from editor view. |

## Stepping Guidelines

- **`delta`** is in seconds. Common values: `0.016` (60fps), `0.0139` (72fps/Quest refresh rate).
- **Start small** — step 1-3 frames first to catch the initial moment, then step more.
- **Don't overshoot** — stepping 100 frames at once defeats the purpose. Step in batches of 5-20.

## Patterns

Short domain-specific tips. Apply the core workflow above, plus these hints.

### Physics (falling, bouncing, collisions)

- Pause BEFORE releasing the object or applying force.
- Step 1-3 frames at `delta: 0.016` to catch initial acceleration.
- In diffs, check `PhysicsBody._linearVelocity` and `PhysicsBody._angularVelocity` to see motion direction and speed.
- Check `Transform.position` to track movement.
- If an object falls through a surface: verify the surface entity has both `PhysicsBody` (Static) and `PhysicsShape` (TriMesh for complex geometry).
- Use `ecs_query_entity` to inspect `PhysicsShape` and `PhysicsBody` on both the falling object and the surface.

### Grab and Throw

- Pause while the object is still held (trigger/grip engaged).
- Release the input (set button value to 0) while paused.
- Step frame by frame to observe the release velocity.
- In diffs, `PhysicsBody._linearVelocity` shows the throw direction and speed.
- If the object doesn't move after release: check that it has `PhysicsBody` with `state: Dynamic`.

### Animations and Transitions

- Step 1 frame at a time with `delta` matching your target framerate.
- Compare `Transform.position`, `Transform.orientation`, and `Transform.scale` across snapshots to track interpolation.
- Use screenshots between steps to observe visual progression.

### Collision Detection

- Pause just before two objects meet.
- Step 1 frame at a time.
- Watch for `PhysicsBody._linearVelocity` sign changes (indicates bounce/impact).
- Watch for `PhysicsBody._angularVelocity` spikes (indicates tumbling from impact).
- If objects pass through each other: check `PhysicsShape` exists on both entities, and verify shape types are appropriate (use `TriMesh` for complex static geometry).

### System Isolation

- Use `ecs_list_systems` to see all systems and their priorities.
- Use `ecs_toggle_system({ "name": "SystemName", "paused": true })` to pause a suspect system while others run.
- Step forward and observe — if the bug disappears, that system is the cause.
- Remember to unpause the system when done.

## Notes

- **Snapshots overwrite** — only 2 are stored. Label them clearly ("before"/"after") and diff before taking new ones.
- **Resume is safe** — the first frame after resume uses a capped delta to prevent physics explosions from accumulated time.
- **Render loop continues while paused** — screenshots always work, and the XR session stays alive.
- **Stepping requires pause** — `ecs_step` will fail if you haven't called `ecs_pause` first.
