// Race-track example: a cartoon oval race track plus a retro cartoon car,
// loaded from glTF (.glb) binaries and merged into a single scene.
//
// This example is intentionally self-contained — it shares no logic with the
// other examples — because it is expected to grow significantly more complex.
//
// For now it does nothing but load the two models — no sky, environment map,
// or app-level post-processing effects.

import type { Mat4, RenderScene, SceneMeshInstance } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import {
  mat4Identity,
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

/**
 * Tunable driving dynamics for the keyboard-controlled car. All rates are in
 * metres/second or metres/second² except `yawRate`, which is radians/second.
 */
export type RaceTrackDrivingSettings = {
  /** Forward acceleration while the throttle (Up / W) is held (m/s²). */
  accelerationRate: number;
  /** Maximum forward speed the car can reach (m/s). */
  maxSpeed: number;
  /**
   * Passive deceleration applied every frame the throttle is released and the
   * brake is not held — the car coasts to a stop at this rate (m/s²).
   */
  coastDeceleration: number;
  /**
   * Active braking deceleration while the brake (Down / S) is held (m/s²).
   * Expected to be larger than `coastDeceleration`.
   */
  brakeDeceleration: number;
  /**
   * Steering rate applied while a steer key (Left/Right or A/D) is held
   * (radians/second). The car cannot steer while stationary.
   */
  yawRate: number;
  /**
   * Yaw correction (degrees about +Y) added to the car's heading when
   * deriving the *movement* direction only. Compensates for models whose
   * local forward axis is not aligned with the engine's reference forward
   * (`RACE_TRACK_CAR_FORWARD_AXIS`), which would otherwise make the car drive
   * sideways relative to how it visually points. Does not affect the visual
   * mesh orientation or the camera.
   */
  forwardYawDegrees: number;
  /**
   * Yaw applied per pixel of horizontal mouse movement while mouse steering
   * (radians/pixel). Like keyboard steering, mouse steering only bites while
   * the car is moving.
   */
  mouseSteerSensitivity: number;
};

export type RaceTrackExampleOptions = {
  /** Active camera view. The camera is always rigidly attached to the car — there is no free/manual mode. */
  cameraView: RaceTrackCameraView;
  interior: RaceTrackCameraViewSettings;
  follow: RaceTrackCameraViewSettings;
  /** Keyboard-driving dynamics. */
  driving: RaceTrackDrivingSettings;
};

export const DEFAULT_RACE_TRACK_OPTIONS: RaceTrackExampleOptions = {
  cameraView: 'interior',
  interior: { offset: [0, 1.374, 0], yawDegrees: -90, pitchDegrees: 0 },
  follow: { offset: [8, 3, 0], yawDegrees: -90, pitchDegrees: 0 },
  driving: {
    accelerationRate: 8,
    maxSpeed: 30,
    coastDeceleration: 4,
    brakeDeceleration: 18,
    yawRate: 0.6667,
    forwardYawDegrees: 90,
    mouseSteerSensitivity: 0.00125,
  },
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
  /**
   * Advance the car's driving simulation by `dtSeconds`, integrating the
   * current keyboard input against the supplied `driving` dynamics. No-op
   * until the car model has loaded. Call once per frame before reading
   * `getCarPose()`.
   */
  update: (dtSeconds: number, driving: RaceTrackDrivingSettings) => void;
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
  // Car meshes paired with their pre-pose (glTF-local) transforms, so the car
  // body can be re-posed each frame as it drives. Populated once the car model
  // loads; empty until then.
  const carMeshEntries: Array<{ mesh: SceneMeshInstance; baseTransform: Mat4 }> = [];

  // ── Keyboard driving input ────────────────────────────────────────────────
  // Live input state, updated by window key listeners and integrated each frame
  // by `update()`. Current forward speed (m/s) persists across frames so the
  // car keeps rolling after the throttle is released.
  let throttleHeld = false; // Up / W — accelerate forward
  let brakeHeld = false; // Down / S — active braking
  let steerLeftHeld = false; // Left / A
  let steerRightHeld = false; // Right / D
  let speed = 0;

  // Mouse input: left button accelerates, right button brakes, and horizontal
  // movement steers. `pendingMouseYawPixels` accumulates raw horizontal
  // movement between frames and is consumed (and zeroed) by `update()`.
  let mouseThrottleHeld = false;
  let mouseBrakeHeld = false;
  let pendingMouseYawPixels = 0;

  const setKeyState = (key: string, pressed: boolean): boolean => {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        throttleHeld = pressed;
        return true;
      case 'ArrowDown':
      case 's':
      case 'S':
        brakeHeld = pressed;
        return true;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        steerLeftHeld = pressed;
        return true;
      case 'ArrowRight':
      case 'd':
      case 'D':
        steerRightHeld = pressed;
        return true;
      default:
        return false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (setKeyState(event.key, true)) event.preventDefault();
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    if (setKeyState(event.key, false)) event.preventDefault();
  };
  const handleBlur = (): void => {
    throttleHeld = false;
    brakeHeld = false;
    steerLeftHeld = false;
    steerRightHeld = false;
    mouseThrottleHeld = false;
    mouseBrakeHeld = false;
    pendingMouseYawPixels = 0;
  };

  const handleMouseMove = (event: MouseEvent): void => {
    // Relative horizontal movement steers; works with or without pointer lock.
    pendingMouseYawPixels += event.movementX;
  };
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      mouseThrottleHeld = true; // left button accelerates
    } else if (event.button === 2) {
      mouseBrakeHeld = true; // right button brakes
      event.preventDefault();
    }
  };
  const handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      mouseThrottleHeld = false;
    } else if (event.button === 2) {
      mouseBrakeHeld = false;
    }
  };
  // Suppress the context menu so holding the right button to brake does not
  // pop up the browser menu.
  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('contextmenu', handleContextMenu);

  // Record the car model's meshes and their glTF-local transforms (before the
  // authored spawn offset is baked in) so the car body can be re-posed each
  // frame from the live `carPose`. Must run before `transformSceneMeshes`.
  const captureCarMeshEntries = (scene: RenderScene, model: RaceTrackModel): void => {
    if (model.key !== 'car') return;
    for (const mesh of scene.meshes) {
      carMeshEntries.push({
        mesh,
        baseTransform: mesh.transform ? new Float32Array(mesh.transform) : mat4Identity(),
      });
    }
  };

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
      captureCarMeshEntries(combined, valid[0]!.model);
      transformSceneMeshes(combined, valid[0]!.model);

      for (let i = 1; i < valid.length; i += 1) {
        const src: RenderScene = {
          meshes: valid[i]!.result.meshes,
          textureLibrary: valid[i]!.result.textureLibrary,
          lights: [],
        };
        prefixSceneTextureIds(src, valid[i]!.model.key);
        captureCarMeshEntries(src, valid[i]!.model);
        transformSceneMeshes(src, valid[i]!.model);
        mergeSceneInto(combined, src);
      }

      const carEntry = valid.find((entry) => entry.model.key === 'car');
      if (carEntry) {
        const spawn = carEntry.model.position ?? [0, 0, 0];
        carPose = {
          // Copy so per-frame integration never mutates the shared model constant.
          position: [spawn[0], spawn[1], spawn[2]],
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
    update: (dtSeconds: number, driving: RaceTrackDrivingSettings): void => {
      if (!carPose || !(dtSeconds > 0)) return;

      // Keyboard and mouse inputs are combined: either source can throttle or
      // brake, and both steering sources add together.
      const throttle = throttleHeld || mouseThrottleHeld;
      const brake = brakeHeld || mouseBrakeHeld;
      const mouseYaw = pendingMouseYawPixels;
      pendingMouseYawPixels = 0;

      // Longitudinal dynamics: throttle accelerates toward maxSpeed; braking
      // decelerates hard; otherwise the car coasts down to a stop. Speed never
      // goes negative (no reverse gear).
      if (throttle) {
        speed = Math.min(driving.maxSpeed, speed + driving.accelerationRate * dtSeconds);
      } else if (brake) {
        speed = Math.max(0, speed - driving.brakeDeceleration * dtSeconds);
      } else {
        speed = Math.max(0, speed - driving.coastDeceleration * dtSeconds);
      }

      // Steering only bites while the car is moving. Left turns decrease yaw,
      // right turns increase it (about +Y). Keyboard is time-scaled; mouse is
      // proportional to physical movement (already frame-rate independent).
      if (speed > 0) {
        const steer = (steerRightHeld ? 1 : 0) - (steerLeftHeld ? 1 : 0);
        if (steer !== 0) {
          carPose.yawRadians += steer * driving.yawRate * dtSeconds;
        }
        // Mouse steering only applies while the left button (accelerate) is
        // held.
        if (mouseYaw !== 0 && mouseThrottleHeld) {
          carPose.yawRadians += mouseYaw * driving.mouseSteerSensitivity;
        }
      }

      if (speed > 0) {
        // Apply the model's forward-axis yaw correction so the car drives in
        // the direction it visually faces rather than sideways.
        const movementYaw = carPose.yawRadians + (driving.forwardYawDegrees * Math.PI) / 180;
        const forward = rotateVec3ByMat4(mat4RotationY(movementYaw), RACE_TRACK_CAR_FORWARD_AXIS);
        const step = speed * dtSeconds;
        carPose.position[0] += forward[0] * step;
        carPose.position[1] += forward[1] * step;
        carPose.position[2] += forward[2] * step;
      }

      // Re-pose the car body to match the live pose. Mirrors the offset order
      // baked by `transformSceneMeshes`: worldOffset = T(position) · Ry(yaw).
      if (carMeshEntries.length > 0) {
        const poseOffset = mat4Multiply(
          mat4Translation(carPose.position[0], carPose.position[1], carPose.position[2]),
          mat4RotationY(carPose.yawRadians),
        );
        for (const entry of carMeshEntries) {
          entry.mesh.transform = mat4Multiply(poseOffset, entry.baseTransform);
        }
      }
    },
    dispose: () => {
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      onLoadingProgress?.(null);
      for (const dispose of modelDisposers) dispose();
      modelDisposers = [];
    },
  };
};
