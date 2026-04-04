# Runtime Controls and Debug Views

Phase 5.3 adds runtime quality toggles and clustered debug views, exposed through the HUD.

## Runtime Controls API

`src/rendering/debug/RuntimeControls.ts` provides:

- `QUALITY_PRESETS`
- `DEBUG_VIEWS`
- `createDefaultRuntimeToggles()`
- `buildRuntimeRendererConfig(preset, debugView, toggles)`

## Debug Views

- `off`: normal lighting output.
- `clusters`: visualizes cluster density.
- `lights`: visualizes active-light heat.
- `shadows`: visualizes shadow-mode emphasis.

## UI Integration

The HUD in `src/App.tsx` now supports:

- Quality preset selection.
- Debug view selection.
- Feature toggles for shadows, AO, bloom, DoF, color grading.

These update renderer config via `CanvasStage` config updates and do not remount the canvas.

## Notes

- Debug visuals currently influence clear-color output as a framework integration path.
- Future geometry passes can reuse the same runtime control model for full-frame debug overlays.
