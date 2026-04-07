import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '@stunner/core/camera/Camera';
import { KeyboardController } from '@stunner/core/camera/KeyboardController';
import { MouseController } from '@stunner/core/camera/MouseController';
import { TouchController } from '@stunner/core/camera/TouchController';
import {
  RendererEngine,
  type RenderBackend,
  type RendererFrameHookContext,
  type RendererEngineOptions,
} from '@stunner/core/renderer/RendererEngine';
import type { RendererConfig } from '@stunner/core/renderer/config/RendererConfig';
import {
  createModelsAndMaterialsExampleScene,
  type ModelsAndMaterialsExampleOptions,
  type ModelsAndMaterialsExampleSceneResult,
} from '../example/modelsAndMaterials';
import { startPointLightsExample, type PointLightsExampleOptions } from '../example/pointLights';
import { startFlockingExample, type FlockingExampleOptions } from '../example/flocking';
import { startCrowdExample, type CrowdExampleOptions } from '../example/crowd';
import { startSponzaExample, type SponzaExampleOptions } from '../example/sponza';

export type CameraTelemetry = {
  location: [number, number, number];
  forward: [number, number, number];
};

export type PerformanceTelemetry = {
  fps: number;
  frameIntervalMs: number;
  frameTimeMs: number;
};

export type ExampleTelemetry = {
  clipName: string;
  playbackSpeed: number;
} | null;

type CanvasStageProps = {
  className?: string;
  onBackendReady?: (backend: RenderBackend) => void;
  onCameraTelemetry?: (telemetry: CameraTelemetry) => void;
  onPerformanceTelemetry?: (telemetry: PerformanceTelemetry) => void;
  onExampleTelemetry?: (telemetry: ExampleTelemetry) => void;
  rendererConfig?: RendererConfig;
  exampleSelection?: SandboxExample;
  modelsAndMaterialsOptions?: ModelsAndMaterialsExampleOptions;
  pointLightsOptions?: PointLightsExampleOptions;
  flockingOptions?: FlockingExampleOptions;
  crowdOptions?: CrowdExampleOptions;
  sponzaOptions?: SponzaExampleOptions;
  forceWebGpu?: boolean;
};

