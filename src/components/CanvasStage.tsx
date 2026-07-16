import { memo, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Camera } from '@dotdotdash/stunner-core/camera/Camera';
import { KeyboardController } from '@dotdotdash/stunner-core/camera/KeyboardController';
import { MouseController } from '@dotdotdash/stunner-core/camera/MouseController';
import { TouchController } from '@dotdotdash/stunner-core/camera/TouchController';
import {
  RendererEngine,
  type RendererInvalidationEvent,
  type RendererFrameHookContext,
  type RendererEngineOptions,
} from '@dotdotdash/stunner-core/renderer/RendererEngine';
import type { RendererConfig } from '@dotdotdash/stunner-core/renderer/config/RendererConfig';
import {
  createModelsAndMaterialsExampleScene,
  type ModelsAndMaterialsExampleOptions,
  type ModelsAndMaterialsExampleSceneResult,
} from '../examples/modelsAndMaterials';
import { startPointLightsExample, type PointLightsExampleOptions } from '../examples/pointLights';
import { startFlockingExample, type FlockingExampleOptions } from '../examples/flocking';
import { startCrowdExample, type CrowdExampleOptions, type CrowdPickingData } from '../examples/crowd';
import { startBrainStemDracoExample, type BrainStemDracoExampleOptions } from '../examples/brainStemDraco';
import { startSponzaExample, type SponzaExampleOptions } from '../examples/sponza';
import { startHillsExample, type HillsExampleOptions } from '../examples/hills';
import { startPorscheExample, type PorscheExampleOptions } from '../examples/usd/porsche';
import { startTrainExample } from '../examples/usd/train';
import { startCityExample } from '../examples/usd/city';
import { startGsplatExample, type GsplatExampleController, type GsplatExampleOptions } from '../examples/gsplat';
import {
  startVehicleExample,
  computeVehicleCameraPose,
  DEFAULT_VEHICLE_OPTIONS,
  type VehicleExampleOptions,
} from '../examples/spacecraft';

export type CameraTelemetry = {
  location: [number, number, number];
  forward: [number, number, number];
  /** Vertical field-of-view in degrees. */
  fovDegrees: number;
  /** Per-frame interpolation factor for location (`1` = snap, `0.333` = default ease). */
  positionInterpolationSpeed: number;
  /** Per-frame interpolation factor for rotation + vertical FOV (`1` = snap, `0.333` = default ease). */
  forwardInterpolationSpeed: number;
  /** Maximum remaining positional distance before the display pose snaps to the target. */
  positionInterpolationDistanceThreshold: number;
  /** Maximum remaining forward-state difference before the display pose snaps to the target. */
  forwardInterpolationDistanceThreshold: number;
};

/** Imperative camera input \u2014 every field is optional and applied if present. */
export type CameraInput = {
  location?: [number, number, number];
  forward?: [number, number, number];
  fovDegrees?: number;
  positionInterpolationSpeed?: number;
  forwardInterpolationSpeed?: number;
  positionInterpolationDistanceThreshold?: number;
  forwardInterpolationDistanceThreshold?: number;
  /**
   * When `true`, the camera snaps its displayed pose to the target after
   * the supplied fields are applied, bypassing interpolation. Used when
   * loading an example so the camera does not ease in from the previous
   * example's pose.
   */
  snap?: boolean;};

export type CanvasStageCameraControls = {
  getCamera: () => CameraTelemetry | null;
  setCamera: (camera: CameraInput) => void;
};

export type PerformanceTelemetry = {
  /** rAF tick rate. */
  fps: number;
  /** Effective presented rate (tick rate floored by GPU completion time). */
  presentedFps: number;
  frameIntervalMs: number;
  frameTimeMs: number;
  /** GPU wall time per frame (ms); `0` until the first onSubmittedWorkDone probe resolves. */
  gpuFrameTimeMs: number;
  cpuUsagePercent: number | null;
  cpuMemoryMb: number | null;
  gpuUsagePercent: number | null;
  gpuMemoryMb: number | null;
  canvasWidthPx: number | null;
  canvasHeightPx: number | null;
};

export type ExampleTelemetry = {
  clipName: string;
  playbackSpeed: number;
} | null;

type CrowdSpeechBubble = {
  x: number;
  y: number;
  text: string;
};

const CROWD_GREETINGS = ['hello!', 'hi!', 'hey there!', 'sup?', 'good day!', 'yo!'];

const nextGreetingIndex = (currentIndex: number | null): number => {
  if (!Number.isFinite(currentIndex)) {
    return 0;
  }
  return ((currentIndex ?? 0) + 1) % CROWD_GREETINGS.length;
};

const getPointerViewportCoords = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): [number, number] => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  return [clientX - rect.left, clientY - rect.top].map((value, index) => {
    const limit = index === 0 ? width : height;
    return Math.max(0, Math.min(limit, value));
  }) as [number, number];
};

const intersectVerticalCylinder = (
  rayOrigin: [number, number, number],
  rayDirection: [number, number, number],
  cylinderCenterX: number,
  cylinderMinY: number,
  cylinderCenterZ: number,
  cylinderRadius: number,
  cylinderHeight: number,
): number | null => {
  const ox = rayOrigin[0] - cylinderCenterX;
  const oz = rayOrigin[2] - cylinderCenterZ;
  const dx = rayDirection[0];
  const dz = rayDirection[2];
  const radiusSq = cylinderRadius * cylinderRadius;

  const a = dx * dx + dz * dz;
  if (a <= 1e-8) {
    return null;
  }

  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radiusSq;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const inv2A = 1 / (2 * a);
  const tCandidates = [(-b - sqrtDisc) * inv2A, (-b + sqrtDisc) * inv2A];
  const minY = cylinderMinY;
  const maxY = cylinderMinY + cylinderHeight;

  for (const t of tCandidates) {
    if (t <= 0) {
      continue;
    }
    const y = rayOrigin[1] + rayDirection[1] * t;
    if (y >= minY && y <= maxY) {
      return t;
    }
  }

  return null;
};

