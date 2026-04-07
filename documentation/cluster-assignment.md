# Cluster Assignment API

Agent target: assign lights to cluster depth bands and produce compact index buffers.

## Source of truth

- `src/stunner/renderer/cluster/ClusterAssignment.ts`
- Function: `assignLightsToClusters(input)`

## Output buffers

- `counts[clusterId]`: number of lights for the cluster
- `offsets[clusterId]`: start index into `lightIndices`
- `lightIndices`: flat light index list

## Important behavior

- Directional lights are assigned across the full depth range.
- Non-directional lights with non-positive view depth are skipped.
- Current implementation assigns across all X/Y cells for the computed Z range.