export type SandboxExample = 'modelsAndMaterials' | 'pointLights' | 'crowd' | 'flocking' | 'sponza';

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  onCameraTelemetry,
  onPerformanceTelemetry,
  onExampleTelemetry,
  rendererConfig,
  exampleSelection = 'modelsAndMaterials',
  modelsAndMaterialsOptions,
  pointLightsOptions,
  flockingOptions,
  crowdOptions,
  sponzaOptions,
  forceWebGpu = false,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const engineRef = useRef<RendererEngine | null>(null);
  const onBackendReadyRef = useRef<typeof onBackendReady>(onBackendReady);
  const onCameraTelemetryRef = useRef<typeof onCameraTelemetry>(onCameraTelemetry);
  const onPerformanceTelemetryRef = useRef<typeof onPerformanceTelemetry>(onPerformanceTelemetry);
  const onExampleTelemetryRef = useRef<typeof onExampleTelemetry>(onExampleTelemetry);
  const exampleBeforeFrameHookRef = useRef<((context: RendererFrameHookContext) => void) | null>(null);
  const modelsAndMaterialsRigControllerRef = useRef<ModelsAndMaterialsExampleSceneResult['rigController']>(null);
  const modelsAndMaterialsSetOrbitSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setOrbitSpeed'] | null>(null);
  const modelsAndMaterialsSetRotationSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setRotationSpeed'] | null>(null);
  const modelsAndMaterialsSetAnimationPlaybackSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setAnimationPlaybackSpeed'] | null>(null);
  const modelsAndMaterialsSetDirectionalLightRef = useRef<ModelsAndMaterialsExampleSceneResult['setDirectionalLight'] | null>(null);
  const modelsAndMaterialsSceneRef = useRef<ModelsAndMaterialsExampleSceneResult['scene'] | null>(null);
  const pointLightsExampleControllerRef = useRef<ReturnType<typeof startPointLightsExample> | null>(null);
  const flockingControllerRef = useRef<ReturnType<typeof startFlockingExample> | null>(null);
  const crowdControllerRef = useRef<ReturnType<typeof startCrowdExample> | null>(null);
  const sponzaControllerRef = useRef<ReturnType<typeof startSponzaExample> | null>(null);
  const [engineInstanceVersion, setEngineInstanceVersion] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const smoothedFpsRef = useRef(0);
  const requiresComputePipeline = exampleSelection === 'flocking' || exampleSelection === 'crowd';
  const computeExampleSelection = requiresComputePipeline ? exampleSelection : 'none';
  const modelsAndMaterialsPlaybackSpeed = modelsAndMaterialsOptions?.animationPlaybackSpeed;
  const modelsAndMaterialsOrbitSpeed = modelsAndMaterialsOptions?.orbitSpeedRadPerSec;
  const modelsAndMaterialsRotationSpeed = modelsAndMaterialsOptions?.rotationSpeedRadPerSec;
  const modelsAndMaterialsDirectionalLightAzimuthDeg = modelsAndMaterialsOptions?.directionalLightAzimuthDeg;
  const modelsAndMaterialsDirectionalLightElevationDeg = modelsAndMaterialsOptions?.directionalLightElevationDeg;
  const modelsAndMaterialsDirectionalLightIntensity = modelsAndMaterialsOptions?.directionalLightIntensity;

  const defaultCameraPosition: [number, number, number] = [5.37, 7.02, 1.19];
  const defaultCameraForward: [number, number, number] = [-0.64, -0.4, -0.66];
  const defaultCameraLookAt: [number, number, number] = [
    defaultCameraPosition[0] + defaultCameraForward[0],
    defaultCameraPosition[1] + defaultCameraForward[1],
    defaultCameraPosition[2] + defaultCameraForward[2],
  ];

  const directionalLightDirectionFromAngles = (
    azimuthDeg: number,
    elevationDeg: number,
  ): [number, number, number] => {
    const azimuthRadians = (azimuthDeg * Math.PI) / 180;
    const elevationRadians = (elevationDeg * Math.PI) / 180;
    const horizontal = Math.cos(elevationRadians);
    return [
      Math.cos(azimuthRadians) * horizontal,
      Math.sin(elevationRadians),
      Math.sin(azimuthRadians) * horizontal,
    ];
  };

  useEffect(() => {
    onBackendReadyRef.current = onBackendReady;
  }, [onBackendReady]);

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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const camera = new Camera({
      location: defaultCameraPosition,
      rotationEuler: [0, 0, 0],
    });
    camera.lookAt(defaultCameraLookAt);
    cameraRef.current = camera;

    const touchController = new TouchController(camera, canvas);
    const mouseController = new MouseController(camera, canvas);
    const keyboardController = new KeyboardController(camera);

    const telemetryTimer = window.setInterval(() => {
      const latestMetrics = engineRef.current?.getLatestFrameMetrics();
      let fps = 0;
      let frameIntervalMs = 0;
      let frameTimeMs = 0;
      if (latestMetrics && latestMetrics.frameIntervalMs > 0.0001) {
        frameIntervalMs = latestMetrics.frameIntervalMs;
        frameTimeMs = latestMetrics.frameTimeMs;
        const instantaneousFps = 1000 / latestMetrics.frameIntervalMs;
        const boundedFps = Math.min(240, Math.max(0, instantaneousFps));
        const alpha = 0.2;
        if (smoothedFpsRef.current <= 0.0001) {
          smoothedFpsRef.current = boundedFps;
        } else {
          smoothedFpsRef.current = smoothedFpsRef.current + (boundedFps - smoothedFpsRef.current) * alpha;
        }
        fps = smoothedFpsRef.current;
      }
      onCameraTelemetryRef.current?.({
        location: camera.getLocation(),
        forward: camera.forwardDir(),
      });
      onPerformanceTelemetryRef.current?.({ fps, frameIntervalMs, frameTimeMs });
    }, 120);

    let disposed = false;

    const flockingController = computeExampleSelection === 'flocking'
      ? startFlockingExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
          }, flockingOptions)
      : null;
    flockingControllerRef.current = flockingController;

    const crowdController = computeExampleSelection === 'crowd'
      ? startCrowdExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
        }, crowdOptions)
      : null;
    crowdControllerRef.current = crowdController;

    const activeController = flockingController ?? crowdController;
    const activeBeforeFrameHook = activeController?.engineOptions.frameHooks?.beforeFrame;
    const activeAfterFrameHook = activeController?.engineOptions.frameHooks?.afterFrame;
    const activeOnErrorHook = activeController?.engineOptions.frameHooks?.onError;

    const engineOptions: RendererEngineOptions = {
      webGpuOnly: forceWebGpu || requiresComputePipeline,
      ...activeController?.engineOptions,
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
    setEngineInstanceVersion((current) => current + 1);

    void engine
      .start()
      .then((backend) => {
        if (!disposed) {
          onBackendReadyRef.current?.(backend);
        }
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : forceWebGpu
              ? 'Renderer failed to start with WebGPU.'
              : 'Renderer failed to start with WebGPU and WebGL2.';
        setFatalError(message);
      });
    return () => {
      disposed = true;
      cameraRef.current = null;
      engineRef.current = null;
      touchController.dispose();
      mouseController.dispose();
      keyboardController.dispose();
      window.clearInterval(telemetryTimer);
      flockingControllerRef.current = null;
      crowdControllerRef.current = null;
      flockingController?.dispose();
      crowdController?.dispose();
      engine.dispose();
    };
  }, [forceWebGpu, requiresComputePipeline, computeExampleSelection]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const camera = cameraRef.current;
    if (camera) {
      if (exampleSelection === 'flocking') {
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
      } else if (exampleSelection === 'sponza') {
        const sponzaCameraPosition: [number, number, number] = [-9.72, 0.98, 0.28];
        const sponzaCameraForward: [number, number, number] = [0.94, 0.26, -0.24];
        camera.setLocation(sponzaCameraPosition);
        camera.lookAt([
          sponzaCameraPosition[0] + sponzaCameraForward[0],
          sponzaCameraPosition[1] + sponzaCameraForward[1],
          sponzaCameraPosition[2] + sponzaCameraForward[2],
        ]);
      } else {
        camera.setLocation(defaultCameraPosition);
        camera.lookAt(defaultCameraLookAt);
      }
    }

    let disposed = false;
    let disposeExample: (() => void) | null = null;
    modelsAndMaterialsRigControllerRef.current = null;
    modelsAndMaterialsSetOrbitSpeedRef.current = null;
    modelsAndMaterialsSetRotationSpeedRef.current = null;
    modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = null;
    modelsAndMaterialsSetDirectionalLightRef.current = null;
    modelsAndMaterialsSceneRef.current = null;

    if (exampleSelection === 'flocking') {
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      return () => {
        disposed = true;
        exampleBeforeFrameHookRef.current = null;
        onExampleTelemetryRef.current?.(null);
      };
    }

    if (exampleSelection === 'pointLights') {
      exampleBeforeFrameHookRef.current = null;
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
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      const controller = startSponzaExample((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      }, sponzaOptions);
      sponzaControllerRef.current = controller;
      disposeExample = controller.dispose;
    } else if (exampleSelection === 'crowd') {
      sponzaControllerRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
    } else {
      sponzaControllerRef.current = null;
      pointLightsExampleControllerRef.current = null;
      void createModelsAndMaterialsExampleScene({
        animationPlaybackSpeed: modelsAndMaterialsPlaybackSpeed,
        orbitSpeedRadPerSec: modelsAndMaterialsOrbitSpeed,
        rotationSpeedRadPerSec: modelsAndMaterialsRotationSpeed,
        directionalLightAzimuthDeg: modelsAndMaterialsDirectionalLightAzimuthDeg,
        directionalLightElevationDeg: modelsAndMaterialsDirectionalLightElevationDeg,
        directionalLightIntensity: modelsAndMaterialsDirectionalLightIntensity,
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
          modelsAndMaterialsSetDirectionalLightRef.current = result.setDirectionalLight;
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
      sponzaControllerRef.current = null;
      modelsAndMaterialsRigControllerRef.current = null;
      modelsAndMaterialsSetOrbitSpeedRef.current = null;
      modelsAndMaterialsSetRotationSpeedRef.current = null;
      modelsAndMaterialsSetAnimationPlaybackSpeedRef.current = null;
      modelsAndMaterialsSetDirectionalLightRef.current = null;
      modelsAndMaterialsSceneRef.current = null;
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      disposeExample?.();
    };
  }, [exampleSelection, engineInstanceVersion]);

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
    if (exampleSelection !== 'modelsAndMaterials') {
      return;
    }
    const azimuthDeg = modelsAndMaterialsDirectionalLightAzimuthDeg;
    const elevationDeg = modelsAndMaterialsDirectionalLightElevationDeg;
    const intensity = modelsAndMaterialsDirectionalLightIntensity;
    if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg)) {
      return;
    }
    if (!Number.isFinite(intensity)) {
      return;
    }
    const direction = directionalLightDirectionFromAngles(
      azimuthDeg ?? 27,
      Math.max(-89, Math.min(89, elevationDeg ?? 56)),
    );
    modelsAndMaterialsSetDirectionalLightRef.current?.(
      direction,
      Math.max(0, intensity ?? 0),
    );
    if (modelsAndMaterialsSceneRef.current) {
      engineRef.current?.setScene(modelsAndMaterialsSceneRef.current);
    }
  }, [
    exampleSelection,
    modelsAndMaterialsDirectionalLightAzimuthDeg,
    modelsAndMaterialsDirectionalLightElevationDeg,
    modelsAndMaterialsDirectionalLightIntensity,
  ]);

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
    if (exampleSelection === 'sponza' && sponzaOptions) {
      sponzaControllerRef.current?.setOptions(sponzaOptions);
    }
  }, [exampleSelection, sponzaOptions]);

  useEffect(() => {
    if (!rendererConfig || !engineRef.current) {
      return;
    }
    engineRef.current.updateConfig(rendererConfig);
  }, [rendererConfig, exampleSelection]);
  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className={className} aria-label="Game rendering surface" />
      {fatalError ? <p className="canvas-error">{fatalError}</p> : null}
    </div>
  );
});