type CanvasStageProps = {
  className?: string;
  onRendererInvalidated?: (event: RendererInvalidationEvent) => void;
  onCameraTelemetry?: (telemetry: CameraTelemetry) => void;
  onPerformanceTelemetry?: (telemetry: PerformanceTelemetry) => void;
  onExampleTelemetry?: (telemetry: ExampleTelemetry) => void;
  onExampleLoadingProgress?: (progress: number | null) => void;
  rendererConfig?: RendererConfig;
  exampleSelection?: SandboxExample;
  modelsAndMaterialsOptions?: ModelsAndMaterialsExampleOptions;
  pointLightsOptions?: PointLightsExampleOptions;
  flockingOptions?: FlockingExampleOptions;
  crowdOptions?: CrowdExampleOptions;
  gsplatOptions?: GsplatExampleOptions;
  sponzaOptions?: SponzaExampleOptions;
  brainStemDracoOptions?: BrainStemDracoExampleOptions;
  porscheOptions?: PorscheExampleOptions;
  hillsOptions?: HillsExampleOptions;
  vehicleOptions?: VehicleExampleOptions;
  /**
   * Optional ref populated with imperative camera read/write helpers.
   * Used by the HUD to save and restore camera pose alongside other settings.
   */
  cameraControlsRef?: MutableRefObject<CanvasStageCameraControls | null>;
  /**
   * Optional ref carrying a one-shot camera pose to apply on the next mount
   * instead of the per-example default. Used by the demo shell to preserve
   * the live camera across reload-only renderer changes (e.g. LOD
   * `maxTextureSize` / `tessellationFactor` edits remount the stage). The
   * ref's `current` is consumed (cleared) once applied so it does not bleed
   * into a later example switch.
   */
  initialCameraOverrideRef?: MutableRefObject<CameraInput | null>;
};

export type SandboxExample =
  | 'brainStemDraco'
  | 'city'
  | 'crowd'
  | 'flocking'
  | 'gsplat'
  | 'hills'
  | 'modelsAndMaterials'
  | 'pointLights'
  | 'porsche'
  | 'spacecraft'
  | 'sponza'
  | 'train';

