import type { Mat4, RenderScene, SceneMeshInstance } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4ScaleUniform,
  mat4Translation,
} from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import { createSkySphere } from '@dotdotdash/stunner-core/sky';
import type { PbrMaterial } from '@dotdotdash/stunner-core/renderer/mesh/MaterialTypes';
import { loadGltfSceneFromUrl } from '@dotdotdash/stunner-core/renderer/mesh/GltfLoader';
import { createCylinder } from '@dotdotdash/stunner-core/renderer/mesh/MeshFactory';
import { createDynamicTextureMaterial } from '@dotdotdash/stunner-core/texture/DynamicTextureMaterial';
import { TextureCanvas } from '@dotdotdash/stunner-core/texture/TextureCanvas';
import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';

export type VehicleCameraView = 'interior' | 'follow';

export type VehicleCameraViewSettings = {
  /** Car-local offset (metres), rotated by the vehicle's heading and added to its world position. */
  offset: [number, number, number];
  /** Additional yaw (degrees about +Y) applied on top of the vehicle's heading (plus the fixed 180° flip). */
  yawDegrees: number;
  /** Additional pitch (degrees about the local +X axis), applied before yaw. Positive tilts the view upward. No roll. */
  pitchDegrees: number;
};

/**
 * Tunable driving dynamics for the keyboard-controlled vehicle. All rates are in
 * metres/second or metres/second² except `yawRate`, which is radians/second.
 */
export type VehicleDrivingSettings = {
  /** Forward acceleration while the throttle (Up / W) is held (m/s²). */
  accelerationRate: number;
  /** Maximum forward speed the vehicle can reach (m/s). */
  maxSpeed: number;
  /**
   * Passive deceleration applied every frame the throttle is released and the
   * brake is not held — the vehicle coasts to a stop at this rate (m/s²).
   */
  coastDeceleration: number;
  /**
   * Active braking deceleration while the brake (Down / S) is held (m/s²).
   * Expected to be larger than `coastDeceleration`.
   */
  brakeDeceleration: number;
  /**
   * Steering rate applied while a steer key (Left/Right or A/D) is held
   * (radians/second). The vehicle cannot steer while stationary.
   */
  yawRate: number;
  /**
   * Yaw correction (degrees about +Y) added to the vehicle's heading when
   * deriving the *movement* direction only. Compensates for models whose
   * local forward axis is not aligned with the engine's reference forward
   * (`VEHICLE_FORWARD_AXIS`), which would otherwise make the vehicle drive
   * sideways relative to how it visually points. Does not affect the visual
   * mesh orientation or the camera.
   */
  forwardYawDegrees: number;
  /**
   * Yaw applied per pixel of horizontal mouse movement while mouse steering
   * (radians/pixel). Like keyboard steering, mouse steering only bites while
   * the vehicle is moving.
   */
  mouseSteerSensitivity: number;
  /**
   * Maximum distance (metres) the vehicle may travel from the world origin
   * `[0, 0, 0]`, measured along the X/Z plane only (Y is ignored). Once the
   * vehicle reaches this radius its position is clamped back onto the
   * boundary circle each frame — it can still drive tangentially along the
   * edge but cannot move further outward. Set to `Infinity` to disable.
   */
  maxRadiusFromCenter: number;
};

export type VehicleExampleOptions = {
  /** Active camera view. The camera is always rigidly attached to the vehicle — there is no free/manual mode. */
  cameraView: VehicleCameraView;
  interior: VehicleCameraViewSettings;
  follow: VehicleCameraViewSettings;
  /** Keyboard-driving dynamics. */
  driving: VehicleDrivingSettings;
};

