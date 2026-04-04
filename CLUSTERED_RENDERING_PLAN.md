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
- [x] 3.2 Directional shadow cascades framework.
- [x] 3.3 Spot and point shadow mapping framework.
- [x] 3.4 Filtering modes (hard/PCF) and per-light overrides.

### Phase 4 - Post Processing

- [x] 4.1 Ambient occlusion pass framework.
- [x] 4.2 Bloom pass framework.
- [x] 4.3 Depth of field + bokeh pass framework.
- [x] 4.4 Color grading + tone mapping pass framework.

### Phase 5 - Integration + Quality Tiers

- [x] 5.1 Preset matrix for low/medium/high/ultra/custom.
- [x] 5.2 Feature failover policy for weaker devices.
- [x] 5.3 Runtime toggles and debug visualizations.

## Build Checkpoints

- [x] Checkpoint A - After 1.1 (`npm run build` passed)
- [x] Checkpoint B - After 1.2 (`npm run build` passed)
- [x] Checkpoint C - After 1.3 (`npm run build` passed)
- [x] Checkpoint D - After 2.2 (`npm run build` passed)
- [x] Checkpoint E - After 2.4 (`npm run build` passed)
- [x] Checkpoint F - After 3.4 (`npm run build` passed)
- [x] Checkpoint G - After 4.4 (`npm run build` passed)
- [x] Checkpoint H - After 5.3 (`npm run build` passed)

## Progress Log

- 2026-04-03: Started execution. Implemented renderer configuration schema and connected it to `RenderEngine` / `CanvasStage`. Added usage docs in `documentation/renderer-configuration.md`. Build checkpoint A passed.
- 2026-04-03: Implemented render graph pass/resource interfaces in `src/rendering/graph/*`. Added usage docs in `documentation/render-graph.md`. Build checkpoint B passed.
- 2026-04-03: Implemented renderer metrics interfaces and frame metrics store in `src/rendering/metrics/*` with engine integration. Added usage docs in `documentation/renderer-metrics.md`. Build checkpoint C passed.
- 2026-04-03: Implemented cluster grid and Z-slice policy utilities in `src/rendering/cluster/ClusterGrid.ts`. Added usage docs in `documentation/cluster-grid.md`. Build passed after step 2.1.
- 2026-04-03: Added typed light data and packed light buffer utilities for point/spot/directional/area lights in `src/rendering/lights/*`. Added usage docs in `documentation/light-buffers.md`. Build checkpoint D passed.
- 2026-04-03: Implemented CPU cluster light assignment scaffolding in `src/rendering/cluster/ClusterAssignment.ts` and documented usage in `documentation/cluster-assignment.md`. Build passed after step 2.3.
- 2026-04-03: Integrated clustered lighting evaluation into `RenderEngine` using cluster grid + assignment + light buffers, and documented usage in `documentation/clustered-lighting-integration.md`. Build checkpoint E passed.
- 2026-04-03: Added shadow quality ladder resolver and per-light shadow settings schema in `src/rendering/shadows/ShadowConfiguration.ts`, documented in `documentation/shadow-configuration.md`. Build passed after step 3.1.
- 2026-04-03: Implemented directional cascade split framework in `src/rendering/shadows/DirectionalShadowCascades.ts` and documented usage in `documentation/directional-shadow-cascades.md`. Build passed after step 3.2.
- 2026-04-03: Implemented spot/point shadow atlas planning utilities in `src/rendering/shadows/SpotPointShadowMapping.ts` and documented usage in `documentation/spot-point-shadow-mapping.md`. Build passed after step 3.3.
- 2026-04-03: Implemented shadow filter kernels and per-light override resolution in `src/rendering/shadows/ShadowFiltering.ts`, documented in `documentation/shadow-filtering-overrides.md`. Build checkpoint F passed.
- 2026-04-03: Added ambient occlusion framework utilities in `src/rendering/post/AmbientOcclusion.ts` and documented usage in `documentation/ambient-occlusion.md`. Build passed after step 4.1.
- 2026-04-03: Added bloom extraction and mip-chain planning utilities in `src/rendering/post/Bloom.ts` and documented usage in `documentation/bloom.md`. Build passed after step 4.2.
- 2026-04-03: Added depth-of-field and bokeh evaluation utilities in `src/rendering/post/DepthOfField.ts` and documented usage in `documentation/depth-of-field-bokeh.md`. Build passed after step 4.3.
- 2026-04-03: Added color grading and tone mapping utilities in `src/rendering/post/ColorGrading.ts` and documented usage in `documentation/color-grading-tone-mapping.md`. Build checkpoint G passed.
- 2026-04-03: Added quality preset matrix utilities in `src/rendering/quality/QualityMatrix.ts` and documented usage in `documentation/quality-matrix.md`. Build passed after step 5.1.
- 2026-04-03: Added quality failover policy utilities in `src/rendering/quality/FailoverPolicy.ts` and documented usage in `documentation/failover-policy.md`. Build passed after step 5.2.
- 2026-04-03: Added runtime quality/debug control utilities in `src/rendering/debug/RuntimeControls.ts` and integrated HUD toggles/debug views via `src/App.tsx`. Documented usage in `documentation/runtime-controls-and-debug-views.md`. Build checkpoint H passed.
