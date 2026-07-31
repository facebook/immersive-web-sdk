# Original Grab Assets

These standard GLB assets preserve the globe-and-landmarks composition from
the historical Grab example introduced in commit `ba351ba5`.

They were exported once from the example's earlier authoring source at
`ff2b7af5^`. The current example loads them through its normal IWSDK asset
manifest and native scene JSON; no external authoring pipeline is needed at
runtime or build time.

The historical exporter padded GLB JSON chunks with null bytes. Those padding
bytes were normalized to the spaces required by the GLB 2.0 specification so
the assets load in standards-compliant glTF loaders.
