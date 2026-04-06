import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '../camera/Camera';
import { KeyboardController } from '../camera/KeyboardController';
import { MouseController } from '../camera/MouseController';
import { TouchController } from '../camera/TouchController';
import {
  RendererEngine,
  type RenderBackend,
  type RendererFrameHookContext,
  type RendererEngineOptions,
} from './RendererEngine';
import type { RendererConfig } from './config/RendererConfig';
import {
  createModelsAndMaterialsExampleScene,
  type ModelsAndMaterialsExampleOptions,
  type ModelsAndMaterialsExampleSceneResult,
} from '../../example/modelsAndMaterials';
import { startPointLightsExample, type PointLightsExampleOptions } from '../../example/pointLights';
import { startFlockingExample, type FlockingExampleOptions } from '../../example/flocking';
import { createCrowdExampleScene } from '../../example/crowd';

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
  forceWebGpu?: boolean;
};

export type SandboxExample = 'modelsAndMaterials' | 'pointLights' | 'crowd' | 'flocking';

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
  const modelsAndMaterialsSetRotationSpeedRef = useRef<ModelsAndMaterialsExampleSceneResult['setRotationSpeed'] | null>(null);
  const modelsAndMaterialsSetDirectionalLightRef = useRef<ModelsAndMaterialsExampleSceneResult['setDirectionalLight'] | null>(null);
  const modelsAndMaterialsSetGlassRefractionRef = useRef<ModelsAndMaterialsExampleSceneResult['setGlassRefraction'] | null>(null);
  const modelsAndMaterialsSceneRef = useRef<ModelsAndMaterialsExampleSceneResult['scene'] | null>(null);
  const pointLightsExampleControllerRef = useRef<ReturnType<typeof startPointLightsExample> | null>(null);
  const flockingControllerRef = useRef<ReturnType<typeof startFlockingExample> | null>(null);
  const [engineInstanceVersion, setEngineInstanceVersion] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const smoothedFpsRef = useRef(0);
  const requiresFlockingPipeline = exampleSelection === 'flocking';
  const modelsAndMaterialsPlaybackSpeed = modelsAndMaterialsOptions?.animationPlaybackSpeed;
  const modelsAndMaterialsRotationSpeed = modelsAndMaterialsOptions?.rotationSpeedRadPerSec;
  const modelsAndMaterialsDirectionalLightAzimuthDeg = modelsAndMaterialsOptions?.directionalLightAzimuthDeg;
  const modelsAndMaterialsDirectionalLightElevationDeg = modelsAndMaterialsOptions?.directionalLightElevationDeg;
  const modelsAndMaterialsDirectionalLightIntensity = modelsAndMaterialsOptions?.directionalLightIntensity;
  const modelsAndMaterialsGlassRefractionBend = modelsAndMaterialsOptions?.glassRefractionBend;
  const modelsAndMaterialsGlassRefractionThickness = modelsAndMaterialsOptions?.glassRefractionThickness;
  const modelsAndMaterialsGlassRefractionSteps = modelsAndMaterialsOptions?.glassRefractionSteps;
  const modelsAndMaterialsGlassRefractionDepthBias = modelsAndMaterialsOptions?.glassRefractionDepthBias;

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
      location: [6.5, 6.5, 1.0],
      rotationEuler: [0, 0, 0],
    });
    camera.lookAt([0, 0.8, -5.5]);
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

    const flockingController = requiresFlockingPipeline
      ? startFlockingExample((scene) => {
          if (!disposed) {
            engineRef.current?.setScene(scene);
          }
          }, flockingOptions)
      : null;
    flockingControllerRef.current = flockingController;

    const flockingBeforeFrameHook = flockingController?.engineOptions.frameHooks?.beforeFrame;
    const flockingAfterFrameHook = flockingController?.engineOptions.frameHooks?.afterFrame;
    const flockingOnErrorHook = flockingController?.engineOptions.frameHooks?.onError;

    const engineOptions: RendererEngineOptions = {
      webGpuOnly: forceWebGpu || requiresFlockingPipeline,
      ...flockingController?.engineOptions,
      frameHooks: {
        beforeFrame: (context) => {
          flockingBeforeFrameHook?.(context);
          exampleBeforeFrameHookRef.current?.(context);
        },
        afterFrame: (context) => {
          flockingAfterFrameHook?.(context);
        },
        onError: (phase, error, context) => {
          if (flockingOnErrorHook) {
            flockingOnErrorHook(phase, error, context);
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
      flockingController?.dispose();
      engine.dispose();
    };
  }, [forceWebGpu, requiresFlockingPipeline]);

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
        camera.lookAt([0, 3.8, -8.0]);
      } else if (exampleSelection === 'crowd') {
        camera.setLocation([0.0, 2.2, 12.0]);
        camera.lookAt([0, 1.4, 0]);
      } else {
        camera.setLocation([6.5, 6.5, 1.0]);
        camera.lookAt([0, 0.8, -5.5]);
      }
    }

    let disposed = false;
    let disposeExample: (() => void) | null = null;
    modelsAndMaterialsRigControllerRef.current = null;
    modelsAndMaterialsSetRotationSpeedRef.current = null;
    modelsAndMaterialsSetDirectionalLightRef.current = null;
    modelsAndMaterialsSetGlassRefractionRef.current = null;
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
    } else if (exampleSelection === 'crowd') {
      exampleBeforeFrameHookRef.current = null;
      onExampleTelemetryRef.current?.(null);
      void createCrowdExampleScene()
        .then((result) => {
          if (disposed) {
            result.dispose();
            return;
          }
          engine.setScene(result.scene);
          disposeExample = result.dispose;
        })
        .catch((error: unknown) => {
          console.warn('Crowd example scene failed to initialize.', error);
        });
    } else {
      pointLightsExampleControllerRef.current = null;
      void createModelsAndMaterialsExampleScene({
        animationPlaybackSpeed: modelsAndMaterialsPlaybackSpeed,
        rotationSpeedRadPerSec: modelsAndMaterialsRotationSpeed,
        directionalLightAzimuthDeg: modelsAndMaterialsDirectionalLightAzimuthDeg,
        directionalLightElevationDeg: modelsAndMaterialsDirectionalLightElevationDeg,
        directionalLightIntensity: modelsAndMaterialsDirectionalLightIntensity,
        glassRefractionBend: modelsAndMaterialsGlassRefractionBend,
        glassRefractionThickness: modelsAndMaterialsGlassRefractionThickness,
        glassRefractionSteps: modelsAndMaterialsGlassRefractionSteps,
        glassRefractionDepthBias: modelsAndMaterialsGlassRefractionDepthBias,
      })
        .then((result: ModelsAndMaterialsExampleSceneResult) => {
          if (disposed) {
            result.dispose();
            return;
          }
          modelsAndMaterialsRigControllerRef.current = result.rigController;
          modelsAndMaterialsSetRotationSpeedRef.current = result.setRotationSpeed;
          modelsAndMaterialsSetDirectionalLightRef.current = result.setDirectionalLight;
          modelsAndMaterialsSetGlassRefractionRef.current = result.setGlassRefraction;
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
      modelsAndMaterialsRigControllerRef.current = null;
      modelsAndMaterialsSetRotationSpeedRef.current = null;
      modelsAndMaterialsSetDirectionalLightRef.current = null;
      modelsAndMaterialsSetGlassRefractionRef.current = null;
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
    const nextSpeed = modelsAndMaterialsPlaybackSpeed;
    if (!Number.isFinite(nextSpeed)) {
      return;
    }
    const clampedSpeed = Math.max(0, nextSpeed ?? 1);
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
    if (exampleSelection !== 'modelsAndMaterials') {
      return;
    }
    const bend = modelsAndMaterialsGlassRefractionBend;
    const thickness = modelsAndMaterialsGlassRefractionThickness;
    const steps = modelsAndMaterialsGlassRefractionSteps;
    const depthBias = modelsAndMaterialsGlassRefractionDepthBias;
    if (!Number.isFinite(bend) || !Number.isFinite(thickness) || !Number.isFinite(steps) || !Number.isFinite(depthBias)) {
      return;
    }
    modelsAndMaterialsSetGlassRefractionRef.current?.(
      Math.max(1, Math.min(2.5, bend ?? 1.52)),
      Math.max(0, Math.min(4, thickness ?? 1)),
      Math.max(1, Math.min(16, Math.round(steps ?? 6))),
      Math.max(0.0005, Math.min(0.04, depthBias ?? 0.0015)),
    );
    if (modelsAndMaterialsSceneRef.current) {
      engineRef.current?.setScene(modelsAndMaterialsSceneRef.current);
    }
  }, [
    exampleSelection,
    modelsAndMaterialsGlassRefractionBend,
    modelsAndMaterialsGlassRefractionThickness,
    modelsAndMaterialsGlassRefractionSteps,
    modelsAndMaterialsGlassRefractionDepthBias,
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
    if (!rendererConfig || !engineRef.current) {
      return;
    }
    engineRef.current.updateConfig(rendererConfig);
  }, [rendererConfig]);
  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className={className} aria-label="Game rendering surface" />
      {fatalError ? <p className="canvas-error">{fatalError}</p> : null}
    </div>
  );
});
