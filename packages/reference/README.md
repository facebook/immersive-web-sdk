# `@iwsdk/reference`

Local semantic search and API reference tooling for Immersive Web SDK projects.
The package supplies the `iwsdk-reference` MCP server and is normally invoked
through `@iwsdk/cli` rather than called directly.

## Setup

Create-generated projects install this package as a development dependency.
Warm the pinned corpus and embedding model once before using reference queries:

```bash
npx iwsdk reference warmup
npx iwsdk reference status
```

The package intentionally does not embed the large reference corpus or model.
Warmup stores project state under `.iwsdk/reference` and reuses the shared model
and corpus caches. Internal or offline deployments can host the corpus payload
themselves and set `IWSDK_REFERENCE_ASSETS_BASE_URL`; the pinned model URLs must
also be reachable or already present in the shared cache.

## Queries

```bash
npx iwsdk reference search --input-json \
  '{"query":"create a grabbable object","limit":5}'
npx iwsdk reference api --input-json '{"name":"World.create"}'
npx iwsdk reference components
npx iwsdk reference systems
```

Run `npx iwsdk reference --help` for the complete command surface. When this
package is installed, `@iwsdk/cli` also registers its MCP adapter automatically.

## Sharp security override

The currently supported `@huggingface/transformers` release still declares
Sharp `^0.34.x`, while the patched Sharp line begins at 0.35. Create-generated
projects pin the compatible patched release in their root package manifest:

```json
{
  "overrides": {
    "sharp": "0.35.3"
  }
}
```

Add the same root override when installing `@iwsdk/reference` manually with
npm. IWSDK uses Transformers for text feature extraction; its test and release
matrices exercise that path with Sharp 0.35.3.

## License

MIT © Meta Platforms, Inc.
