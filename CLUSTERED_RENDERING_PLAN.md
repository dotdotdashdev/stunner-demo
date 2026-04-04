# Clustered Rendering Execution Plan

This plan is the live source of truth for implementation and progress tracking.
Each completed step must include a successful build checkpoint.

## Constraints

- Keep the render canvas lifecycle stable and independent from UI state updates.
- Run `npm run build` between completed implementation steps.
- Add feature usage documentation under `documentation/` as each feature lands.
- Exclude for now: god rays and scene geometry/asset pipeline.

## Milestones

### Phase 1 - Foundation

- [x] 1.1 Create configurable renderer schema (clustered lights, shadows, AO, bloom, DoF+bokeh, color grading).
- [x] 1.2 Add render graph pass interfaces and resource descriptors.
- [x] 1.3 Add renderer metrics/timing interfaces.

### Phase 2 - Clustered Lighting Core

- [x] 2.1 Define cluster grid and Z-slice policy.
- [x] 2.2 Define light buffers for point/spot/area/directional.
- [x] 2.3 Implement cluster assignment pass.
- [x] 2.4 Integrate clustered lighting evaluation in shading pipeline.

### Phase 3 - Shadows

- [x] 3.1 Shadow config schema and quality ladder.
- [ ] 3.2 Directional shadow cascades framework.
- [ ] 3.3 Spot and point shadow mapping framework.
- [ ] 3.4 Filtering modes (hard/PCF) and per-light overrides.

### Phase 4 - Post Processing

- [ ] 4.1 Ambient occlusion pass framework.
- [ ] 4.2 Bloom pass framework.
- [ ] 4.3 Depth of field + bokeh pass framework.
- [ ] 4.4 Color grading + tone mapping pass framework.

### Phase 5 - Integration + Quality Tiers

- [ ] 5.1 Preset matrix for low/medium/high/ultra/custom.
- [ ] 5.2 Feature failover policy for weaker devices.
- [ ] 5.3 Runtime toggles and debug visualizations.

## Build Checkpoints

- [x] Checkpoint A - After 1.1 (`npm run build` passed)
- [x] Checkpoint B - After 1.2 (`npm run build` passed)
- [x] Checkpoint C - After 1.3 (`npm run build` passed)
- [x] Checkpoint D - After 2.2 (`npm run build` passed)
- [x] Checkpoint E - After 2.4 (`npm run build` passed)
- [ ] Checkpoint F - After 3.4
- [ ] Checkpoint G - After 4.4
- [ ] Checkpoint H - After 5.3

## Progress Log

- 2026-04-03: Started execution. Implemented renderer configuration schema and connected it to `RenderEngine` / `CanvasStage`. Added usage docs in `documentation/renderer-configuration.md`. Build checkpoint A passed.
- 2026-04-03: Implemented render graph pass/resource interfaces in `src/rendering/graph/*`. Added usage docs in `documentation/render-graph.md`. Build checkpoint B passed.
- 2026-04-03: Implemented renderer metrics interfaces and frame metrics store in `src/rendering/metrics/*` with engine integration. Added usage docs in `documentation/renderer-metrics.md`. Build checkpoint C passed.
- 2026-04-03: Implemented cluster grid and Z-slice policy utilities in `src/rendering/cluster/ClusterGrid.ts`. Added usage docs in `documentation/cluster-grid.md`. Build passed after step 2.1.
- 2026-04-03: Added typed light data and packed light buffer utilities for point/spot/directional/area lights in `src/rendering/lights/*`. Added usage docs in `documentation/light-buffers.md`. Build checkpoint D passed.
- 2026-04-03: Implemented CPU cluster light assignment scaffolding in `src/rendering/cluster/ClusterAssignment.ts` and documented usage in `documentation/cluster-assignment.md`. Build passed after step 2.3.
- 2026-04-03: Integrated clustered lighting evaluation into `RenderEngine` using cluster grid + assignment + light buffers, and documented usage in `documentation/clustered-lighting-integration.md`. Build checkpoint E passed.
- 2026-04-03: Added shadow quality ladder resolver and per-light shadow settings schema in `src/rendering/shadows/ShadowConfiguration.ts`, documented in `documentation/shadow-configuration.md`. Build passed after step 3.1.
