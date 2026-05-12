# GLXF / Editor Configuration

Physics components can be configured declaratively in GLXF scene files (exported by Meta Spatial Editor):

```json
{
  "com.iwsdk.components.PhysicsShape": {
    "shape": { "alias": "Auto", "value": 6 },
    "dimensions": { "value": [0, 0, 0] },
    "density": { "value": 1.0 },
    "friction": { "value": 0.5 },
    "restitution": { "value": 0.0 }
  },
  "com.iwsdk.components.PhysicsBody": {
    "state": { "alias": "DYNAMIC", "value": 1 },
    "gravityFactor": { "value": 1.0 },
    "linearDamping": { "value": 0.0 },
    "angularDamping": { "value": 0.0 }
  }
}
```

**State enum values in GLXF:**

- `0` = STATIC
- `1` = DYNAMIC
- `2` = KINEMATIC

**Shape enum values in GLXF:**

- `0` = Sphere
- `1` = Box
- `2` = Cylinder
- `3` = Capsules
- `4` = ConvexHull
- `5` = TriMesh
- `6` = Auto
