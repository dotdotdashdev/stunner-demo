// Race-track example: a cartoon oval race track plus a retro cartoon car,
// loaded from glTF (.glb) binaries and merged into a single scene.
//
// This example is intentionally self-contained — it shares no logic with the
// other examples — because it is expected to grow significantly more complex.
//
// For now it does nothing but load the two models — no sky, environment map,
// or app-level post-processing effects.

import type { Mat4, RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import {
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4Translation,
} from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { loadGltfSceneFromUrl } from '@dotdotdash/stunner-core/renderer/mesh/GltfLoader';
import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';

// ── Camera views ────────────────────────────────────────────────────────────

export type RaceTrackCameraView = 'interior' | 'follow';

export type RaceTrackCameraViewSettings = {
  /** Car-local offset (metres), rotated by the car's heading and added to its world position. */
  offset: [number, number, number];
  /** Additional yaw (degrees about +Y) applied on top of the car's heading (plus the fixed 180° flip). */
  yawDegrees: number;
  /** Additional pitch (degrees about the local +X axis), applied before yaw. Positive tilts the view upward. No roll. */
  pitchDegrees: number;
};

export type RaceTrackExampleOptions = {
  /** Active camera view. The camera is always rigidly attached to the car — there is no free/manual mode. */
  cameraView: RaceTrackCameraView;
  interior: RaceTrackCameraViewSettings;
  follow: RaceTrackCameraViewSettings;
};

export const DEFAULT_RACE_TRACK_OPTIONS: RaceTrackExampleOptions = {
  cameraView: 'interior',
  interior: { offset: [0, 1.374, 0], yawDegrees: -90, pitchDegrees: 0 },
  follow: { offset: [8, 3, 0], yawDegrees: -90, pitchDegrees: 0 },
};

/**
 * The car's current world pose. Position/yaw are static today but read live
 * each frame so a future driving routine can move the car without any
 * camera-side changes.
 */
export type RaceTrackCarPose = {
  position: [number, number, number];
  yawRadians: number;
};

// Rotate a direction vector (w = 0) by a column-major 4x4 matrix, ignoring
// translation.
const rotateVec3ByMat4 = (m: Mat4, v: [number, number, number]): [number, number, number] => {
  const [x, y, z] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
};

// Reference forward axis for the car's own local space (used both for the
// "car forward" the camera aligns to and as the camera's own look direction
// once rotated). Arbitrary but must stay consistent with the `offset`
// values above, which were authored against this axis.
const RACE_TRACK_CAR_FORWARD_AXIS: [number, number, number] = [0, 0, 1];

/**
 * Compute a world-space camera location + forward vector for `view`, rigidly
 * attached to the car at `carPose`. The offset is rotated by the car's
 * heading only (it is a fixed mounting point); the look direction is the
 * car's forward direction plus a fixed 180° correction (the camera faces
 * back along the car, e.g. from the driver's seat or a chase position)
 * plus the view's own yaw/pitch adjustment.
 */
export const computeRaceTrackCameraPose = (
  carPose: RaceTrackCarPose,
  view: RaceTrackCameraViewSettings,
): { location: [number, number, number]; forward: [number, number, number] } => {
  const carYawMat = mat4RotationY(carPose.yawRadians);
  const worldOffset = rotateVec3ByMat4(carYawMat, view.offset);
  const location: [number, number, number] = [
    carPose.position[0] + worldOffset[0],
    carPose.position[1] + worldOffset[1],
    carPose.position[2] + worldOffset[2],
  ];

  const totalYaw = carPose.yawRadians + Math.PI + (view.yawDegrees * Math.PI) / 180;
  const pitchRadians = (view.pitchDegrees * Math.PI) / 180;
  const rotation = mat4Multiply(mat4RotationY(totalYaw), mat4RotationX(pitchRadians));
  const forward = rotateVec3ByMat4(rotation, RACE_TRACK_CAR_FORWARD_AXIS);

  return { location, forward };
};

export type RaceTrackExampleController = {
  dispose: () => void;
  /**
   * Engine-level customisation that the host (CanvasStage) merges into
   * `RendererEngine` options when constructing the engine. Currently empty —
   * the example no longer injects any post-process stages or frame hooks.
   */
  engineOptions: RendererEngineOptions;
  /** Returns the car's current world pose, or `null` before it has loaded. */
  getCarPose: () => RaceTrackCarPose | null;
};

type RaceTrackModel = {
  /** Stable id used to namespace the model's texture-library entries. */
  key: string;
  url: string;
  /** Optional world-space translation applied to every mesh in the model. */
  position?: [number, number, number];
  /** Optional yaw rotation (radians about +Y) applied before `position`. */
  rotationY?: number;
};

const RACE_TRACK_MODELS: ReadonlyArray<RaceTrackModel> = [
  { key: 'track', url: '/models/race-track/cartoon_race_track_oval.glb' },
  {
    key: 'car',
    url: '/models/race-track/cicada_retro_cartoon_car.glb',
    position: [-4.0, 0.0, -32.329],
    rotationY: Math.PI,
  },
];

// Pre-multiply a world-space yaw rotation and translation onto every mesh
// transform in `scene`.
const transformSceneMeshes = (scene: RenderScene, model: RaceTrackModel): void => {
  const { position, rotationY } = model;
  if (!position && rotationY === undefined) return;
  let offset = rotationY !== undefined ? mat4RotationY(rotationY) : mat4Translation(0, 0, 0);
  if (position) offset = mat4Multiply(mat4Translation(...position), offset);
  for (const mesh of scene.meshes) {
    mesh.transform = mesh.transform ? mat4Multiply(offset, mesh.transform) : new Float32Array(offset);
  }
};

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
  let carPose: RaceTrackCarPose | null = null;
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
      transformSceneMeshes(combined, valid[0]!.model);

      for (let i = 1; i < valid.length; i += 1) {
        const src: RenderScene = {
          meshes: valid[i]!.result.meshes,
          textureLibrary: valid[i]!.result.textureLibrary,
          lights: [],
        };
        prefixSceneTextureIds(src, valid[i]!.model.key);
        transformSceneMeshes(src, valid[i]!.model);
        mergeSceneInto(combined, src);
      }

      const carEntry = valid.find((entry) => entry.model.key === 'car');
      if (carEntry) {
        carPose = {
          position: carEntry.model.position ?? [0, 0, 0],
          yawRadians: carEntry.model.rotationY ?? 0,
        };
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
    getCarPose: () => carPose,
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const dispose of modelDisposers) dispose();
      modelDisposers = [];
    },
  };
};
