import type {
  RenderScene,
  SceneInstancedMesh,
  SceneMeshInstance,
} from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import type { Vec3 } from '@dotdotdash/stunner-core/math/Vector';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4ScaleUniform,
  mat4Translation,
  rotateVec3ByMat4,
  type Mat4,
} from '@dotdotdash/stunner-core/math/Matrix';
import { createSkySphere } from '@dotdotdash/stunner-core/sky';
import type { PbrMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { createDefaultMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { loadGltfSceneFromUrl } from '@dotdotdash/stunner-core/renderer/mesh/GltfLoader';
import type { MeshBounds } from '@dotdotdash/stunner-core/renderer/mesh/MeshFactory';
import {
  createCylinder,
  createSphere,
  computeMeshGeometryBounds,
  mergeMeshBounds,
  transformMeshBounds,
} from '@dotdotdash/stunner-core/renderer/mesh/MeshFactory';
import { createDynamicTextureMaterial } from '@dotdotdash/stunner-core/texture/DynamicTextureMaterial';
import { TextureCanvas } from '@dotdotdash/stunner-core/texture/TextureCanvas';
import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';

export type VehicleCameraViewSettings = {
  /** Vehicle-local offset (metres), rotated by the vehicle's heading and added to its world position. */
  offset: [number, number, number];
  /** Additional yaw (degrees about +Y) applied on top of the vehicle's heading (plus the fixed 180° flip). */
  yawDegrees: number;
  /** Additional pitch (degrees about the local +X axis), applied before yaw. Positive tilts the view upward. No roll. */
  pitchDegrees: number;
};

/**
 * Tunable movement dynamics for the "moving landscape" illusion. The vehicle
 * itself stays near a fixed offset from the world origin; instead, the
 * landscape scrolls past it at a constant rate, with an occasional "boost"
 * that temporarily speeds up the scroll. All distances are metres, all rates
 * are metres/second or metres/second² unless noted otherwise.
 */
export type VehicleMovementSettings = {
  /** Fixed vehicle position (metres) relative to the world origin; the vehicle only drifts laterally/vertically from here. */
  vehicleOffset: [number, number, number];
  /**
   * World-space velocity (m/s) at which the landscape scrolls past the
   * (stationary) vehicle, simulating forward travel. Its direction defines
   * the scroll axis; its magnitude is the baseline scroll speed before any
   * boost is applied.
   */
  landscapeScrollVelocity: [number, number, number];
  /** Maximum lateral (local +X) drift from `vehicleOffset` the left/right controls may reach (metres). */
  maxLateralOffset: number;
  /** Maximum vertical (local +Y) drift from `vehicleOffset` the up/down controls may reach (metres). */
  maxVerticalOffset: number;
  /** Lateral drift speed while a left/right control is held (m/s). */
  lateralSpeed: number;
  /** Vertical drift speed while an up/down control is held (m/s). */
  verticalSpeed: number;
  /** Peak extra scroll speed (m/s) a boost adds on top of the baseline rate. */
  boostBonusSpeed: number;
  /** Rate (m/s²) the boost bonus ramps up to `boostBonusSpeed` once triggered. */
  boostRiseRate: number;
  /** Rate (m/s²) the boost bonus bleeds back off to zero once it peaks. */
  boostDecayRate: number;
  /** Minimum interval (seconds) that must elapse between boosts. */
  boostIntervalSeconds: number;
  /**
   * Distance (metres, measured along the scroll axis) a landscape tile must
   * fall behind the vehicle before it is recycled to the far end of the
   * leapfrogging pair.
   */
  landscapeRecycleBehindDistance: number;
  /**
   * Spacing (metres, along the scroll axis) between the two leapfrogging
   * landscape tile instances. Tune to match the landscape model's footprint
   * along the scroll axis so the two tiles read as one continuous piece.
   */
  landscapeTileSpacing: number;
};

export type VehicleExampleOptions = {
  /** Active camera view. The camera is always rigidly attached to the vehicle — there is no free/manual mode. */
  cameraView: VehicleCameraViewSettings;
  /** Landscape-scroll / vehicle-drift dynamics. */
  movement: VehicleMovementSettings;
};

export const DEFAULT_VEHICLE_OPTIONS: VehicleExampleOptions = {
  cameraView: { offset: [0, 2.5, 4], yawDegrees: 0, pitchDegrees: -15 },
  movement: {
    vehicleOffset: [0, -50, 0],
    landscapeScrollVelocity: [0, 0, -67],
    maxLateralOffset: 250,
    maxVerticalOffset: 100,
    lateralSpeed: -50,
    verticalSpeed: -50,
    boostBonusSpeed: 80,
    boostRiseRate: 240,
    boostDecayRate: 40,
    boostIntervalSeconds: 5,
    landscapeRecycleBehindDistance: 1000,
    landscapeTileSpacing: 2000,
  },
};

/**
 * The vehicle's current world pose. Position/yaw are static today but read live
 * each frame so a future driving routine can move the vehicle without any
 * camera-side changes.
 */
export type VehiclePose = {
  position: [number, number, number];
  yawRadians: number;
};

// Reflection matrix across the plane through the origin with the given unit
// `normal` (R = I - 2·n·nᵀ). Used to mirror the second landscape tile across
// the scroll axis so the two leapfrogging instances read as one continuous,
// alternating-direction piece rather than an obvious repeat.
const mat4ReflectionAcrossNormal = (normal: Vec3): Mat4 => {
  const [nx, ny, nz] = normal;
  const m = mat4Identity();
  m[0] = 1 - 2 * nx * nx; m[4] = -2 * nx * ny; m[8] = -2 * nx * nz;
  m[1] = -2 * ny * nx; m[5] = 1 - 2 * ny * ny; m[9] = -2 * ny * nz;
  m[2] = -2 * nz * nx; m[6] = -2 * nz * ny; m[10] = 1 - 2 * nz * nz;
  return m;
};

const VEHICLE_FORWARD_AXIS: [number, number, number] = [0, 0, 1];

// Standard-gamepad button/axis mapping (Gamepad API "standard" layout).
const GAMEPAD_ACCEL_BUTTON = 0; // A / cross — accelerate
const GAMEPAD_DPAD_LEFT_BUTTON = 14;
const GAMEPAD_DPAD_RIGHT_BUTTON = 15;
const GAMEPAD_DPAD_UP_BUTTON = 12;
const GAMEPAD_DPAD_DOWN_BUTTON = 13;
const GAMEPAD_LEFT_STICK_X_AXIS = 0;
const GAMEPAD_RIGHT_STICK_X_AXIS = 2;
const GAMEPAD_LEFT_STICK_Y_AXIS = 1;
const GAMEPAD_RIGHT_STICK_Y_AXIS = 3;
const GAMEPAD_STICK_DEADZONE = 0.2;

// Minimum interval between double-tap detections (touch), in seconds.
const DOUBLE_TAP_MAX_INTERVAL_SECONDS = 0.3;
// Touch drag must exceed this many pixels (from the touch start Y) before it
// registers as a vertical-movement input, avoiding jitter from taps.
const TOUCH_VERTICAL_DEADZONE_PX = 12;

// ── Banking / pitching (visual tilt while drifting) ───────────────────────
// Purely cosmetic: tilts the ship's mesh about its own local right axis in
// proportion to the current lateral input (bank) and vertical input (pitch),
// then eases back to level when the corresponding control is released. Both
// contribute to the same local-X rotation (see `update()`, where they're
// summed), which is why a lateral bank currently reads as a bit of pitch too.
// Does not affect the camera, which stays rigidly attached via
// `computeVehicleCameraPose`.
const MAX_BANK_RADIANS = (35 * Math.PI) / 180; // tilt angle at full lateral input
const MAX_PITCH_RADIANS = (20 * Math.PI) / 180; // tilt angle at full vertical input
const BANK_SMOOTHING_TIME_CONSTANT = 0.35; // seconds; smaller = snaps to target faster

// ── Engine glow (small emissive spheres seated in the engine nacelles) ─────
// Local offsets (metres, in the ship's own local space — X right, Y up, Z
// forward per `VEHICLE_FORWARD_AXIS`) place one sphere inside each engine
// intake. Tuned by eye against the spacecraft model; adjust if it changes.
const ENGINE_GLOW_LOCAL_OFFSETS: ReadonlyArray<[number, number, number]> = [
  [0.58, 0.14, 0.87],
  [-0.58, 0.14, 0.87],
];
const ENGINE_GLOW_RADIUS = 0.08; // metres
const ENGINE_GLOW_COLOR: [number, number, number] = [0.25, 1.0, 0.85]; // light blue-green
// Emissive intensity idles at the base value and swells toward the max as
// the effective scroll speed approaches its boosted peak; the oscillation
// itself also speeds up with speed so the glow pulses faster during a boost.
const ENGINE_GLOW_BASE_INTENSITY = 2;
const ENGINE_GLOW_MAX_INTENSITY = 16;
const ENGINE_GLOW_MIN_PULSE_HZ = 1;
const ENGINE_GLOW_MAX_PULSE_HZ = 9;

const SKY_RADIUS = 2500;
const SKY_TEXTURE = 'sky-1';

const addSky = (scene: RenderScene): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${SKY_TEXTURE}`;
  scene.textureLibrary[textureId] = `/images/${SKY_TEXTURE}.png`;
  scene.meshes.push(
    createSkySphere({
      textureId,
      radius: SKY_RADIUS,
      intensity: 1,
      blendAmount: 1,
      blendMode: 'alpha',
      useTextureAlpha: true,
    }),
  );
  scene.environmentMap = {
    textureId,
    intensity: 1,
  };
};

// ── In-world speed HUD ───────────────────────────────────────────────────────
// A short, wide, open-ended cylinder head-locked to the camera. The speed
// readout is drawn to a 2D canvas texture and mapped onto the cylinder's inner
// wall, so it reads as a gently curved panel floating in front of the driver.
const HUD_TEXTURE_ID = 'vehicleSpeedHud';

// ── HUD tunables (play with these) ───────────────────────────────────────────
// Cylinder SIZE:
const HUD_RADIUS = 0.75; // metres — panel distance from camera; larger = farther & flatter (less curve)
const HUD_HEIGHT = 1; // metres — vertical extent of the cylinder (short = thin band)
// Cylinder POSITION (relative to the head-locked camera):
const HUD_VERTICAL_OFFSET = 0; // metres along camera-up; negative lowers the panel, positive raises it
// Readout PLACEMENT on the panel (fractions of the canvas, 0..1):
const HUD_READOUT_U = 0.825; // horizontal: 0.75 is the camera-forward arc (after the U flip) — keep near 0.75
const HUD_READOUT_V = 0.333; // vertical: 0.5 = eye level, larger = lower in view
const HUD_FONT_SCALE = 0.14; // speed number height as a fraction of the canvas height
const HUD_UNIT_FONT_SCALE = 0.07; // "MPH" label height as a fraction of the canvas height
const HUD_READOUT_GAP = 0.005; // gap between the number and "MPH", fraction of canvas width
const HUD_MPH_VERTICAL_OFFSET = -9; // vertical offset for the "MPH" label, fraction of canvas height
// The number is right-aligned to the left of centre and "MPH" is left-aligned
// to the right of centre, so the layout stays fixed as the digit count changes.
// ─────────────────────────────────────────────────────────────────────────────

const HUD_CANVAS_WIDTH = 4096;
// Match the canvas aspect to the cylinder's circumference:height ratio so text
// maps without horizontal/vertical distortion.
const HUD_CANVAS_HEIGHT = Math.round((HUD_CANVAS_WIDTH * HUD_HEIGHT) / (2 * Math.PI * HUD_RADIUS));
// m/s → mph.
const MPH_PER_MPS = 2.2369362920544;
// Google Fonts family used for the readout.
const HUD_FONT_LINK_ID = 'orbitron-font-link';
const HUD_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap';

/**
 * Compute a world-space camera location + forward vector for `view`, rigidly
 * attached to the vehicle at `vehiclePose`. The offset is rotated by the vehicle's
 * heading only (it is a fixed mounting point); the look direction is the
 * vehicle's forward direction plus a fixed 180° correction (the camera faces
 * back along the vehicle, e.g. from the driver's seat or a chase position)
 * plus the view's own yaw/pitch adjustment.
 */
export const computeVehicleCameraPose = (
  vehiclePose: VehiclePose,
  view: VehicleCameraViewSettings,
): { location: [number, number, number]; forward: [number, number, number] } => {
  const vehicleYawMat = mat4RotationY(vehiclePose.yawRadians);
  const worldOffset = rotateVec3ByMat4(vehicleYawMat, view.offset);
  const location: [number, number, number] = [
    vehiclePose.position[0] + worldOffset[0],
    vehiclePose.position[1] + worldOffset[1],
    vehiclePose.position[2] + worldOffset[2],
  ];

  const totalYaw = vehiclePose.yawRadians + Math.PI + (view.yawDegrees * Math.PI) / 180;
  const pitchRadians = (view.pitchDegrees * Math.PI) / 180;
  const rotation = mat4Multiply(mat4RotationY(totalYaw), mat4RotationX(pitchRadians));
  const forward = rotateVec3ByMat4(rotation, VEHICLE_FORWARD_AXIS);

  return { location, forward };
};

export type VehicleExampleController = {
  dispose: () => void;
  /**
   * Engine-level customisation that the host (CanvasStage) merges into
   * `RendererEngine` options when constructing the engine. Currently empty —
   * the example no longer injects any post-process stages or frame hooks.
   */
  engineOptions: RendererEngineOptions;
  /** Returns the vehicle's current world pose, or `null` before it has loaded. */
  getVehiclePose: () => VehiclePose | null;
  /**
   * Advance the simulation by `dtSeconds`: integrates lateral/vertical drift
   * input, the boost envelope, and the landscape scroll/leapfrog against the
   * supplied `movement` settings. No-op until the vehicle model has loaded.
   * Call once per frame before reading `getVehiclePose()`.
   */
  update: (dtSeconds: number, movement: VehicleMovementSettings) => void;
  /**
   * Head-lock the speed HUD cylinder to the camera. Pass the camera's current
   * display-space location and orthonormal basis (right, up, forward). No-op
   * until the HUD has been created. Call once per frame from the camera-follow
   * hook, after the camera pose is resolved.
   */
  updateHudTransform: (
    location: [number, number, number],
    right: [number, number, number],
    up: [number, number, number],
    forward: [number, number, number],
  ) => void;
  /**
   * Current boost recharge state, for a future "recharge" HUD component:
   * seconds since the last boost fired and the configured cooldown interval.
   * `secondsSinceLastBoost` is `Infinity` if no boost has fired yet.
   */
  getBoostStatus: () => { secondsSinceLastBoost: number; intervalSeconds: number };
};

type VehicleModel = {
  key: string;
  url: string;
  position?: [number, number, number];
  /** Optional yaw rotation (radians about +Y) applied before `position`. */
  rotationY?: number;
  /**
   * Optional mesh-local forward-axis correction (radians about +Y), applied
   * innermost — before `rotationY`, scale, or anything else. Some source
   * models don't author their "nose" along local +Z (the axis every other
   * part of this example assumes, e.g. `VEHICLE_FORWARD_AXIS`); this remaps
   * the mesh's actual forward axis onto +Z without changing `rotationY`
   * itself, since `rotationY` also becomes `vehiclePose.yawRadians` and the
   * camera-follow / landscape-scroll alignment is tuned against that value.
   */
  meshForwardAxisCorrectionY?: number;
  scale?: number;
};

// The landscape model is loaded once and drawn as a GPU-instanced mesh with
// two instance transforms (one per leapfrogging tile); both tiles share this
// static (unscrolled) base position and are re-posed every frame in
// `update()` along the scroll axis (see `landscapeInstancedMeshes` /
// `landscapeTilePhaseOffsets`), which is why `position` is omitted here —
// baking it in via `transformSceneMeshes` would only be overwritten anyway.
const LANDSCAPE_BASE_POSITION: [number, number, number] = [0, -50, 300];
const VEHICLE_MODELS: ReadonlyArray<VehicleModel> = [
  {
    key: 'landscape',
    url: '/models/vehicle/landscape.glb',
    scale: 0.25,
  },
  {
    key: 'vehicle',
    position: [0, 0, -500],
    url: '/models/vehicle/spacecraft.glb',
    rotationY: Math.PI,
    meshForwardAxisCorrectionY: Math.PI / 2,
    scale: 0.05,
  },
];

// Pre-multiply a world-space yaw rotation and translation onto every mesh
// transform in `scene`.
const transformSceneMeshes = (scene: RenderScene, model: VehicleModel): void => {
  const { position, rotationY, meshForwardAxisCorrectionY, scale } = model;
  if (
    !position &&
    rotationY === undefined &&
    meshForwardAxisCorrectionY === undefined &&
    scale === undefined
  ) {
    return;
  }
  let transform = rotationY !== undefined ? mat4RotationY(rotationY) : mat4Translation(0, 0, 0);
  if (meshForwardAxisCorrectionY !== undefined) {
    transform = mat4Multiply(transform, mat4RotationY(meshForwardAxisCorrectionY));
  }
  if (position) transform = mat4Multiply(mat4Translation(...position), transform);
  if (scale !== undefined) transform = mat4Multiply(mat4ScaleUniform(scale), transform);
  for (const mesh of scene.meshes) {
    mesh.transform = mesh.transform ? mat4Multiply(transform, mesh.transform) : new Float32Array(transform);
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

export const startVehicleExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void
): VehicleExampleController => {
  let disposed = false;
  let modelDisposers: Array<() => void> = [];
  let vehiclePose: VehiclePose | null = null;
  // Car meshes paired with their pre-pose (glTF-local) transforms, so the vehicle
  // body can be re-posed each frame as it drifts. Populated once the vehicle model
  // loads; empty until then.
  const vehicleMeshEntries: Array<{ mesh: SceneMeshInstance; baseTransform: Mat4 }> = [];
  // The landscape model is loaded exactly once; it is drawn twice via GPU
  // instancing (one `SceneInstancedMesh` per source sub-mesh, each carrying
  // two instance transforms — one per leapfrogging tile) rather than by
  // loading the model a second time. Populated once the landscape model
  // loads — see `buildLandscapeInstancedMeshes`.
  const landscapeInstancedMeshes: Array<{
    instanced: SceneInstancedMesh;
    /** Pre-pose (scaled, glTF-local) transform for tile 0 and mirrored tile 1. */
    baseTransforms: [Mat4, Mat4];
  }> = [];
  // Running scroll-axis phase offset (metres) for each of the two
  // leapfrogging tiles; nudged back by two tile-spacings whenever a tile
  // falls `landscapeRecycleBehindDistance` behind the vehicle — see
  // `update()`.
  const landscapeTilePhaseOffsets: [number, number] = [0, 0];
  // Total distance (metres) scrolled along the scroll axis so far.
  let scrollDistance = 0;
  // Effective scroll speed last computed by `update()` (baseline + boost), used
  // for the speed HUD readout (m/s).
  let effectiveScrollSpeed = 0;

  // ── Lateral / vertical drift input ──────────────────────────────────────────
  // Live input state, updated by window key/touch/gamepad listeners and
  // integrated each frame by `update()`.
  let lateralLeftHeld = false; // Left / A
  let lateralRightHeld = false; // Right / D
  let verticalUpHeld = false; // Up / W
  let verticalDownHeld = false; // Down / S
  // Current drift offsets from `movement.vehicleOffset` (metres), clamped each
  // frame to [-maxLateralOffset, maxLateralOffset] / [-maxVerticalOffset, maxVerticalOffset].
  let lateralOffset = 0;
  let verticalOffset = 0;
  // Current visual bank (lateral tilt) and pitch (vertical tilt) angles,
  // radians. Both are smoothed toward a target each frame in `update()` — see
  // the banking/pitching constants above — and summed into one local-X
  // rotation, so they blend naturally when both inputs are active.
  let bankRadians = 0;
  let pitchRadians = 0;
  // Elapsed time fed to the engine-glow pulse oscillator, advanced each
  // `update()` call.
  let engineGlowTimeSeconds = 0;
  // Total elapsed simulation time (seconds), used to time boosts.
  let elapsedTimeSeconds = 0;

  // ── Boost state ──────────────────────────────────────────────────────────
  // Set by an input handler when a boost is requested (tap gesture); consumed
  // (and cleared) by `update()`, which only honours it if the cooldown has
  // elapsed.
  let boostRequested = false;
  // `true` while the boost bonus is ramping up toward its peak; once it peaks
  // it flips to bleeding off (handled purely by `boostExtraSpeed` decaying).
  let boostRising = false;
  // Current extra scroll speed (m/s) contributed by an in-flight boost.
  let boostExtraSpeed = 0;
  // Simulation time (seconds) at which the last boost fired, or `-Infinity`
  // until the first boost.
  let lastBoostTimeSeconds = -Infinity;
  // Boost cooldown from the most recent `update()` call, for `getBoostStatus()`.
  let lastBoostIntervalSeconds = DEFAULT_VEHICLE_OPTIONS.movement.boostIntervalSeconds;

  const setKeyState = (key: string, pressed: boolean): boolean => {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        verticalUpHeld = pressed;
        return true;
      case 'ArrowDown':
      case 's':
      case 'S':
        verticalDownHeld = pressed;
        return true;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        lateralLeftHeld = pressed;
        return true;
      case 'ArrowRight':
      case 'd':
      case 'D':
        lateralRightHeld = pressed;
        return true;
      case ' ':
      case 'Spacebar':
        if (pressed) boostRequested = true; // tap — fires once, ignores auto-repeat via `event.repeat`
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
    lateralLeftHeld = false;
    lateralRightHeld = false;
    verticalUpHeld = false;
    verticalDownHeld = false;
    touchActive = false;
    touchVerticalDirection = 0;
  };

  // Mouse input: the left button fires a boost (tap, not held).
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) boostRequested = true;
  };

  // Touch input: dragging up/down (past a small deadzone) moves the vehicle
  // vertically, and a double-tap fires a boost.
  let touchActive = false;
  let touchStartY: number | null = null;
  let touchVerticalDirection = 0; // -1 (down), 0 (idle), +1 (up)
  let lastTouchStartTimeSeconds = -Infinity;

  const nowSeconds = (): number =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  const handleTouchStart = (event: TouchEvent): void => {
    touchActive = true;
    const touch = event.touches[0];
    if (touch) {
      touchStartY = touch.clientY;
    }
    const now = nowSeconds();
    if (now - lastTouchStartTimeSeconds <= DOUBLE_TAP_MAX_INTERVAL_SECONDS) {
      boostRequested = true;
    }
    lastTouchStartTimeSeconds = now;
    event.preventDefault();
  };
  const handleTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch && touchStartY !== null) {
      const deltaY = touch.clientY - touchStartY;
      touchVerticalDirection = deltaY < -TOUCH_VERTICAL_DEADZONE_PX ? 1 : deltaY > TOUCH_VERTICAL_DEADZONE_PX ? -1 : 0;
    }
    event.preventDefault();
  };
  const handleTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length === 0) {
      touchActive = false;
      touchStartY = null;
      touchVerticalDirection = 0;
    } else {
      // A finger lifted but others remain; keep dragging from the new primary.
      touchStartY = event.touches[0]!.clientY;
    }
  };

  // Gamepad button-edge tracking (boost fires once per press, not while held).
  let prevGamepadBoostPressed = false;

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('touchstart', handleTouchStart, { passive: false });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('touchcancel', handleTouchEnd);

  // ── Speed HUD setup ─────────────────────────────────────────────────────────
  // Canvas texture for the readout, an open-ended cylinder to project it onto,
  // and an unlit emissive material so the panel glows regardless of scene
  // lighting. `uvScaleOffset` flips U so text reads correctly when viewed from
  // *inside* the cylinder (the inner wall mirrors the outward-facing UVs).
  const hudCanvas = new TextureCanvas({
    width: HUD_CANVAS_WIDTH,
    height: HUD_CANVAS_HEIGHT,
    pixelScale: 2,
  });
  const hudMaterial: PbrMaterial = createDynamicTextureMaterial({
    textureId: HUD_TEXTURE_ID,
    slots: ['emissive'],
    emissiveIntensity: 1.4,
  });
  // Black texture + white text composited with additive blending: black areas
  // add nothing (scene shows through), white text glows. baseColor is black so
  // the unlit base contributes nothing to the additive sum; the readout is
  // driven entirely by the emissive dynamic texture.
  hudMaterial.baseColor = [0, 0, 0, 1];
  hudMaterial.transparent = true;
  hudMaterial.blendMode = 'additive';
  hudMaterial.twoSided = true;
  hudMaterial.alwaysOnTop = true;
  hudMaterial.uvScaleOffset = [-1, 1, 1, 0];
  hudMaterial.castsShadows = false;
  hudMaterial.receivesShadows = false;
  const hudMesh: SceneMeshInstance = {
    geometry: createCylinder({
      topRadius: HUD_RADIUS,
      bottomRadius: HUD_RADIUS,
      height: HUD_HEIGHT,
      radialSegments: 64,
      openEnded: true,
    }),
    material: hudMaterial,
    transform: mat4Identity(),
  };

  // ── Engine glow spheres ─────────────────────────────────────────────────────
  // Small unlit emissive spheres seated inside the engine nacelles. Both share
  // one material instance so `update()` only has to write `emissiveIntensity`
  // once per frame to pulse them in lockstep.
  const engineGlowMaterial: PbrMaterial = createDefaultMaterial({
    name: 'vehicle-engine-glow',
    baseColor: [0, 0, 0, 1],
    emissive: ENGINE_GLOW_COLOR,
    emissiveIntensity: ENGINE_GLOW_BASE_INTENSITY,
    metallic: 0,
    roughness: 1,
    castsShadows: false,
    receivesShadows: false,
  });
  const engineGlowMeshes: SceneMeshInstance[] = ENGINE_GLOW_LOCAL_OFFSETS.map((offset) => ({
    geometry: createSphere({ radius: ENGINE_GLOW_RADIUS, widthSegments: 32, heightSegments: 32 }),
    material: engineGlowMaterial,
    transform: mat4Translation(offset[0], offset[1], offset[2]),
  }));

  let lastMph = -1;
  let fontReady = false;

  // Redraw the readout. The camera-forward arc of the cylinder maps (after the
  // U flip) to canvas x = 0.75·W, so the number is centred there.
  const drawSpeedHud = (mph: number): void => {
    hudCanvas.draw((ctx, w, h) => {
      // Opaque black background; with additive blending it contributes nothing.
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      if (fontReady) {
        // Camera-forward arc maps (after the U flip) to canvas x = HUD_READOUT_U·W.
        const cx = w * HUD_READOUT_U;
        const cy = h * HUD_READOUT_V;
        const gap = w * HUD_READOUT_GAP;
        const fontStack = '"Orbitron", sans-serif';

        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(150,220,255,0.9)';
        ctx.shadowBlur = h * 0.05;
        ctx.fillStyle = '#ffffff';

        // Speed: right-aligned just left of centre (grows leftward as digits add).
        ctx.textAlign = 'right';
        ctx.font = `900 ${Math.round(h * HUD_FONT_SCALE)}px ${fontStack}`;
        ctx.fillText(String(mph), cx - gap / 2, cy + HUD_MPH_VERTICAL_OFFSET);

        // Unit: left-aligned just right of centre (fixed position).
        ctx.textAlign = 'left';
        ctx.font = `700 ${Math.round(h * HUD_UNIT_FONT_SCALE)}px ${fontStack}`;
        ctx.fillText('MPH', cx + gap / 2, cy);
      }
    });
  };

  // Load the Orbitron web font, then force a redraw once it is ready.
  const ensureOrbitronFont = (): void => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(HUD_FONT_LINK_ID)) {
      const link = document.createElement('link');
      link.id = HUD_FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = HUD_FONT_HREF;
      document.head.appendChild(link);
    }
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      Promise.all([fonts.load('900 100px Orbitron'), fonts.load('700 100px Orbitron')])
        .then(() => {
          fontReady = true;
          lastMph = -1; // force a redraw with the real font on the next update
        })
        .catch(() => {
          /* fall back to sans-serif */
        });
    }
  };

  drawSpeedHud(0);
  ensureOrbitronFont();

  // Mirror axis for the second landscape tile, derived from the default scroll
  // direction (the scroll direction is effectively fixed for the lifetime of
  // one example run, so this is computed once rather than per-frame).
  const [defaultSvx, defaultSvy, defaultSvz] = DEFAULT_VEHICLE_OPTIONS.movement.landscapeScrollVelocity;
  const defaultScrollSpeed = Math.hypot(defaultSvx, defaultSvy, defaultSvz);
  const defaultScrollDir: [number, number, number] =
    defaultScrollSpeed > 0
      ? [defaultSvx / defaultScrollSpeed, defaultSvy / defaultScrollSpeed, defaultSvz / defaultScrollSpeed]
      : [0, 0, 1];
  const landscapeMirror = mat4ReflectionAcrossNormal(defaultScrollDir);

  // Record the vehicle model's meshes and their glTF-local transforms (before
  // any spawn offset is baked in) so the vehicle body can be re-posed each
  // frame from live state. Must run before `transformSceneMeshes`. Any
  // `meshForwardAxisCorrectionY` is folded in here (applied before scale,
  // which commutes since it's uniform) so it becomes part of the vehicle's
  // canonical orientation that the per-frame dynamic bank/pitch/yaw build on
  // top of, without touching `vehiclePose.yawRadians` (see its doc comment).
  const captureVehicleMeshEntries = (scene: RenderScene, model: VehicleModel): void => {
    if (model.key !== 'vehicle') return;
    const scaleMat = model.scale !== undefined ? mat4ScaleUniform(model.scale) : null;
    const axisCorrectionMat =
      model.meshForwardAxisCorrectionY !== undefined
        ? mat4RotationY(model.meshForwardAxisCorrectionY)
        : null;
    for (const mesh of scene.meshes) {
      const local = mesh.transform ? new Float32Array(mesh.transform) : mat4Identity();
      const corrected = axisCorrectionMat ? mat4Multiply(axisCorrectionMat, local) : local;
      const scaled = scaleMat ? mat4Multiply(scaleMat, corrected) : corrected;
      vehicleMeshEntries.push({ mesh, baseTransform: scaled });
    }
  };

  // Build one `SceneInstancedMesh` per source sub-mesh of the loaded landscape
  // scene, each carrying two instance transforms — index 0 for the first
  // leapfrogging tile, index 1 for the second, mirrored across the scroll axis
  // so the pair reads as one continuous, alternating-direction piece. This
  // draws the single loaded model twice via GPU instancing instead of loading
  // it a second time. Applies the model's scale itself (mirroring
  // `captureVehicleMeshEntries`), so it does not depend on `transformSceneMeshes`.
  //
  // The source model's own origin is not necessarily its visual centre (glTF
  // authoring tools commonly leave the origin at a corner/edge of a terrain
  // tile). `LANDSCAPE_BASE_POSITION` and the per-frame scroll math both
  // assume a tile's world position *is* its visual centre, and the mirror
  // reflects tile 1 across a plane through the origin — so an off-centre
  // pivot would also throw tile 1's placement off differently than tile 0's.
  // To keep both assumptions valid, we first measure the combined (scaled)
  // bounds of every sub-mesh and fold a `translate(-center)` into each
  // sub-mesh's base transform before the mirror is applied.
  const buildLandscapeInstancedMeshes = (scene: RenderScene, model: VehicleModel): SceneInstancedMesh[] => {
    const scaleMat = model.scale !== undefined ? mat4ScaleUniform(model.scale) : null;
    const scaledLocals = scene.meshes.map((mesh) => {
      const local = mesh.transform ? new Float32Array(mesh.transform) : mat4Identity();
      return scaleMat ? mat4Multiply(scaleMat, local) : local;
    });

    let combinedBounds: MeshBounds | null = null;
    for (let i = 0; i < scene.meshes.length; i += 1) {
      const localBounds = computeMeshGeometryBounds(scene.meshes[i]!.geometry);
      const worldBounds = transformMeshBounds(localBounds, scaledLocals[i]!);
      combinedBounds = combinedBounds ? mergeMeshBounds(combinedBounds, worldBounds) : worldBounds;
    }
    const center = combinedBounds?.center ?? [0, 0, 0];
    const centering = mat4Translation(-center[0], -center[1], -center[2]);

    const result: SceneInstancedMesh[] = [];
    for (let i = 0; i < scene.meshes.length; i += 1) {
      const mesh = scene.meshes[i]!;
      const base = mat4Multiply(centering, scaledLocals[i]!);
      const mirrored = mat4Multiply(landscapeMirror, base);
      const instanced: SceneInstancedMesh = {
        geometry: mesh.geometry,
        material: mesh.material,
        instanceTransforms: [new Float32Array(base), new Float32Array(mirrored)],
      };
      landscapeInstancedMeshes.push({ instanced, baseTransforms: [base, mirrored] });
      result.push(instanced);
    }
    return result;
  };

  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    try {
      const total = VEHICLE_MODELS.length;
      const loaded = await Promise.all(
        VEHICLE_MODELS.map(async (model, idx) => {
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
        (entry): entry is { model: VehicleModel; result: Awaited<ReturnType<typeof loadGltfSceneFromUrl>> } =>
          entry !== null,
      );
      if (valid.length === 0) {
        onLoadingProgress?.(null);
        return;
      }

      modelDisposers = valid.map((entry) => entry.result.dispose);

      // Build a combined scene; namespace each model's textures, capture the
      // vehicle's mesh entries, and route the landscape model's meshes into
      // GPU-instanced draws (two instances, one per leapfrogging tile)
      // instead of merging duplicate loaded copies into `combined.meshes`.
      const combined: RenderScene = {
        meshes: [],
        instancedMeshes: [],
        textureLibrary: {},
        lights: [],
      };

      for (const entry of valid) {
        const src: RenderScene = {
          meshes: entry.result.meshes,
          textureLibrary: entry.result.textureLibrary,
          lights: [],
        };
        prefixSceneTextureIds(src, entry.model.key);

        if (entry.model.key === 'landscape') {
          combined.instancedMeshes!.push(...buildLandscapeInstancedMeshes(src, entry.model));
          if (src.textureLibrary) {
            combined.textureLibrary = { ...combined.textureLibrary, ...src.textureLibrary };
          }
        } else {
          captureVehicleMeshEntries(src, entry.model);
          transformSceneMeshes(src, entry.model);
          mergeSceneInto(combined, src);
        }
      }

      const vehicleEntry = valid.find((entry) => entry.model.key === 'vehicle');
      if (vehicleEntry) {
        const spawn = vehicleEntry.model.position ?? [0, 0, 0];
        vehiclePose = {
          position: [spawn[0], spawn[1], spawn[2]],
          yawRadians: vehicleEntry.model.rotationY ?? 0,
        };
      }

      // Space the two landscape tiles apart along the scroll axis so they read
      // as one continuous piece; `update()` recycles each tile's offset as it
      // falls behind the vehicle.
      landscapeTilePhaseOffsets[1] = DEFAULT_VEHICLE_OPTIONS.movement.landscapeTileSpacing;

      if (combined.lights.length === 0) {
        combined.directionalLightingEnabled = true;
        combined.directionalLightingIntensity = 1;
      }

      combined.meshes.push(hudMesh);
      for (const glow of engineGlowMeshes) combined.meshes.push(glow);
      combined.dynamicTextures = {
        ...combined.dynamicTextures,
        [HUD_TEXTURE_ID]: hudCanvas.toSource(),
      };
      addSky(combined);
      applyScene(combined);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('vehicle example failed to load.', err);
    }
  })();

  const engineOptions: RendererEngineOptions = {};

  return {
    engineOptions,
    getVehiclePose: () => vehiclePose,
    update: (dtSeconds: number, movement: VehicleMovementSettings): void => {
      if (!vehiclePose || !(dtSeconds > 0)) return;
      elapsedTimeSeconds += dtSeconds;
      lastBoostIntervalSeconds = movement.boostIntervalSeconds;

      // Poll the gamepad (if any). The primary button fires a boost (edge
      // detected — only on the frame it's newly pressed); the d-pad and
      // either thumbstick's X/Y axes drift the vehicle laterally/vertically.
      let gamepadLateral = 0; // -1 (full left) … +1 (full right)
      let gamepadVertical = 0; // -1 (full down) … +1 (full up)
      const pads =
        typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads.find((p): p is Gamepad => p !== null);
      if (pad) {
        const boostPressed = pad.buttons[GAMEPAD_ACCEL_BUTTON]?.pressed ?? false;
        if (boostPressed && !prevGamepadBoostPressed) boostRequested = true;
        prevGamepadBoostPressed = boostPressed;

        const dpadLateral =
          (pad.buttons[GAMEPAD_DPAD_RIGHT_BUTTON]?.pressed ? 1 : 0) -
          (pad.buttons[GAMEPAD_DPAD_LEFT_BUTTON]?.pressed ? 1 : 0);
        const leftX = pad.axes[GAMEPAD_LEFT_STICK_X_AXIS] ?? 0;
        const rightX = pad.axes[GAMEPAD_RIGHT_STICK_X_AXIS] ?? 0;
        const stickX = Math.abs(leftX) >= Math.abs(rightX) ? leftX : rightX;
        const stickLateral = Math.abs(stickX) > GAMEPAD_STICK_DEADZONE ? stickX : 0;
        gamepadLateral = Math.max(-1, Math.min(1, dpadLateral + stickLateral));

        // Thumbstick Y axes are -1 at rest-up, so invert to make "up" positive.
        const dpadVertical =
          (pad.buttons[GAMEPAD_DPAD_UP_BUTTON]?.pressed ? 1 : 0) -
          (pad.buttons[GAMEPAD_DPAD_DOWN_BUTTON]?.pressed ? 1 : 0);
        const leftY = pad.axes[GAMEPAD_LEFT_STICK_Y_AXIS] ?? 0;
        const rightY = pad.axes[GAMEPAD_RIGHT_STICK_Y_AXIS] ?? 0;
        const stickY = Math.abs(leftY) >= Math.abs(rightY) ? leftY : rightY;
        const stickVertical = Math.abs(stickY) > GAMEPAD_STICK_DEADZONE ? -stickY : 0;
        gamepadVertical = Math.max(-1, Math.min(1, dpadVertical + stickVertical));
      }

      // Lateral drift: keyboard + gamepad. Vertical drift: keyboard + touch +
      // gamepad. Both are clamped to ±1 before being applied at their configured
      // speed, then the resulting offset is clamped to the configured range.
      const keyboardLateral = (lateralRightHeld ? 1 : 0) - (lateralLeftHeld ? 1 : 0);
      const lateralInput = Math.max(-1, Math.min(1, keyboardLateral + gamepadLateral));
      const keyboardVertical = (verticalUpHeld ? 1 : 0) - (verticalDownHeld ? 1 : 0);
      const verticalInput = Math.max(
        -1,
        Math.min(1, keyboardVertical + (touchActive ? touchVerticalDirection : 0) + gamepadVertical),
      );

      lateralOffset = Math.max(
        -movement.maxLateralOffset,
        Math.min(movement.maxLateralOffset, lateralOffset + lateralInput * movement.lateralSpeed * dtSeconds),
      );
      verticalOffset = Math.max(
        -movement.maxVerticalOffset,
        Math.min(movement.maxVerticalOffset, verticalOffset + verticalInput * movement.verticalSpeed * dtSeconds),
      );

      vehiclePose.position[0] = movement.vehicleOffset[0] + lateralOffset;
      vehiclePose.position[1] = movement.vehicleOffset[1] + verticalOffset;
      vehiclePose.position[2] = movement.vehicleOffset[2];

      // Bank/pitch toward angles proportional to the current lateral/vertical
      // input, and ease back to level once each stops — the target is 0 in
      // that case, so the exponential smoothing naturally levels it off. Both
      // share one smoothing rate and are summed into a single local-X tilt
      // below, so a lateral bank and a vertical pitch blend together.
      const targetBankRadians = lateralInput * MAX_BANK_RADIANS;
      const targetPitchRadians = verticalInput * MAX_PITCH_RADIANS;
      const bankSmoothing = 1 - Math.exp(-dtSeconds / BANK_SMOOTHING_TIME_CONSTANT);
      bankRadians += (targetBankRadians - bankRadians) * bankSmoothing;
      pitchRadians += (targetPitchRadians - pitchRadians) * bankSmoothing;

      // Boost envelope: a tap (space / left mouse button / double-tap /
      // gamepad button edge) starts a rapid rise to `boostBonusSpeed`, gated
      // by `boostIntervalSeconds` since the last one; once it peaks it bleeds
      // back off to zero at `boostDecayRate`.
      if (boostRequested) {
        boostRequested = false;
        if (elapsedTimeSeconds - lastBoostTimeSeconds >= movement.boostIntervalSeconds) {
          lastBoostTimeSeconds = elapsedTimeSeconds;
          boostRising = true;
        }
      }
      if (boostRising) {
        boostExtraSpeed = Math.min(movement.boostBonusSpeed, boostExtraSpeed + movement.boostRiseRate * dtSeconds);
        if (boostExtraSpeed >= movement.boostBonusSpeed) boostRising = false;
      } else {
        boostExtraSpeed = Math.max(0, boostExtraSpeed - movement.boostDecayRate * dtSeconds);
      }

      // The landscape scrolls past the (laterally/vertically drifting but
      // otherwise stationary) vehicle at the configured rate plus any current
      // boost bonus, simulating forward travel.
      const [svx, svy, svz] = movement.landscapeScrollVelocity;
      const baseScrollSpeed = Math.hypot(svx, svy, svz);
      const scrollDir: [number, number, number] =
        baseScrollSpeed > 0 ? [svx / baseScrollSpeed, svy / baseScrollSpeed, svz / baseScrollSpeed] : [0, 0, 1];
      effectiveScrollSpeed = baseScrollSpeed + boostExtraSpeed;
      scrollDistance += effectiveScrollSpeed * dtSeconds;

      // Re-pose the vehicle body to match the live pose. The visual bank/pitch
      // tilt (their sum, about the local right/X axis) is applied before the
      // (constant) heading — purely cosmetic, it does not feed back into
      // `vehiclePose` or the camera.
      let poseOffset = mat4Multiply(
        mat4Translation(vehiclePose.position[0], vehiclePose.position[1], vehiclePose.position[2]),
        mat4Multiply(mat4RotationY(vehiclePose.yawRadians + bankRadians * 0.5), mat4RotationZ(bankRadians)),
      );
      poseOffset = mat4Multiply(poseOffset, mat4RotationX(pitchRadians));
      if (vehicleMeshEntries.length > 0) {
        for (const entry of vehicleMeshEntries) {
          entry.mesh.transform = mat4Multiply(poseOffset, entry.baseTransform);
        }
      }

      // Advance and, if needed, recycle each landscape tile. A tile is
      // recycled once it falls `landscapeRecycleBehindDistance` behind the
      // vehicle (measured along the scroll axis), jumping it forward by two
      // tile-spacings so it becomes the new far tile. Each tile corresponds to
      // instance index `tileIndex` across every landscape `SceneInstancedMesh`.
      for (let tileIndex = 0; tileIndex < landscapeTilePhaseOffsets.length; tileIndex += 1) {
        let phaseOffset = landscapeTilePhaseOffsets[tileIndex]!;
        let dynamicPosition: [number, number, number] = [
          LANDSCAPE_BASE_POSITION[0] + scrollDir[0] * (scrollDistance + phaseOffset),
          LANDSCAPE_BASE_POSITION[1] + scrollDir[1] * (scrollDistance + phaseOffset),
          LANDSCAPE_BASE_POSITION[2] + scrollDir[2] * (scrollDistance + phaseOffset),
        ];
        const relativeToVehicle =
          (dynamicPosition[0] - vehiclePose.position[0]) * scrollDir[0] +
          (dynamicPosition[1] - vehiclePose.position[1]) * scrollDir[1] +
          (dynamicPosition[2] - vehiclePose.position[2]) * scrollDir[2];
        if (relativeToVehicle > movement.landscapeRecycleBehindDistance) {
          phaseOffset -= 2 * movement.landscapeTileSpacing;
          landscapeTilePhaseOffsets[tileIndex] = phaseOffset;
          dynamicPosition = [
            LANDSCAPE_BASE_POSITION[0] + scrollDir[0] * (scrollDistance + phaseOffset),
            LANDSCAPE_BASE_POSITION[1] + scrollDir[1] * (scrollDistance + phaseOffset),
            LANDSCAPE_BASE_POSITION[2] + scrollDir[2] * (scrollDistance + phaseOffset),
          ];
        }
        if (landscapeInstancedMeshes.length > 0) {
          const translation = mat4Translation(dynamicPosition[0], dynamicPosition[1], dynamicPosition[2]);
          for (const entry of landscapeInstancedMeshes) {
            entry.instanced.instanceTransforms[tileIndex] = mat4Multiply(
              translation,
              entry.baseTransforms[tileIndex]!,
            );
          }
        }
      }

      // Keep the engine-glow spheres seated in the nacelles as the ship
      // drifts/banks, and pulse their shared material's emissive intensity in
      // proportion to the current effective speed — idle glow normally,
      // brighter and faster-pulsing during a boost.
      if (engineGlowMeshes.length > 0) {
        for (let i = 0; i < engineGlowMeshes.length; i += 1) {
          const offset = ENGINE_GLOW_LOCAL_OFFSETS[i]!;
          engineGlowMeshes[i]!.transform = mat4Multiply(
            poseOffset,
            mat4Translation(offset[0], offset[1], offset[2]),
          );
        }
        engineGlowTimeSeconds += dtSeconds;
        const boostFraction =
          movement.boostBonusSpeed > 0 ? Math.max(0, Math.min(1, boostExtraSpeed / movement.boostBonusSpeed)) : 0;
        const pulseHz = ENGINE_GLOW_MIN_PULSE_HZ + boostFraction * (ENGINE_GLOW_MAX_PULSE_HZ - ENGINE_GLOW_MIN_PULSE_HZ);
        const pulse = 0.5 + 0.5 * Math.sin(engineGlowTimeSeconds * pulseHz * Math.PI * 2);
        engineGlowMaterial.emissiveIntensity =
          ENGINE_GLOW_BASE_INTENSITY + boostFraction * (ENGINE_GLOW_MAX_INTENSITY - ENGINE_GLOW_BASE_INTENSITY) * pulse;
      }

      // Refresh the speed readout only when the whole-mph value changes, so the
      // canvas texture uploads at most once per mph tick.
      const mph = Math.round(effectiveScrollSpeed * MPH_PER_MPS);
      if (mph !== lastMph) {
        lastMph = mph;
        drawSpeedHud(mph);
      }
    },
    updateHudTransform: (location, right, up, forward): void => {
      // Column-major basis: local +X → right, +Y → up (cylinder axis),
      // +Z → forward, origin → camera location. Head-locks the HUD to the view.
      // HUD_VERTICAL_OFFSET nudges the panel along camera-up.
      const ox = location[0] + up[0] * HUD_VERTICAL_OFFSET;
      const oy = location[1] + up[1] * HUD_VERTICAL_OFFSET;
      const oz = location[2] + up[2] * HUD_VERTICAL_OFFSET;
      const m = hudMesh.transform ?? mat4Identity();
      m[0] = right[0]; m[1] = right[1]; m[2] = right[2]; m[3] = 0;
      m[4] = up[0]; m[5] = up[1]; m[6] = up[2]; m[7] = 0;
      m[8] = forward[0]; m[9] = forward[1]; m[10] = forward[2]; m[11] = 0;
      m[12] = ox; m[13] = oy; m[14] = oz; m[15] = 1;
      hudMesh.transform = m;
    },
    getBoostStatus: () => ({
      secondsSinceLastBoost:
        lastBoostTimeSeconds === -Infinity ? Infinity : elapsedTimeSeconds - lastBoostTimeSeconds,
      intervalSeconds: lastBoostIntervalSeconds,
    }),
    dispose: () => {
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      hudCanvas.dispose();
      onLoadingProgress?.(null);
      for (const dispose of modelDisposers) dispose();
      modelDisposers = [];
    },
  };
};
