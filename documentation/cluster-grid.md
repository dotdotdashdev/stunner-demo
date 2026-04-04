# Cluster Grid and Z-Slice Policy

Clustered shading starts by splitting the camera frustum into a 3D grid.

## API

Use `buildClusterGrid` from `src/renderer/cluster/ClusterGrid.ts`:

```ts
import { buildClusterGrid } from '../renderer/cluster/ClusterGrid';

const cluster = buildClusterGrid(
  {
    viewportWidth: 1920,
    viewportHeight: 1080,
    nearPlane: 0.1,
    farPlane: 200,
    config: rendererConfig.clustered,
  },
  'hybrid-log',
);

const zSlice = cluster.toSlice(12.5);
```

## Policies

- `logarithmic`: stronger precision near camera.
- `hybrid-log`: blends linear + log distribution for more stable transitions.

## Outputs

- `grid.clustersX`, `grid.clustersY`, `grid.clustersZ`
- `grid.clusterCount`
- `getClusterIndex(...)` for flattening 3D cluster coords

## Notes

- Current implementation is CPU utility scaffolding for upcoming GPU cluster assignment.
- Cluster AABB construction and light list generation are planned in subsequent steps.
