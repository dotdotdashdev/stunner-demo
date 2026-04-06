# Cluster Grid API

Agent target: build clustered frustum partitions and map depth to Z slices.

## Source of truth

- `src/stunner/renderer/cluster/ClusterGrid.ts`
- Functions:
  - `createClusterGridInfo(viewportWidth, viewportHeight, config)`
  - `buildClusterGrid(params, policy)`
  - `depthToSlice(viewSpaceDepth, near, far, sliceCount, policy)`
  - `getClusterIndex(x, y, z, grid)`

## Policies

- `logarithmic`
- `hybrid-log`

## Behavior notes

- Cluster X/Y counts are derived from viewport and tile size.
- Z count is `config.zSlices` with minimum 1.
- Depth mapping clamps to `[near, far]`.
