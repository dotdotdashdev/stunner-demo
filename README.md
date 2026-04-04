# Stripe Prototype

Vite + React scaffold for a rendering-heavy web game shell.

## What This Scaffold Provides

- WebGPU-first renderer with automatic WebGL2 fallback
- Stable canvas lifecycle isolated from React state updates
- React overlay (HUD/UI) on top of the render surface
- Basic websocket client hook for incoming game data

## Key Structure

- `src/renderer/RendererEngine.ts` initializes WebGPU/WebGL2 and owns the frame loop
- `src/renderer/CanvasStage.tsx` hosts the canvas and starts/stops the renderer
- `src/network/useGameSocket.ts` manages websocket connection and message preview
- `src/App.tsx` composes the canvas layer and HUD layer

## Canvas Stability Rule

The canvas should not be remounted or recreated on normal UI state changes.

This project enforces that by:

- Keeping renderer setup inside `CanvasStage` with a one-time effect
- Memoizing `CanvasStage` so parent updates do not trigger render restarts
- Separating HUD state and socket state from renderer internals

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Optional socket endpoint configuration:

```bash
cp .env.example .env
```

Default value:

```env
VITE_GAME_WS_URL=ws://localhost:8080/ws
```

3. Run dev server:

```bash
npm run dev
```

4. Production build:

```bash
npm run build
```
