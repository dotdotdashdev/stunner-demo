# Render Graph Post-Processing Pipeline

This extension wires an ordered post-processing chain into the render graph and executes it each frame.

## Execution Order

0. `scene-prepass`
1. `clustered-lighting`
2. `ambient-occlusion`
3. `bloom`
4. `depth-of-field`
5. `color-grading`
6. backend `final-clear`

## Core Integration

- Pipeline runner: `src/rendering/post/PostProcessingGraph.ts`
- Synchronous render graph path: `src/rendering/graph/RenderGraph.ts` (`executeSync`)
- Frame resource store: `src/rendering/graph/FrameResourceStore.ts`
- Frame loop integration: `src/rendering/RenderEngine.ts`

## Frame Inputs

`PostProcessingGraph.execute(...)` consumes:

- active lights
- frame time/delta
- viewport size

Depth/normal/highlight proxies are now produced inside `scene-prepass` and written to graph resources.

## Resource Flow

Named resources written/read across passes:

- `scene-depth`
- `scene-normal-alignment`
- `scene-local-contrast`
- `scene-highlight`
- `lighting-result`
- `hdr-color`
- `ao-result`
- `bloom-result`
- `dof-result`
- `final-color`

## Frame Outputs

- `finalColor` used by both WebGPU and WebGL2 final clear
- pass timings propagated into renderer metrics

## Notes

- This is a real ordered pass execution path over framework-level effect evaluators.
- It keeps the existing stable-canvas lifecycle untouched.
- Future work can replace proxy input values with real depth/normal/history buffers and texture resources.
