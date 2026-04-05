# Screen Space Reflections (SSR) Integration Plan

## Goal

Introduce a WebGPU SSR pass so reflective materials can pick up scene reflections (not only sky/ground environment), while keeping GPU cost controlled and preserving current pipeline stability.

## Current Pipeline Reality (Source of Truth)

WebGPU frame sequence in `WebGpuPostGraph.render(...)`:

1. `scene-prepass` -> writes:
   - `scene-hdr` (`rgba16float`)
   - `scene-normal` (`rgba16float`)
   - `scene-material` (`rgba16float`)
   - `scene-depth` (`depth24plus`)
2. `ambient-occlusion` -> writes `ao` mask
3. `bloom-prefilter` -> `bloom-temp` blur chain -> `bloom`
4. `depth-of-field` prefilter/blur -> `dof`
5. `motion-blur` -> `motion-blur`
6. `color-grading` composite -> canvas

Important coupling details:

- AO is applied in composite (multiplies source color), not in-place into `scene-hdr`.
- DoF uses `scene-hdr` as source and outputs `dof`.
- Motion blur uses `dof` output as source and outputs `motion-blur`.
- Composite currently chooses source color as `motion-blur` when enabled, otherwise `dof`.
- `scene-material` currently stores:
  - `x`: highlight/emissive hint
  - `y`: linearized distance proxy (`dist / cameraFar`)
  - `z`: unused
  - `w`: unused

This means SSR can be integrated cleanly if we keep it as a separate pass that reads scene buffers and writes a dedicated reflection-applied color texture used by downstream passes.

## Why Isolation First

Directly injecting SSR into existing DoF/Motion/Composite logic will create fragile branching and resource coupling. A small isolation step first will make SSR safer:

- Introduce a stable intermediate "post-source color" texture contract.
- Make all downstream effects consume that contract instead of reading mixed upstream outputs.
- Keep AO/Bloom/DoF/Motion toggles behavior unchanged.

## Proposed Architecture

### 1) Add SSR Config + Runtime Toggle

Files:

- `src/stunner/renderer/config/RendererConfig.ts`
- `src/stunner/renderer/debug/RuntimeControls.ts`
- `src/App.tsx`

Changes:

- Add `ScreenSpaceReflectionsConfig` to `RendererConfig`:
  - `enabled: boolean`
  - `quality: 'low' | 'medium' | 'high'`
  - `maxSteps: number`
  - `maxDistance: number`
  - `thickness: number`
  - `stride: number`
  - `resolve: number` (blend strength)
  - `roughnessCutoff: number`
  - `downsample: 1 | 2`
- Set conservative defaults in presets:
  - low: disabled
  - medium/high/ultra: enabled with bounded sample budgets
- Add `screenSpaceReflections` to runtime feature toggles.
- Add HUD toggle button:
  - `SSR: On/Off`

### 2) Isolate Post Source Color Chain

File:

- `src/stunner/renderer/post/WebGpuPostGraph.ts`

Changes:

- Add dedicated textures:
  - `lighting-base` (`rgba16float`): copy/reference from `scene-hdr` baseline
  - `lighting-ssr` (`rgba16float`): SSR-resolved color
- Update pass flow contract:
  - DoF prefilter reads from `lighting-ssr` when SSR enabled, else `lighting-base`.
  - Motion blur reads from DoF output (same as now).
  - Composite reads from motion output (or DoF fallback), unchanged externally.
- Keep AO/bloom application logic in composite to avoid behavior drift.

This keeps SSR self-contained and avoids rewriting existing tone-mapping/composite behavior.

### 3) Extend G-Buffer Packing for SSR Eligibility

File:

- `src/stunner/renderer/post/WebGpuPostGraph.ts` (SCENE_SHADER WGSL)

Changes in `SceneOut.matBuf` packing:

- Keep current channels for compatibility, but populate unused channels:
  - `x`: emissive/highlight hint (unchanged)
  - `y`: depth proxy (unchanged)
  - `z`: roughness
  - `w`: metallic (or reflectivity mask)

SSR pass can then cheaply skip non-reflective pixels.

### 4) Add SSR Pass (WebGPU, Raster Full-Screen)

File:

- `src/stunner/renderer/post/WebGpuPostGraph.ts`

New resources:

- `ssr-hit` (`rgba16float`, optional half-res)
- `lighting-ssr` (`rgba16float`)

New pipelines:

- `ssrTracePipeline` (ray march + hit color gather)
- `ssrResolvePipeline` (blend SSR into source color with Fresnel/roughness weighting)

Inputs:

- `scene-hdr` (scene color source)
- `scene-normal`
- `scene-material`
- `scene-depth`
- post uniforms (camera vectors, FOV, near/far, SSR params)

Algorithm (performance-first):

1. Reconstruct view position from UV + depth proxy.
2. Compute reflection vector from normal + view direction.
3. March in screen space with fixed `maxSteps`, `stride`, and early-out:
   - stop when outside viewport
   - stop when marched distance exceeds `maxDistance`
   - hit when ray depth crosses scene depth within `thickness`
