# Example Asset Provenance

The three models in this package are first-party IWSDK assets authored and owned
by Meta Platforms, Inc. and affiliates. The IWSDK maintainer confirmed their
first-party authorship and MIT redistribution terms on 2026-07-31. The package
ships the repository's MIT `LICENSE`; no attribution beyond its copyright and
permission notice is required.

## Publication evidence

Every catalog entry records:

- the exact historical repository URL for its approved source bytes;
- Meta Platforms, Inc. and affiliates as author and owner;
- the MIT SPDX identifier and repository license URL;
- the required copyright notice; and
- per-file byte sizes and SHA-256 hashes for the approved distributable bytes.

`prepublishOnly` validates this metadata and all catalog bytes before npm can
publish the package.

## Current custody record

All three assets first appear in the public repository at commit
`a3f9011096818777d16b423a6c17e40c82074e65`, exported by FBShipIt from source id
`a475ae3a56d133e8df6eec5b28d6a3c69b639615`. The fuller history available to
maintainers records the same bytes earlier in commit
`353e9e837e3e71c2e73c3c29bf06853d7996b8b9`, authored by Felix Zhang for the
initial audio example, and moved into the starter in
`34dd5014cd26c1a0500bfae99c15e3070ecb4c6e`. Together with the maintainer's
first-party ownership and MIT-license confirmation, these records establish the
publication provenance for the exact catalog hashes. The glTF files themselves
contain no embedded author, copyright, generator, license, or source metadata.

| Asset ID            | Historical authoring name | Author / owner                      | License |
| ------------------- | ------------------------- | ----------------------------------- | ------- |
| `environment-desk`  | `environment_desk`        | Meta Platforms, Inc. and affiliates | MIT     |
| `plant-sansevieria` | `PlantSansevieria`        | Meta Platforms, Inc. and affiliates | MIT     |
| `robot`             | `robot_v001`              | Meta Platforms, Inc. and affiliates | MIT     |

The file-level sizes and SHA-256 values in `src/catalog.json` identify the
authoritative approved bytes.