export const CanvasStage = memo(function CanvasStage({
  className,
  onRendererInvalidated,
  onCameraTelemetry,
  onPerformanceTelemetry,
  onExampleTelemetry,
  onExampleLoadingProgress,
  rendererConfig,
  exampleSelection = 'modelsAndMaterials',
  modelsAndMaterialsOptions,
  pointLightsOptions,
  flockingOptions,
  crowdOptions,
  gsplatOptions,
  sponzaOptions,
  brainStemDracoOptions,
  porscheOptions,
  hillsOptions,
  vehicleOptions,
  cameraControlsRef,
  initialCameraOverrideRef,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const engineRef = useRef<RendererEngine | null>(null);
  const onRendererInvalidatedRef = useRef<typeof onRendererInvalidated>(onRendererInvalidated);
  const onCameraTelemetryRef = useRef<typeof onCameraTelemetry>(onCameraTelemetry);
  const onPerformanceTelemetryRef = useRef<typeof onPerformanceTelemetry>(onPerformanceTelemetry);
  const onExampleTelemetryRef = useRef<typeof onExampleTelemetry>(onExampleTelemetry);
  const onExampleLoadingProgressRef = useRef<typeof onExampleLoadingProgress>(onExampleLoadingProgress);
  const exampleBeforeFrameHookRef = useRef<((context: RendererFrameHookContext) => void) | null>(null);
  const modelsAndMaterialsRigControllerRef = useRef<ModelsAndMaterialsExampleSceneResult['rigController']>(null);
  const modelsAndMaterialsSetOrbitSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setOrbitSpeed'] | null>(null);
  const modelsAndMaterialsSetRotationSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setRotationSpeed'] | null>(null);
  const modelsAndMaterialsSetAnimationPlaybackSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setAnimationPlaybackSpeed'] | null>(null);
  const modelsAndMaterialsSceneRef = useRef<ModelsAndMaterialsExampleSceneResult['scene'] | null>(null);
  const pointLightsExampleControllerRef = useRef<ReturnType<typeof startPointLightsExample> | null>(null);
  const flockingControllerRef = useRef<ReturnType<typeof startFlockingExample> | null>(null);
  const crowdControllerRef = useRef<ReturnType<typeof startCrowdExample> | null>(null);
  const cityControllerRef = useRef<ReturnType<typeof startCityExample> | null>(null);
  const vehicleControllerRef = useRef<ReturnType<typeof startVehicleExample> | null>(null);
  const vehicleOptionsRef = useRef<VehicleExampleOptions>(vehicleOptions ?? DEFAULT_VEHICLE_OPTIONS);
  // Continuous (unwrapped) camera yaw for the vehicle follow cam. `lookAt`
  // derives yaw via atan2 (always wrapped to (-π, π]), so as the car circles
  // the track the eased camera yaw would otherwise jump ±2π and spin the long
  // way around. We unwrap against this running value so easing always takes the
  // shortest path. Reset to null to re-seed (fresh mount / example switch).
  const vehicleCameraYawRef = useRef<number | null>(null);
  const trainControllerRef = useRef<ReturnType<typeof startTrainExample> | null>(null);
  const brainStemDracoControllerRef = useRef<ReturnType<typeof startBrainStemDracoExample> | null>(null);
  const sponzaControllerRef = useRef<ReturnType<typeof startSponzaExample> | null>(null);
  const hillsControllerRef = useRef<ReturnType<typeof startHillsExample> | null>(null);
  const gsplatSetRotationSpeedRef = useRef<GsplatExampleController['setRotationSpeed'] | null>(null);
  const usdControllerRef = useRef<{ dispose: () => void; setOptions?: (options: PorscheExampleOptions) => void } | null>(null);
  const lastCameraResetExampleRef = useRef<SandboxExample | null>(null);
  const [engineInstanceVersion, setEngineInstanceVersion] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fatalErrorVisible, setFatalErrorVisible] = useState(false);
  const [crowdSpeechBubble, setCrowdSpeechBubble] = useState<CrowdSpeechBubble | null>(null);
  const smoothedFpsRef = useRef(0);
  const smoothedPresentedFpsRef = useRef(0);
  const selectedCrowdTransformIndexRef = useRef<number | null>(null);
  const selectedCrowdBodyIdRef = useRef<number | null>(null);
  const selectedGreetingIndexRef = useRef<number | null>(null);
  const crowdBodyIdsRef = useRef<WeakMap<object, number>>(new WeakMap<object, number>());
  const nextCrowdBodyIdRef = useRef(1);
  const performanceWithMemoryRef = useRef<Performance & {
    memory?: {
      usedJSHeapSize: number;
    };
  }>(performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
    };
  });
  const cpuMemoryBaselineBytesRef = useRef<number | null>(null);
  const modelsAndMaterialsPlaybackSpeed = modelsAndMaterialsOptions?.animationPlaybackSpeed;
  const modelsAndMaterialsOrbitSpeed = modelsAndMaterialsOptions?.orbitSpeedRadPerSec;
  const modelsAndMaterialsRotationSpeed = modelsAndMaterialsOptions?.rotationSpeedRadPerSec;
  const gsplatRotationSpeed = gsplatOptions?.rotationSpeedRadPerSec;

  const clearCrowdSelection = (): void => {
    selectedCrowdTransformIndexRef.current = null;
    selectedCrowdBodyIdRef.current = null;
    setCrowdSpeechBubble(null);
  };

  const getCrowdBodyId = (transformObject: object): number => {
    const existing = crowdBodyIdsRef.current.get(transformObject);
    if (typeof existing === 'number') {
      return existing;
    }
    const nextId = nextCrowdBodyIdRef.current;
    nextCrowdBodyIdRef.current += 1;
    crowdBodyIdsRef.current.set(transformObject, nextId);
    return nextId;
  };

  const updateCrowdBubblePosition = (): void => {
    if (exampleSelection !== 'crowd') {
      return;
    }
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    const selectedIndex = selectedCrowdTransformIndexRef.current;
    const pickingData = crowdControllerRef.current?.getPickingData();
    if (!camera || !canvas || selectedIndex === null || !pickingData) {
      return;
    }

    const transform = pickingData.instanceTransforms[selectedIndex];
    if (!transform) {
      clearCrowdSelection();
      return;
    }

    const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
    const colliderHeight = pickingData.baseColliderHeight * Math.max(0.01, scaleY);
    const anchorWorld: [number, number, number] = [
      transform[12],
      transform[13] + colliderHeight + pickingData.topOffset,
      transform[14],
    ];
    const viewport = camera.projectWorldToViewport(anchorWorld, canvas.clientWidth, canvas.clientHeight);
    const greetingIndex = selectedGreetingIndexRef.current ?? 0;
    const text = CROWD_GREETINGS[greetingIndex] ?? CROWD_GREETINGS[0];
    setCrowdSpeechBubble({ x: viewport[0], y: viewport[1], text });
  };

  const defaultCameraPosition: [number, number, number] = [5.37, 7.02, 1.19];
  const defaultCameraForward: [number, number, number] = [-0.64, -0.4, -0.66];
  const defaultCameraLookAt: [number, number, number] = [
    defaultCameraPosition[0] + defaultCameraForward[0],
    defaultCameraPosition[1] + defaultCameraForward[1],
    defaultCameraPosition[2] + defaultCameraForward[2],
  ];

  useEffect(() => {
    onRendererInvalidatedRef.current = onRendererInvalidated;
  }, [onRendererInvalidated]);

  useEffect(() => {
    onCameraTelemetryRef.current = onCameraTelemetry;
  }, [onCameraTelemetry]);

  useEffect(() => {
    onPerformanceTelemetryRef.current = onPerformanceTelemetry;
  }, [onPerformanceTelemetry]);

  useEffect(() => {
    onExampleTelemetryRef.current = onExampleTelemetry;
  }, [onExampleTelemetry]);

  useEffect(() => {
    onExampleLoadingProgressRef.current = onExampleLoadingProgress;
  }, [onExampleLoadingProgress]);

  useEffect(() => {
    vehicleOptionsRef.current = vehicleOptions ?? DEFAULT_VEHICLE_OPTIONS;
  }, [vehicleOptions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const camera = new Camera({
      location: defaultCameraPosition,
      rotationEuler: [0, 0, 0],
      far: 5000,
    });
    camera.lookAt(defaultCameraLookAt);
    // Snap so the very first frame isn't easing from the [0,0,0] rotation
    // we used to construct the camera. Subsequent setLocation/lookAt calls
    // (scene switches, slider drags) continue to interpolate as configured.
    camera.snapToTarget();
    cameraRef.current = camera;

    if (cameraControlsRef) {
      cameraControlsRef.current = {
        getCamera: () => {
          const cam = cameraRef.current;
          if (!cam) {
            return null;
          }
          return {
            location: cam.getLocation(),
            forward: cam.forwardDir(),
            fovDegrees: (cam.getFovYRadians() * 180) / Math.PI,
            positionInterpolationSpeed: cam.getPositionInterpolationSpeed(),
            forwardInterpolationSpeed: cam.getForwardInterpolationSpeed(),
            positionInterpolationDistanceThreshold: cam.getPositionInterpolationDistanceThreshold(),
            forwardInterpolationDistanceThreshold: cam.getForwardInterpolationDistanceThreshold(),
          };
        },
        setCamera: (next) => {
          const cam = cameraRef.current;
          if (!cam) {
            return;
          }
          if (typeof next.positionInterpolationSpeed === 'number') {
            cam.setPositionInterpolationSpeed(next.positionInterpolationSpeed);
          }
          if (typeof next.forwardInterpolationSpeed === 'number') {
            cam.setForwardInterpolationSpeed(next.forwardInterpolationSpeed);
          }
          if (typeof next.positionInterpolationDistanceThreshold === 'number') {
            cam.setPositionInterpolationDistanceThreshold(next.positionInterpolationDistanceThreshold);
          }
          if (typeof next.forwardInterpolationDistanceThreshold === 'number') {
            cam.setForwardInterpolationDistanceThreshold(next.forwardInterpolationDistanceThreshold);
          }
          if (typeof next.fovDegrees === 'number') {
            cam.setFovYDegrees(next.fovDegrees);
          }
          if (next.location) {
            cam.setLocation(next.location);
          }
          if (next.forward) {
            const origin = next.location ?? cam.getLocation();
            cam.lookAt([
              origin[0] + next.forward[0],
              origin[1] + next.forward[1],
              origin[2] + next.forward[2],
            ]);
          }
          if (next.snap) {
            cam.snapToTarget();
          }
        },
      };
    }

    // The vehicle example drives the camera programmatically (rigidly
    // attached to the car), so manual mouse/keyboard/touch camera input is
    // disabled for it only — every other example keeps free camera control.
    const isVehicle = exampleSelection === 'spacecraft';
    const touchController = isVehicle ? null : new TouchController(camera, canvas);
    const mouseController = isVehicle ? null : new MouseController(camera, canvas);
    const keyboardController = isVehicle ? null : new KeyboardController(camera);
    const initialHeapBytes = performanceWithMemoryRef.current.memory?.usedJSHeapSize;
    cpuMemoryBaselineBytesRef.current = Number.isFinite(initialHeapBytes) ? (initialHeapBytes ?? 0) : null;

    const telemetryTimer = window.setInterval(() => {
      const latestMetrics = engineRef.current?.getLatestFrameMetrics();
      let fps = 0;
      let presentedFps = 0;
      let frameIntervalMs = 0;
      let frameTimeMs = 0;
      let gpuFrameTimeMs = 0;
      let cpuUsagePercent: number | null = null;
      let cpuMemoryMb: number | null = null;
      let gpuUsagePercent: number | null = null;
      let gpuMemoryMb: number | null = null;
      if (latestMetrics && latestMetrics.frameIntervalMs > 0.0001) {
        frameIntervalMs = latestMetrics.frameIntervalMs;
        frameTimeMs = latestMetrics.frameTimeMs;
        gpuFrameTimeMs = latestMetrics.gpuFrameTimeMs;
        cpuUsagePercent = Math.min(100, Math.max(0, (frameTimeMs / frameIntervalMs) * 100));
        gpuUsagePercent = Math.min(100, Math.max(0, ((frameIntervalMs - frameTimeMs) / frameIntervalMs) * 100));
        const instantaneousFps = 1000 / latestMetrics.frameIntervalMs;
        const boundedFps = Math.min(240, Math.max(0, instantaneousFps));
        const alpha = 0.2;
        if (smoothedFpsRef.current <= 0.0001) {
          smoothedFpsRef.current = boundedFps;
        } else {
          smoothedFpsRef.current = smoothedFpsRef.current + (boundedFps - smoothedFpsRef.current) * alpha;
        }
        fps = smoothedFpsRef.current;
        // Presented rate: rAF tick is the ceiling; GPU completion time is
        // the floor when the GPU is back-pressured. Use whichever interval
        // is larger. Until the first onSubmittedWorkDone probe lands,
        // gpuFrameTimeMs is 0 and presentedFps just tracks fps.
        const effectiveIntervalMs = Math.max(latestMetrics.frameIntervalMs, gpuFrameTimeMs);
        const instantaneousPresentedFps =
          effectiveIntervalMs > 0.0001 ? 1000 / effectiveIntervalMs : boundedFps;
        const boundedPresentedFps = Math.min(240, Math.max(0, instantaneousPresentedFps));
        if (smoothedPresentedFpsRef.current <= 0.0001) {
          smoothedPresentedFpsRef.current = boundedPresentedFps;
        } else {
          smoothedPresentedFpsRef.current =
            smoothedPresentedFpsRef.current
            + (boundedPresentedFps - smoothedPresentedFpsRef.current) * alpha;
        }
        presentedFps = smoothedPresentedFpsRef.current;
      }
      const dynamicGpuBytes = engineRef.current?.getDynamicGpuMemoryUsageBytes();
      if (Number.isFinite(dynamicGpuBytes) && (dynamicGpuBytes ?? 0) >= 0) {
        gpuMemoryMb = (dynamicGpuBytes ?? 0) / (1024 * 1024);
      }
      const usedHeapBytes = performanceWithMemoryRef.current.memory?.usedJSHeapSize;
      if (Number.isFinite(usedHeapBytes) && (usedHeapBytes ?? 0) > 0) {
        const baselineBytes = cpuMemoryBaselineBytesRef.current;
        if (baselineBytes === null) {
          cpuMemoryBaselineBytesRef.current = usedHeapBytes ?? 0;
        }
        const stableBaselineBytes = cpuMemoryBaselineBytesRef.current ?? 0;
        cpuMemoryMb = Math.max(0, ((usedHeapBytes ?? 0) - stableBaselineBytes) / (1024 * 1024));
      }

      onCameraTelemetryRef.current?.({
        location: camera.getLocation(),
        forward: camera.forwardDir(),
        fovDegrees: (camera.getFovYRadians() * 180) / Math.PI,
        positionInterpolationSpeed: camera.getPositionInterpolationSpeed(),
        forwardInterpolationSpeed: camera.getForwardInterpolationSpeed(),
        positionInterpolationDistanceThreshold: camera.getPositionInterpolationDistanceThreshold(),
        forwardInterpolationDistanceThreshold: camera.getForwardInterpolationDistanceThreshold(),
      });
      onPerformanceTelemetryRef.current?.({
        fps,
        presentedFps,
        frameIntervalMs,
        frameTimeMs,
        gpuFrameTimeMs,
        cpuUsagePercent,
        cpuMemoryMb,
        gpuUsagePercent,
        gpuMemoryMb,
        canvasWidthPx: canvas.width > 0 ? canvas.width : null,
        canvasHeightPx: canvas.height > 0 ? canvas.height : null,
      });
    }, 120);

    let disposed = false;

    const flockingController = exampleSelection === 'flocking'
      ? startFlockingExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
          }, flockingOptions)
      : null;
    flockingControllerRef.current = flockingController;

    const crowdController = exampleSelection === 'crowd'
      ? startCrowdExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, crowdOptions, (progress) => {
          if (!disposed) {
            onExampleLoadingProgressRef.current?.(progress);
          }
        })
      : null;
    crowdControllerRef.current = crowdController;

    const cityController = exampleSelection === 'city'
      ? startCityExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, (progress) => {
          if (!disposed) {
            onExampleLoadingProgressRef.current?.(progress);
          }
        })
      : null;
    cityControllerRef.current = cityController;

    const vehicleController = exampleSelection === 'spacecraft'
      ? startVehicleExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, (progress) => {
          if (!disposed) {
            onExampleLoadingProgressRef.current?.(progress);
          }
        })
      : null;
    vehicleControllerRef.current = vehicleController;

    const trainController = exampleSelection === 'train'
      ? startTrainExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, (progress) => {
          if (!disposed) {
            onExampleLoadingProgressRef.current?.(progress);
          }
        })
      : null;
    trainControllerRef.current = trainController;

    const hillsController = exampleSelection === 'hills'
      ? startHillsExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, hillsOptions)
      : null;
    hillsControllerRef.current = hillsController;

    const gsplatController = exampleSelection === 'gsplat'
      ? startGsplatExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, camera, gsplatOptions)
      : null;
    gsplatSetRotationSpeedRef.current = gsplatController?.setRotationSpeed ?? null;

    const activeController = flockingController ?? crowdController ?? cityController ?? vehicleController ?? trainController ?? hillsController ?? gsplatController;
    const activeBeforeFrameHook = activeController?.engineOptions.frameHooks?.beforeFrame;
    const activeAfterFrameHook = activeController?.engineOptions.frameHooks?.afterFrame;
    const activeOnErrorHook = activeController?.engineOptions.frameHooks?.onError;
    const activeOnRendererInvalidated = activeController?.engineOptions.onRendererInvalidated;

    const engineOptions: RendererEngineOptions = {
      ...activeController?.engineOptions,
      onRendererReady: () => {
        setEngineReady(true);
      },
      onRendererInvalidated: (event) => {
        activeOnRendererInvalidated?.(event);
        if (exampleSelection === 'modelsAndMaterials') {
          console.info('[modelsAndMaterials] renderer invalidated', event);
        }
        onRendererInvalidatedRef.current?.(event);
      },
      frameHooks: {
        beforeFrame: (context) => {
          activeBeforeFrameHook?.(context);
          exampleBeforeFrameHookRef.current?.(context);
        },
        afterFrame: (context) => {
          activeAfterFrameHook?.(context);
        },
        onError: (phase, error, context) => {
          if (activeOnErrorHook) {
            activeOnErrorHook(phase, error, context);
            return;
          }
          console.warn('Canvas stage frame hook failed.', error);
        },
      },
    };

    const engine = new RendererEngine(canvas, undefined, camera, engineOptions);
    engineRef.current = engine;
    setFatalError(null);
    setFatalErrorVisible(false);
    setEngineInstanceVersion((current) => current + 1);

    void engine
      .start()
      .then(() => {
        if (disposed) {
          return;
        }
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Renderer failed to start with WebGPU.';
        setFatalError(message);
        setFatalErrorVisible(true);
      });
    return () => {
      disposed = true;
      cameraRef.current = null;
      lastCameraResetExampleRef.current = null;
      if (cameraControlsRef) {
        cameraControlsRef.current = null;
      }
      engineRef.current = null;
      touchController?.dispose();
      mouseController?.dispose();
      keyboardController?.dispose();
      window.clearInterval(telemetryTimer);
      flockingControllerRef.current = null;
      crowdControllerRef.current = null;
      cityControllerRef.current = null;
      vehicleControllerRef.current = null;
      trainControllerRef.current = null;
      brainStemDracoControllerRef.current = null;
      hillsControllerRef.current = null;
      flockingController?.dispose();
      crowdController?.dispose();
      cityController?.dispose();
      vehicleController?.dispose();
      trainController?.dispose();
      hillsController?.dispose();
      gsplatController?.dispose();
      gsplatSetRotationSpeedRef.current = null;
      engine.dispose();
    };
  }, [exampleSelection]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const camera = cameraRef.current;
    if (camera && lastCameraResetExampleRef.current !== exampleSelection) {
      // A pending override is only honored on a *fresh* mount of the stage
      // (lastCameraResetExampleRef has just been re-initialized to null by
      // the unmount cleanup). On a same-mount example switch we still apply
      // the per-example default below.
      const pendingOverride =
        lastCameraResetExampleRef.current === null && initialCameraOverrideRef?.current
          ? initialCameraOverrideRef.current
          : null;
      lastCameraResetExampleRef.current = exampleSelection;
      if (pendingOverride) {
        if (initialCameraOverrideRef) {
          initialCameraOverrideRef.current = null;
        }
        if (typeof pendingOverride.positionInterpolationSpeed === 'number') {
          camera.setPositionInterpolationSpeed(pendingOverride.positionInterpolationSpeed);
        }
        if (typeof pendingOverride.forwardInterpolationSpeed === 'number') {
          camera.setForwardInterpolationSpeed(pendingOverride.forwardInterpolationSpeed);
        }
        if (typeof pendingOverride.positionInterpolationDistanceThreshold === 'number') {
          camera.setPositionInterpolationDistanceThreshold(pendingOverride.positionInterpolationDistanceThreshold);
        }
        if (typeof pendingOverride.forwardInterpolationDistanceThreshold === 'number') {
          camera.setForwardInterpolationDistanceThreshold(pendingOverride.forwardInterpolationDistanceThreshold);
        }
        if (typeof pendingOverride.fovDegrees === 'number') {
          camera.setFovYDegrees(pendingOverride.fovDegrees);
        }
        if (pendingOverride.location) {
          camera.setLocation(pendingOverride.location);
        }
        if (pendingOverride.forward) {
          const origin = pendingOverride.location ?? camera.getLocation();
          camera.lookAt([
            origin[0] + pendingOverride.forward[0],
            origin[1] + pendingOverride.forward[1],
            origin[2] + pendingOverride.forward[2],
          ]);
        }
        camera.snapToTarget();
      } else if (exampleSelection === 'flocking') {
        camera.setLocation([0.0, 0.0, 18.0]);
        camera.lookAt([0, 0, 0]);
      } else if (exampleSelection === 'pointLights') {
        camera.setLocation([22.0, 22.0, 10.0]);
        camera.lookAt([16.97, 14.4, 5.89]);
      } else if (exampleSelection === 'crowd') {
        const crowdCameraPosition: [number, number, number] = [0.0, 2.35, 9.41];
        const crowdCameraForward: [number, number, number] = [0.0, -0.47, -0.88];
        camera.setLocation(crowdCameraPosition);
        camera.lookAt([
          crowdCameraPosition[0] + crowdCameraForward[0],
          crowdCameraPosition[1] + crowdCameraForward[1],
          crowdCameraPosition[2] + crowdCameraForward[2],
        ]);
      } else if (exampleSelection === 'brainStemDraco') {
        const brainStemDracoCameraPosition: [number, number, number] = [0.0, 1.0, 2.5];
        const brainStemDracoCameraForward: [number, number, number] = [0.0, -0.05, -0.95];
        camera.setLocation(brainStemDracoCameraPosition);
        camera.lookAt([
          brainStemDracoCameraPosition[0] + brainStemDracoCameraForward[0],
          brainStemDracoCameraPosition[1] + brainStemDracoCameraForward[1],
          brainStemDracoCameraPosition[2] + brainStemDracoCameraForward[2],
        ]);
      } else if (exampleSelection === 'sponza') {
        const sponzaCameraPosition: [number, number, number] = [-9.72, 0.98, 0.28];
        const sponzaCameraForward: [number, number, number] = [0.94, 0.26, -0.24];
        camera.setLocation(sponzaCameraPosition);
        camera.lookAt([
          sponzaCameraPosition[0] + sponzaCameraForward[0],
          sponzaCameraPosition[1] + sponzaCameraForward[1],
          sponzaCameraPosition[2] + sponzaCameraForward[2],
        ]);
      } else if (exampleSelection === 'gsplat') {
        // The shell-1.sog asset's decoded means span roughly [-1.1, 1.2] on
        // each axis (radius ~1.2 around the origin), so the default
        // modelsAndMaterials-scale camera pose (many units away) would leave
        // it out of frame. Frame it up close instead.
        camera.setLocation([0, 0, 3]);
        camera.lookAt([0, 0, 0]);
      } else if (
        exampleSelection === 'porsche' ||
        exampleSelection === 'train' ||
        exampleSelection === 'city' ||
        exampleSelection === 'spacecraft'
      ) {
        const usdCameraPosition: [number, number, number] = [6, 4, 8];
        const usdCameraForward: [number, number, number] = [-0.6, -0.3, -0.74];
        camera.setLocation(usdCameraPosition);
        camera.lookAt([
          usdCameraPosition[0] + usdCameraForward[0],
          usdCameraPosition[1] + usdCameraForward[1],
          usdCameraPosition[2] + usdCameraForward[2],
        ]);
      } else {
        camera.setLocation(defaultCameraPosition);
        camera.lookAt(defaultCameraLookAt);
      }
      // Snap so switching examples does not animate the camera in from the
      // previous example's pose. Subsequent controller / HUD edits will
      // continue to interpolate at the configured speed.
      camera.snapToTarget();
    }

    let disposed = false;
    let disposeExample: (() => void) | null = null;
    modelsAndMaterialsRigControllerRef.current = null;
    modelsAndMaterialsSetOrbitSpeedRef.current = null;
    modelsAndMaterialsSetRotationSpeedRef.current = null;
    modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = null;
    modelsAndMaterialsSceneRef.current = null;

    if (!engineReady) {
      return () => {
        disposed = true;
        pointLightsExampleControllerRef.current = null;
        sponzaControllerRef.current = null;
        modelsAndMaterialsRigControllerRef.current = null;
        modelsAndMaterialsSetOrbitSpeedRef.current = null;
        modelsAndMaterialsSetRotationSpeedRef.current = null;
        modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = null;
        modelsAndMaterialsSceneRef.current = null;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    }

    if (exampleSelection === 'flocking') {
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    }

    if (exampleSelection === 'pointLights') {
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      const controller = startPointLightsExample((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      }, pointLightsOptions);
      pointLightsExampleControllerRef.current = controller;
      disposeExample = controller.dispose;
    } else if (exampleSelection === 'sponza') {
      pointLightsExampleControllerRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      const controller = startSponzaExample((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      }, sponzaOptions, (progress) => {
        if (!disposed) {
          onExampleLoadingProgressRef.current?.(progress);
        }
      });
      sponzaControllerRef.current = controller;
      disposeExample = controller.dispose;
    } else if (exampleSelection === 'hills') {
      // The hills example registers a compute-stage pipeline at engine init
      // (wind + grass simulation), so it is started in the main effect
      // (above) and its engineOptions feed RendererEngine construction.
      pointLightsExampleControllerRef.current = null;
      sponzaControllerRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    } else if (exampleSelection === 'gsplat') {
      // Likewise, gsplat registers its webGpuStages at engine init (above),
      // so it must not be started again here — doing so would re-fetch and
      // re-decode the SOG asset into a second, unused stage runtime.
      pointLightsExampleControllerRef.current = null;
      sponzaControllerRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    } else if (exampleSelection === 'brainStemDraco') {
      pointLightsExampleControllerRef.current = null;
      sponzaControllerRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      const controller = startBrainStemDracoExample((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      }, brainStemDracoOptions, (progress) => {
        if (!disposed) {
          onExampleLoadingProgressRef.current?.(progress);
        }
      });
      brainStemDracoControllerRef.current = controller;
      exampleBeforeFrameHookRef.current = (context) => {
        controller.beforeFrame(context.deltaTimeMs / 1000);
      };
      disposeExample = controller.dispose;
    } else if (
      exampleSelection === 'porsche'
    ) {
      sponzaControllerRef.current = null;
      pointLightsExampleControllerRef.current = null;
      brainStemDracoControllerRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      const applySceneSafely = (scene: import('@dotdotdash/stunner-core/renderer/mesh/SceneTypes').RenderScene): void => {
        if (disposed) return;
        engine.setScene(scene);
      };
      const onProgress = (progress: number | null): void => {
        if (disposed) return;
        onExampleLoadingProgressRef.current?.(progress);
      };
      const controller = startPorscheExample(applySceneSafely, porscheOptions, onProgress);
      usdControllerRef.current = controller;
      disposeExample = controller.dispose;
    } else if (exampleSelection === 'crowd' || exampleSelection === 'city' || exampleSelection === 'train') {
      // Both are started in the main effect so their engineOptions can be
      // injected at engine-construction time. Nothing to do here beyond
      // clearing unrelated controller refs.
      sponzaControllerRef.current = null;
      pointLightsExampleControllerRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    } else if (exampleSelection === 'spacecraft') {
      // Started in the main effect (its engineOptions must be injected at
      // engine-construction time). Here we only register the per-frame
      // camera-follow hook: the camera is rigidly re-attached to the car
      // every frame according to the selected `interior`/`follow` view.
      // Manual camera input is disabled for this example (see the
      // `isVehicle` controller guard above), so there is no free mode.
      // Switching between `interior`/`follow` is a normal `setLocation`/
      // `setRotationEuler` call, so it eases in at the camera's configured
      // interpolation speed rather than snapping.
      sponzaControllerRef.current = null;
      pointLightsExampleControllerRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      vehicleCameraYawRef.current = null;
      exampleBeforeFrameHookRef.current = (context) => {
        const camera = cameraRef.current;
        const controller = vehicleControllerRef.current;
        if (!camera || !controller) {
          return;
        }
        controller.update(context.deltaTimeMs / 1000, vehicleOptionsRef.current.movement);
        const vehiclePose = controller.getVehiclePose();
        if (!vehiclePose) {
          return;
        }
        const { location, forward } = computeVehicleCameraPose(vehiclePose, vehicleOptionsRef.current.cameraView);
        camera.setLocation(location);
        // Convert the desired look direction into euler pitch/yaw exactly as
        // `Camera.lookAt` would, but unwrap the yaw so it stays continuous
        // across the ±π boundary — otherwise the eased follow cam spins a full
        // turn each time the car laps past that heading.
        const targetPitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));
        const rawYaw = Math.atan2(forward[0], -forward[2]);
        const prevYaw = vehicleCameraYawRef.current;
        let continuousYaw = rawYaw;
        if (prevYaw !== null) {
          const twoPi = Math.PI * 2;
          let delta = rawYaw - prevYaw;
          delta -= twoPi * Math.floor((delta + Math.PI) / twoPi); // wrap to (-π, π]
          continuousYaw = prevYaw + delta;
        }
        vehicleCameraYawRef.current = continuousYaw;
        camera.setRotationEuler([targetPitch, continuousYaw, 0]);

        // Head-lock the in-world speed HUD to the rendered (display) pose so it
        // stays fixed in the view as a gently curved panel.
        controller.updateHudTransform(
          camera.getDisplayLocation(),
          camera.displayRightDir(),
          camera.displayUpDir(),
          camera.displayForwardDir(),
        );
      };
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleLoadingProgressRef.current?.(null);
        onExampleTelemetryRef.current?.(null);
      };
    } else {
      sponzaControllerRef.current = null;
      pointLightsExampleControllerRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      void createModelsAndMaterialsExampleScene({
        animationPlaybackSpeed: modelsAndMaterialsPlaybackSpeed,
        orbitSpeedRadPerSec: modelsAndMaterialsOrbitSpeed,
        rotationSpeedRadPerSec: modelsAndMaterialsRotationSpeed,
      }, (progress) => {
        if (!disposed) {
          onExampleLoadingProgressRef.current?.(progress);
        }
      })
        .then((result: ModelsAndMaterialsExampleSceneResult) => {
          if (disposed) {
            result.dispose();
            return;
          }
          modelsAndMaterialsRigControllerRef.current = result.rigController;
          modelsAndMaterialsSetOrbitSpeedRef.current = result.setOrbitSpeed;
          modelsAndMaterialsSetRotationSpeedRef.current = result.setRotationSpeed;
          modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = result.setAnimationPlaybackSpeed;
          modelsAndMaterialsSceneRef.current = result.scene;
          exampleBeforeFrameHookRef.current = result.beforeFrame;
          onExampleTelemetryRef.current?.(result.animationStatus);
          engine.setScene(result.scene);
          disposeExample = result.dispose;
        })
        .catch((error: unknown) => {
          onExampleTelemetryRef.current?.(null);
          console.warn('Models and materials example scene failed to initialize.', error);
        });
    }

    return () => {
      disposed = true;
      pointLightsExampleControllerRef.current = null;
      crowdControllerRef.current = null;
      brainStemDracoControllerRef.current = null;
      sponzaControllerRef.current = null;
      usdControllerRef.current = null;
      modelsAndMaterialsRigControllerRef.current = null;
      modelsAndMaterialsSetOrbitSpeedRef.current = null;
      modelsAndMaterialsSetRotationSpeedRef.current = null;
      modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = null;
      modelsAndMaterialsSceneRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleLoadingProgressRef.current?.(null);
      onExampleTelemetryRef.current?.(null);
      disposeExample?.();
    };
  }, [exampleSelection, engineInstanceVersion, engineReady]);

  useEffect(() => {
    if (exampleSelection !== 'modelsAndMaterials') {
      return;
    }
    const nextOrbitSpeed = modelsAndMaterialsOrbitSpeed;
    if (!Number.isFinite(nextOrbitSpeed)) {
      return;
    }
    modelsAndMaterialsSetOrbitSpeedRef.current?.(nextOrbitSpeed ?? 0);
  }, [exampleSelection, modelsAndMaterialsOrbitSpeed]);

  useEffect(() => {
    if (exampleSelection !== 'modelsAndMaterials') {
      return;
    }
    const nextSpeed = modelsAndMaterialsPlaybackSpeed;
    if (!Number.isFinite(nextSpeed)) {
      return;
    }
    const clampedSpeed = Math.max(0, nextSpeed ?? 1);
    modelsAndMaterialsSetAnimationPlaybackSpeedRef.current?.(clampedSpeed);
    const rigController = modelsAndMaterialsRigControllerRef.current;
    if (!rigController) {
      return;
    }
    rigController.setPlaybackSpeed(clampedSpeed);
    onExampleTelemetryRef.current?.({
      clipName: rigController.getClipNames()[0] ?? 'unknown',
      playbackSpeed: clampedSpeed,
    });
  }, [exampleSelection, modelsAndMaterialsPlaybackSpeed]);

  useEffect(() => {
    if (exampleSelection !== 'modelsAndMaterials') {
      return;
    }
    const nextRotationSpeed = modelsAndMaterialsRotationSpeed;
    if (!Number.isFinite(nextRotationSpeed)) {
      return;
    }
    modelsAndMaterialsSetRotationSpeedRef.current?.(nextRotationSpeed ?? 0);
  }, [exampleSelection, modelsAndMaterialsRotationSpeed]);

  useEffect(() => {
    if (exampleSelection !== 'gsplat') {
      return;
    }
    const nextRotationSpeed = gsplatRotationSpeed;
    if (!Number.isFinite(nextRotationSpeed)) {
      return;
    }
    gsplatSetRotationSpeedRef.current?.(nextRotationSpeed ?? 0);
  }, [exampleSelection, gsplatRotationSpeed]);

  useEffect(() => {
    if (exampleSelection === 'pointLights' && pointLightsOptions) {
      pointLightsExampleControllerRef.current?.setOptions(pointLightsOptions);
    }
  }, [exampleSelection, pointLightsOptions]);

  useEffect(() => {
    if (exampleSelection === 'flocking' && flockingOptions) {
      flockingControllerRef.current?.setOptions(flockingOptions);
    }
  }, [exampleSelection, flockingOptions]);

  useEffect(() => {
    if (exampleSelection === 'crowd' && crowdOptions) {
      crowdControllerRef.current?.setOptions(crowdOptions);
    }
  }, [exampleSelection, crowdOptions]);

  useEffect(() => {
    if (exampleSelection !== 'crowd') {
      clearCrowdSelection();
      return;
    }
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    if (!canvas || !camera) {
      return;
    }

    const onPointerMove = (event: PointerEvent): void => {
      const pickingData: CrowdPickingData | null = crowdControllerRef.current?.getPickingData() ?? null;
      if (!pickingData || pickingData.instanceTransforms.length === 0) {
        clearCrowdSelection();
        return;
      }

      const [viewportX, viewportY] = getPointerViewportCoords(canvas, event.clientX, event.clientY);
      const ray = camera.rayFromViewport(viewportX, viewportY, canvas.clientWidth, canvas.clientHeight);
      if (!ray) {
        clearCrowdSelection();
        return;
      }

      let bestT = Number.POSITIVE_INFINITY;
      let bestIndex: number | null = null;
      for (let index = 0; index < pickingData.instanceTransforms.length; index += 1) {
        const transform = pickingData.instanceTransforms[index];
        if (!transform) {
          continue;
        }
        const scaleX = Math.hypot(transform[0], transform[1], transform[2]);
        const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
        const scaleZ = Math.hypot(transform[8], transform[9], transform[10]);
        const effectiveScale = Math.max(0.01, (scaleX + scaleZ) * 0.5);
        const colliderRadius = pickingData.baseColliderRadius * effectiveScale;
        const colliderHeight = pickingData.baseColliderHeight * Math.max(0.01, scaleY);
        const t = intersectVerticalCylinder(
          ray.origin,
          ray.direction,
          transform[12],
          transform[13],
          transform[14],
          colliderRadius,
          colliderHeight,
        );
        if (t !== null && t < bestT) {
          bestT = t;
          bestIndex = index;
        }
      }

      if (bestIndex === null) {
        clearCrowdSelection();
        return;
      }

      const selectedTransform = pickingData.instanceTransforms[bestIndex] as object;
      const selectedBodyId = getCrowdBodyId(selectedTransform);
      if (selectedCrowdBodyIdRef.current !== selectedBodyId) {
        selectedGreetingIndexRef.current = nextGreetingIndex(selectedGreetingIndexRef.current);
      }
      selectedCrowdBodyIdRef.current = selectedBodyId;
      selectedCrowdTransformIndexRef.current = bestIndex;
      updateCrowdBubblePosition();
    };

    const onPointerLeave = (): void => {
      clearCrowdSelection();
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      clearCrowdSelection();
    };
  }, [exampleSelection, engineInstanceVersion]);

  useEffect(() => {
    if (exampleSelection !== 'crowd') {
      return;
    }
    let rafId = 0;
    const tick = (): void => {
      updateCrowdBubblePosition();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [exampleSelection, engineInstanceVersion]);

  useEffect(() => {
    if (exampleSelection === 'hills' && hillsOptions) {
      hillsControllerRef.current?.setOptions(hillsOptions);
    }
  }, [exampleSelection, hillsOptions]);

  useEffect(() => {
    if (exampleSelection === 'sponza' && sponzaOptions) {
      sponzaControllerRef.current?.setOptions(sponzaOptions);
    }
  }, [exampleSelection, sponzaOptions]);

  useEffect(() => {
    if (exampleSelection === 'brainStemDraco' && brainStemDracoOptions) {
      brainStemDracoControllerRef.current?.setOptions(brainStemDracoOptions);
    }
  }, [exampleSelection, brainStemDracoOptions]);

  useEffect(() => {
    if (exampleSelection === 'porsche' && porscheOptions) {
      usdControllerRef.current?.setOptions?.(porscheOptions);
    }
  }, [exampleSelection, porscheOptions]);

  useEffect(() => {
    if (!rendererConfig || !engineRef.current) {
      return;
    }
    engineRef.current.updateConfig(rendererConfig);
  }, [rendererConfig, exampleSelection]);

  const visibleFatalError = fatalErrorVisible ? fatalError : null;

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className={className}
        aria-label="Game rendering surface"
      />
      {visibleFatalError ? (
        <div className="canvas-error" role="alert" aria-live="assertive">
          <p className="canvas-error-message">{visibleFatalError}</p>
          <button
            type="button"
            className="canvas-error-close"
            onClick={() => setFatalErrorVisible(false)}
            aria-label="Dismiss renderer error"
          >
            Close
          </button>
        </div>
      ) : null}
      {exampleSelection === 'crowd' && crowdSpeechBubble ? (
        <div
          className="crowd-speech-bubble"
          style={{
            left: `${crowdSpeechBubble.x}px`,
            top: `${crowdSpeechBubble.y}px`,
          }}
        >
          {crowdSpeechBubble.text}
        </div>
      ) : null}
    </div>
  );
});
