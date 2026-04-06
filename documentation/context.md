# Engine Context For Coding Agents

This repository is a renderer-first codebase with optional extensibility for advanced GPU workflows.

## Primary runtime entry points

- App shell: `src/App.tsx`
- Renderer host: `src/stunner/renderer/CanvasStage.tsx`
- Engine core: `src/stunner/renderer/RendererEngine.ts`
- WebGPU pipeline: `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Config-first model

- Build config with `createRendererConfig(...)`.
- Runtime toggles compile back into `RendererConfig`.
- Quality/failover modules are utility layers, not autonomous subsystems.

## Data flow model

- Scene input is provided by `engine.setScene(scene)`.
- Instanced meshes support `cpuPacked` and `gpuExternal` draw sources.
- Optional frame hooks and stage injection extend WebGPU execution.

## Agent operating rules

- Verify behavior against source files, not assumptions from legacy docs.
- Preserve additive extension patterns; avoid breaking default rendering paths.
- Prefer config and typed APIs over ad hoc state wiring.
