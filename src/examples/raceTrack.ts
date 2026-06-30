// Race-track example: a cartoon oval race track plus a retro cartoon car,
// loaded from glTF (.glb) binaries and merged into a single scene.
//
// This example is intentionally self-contained — it shares no logic with the
// other examples — because it is expected to grow significantly more complex.
//
// For now it does nothing but load the two models — no sky, environment map,
// or app-level post-processing effects.

import type { RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { loadGltfSceneFromUrl } from '@dotdotdash/stunner-core/renderer/mesh/GltfLoader';
import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';

export type RaceTrackExampleController = {
  dispose: () => void;
  /**
   * Engine-level customisation that the host (CanvasStage) merges into
   * `RendererEngine` options when constructing the engine. Currently empty —
   * the example no longer injects any post-process stages or frame hooks.
   */
  engineOptions: RendererEngineOptions;
};

type RaceTrackModel = {
  /** Stable id used to namespace the model's texture-library entries. */
  key: string;
  url: string;
};

const RACE_TRACK_MODELS: ReadonlyArray<RaceTrackModel> = [
  { key: 'track', url: '/models/race-track/cartoon_race_track_oval.glb' },
  { key: 'car', url: '/models/race-track/cicada_retro_cartoon_car.glb' },
];

// ── Multi-model merge ──────────────────────────────────────────────────────

// Re-key every entry in the scene's texture library with `prefix` and update
// every material reference to match. Required when merging multiple loaded
// glTF scenes into one because the loader assigns deterministic texture ids
// (e.g. "gltf-texture-0") that collide between source files.
const prefixSceneTextureIds = (scene: RenderScene, prefix: string): void => {
  const lib = scene.textureLibrary;
  if (!lib) return;
  const remap = new Map<string, string>();
  const newLib: Record<string, string> = {};
  for (const [oldId, value] of Object.entries(lib)) {
    const newId = `${prefix}|${oldId}`;
    remap.set(oldId, newId);
    newLib[newId] = value;
  }
  scene.textureLibrary = newLib;
  const seen = new Set<PbrMaterial>();
  const visitMat = (mat: PbrMaterial): void => {
    if (seen.has(mat)) return;
    seen.add(mat);
    const ids = mat.textureIds;
    if (!ids) return;
    for (const slot of Object.keys(ids) as Array<keyof typeof ids>) {
      const old = ids[slot];
      if (old !== undefined) {
        const replacement = remap.get(old);
        if (replacement !== undefined) ids[slot] = replacement;
      }
    }
  };
  for (const m of scene.meshes) visitMat(m.material);
};

// Append `source`'s meshes and texture-library entries into `target`.
const mergeSceneInto = (target: RenderScene, source: RenderScene): void => {
  for (const m of source.meshes) target.meshes.push(m);
  if (source.textureLibrary) {
    target.textureLibrary = target.textureLibrary ?? {};
    for (const [k, v] of Object.entries(source.textureLibrary)) {
      target.textureLibrary[k] = v;
    }
  }
};

export const startRaceTrackExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): RaceTrackExampleController => {
  let disposed = false;
  let modelDisposers: Array<() => void> = [];
  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    try {
      const total = RACE_TRACK_MODELS.length;
      const loaded = await Promise.all(
        RACE_TRACK_MODELS.map(async (model, idx) => {
          const result = await loadGltfSceneFromUrl(model.url);
          if (disposed) {
            result.dispose();
            return null;
          }
          onLoadingProgress?.((idx + 1) / total);
          return { model, result };
        }),
      );

      if (disposed) {
        for (const entry of loaded) entry?.result.dispose();
        return;
      }

      const valid = loaded.filter(
        (entry): entry is { model: RaceTrackModel; result: Awaited<ReturnType<typeof loadGltfSceneFromUrl>> } =>
          entry !== null,
      );
      if (valid.length === 0) {
        onLoadingProgress?.(null);
        return;
      }

      modelDisposers = valid.map((entry) => entry.result.dispose);

      // Build a combined scene from the first model; namespace its textures,
      // then merge the rest in with their own namespacing.
      const combined: RenderScene = {
        meshes: [...valid[0]!.result.meshes],
        textureLibrary: { ...valid[0]!.result.textureLibrary },
        lights: [],
      };
      prefixSceneTextureIds(combined, valid[0]!.model.key);

      for (let i = 1; i < valid.length; i += 1) {
        const src: RenderScene = {
          meshes: valid[i]!.result.meshes,
          textureLibrary: valid[i]!.result.textureLibrary,
          lights: [],
        };
        prefixSceneTextureIds(src, valid[i]!.model.key);
        mergeSceneInto(combined, src);
      }

      if (combined.lights.length === 0) {
        combined.directionalLightingEnabled = true;
        combined.directionalLightingIntensity = 1;
      }

      applyScene(combined);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('raceTrack example failed to load.', err);
    }
  })();

  const engineOptions: RendererEngineOptions = {};

  return {
    engineOptions,
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const dispose of modelDisposers) dispose();
      modelDisposers = [];
    },
  };
};