4. Sample `scene-hdr` at hit UV.
5. Fade by:
   - edge fade near screen borders
   - roughness fade (strongly attenuate rough surfaces)
   - Fresnel factor
   - hit confidence
6. Resolve into `lighting-ssr`:
   - if no hit, keep base color (no artifact-prone black holes)
   - if hit, blend by `resolve` and material reflectivity

Cost controls:

- Default to `downsample = 2` for medium quality.
- Skip SSR when `metallic < threshold` and `roughness > roughnessCutoff`.
- Cap steps by quality tier (example: 8 / 12 / 16).
- Keep no temporal history in V1 to avoid ghosting complexity.

### 5) Uniform Layout Update

File:

- `src/stunner/renderer/post/WebGpuPostGraph.ts`

Changes:

- Expand `POST_UNIFORMS_WGSL` + `POST_UNIFORM_FLOAT_COUNT` to include SSR params.
- Populate data in `postData` write block from `config.screenSpaceReflections`.

Suggested appended fields:

- `ssrEnabled`
- `ssrMaxSteps`
- `ssrMaxDistance`
- `ssrThickness`
- `ssrStride`
- `ssrResolve`
- `ssrRoughnessCutoff`
- `ssrDownsample`

### 6) Preserve CPU/WebGL2 Fallback Stability

Files:

- `src/stunner/renderer/post/PostProcessingGraph.ts`
- `src/stunner/renderer/debug/RuntimeControls.ts`

Behavior:

- Add config and toggle support globally.
- In CPU graph, implement SSR as explicit no-op/bypass result for now.
- Do not alter existing CPU pass output shape unless needed.

Reason: avoids regressions in non-WebGPU path while feature matures.

### 7) Telemetry and Guardrails

Files:

- `src/stunner/renderer/post/WebGpuPostGraph.ts`
- `src/stunner/renderer/metrics/RendererMetrics.ts` (no type change expected)

Changes:

- Add pass timings:
  - `screen-space-reflections-trace`
  - `screen-space-reflections-resolve`
- Add internal fail-safe:
  - If texture/bind group creation fails, fallback to non-SSR source path and continue rendering.

## Minimal Invasive Pass Order (After Integration)

1. `scene-prepass`
2. `ambient-occlusion`
3. `screen-space-reflections-trace`
4. `screen-space-reflections-resolve`
5. `bloom-prefilter`
6. `bloom-blur-horizontal`
7. `bloom-blur-vertical`
8. `depth-of-field-prefilter`
9. `depth-of-field-blur-horizontal`
10. `depth-of-field-blur-vertical`
11. `motion-blur`
12. `color-grading`

Rationale:

- SSR must happen before DoF/motion blur so reflections are post-processed consistently with the scene.
- Bloom should see SSR highlights so reflections can glow naturally.

## Rollout Plan

### Phase A: Plumbing + Toggle (Low Risk)

- Add config type/preset defaults.
- Add runtime toggle and HUD button.
- No rendering behavior changes yet.

### Phase B: Source Isolation (Low-Medium Risk)

- Introduce `lighting-base` / `lighting-ssr` texture contract.
- Wire current passes to new source contract.
- Validate output parity with SSR disabled.

### Phase C: SSR Pass V1 (Medium Risk)

- Implement trace + resolve shaders.
- Add bind groups, textures, pass execution, timings.
- Keep defaults conservative.

### Phase D: Tuning + Quality Matrix (Medium Risk)

- Tune presets for low/medium/high/ultra.
- Confirm frame-time deltas in each preset.
- Clamp quality automatically if frame budget exceeded (optional follow-up).

## Validation Checklist

Functional:

- SSR toggle changes reflections immediately without restarting renderer.
- Turning SSR off returns to current reflection behavior.
- Non-reflective rough materials do not show noisy artifacts.
- No black/magenta output if SSR misses; fallback always valid.

Pipeline stability:

- AO/Bloom/DoF/Motion/Color grading toggles still work as before.
- Debug views still render and remain readable.
- WebGL2 path remains operational.

Performance:

- Medium preset SSR cost target: typically <= 1.2 to 2.0 ms on mid-tier GPU.
- Low preset keeps SSR off by default.
- High/ultra remain under acceptable frame budget for demo scene.

## Risks and Mitigations

- Risk: artifact streaking on thin geometry.
  - Mitigation: depth thickness threshold + edge fade + conservative max distance.
- Risk: pipeline coupling regressions with DoF/motion.
  - Mitigation: isolate source contract before adding SSR passes.
- Risk: GPU cost spikes at high resolution.
  - Mitigation: half-res SSR path and capped steps by preset.
- Risk: stale documentation mismatch.
  - Mitigation: update docs after implementation with actual pass/resource names.

## Suggested First Implementation Delta

If implementing incrementally, first PR should contain only:

1. Config and runtime toggle plumbing (`screenSpaceReflections.enabled`).
2. HUD SSR button.
3. No-op SSR placeholders in WebGPU pass list and CPU fallback.

Then add shader/resource logic in a second PR to keep integration risk low and reviewable.