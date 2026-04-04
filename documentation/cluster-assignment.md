# Cluster Assignment

`assignLightsToClusters` maps lights into frustum Z-slices and produces compact index buffers.

## Usage

```ts
import { assignLightsToClusters } from '../renderer/cluster/ClusterAssignment';

const assignment = assignLightsToClusters({
  grid: clusterGrid,
  nearPlane: 0.1,
  farPlane: 200,
  zPolicy: 'hybrid-log',
  lights,
});

// assignment.counts[clusterId]
// assignment.offsets[clusterId]
// assignment.lightIndices
```

## Output Layout

- `counts`: number of lights assigned to each cluster.
- `offsets`: start position in `lightIndices` for each cluster.
- `lightIndices`: flattened contiguous light index list.

## Current Behavior

- Point, spot, and area lights use view-space depth plus range to compute slice spans.
- Directional lights affect all slices.
- XY assignment is currently conservative (full XY coverage), with tighter frustum-space XY culling planned next.

## Notes

This is CPU-side scaffolding for the upcoming GPU cluster assignment pass and clustered shader decoding path.