export const DEFAULT_VEHICLE_OPTIONS: VehicleExampleOptions = {
  cameraView: 'follow',
  interior: { offset: [0, 1.374, 0], yawDegrees: -90, pitchDegrees: 0 },
  follow: { offset: [7, 3, 0], yawDegrees: -90, pitchDegrees: 0 },
  driving: {
    accelerationRate: 32,
    maxSpeed: 128,
    coastDeceleration: 16,
    brakeDeceleration: 64,
    yawRate: 1,
    forwardYawDegrees: 90,
    mouseSteerSensitivity: 0.00125,
    maxRadiusFromCenter: 512,
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

// Reference forward axis for the vehicle's own local space (used both for the
// "vehicle forward" the camera aligns to and as the camera's own look direction
// once rotated). Arbitrary but must stay consistent with the `offset`
// values above, which were authored against this axis.
const VEHICLE_FORWARD_AXIS: [number, number, number] = [0, 0, 1];

// Standard-gamepad button/axis mapping (Gamepad API "standard" layout).
const GAMEPAD_ACCEL_BUTTON = 0; // A / cross — accelerate
const GAMEPAD_DECEL_BUTTON = 1; // B / circle — decelerate
const GAMEPAD_TOGGLE_VIEW_BUTTON = 3; // Y / triangle — toggle interior/follow (if available)
const GAMEPAD_DPAD_LEFT_BUTTON = 14;
const GAMEPAD_DPAD_RIGHT_BUTTON = 15;
const GAMEPAD_LEFT_STICK_X_AXIS = 0;
const GAMEPAD_RIGHT_STICK_X_AXIS = 2;
const GAMEPAD_STICK_DEADZONE = 0.2;

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
   * Advance the vehicle's driving simulation by `dtSeconds`, integrating the
   * current keyboard input against the supplied `driving` dynamics. No-op
   * until the vehicle model has loaded. Call once per frame before reading
   * `getVehiclePose()`.
   */
  update: (dtSeconds: number, driving: VehicleDrivingSettings) => void;
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
};

type VehicleModel = {
  key: string;
  url: string;
  position?: [number, number, number];
  /** Optional yaw rotation (radians about +Y) applied before `position`. */
  rotationY?: number;
  scale?: number;
};

const VEHICLE_MODELS: ReadonlyArray<VehicleModel> = [
  { 
    key: 'landscape', 
    position: [-5000, -1250, 3000],
    url: '/models/vehicle/landscape.glb',
    scale: 0.25,
  },
  {
    key: 'vehicle',
    url: '/models/vehicle/spacecraft.glb',
    rotationY: Math.PI,
    scale: 0.05,
  },
];

// Pre-multiply a world-space yaw rotation and translation onto every mesh
// transform in `scene`.
const transformSceneMeshes = (scene: RenderScene, model: VehicleModel): void => {
  const { position, rotationY, scale } = model;
  if (!position && rotationY === undefined && scale === undefined) return;
  let transform = rotationY !== undefined ? mat4RotationY(rotationY) : mat4Translation(0, 0, 0);
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
  onLoadingProgress?: (progress: number | null) => void,
  onToggleCameraView?: () => void,
): VehicleExampleController => {
  let disposed = false;
  let modelDisposers: Array<() => void> = [];
  let vehiclePose: VehiclePose | null = null;
  // Car meshes paired with their pre-pose (glTF-local) transforms, so the vehicle
  // body can be re-posed each frame as it drives. Populated once the vehicle model
  // loads; empty until then.
  const vehicleMeshEntries: Array<{ mesh: SceneMeshInstance; baseTransform: Mat4 }> = [];

  // ── Keyboard driving input ────────────────────────────────────────────────
  // Live input state, updated by window key listeners and integrated each frame
  // by `update()`. Current forward speed (m/s) persists across frames so the
  // vehicle keeps rolling after the throttle is released.
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

  // Touch input: any touch accelerates (no brake gesture), and horizontal
  // panning while touching steers. `pendingTouchYawPixels` accumulates the
  // primary touch's horizontal travel between frames; `lastTouchX` tracks its
  // previous X so we can derive per-move deltas (touch events lack movementX).
  let touchActive = false;
  let lastTouchX: number | null = null;
  let pendingTouchYawPixels = 0;

  // Gamepad input (polled each frame in `update()`). Only the rising edge of
  // the toggle-view button fires, so we remember its previous pressed state.
  let prevGamepadTogglePressed = false;

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
    touchActive = false;
    lastTouchX = null;
    pendingTouchYawPixels = 0;
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

  const handleTouchStart = (event: TouchEvent): void => {
    touchActive = true; // any touch accelerates
    const touch = event.touches[0];
    if (touch) lastTouchX = touch.clientX;
    event.preventDefault();
  };
  const handleTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch && lastTouchX !== null) {
      pendingTouchYawPixels += touch.clientX - lastTouchX; // pan steers
      lastTouchX = touch.clientX;
    }
    event.preventDefault();
  };
  const handleTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length === 0) {
      touchActive = false;
      lastTouchX = null;
    } else {
      // A finger lifted but others remain; keep steering from the new primary.
      lastTouchX = event.touches[0]!.clientX;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('contextmenu', handleContextMenu);
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

  // Record the vehicle model's meshes and their glTF-local transforms (before the
  // authored spawn offset is baked in) so the vehicle body can be re-posed each
  // frame from the live `vehiclePose`. Must run before `transformSceneMeshes`.
  const captureVehicleMeshEntries = (scene: RenderScene, model: VehicleModel): void => {
    if (model.key !== 'vehicle') return;
    const scaleMat = model.scale !== undefined ? mat4ScaleUniform(model.scale) : null;
    for (const mesh of scene.meshes) {
      const local = mesh.transform ? new Float32Array(mesh.transform) : mat4Identity();
      vehicleMeshEntries.push({
        mesh,
        baseTransform: scaleMat ? mat4Multiply(scaleMat, local) : local,
      });
    }
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

      // Build a combined scene from the first model; namespace its textures,
      // then merge the rest in with their own namespacing.
      const combined: RenderScene = {
        meshes: [...valid[0]!.result.meshes],
        textureLibrary: { ...valid[0]!.result.textureLibrary },
        lights: [],
      };
      prefixSceneTextureIds(combined, valid[0]!.model.key);
      captureVehicleMeshEntries(combined, valid[0]!.model);
      transformSceneMeshes(combined, valid[0]!.model);

      for (let i = 1; i < valid.length; i += 1) {
        const src: RenderScene = {
          meshes: valid[i]!.result.meshes,
          textureLibrary: valid[i]!.result.textureLibrary,
          lights: [],
        };
        prefixSceneTextureIds(src, valid[i]!.model.key);
        captureVehicleMeshEntries(src, valid[i]!.model);
        transformSceneMeshes(src, valid[i]!.model);
        mergeSceneInto(combined, src);
      }

      const vehicleEntry = valid.find((entry) => entry.model.key === 'vehicle');
      if (vehicleEntry) {
        const spawn = vehicleEntry.model.position ?? [0, 0, 0];
        vehiclePose = {
          // Copy so per-frame integration never mutates the shared model constant.
          position: [spawn[0], spawn[1], spawn[2]],
          yawRadians: vehicleEntry.model.rotationY ?? 0,
        };
      }

      if (combined.lights.length === 0) {
        combined.directionalLightingEnabled = true;
        combined.directionalLightingIntensity = 1;
      }

      // The grandstand canopy roof (split onto its own `canopy` material in the
      // GLB) shows shadow/culling noise on its thin geometry. Disable shadow
      // casting/receiving on it to test whether the artifact is shadow acne.
      {
        const seen = new Set<PbrMaterial>();
        for (const m of combined.meshes) {
          const mat = m.material;
          if (seen.has(mat)) continue;
          seen.add(mat);
          if (mat.name?.includes('canopy')) {
            mat.castsShadows = false;
            mat.receivesShadows = false;
          }
        }
      }

      // Attach the head-locked speed HUD (cylinder + dynamic canvas texture).
      combined.meshes.push(hudMesh);
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
    update: (dtSeconds: number, driving: VehicleDrivingSettings): void => {
      if (!vehiclePose || !(dtSeconds > 0)) return;

      // Poll the gamepad (if any). Buttons drive throttle/brake and toggle the
      // camera view; the d-pad and either thumbstick's X axis steer.
      let gamepadThrottle = false;
      let gamepadBrake = false;
      let gamepadSteer = 0; // -1 (full left) … +1 (full right)
      const pads =
        typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads.find((p): p is Gamepad => p !== null);
      if (pad) {
        gamepadThrottle = pad.buttons[GAMEPAD_ACCEL_BUTTON]?.pressed ?? false;
        gamepadBrake = pad.buttons[GAMEPAD_DECEL_BUTTON]?.pressed ?? false;

        const dpad =
          (pad.buttons[GAMEPAD_DPAD_RIGHT_BUTTON]?.pressed ? 1 : 0) -
          (pad.buttons[GAMEPAD_DPAD_LEFT_BUTTON]?.pressed ? 1 : 0);
        // Use whichever stick is pushed further from centre, past a deadzone.
        const leftX = pad.axes[GAMEPAD_LEFT_STICK_X_AXIS] ?? 0;
        const rightX = pad.axes[GAMEPAD_RIGHT_STICK_X_AXIS] ?? 0;
        const stick = Math.abs(leftX) >= Math.abs(rightX) ? leftX : rightX;
        const stickSteer = Math.abs(stick) > GAMEPAD_STICK_DEADZONE ? stick : 0;
        gamepadSteer = Math.max(-1, Math.min(1, dpad + stickSteer));

        // Rising edge of the toggle-view button flips interior/follow.
        const togglePressed = pad.buttons[GAMEPAD_TOGGLE_VIEW_BUTTON]?.pressed ?? false;
        if (togglePressed && !prevGamepadTogglePressed) {
          onToggleCameraView?.();
        }
        prevGamepadTogglePressed = togglePressed;
      } else {
        prevGamepadTogglePressed = false;
      }

      // Keyboard, mouse, touch, and gamepad inputs are combined: any source can
      // throttle, keyboard/mouse/gamepad can brake, and all steering sources
      // add together. (Touch has no brake gesture.)
      const throttle = throttleHeld || mouseThrottleHeld || touchActive || gamepadThrottle;
      const brake = brakeHeld || mouseBrakeHeld || gamepadBrake;
      const mouseYaw = pendingMouseYawPixels;
      pendingMouseYawPixels = 0;
      const touchYaw = pendingTouchYawPixels;
      pendingTouchYawPixels = 0;

      // Longitudinal dynamics: throttle accelerates toward maxSpeed; braking
      // decelerates hard; otherwise the vehicle coasts down to a stop. Speed never
      // goes negative (no reverse gear).
      if (throttle) {
        speed = Math.min(driving.maxSpeed, speed + driving.accelerationRate * dtSeconds);
      } else if (brake) {
        speed = Math.max(0, speed - driving.brakeDeceleration * dtSeconds);
      } else {
        speed = Math.max(0, speed - driving.coastDeceleration * dtSeconds);
      }

      // Steering only bites while the vehicle is moving. Left turns decrease yaw,
      // right turns increase it (about +Y). Keyboard is time-scaled; mouse is
      // proportional to physical movement (already frame-rate independent).
      if (speed > 0) {
        const steer = (steerRightHeld ? 1 : 0) - (steerLeftHeld ? 1 : 0);
        if (steer !== 0) {
          vehiclePose.yawRadians += steer * driving.yawRate * dtSeconds;
        }
        // Gamepad steering is analog and time-scaled like the keyboard.
        if (gamepadSteer !== 0) {
          vehiclePose.yawRadians += gamepadSteer * driving.yawRate * dtSeconds;
        }
        // Mouse steering only applies while the left button (accelerate) is
        // held.
        if (mouseYaw !== 0 && mouseThrottleHeld) {
          vehiclePose.yawRadians += mouseYaw * driving.mouseSteerSensitivity;
        }
        // Touch steering applies while the screen is being touched
        // (which is also what accelerates).
        if (touchYaw !== 0 && touchActive) {
          vehiclePose.yawRadians += touchYaw * driving.mouseSteerSensitivity;
        }
      }

      if (speed > 0) {
        // Apply the model's forward-axis yaw correction so the vehicle drives in
        // the direction it visually faces rather than sideways.
        const movementYaw = vehiclePose.yawRadians + (driving.forwardYawDegrees * Math.PI) / 180;
        const forward = rotateVec3ByMat4(mat4RotationY(movementYaw), VEHICLE_FORWARD_AXIS);
        const step = speed * dtSeconds;
        vehiclePose.position[0] += forward[0] * step;
        vehiclePose.position[1] += forward[1] * step;
        vehiclePose.position[2] += forward[2] * step;

        // Clamp to the configured travel radius, measured on the X/Z plane
        // only. The vehicle slides along the boundary circle rather than
        // stopping dead, so steering back inward remains responsive.
        const radius = Math.hypot(vehiclePose.position[0], vehiclePose.position[2]);
        if (radius > driving.maxRadiusFromCenter && radius > 0) {
          const scale = driving.maxRadiusFromCenter / radius;
          vehiclePose.position[0] *= scale;
          vehiclePose.position[2] *= scale;
        }
      }

      // Re-pose the vehicle body to match the live pose. Mirrors the offset order
      // baked by `transformSceneMeshes`: worldOffset = T(position) · Ry(yaw).
      if (vehicleMeshEntries.length > 0) {
        const poseOffset = mat4Multiply(
          mat4Translation(vehiclePose.position[0], vehiclePose.position[1], vehiclePose.position[2]),
          mat4RotationY(vehiclePose.yawRadians),
        );
        for (const entry of vehicleMeshEntries) {
          entry.mesh.transform = mat4Multiply(poseOffset, entry.baseTransform);
        }
      }

      // Refresh the speed readout only when the whole-mph value changes, so the
      // canvas texture uploads at most once per mph tick.
      const mph = Math.round(speed * MPH_PER_MPS);
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
    dispose: () => {
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
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
