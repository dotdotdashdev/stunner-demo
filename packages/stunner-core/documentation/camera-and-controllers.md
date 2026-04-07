# Camera and Input Controllers

Agent target: use these classes to drive camera pose in `CanvasStage`.

## Source of truth

- `src/stunner/camera/Camera.ts`
- `src/stunner/camera/KeyboardController.ts`
- `src/stunner/camera/MouseController.ts`
- `src/stunner/camera/TouchController.ts`
- Wiring entry (demo-owned): `src/demo/CanvasStage.tsx`

## Camera responsibilities

- Position/orientation state
- View/projection matrix derivation
- Direction vectors used by renderer telemetry and shading helpers

## Controller responsibilities

- Keyboard: movement and look shortcuts
- Mouse: look/pan/zoom interaction
- Touch: drag look and pinch zoom

## Agent guidance

- Always dispose controllers when recreating camera/canvas bindings.
