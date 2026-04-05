# Stunner Engine

Vite + React foundation for a rendering-focused web engine shell.

## What This Project Provides

- WebGPU-first renderer with automatic WebGL2 fallback
- Stable canvas lifecycle isolated from React state updates
- React overlay (HUD/UI) on top of the render surface

## Key Structure

- `src/stunner/renderer/RendererEngine.ts` initializes WebGPU/WebGL2 and owns the frame loop
- `src/stunner/renderer/CanvasStage.tsx` hosts the canvas and starts/stops the renderer
- `src/App.tsx` composes the canvas layer and HUD layer
- `src/stunner/camera/Camera.ts` stores camera transform/projection and matrix outputs
- `src/stunner/camera/*Controller.ts` provides touch, mouse, and keyboard camera interaction classes

## Documentation Highlights

- `documentation/camera-and-controllers.md` explains camera API, direction vectors, controller setup, and controls
- `documentation/fog.md` explains fog configuration, runtime toggles, and tuning guidance

## Canvas Stability Rule

The canvas should not be remounted or recreated on normal UI state changes.

This project enforces that by:

- Keeping renderer setup inside `CanvasStage` with a one-time effect
- Memoizing `CanvasStage` so parent updates do not trigger render restarts
- Separating HUD state from renderer internals

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Production build:

```bash
npm run build
```
