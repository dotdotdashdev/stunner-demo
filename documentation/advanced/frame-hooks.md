# Advanced API: Frame Hooks

Agent target: run per-frame custom logic around engine frame execution.

## Source of truth

- `src/stunner/renderer/RendererEngine.ts`
- Types: `RendererFrameHooks`, `RendererFrameHookContext`, `RendererAfterFrameHookContext`

## Hook shape

- `beforeFrame(context)`
- `afterFrame(context)`
- `onError(phase, error, context)`

## Use cases

- Sync external simulation clocks with frame timing.
- Update external uniforms/buffers before stage execution.
- Emit diagnostics after frame completion.

## Agent guidance

- Keep hook work bounded; avoid heavy CPU operations.
- Use stage injection when deterministic pass positioning is required.
