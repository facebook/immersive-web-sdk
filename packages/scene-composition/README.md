# @iwsdk/scene-composition

IWSDK-native scene document primitives for declarative scene authoring.

This package owns the browser-independent scene JSON contract used by the native
scene editor and agentic scene composition tools. It intentionally does not
import `three`, Vite, Playwright, or IWSDK runtime packages.

Exports include:

- `SCENE_DOCUMENT_JSON_SCHEMA` and `SCENE_DOCUMENT_SCHEMA_ID`
- scene document TypeScript types
- parser, serializer, and runtime validator
- deterministic, resolver-driven scene module composition for Node and browsers
- reversible scene patch operations and command history
- deterministic `lookAt`, snap-to-grid, and bounds-aware alignment helpers
- deterministic, browser-independent RGBA generation and hashes for versioned
  periodic procedural PBR maps

The package accepts one closed scene format: `iwsdk.scene.v1`. The exported
schema, TypeScript types, parser, serializer, and validator all describe that
same contract; there are no legacy readers or migration APIs.

## Scene modules

Any v1 document may declare ordered `imports`:

```json
{
  "imports": [
    {
      "id": "furniture",
      "src": "./modules/furniture.scene.json",
      "transform": { "position": [0, 0, -2] }
    }
  ]
}
```

Import IDs start with an ASCII letter and contain only letters, digits, `_`, or
`-`. `composeSceneDocument(root, { source, resolve })` recursively asks the
provided resolver for `{ source, document }`, where `source` is the canonical URL
or path of the returned module. The resolver receives the declared `src`, the
canonical importer when known, and the full namespace. It may return parsed JSON
or JSON text and may use `fetch`, filesystem APIs, an in-memory map, or another
application-specific transport.

Composition preserves declaration order. Imported node, resource, prefab, and
component-schema IDs and their references use slash namespaces such as
`furniture/chair`; nested imports use `room/furniture/chair`. Each import creates
a group wrapper named for its namespace segment, and its optional transform is
applied to that wrapper. Module asset URIs are rebased against the resolver's
canonical module source. Only the root document contributes `environment`,
`authoring`, and document metadata.

The result contains `{ document, dependencies }`. The composed document has no
remaining imports and is validated before return. Dependencies are a stable,
declaration-order preorder traversal with each import's `id`, full `namespace`,
declared `src`, resolved canonical `source`, and canonical `importer` when known.
Canonical resolved sources are also the cycle-detection identity.

The material contract supports `standard`, `physical`, and `basic` models.
Nodes may mark rendered infrastructure with `framingRole: "support"`; the default
`content` role keeps ordinary nodes in content-only camera framing bounds.
Standard and physical materials may declare independently seeded procedural albedo,
emissive, roughness, metalness, ambient-occlusion, alpha, normal, or bump maps using
the bounded `periodic-fbm-v1` algorithm. Capability snapshots advertise the supported
channels, algorithms, per-dimension limit, total texel budget, and total sample
budget; validation enforces those limits before runtime lowering.

Scene review rounds are zero-based: round `0` is the initial review and the
configured `maxCorrectionRounds` is the inclusive correction ceiling. Configured
`round-limit` stop reason is valid only at that ceiling. Configured review lenses
and recorded evidence use the canonical `layout`, `geometry`, `final` order; a
later configured lens cannot pass until every earlier one passes.
The assisted finalizer computes deterministic acceptance statuses and revision
identity from the active document. Failed nonterminal reviews use
`continue-refining`; that reason is invalid on a passing review, so it cannot
weaken the final publish gate.

The closed schema caps configured and recorded correction rounds at 10. Persistence
requires every round above zero to link by exact path and SHA-256 to the adjacent
immutable predecessor. Review waivers are portable data, but the editor server rejects
them until a trusted user-approval artifact exists; an `authorizedBy: "user"` literal
alone is not an authorization boundary.

Composition provenance is complete over declared inputs: it includes SHA-256 of the
exact UTF-8 prompt and each reference's declared digest. Prompt identity is
recomputed. External reference bytes are not claimed as verified without a trusted
byte provider.
